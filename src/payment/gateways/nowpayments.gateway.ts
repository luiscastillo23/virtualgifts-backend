// src/payment/gateways/nowpayments.gateway.ts

import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
} from '../interfaces/payment.interface';
import * as crypto from 'crypto';

@Injectable()
export class NowPaymentsGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(NowPaymentsGateway.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly ipnSecret: string;
  private readonly appBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NOWPAYMENTS_API_KEY', '');
    this.baseUrl = this.configService.get<string>(
      'NOWPAYMENTS_API_URL',
      'https://api.nowpayments.io/v1',
    );
    this.ipnSecret = this.configService.get<string>(
      'NOWPAYMENTS_IPN_SECRET',
      '',
    );
    this.appBaseUrl = this.configService.get<string>('APP_BASE_URL', '');

    if (!this.apiKey || !this.ipnSecret || !this.appBaseUrl) {
      this.logger.error(
        'NOWPayments environment variables are not fully configured.',
      );
      throw new InternalServerErrorException(
        'NOWPayments gateway is not configured.',
      );
    }
  }

  private getCallbackUrl(gateway: string): string {
    return `${this.appBaseUrl}/payment/webhook/${gateway}`;
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      const payCurrency = metadata?.payCurrency;
      if (!payCurrency) {
        throw new BadRequestException(
          'Payment currency (payCurrency) is required for NOWPayments.',
        );
      }

      this.logger.log(
        `Creating NOWPayments intent for ${amount} ${currency}, paying with ${payCurrency}`,
      );

      const requestBody = {
        price_amount: amount,
        price_currency: currency.toLowerCase(),
        pay_currency: payCurrency.toLowerCase(),
        order_id: metadata?.orderId,
        order_description: `Order ${metadata?.orderId}`,
        ipn_callback_url: this.getCallbackUrl('nowpayments'),
        success_url:
          metadata?.returnUrl || `${this.appBaseUrl}/payment/success`,
        cancel_url: metadata?.cancelUrl || `${this.appBaseUrl}/payment/cancel`,
      };
      // --- END OF THE DEFINITIVE FIX ---

      const response = await axios.post(
        `${this.baseUrl}/payment`,
        requestBody,
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      const payment = response.data;
      this.logger.log(
        `NOWPayments intent created successfully: ${payment.payment_id}`,
      );

      return {
        id: payment.payment_id,
        amount: parseFloat(payment.price_amount),
        currency: payment.price_currency,
        status: this.mapNowPaymentsStatus(payment.payment_status),
        clientSecret: payment.pay_address,
        metadata: {
          paymentId: payment.payment_id,
          payAddress: payment.pay_address,
          payCurrency: payment.pay_currency,
          invoiceUrl: payment.invoice_url,
        },
      };
    } catch (error) {
      this.logger.error(
        `NOWPayments payment creation failed: ${error.response?.data?.message || error.message}`,
        error.stack,
      );
      throw new Error(
        `NOWPayments payment creation failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData?: any,
  ): Promise<PaymentResult> {
    try {
      const payment = await this.getPaymentDetails(paymentIntentId);
      const status = this.mapNowPaymentsStatus(payment.payment_status);

      return {
        success: status === PaymentStatus.COMPLETED,
        paymentId: payment.payment_id,
        transactionId: payment.payin_hash,
        status,
        amount: parseFloat(payment.price_amount),
        currency: payment.price_currency,
        gatewayResponse: payment,
      };
    } catch (error) {
      this.logger.error(
        `Failed to confirm NOWPayments payment: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        paymentId: paymentIntentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'USD',
        error: error.message,
      };
    }
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<PaymentResult> {
    this.logger.warn(
      'NOWPayments refunds must be processed manually via their dashboard.',
    );
    return {
      success: false,
      paymentId,
      status: PaymentStatus.FAILED,
      amount: 0,
      currency: 'USD',
      error: 'NOWPayments refunds require manual processing.',
    };
  }

  async verifyWebhook(
    payload: string,
    signature: string,
  ): Promise<WebhookEvent> {
    try {
      const sortedPayload = JSON.stringify(
        JSON.parse(payload),
        Object.keys(JSON.parse(payload)).sort(),
      );
      const hmac = crypto.createHmac('sha512', this.ipnSecret);
      hmac.update(sortedPayload, 'utf-8');
      const expectedSignature = hmac.digest('hex');

      if (signature !== expectedSignature) {
        this.logger.warn(
          `Invalid NOWPayments webhook signature. Expected: ${expectedSignature}, Got: ${signature}`,
        );
        throw new Error('Invalid webhook signature');
      }

      const event = JSON.parse(payload);

      return {
        id: event.payment_id,
        type: `payment.${event.payment_status}`,
        data: event,
        timestamp: new Date(event.updated_at).getTime() / 1000,
      };
    } catch (error) {
      this.logger.error('Failed to verify NOWPayments webhook', error.stack);
      throw new Error(
        `NOWPayments webhook verification failed: ${error.message}`,
      );
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const payment = await this.getPaymentDetails(paymentId);
      return this.mapNowPaymentsStatus(payment.payment_status);
    } catch (error) {
      this.logger.error(
        'Failed to get NOWPayments payment status',
        error.stack,
      );
      return PaymentStatus.FAILED;
    }
  }

  private async getPaymentDetails(paymentId: string): Promise<any> {
    const response = await axios.get(`${this.baseUrl}/payment/${paymentId}`, {
      headers: { 'x-api-key': this.apiKey },
    });
    return response.data;
  }

  private mapNowPaymentsStatus(status: string): PaymentStatus {
    switch (status) {
      case 'finished':
        return PaymentStatus.COMPLETED;
      case 'failed':
        return PaymentStatus.FAILED;
      case 'expired':
        return PaymentStatus.CANCELLED;
      case 'waiting':
      case 'confirming':
      case 'sending':
        return PaymentStatus.PENDING;
      case 'partially_paid':
        return PaymentStatus.PROCESSING;
      default:
        return PaymentStatus.PENDING;
    }
  }
}
