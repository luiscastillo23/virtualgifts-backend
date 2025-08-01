import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
} from '../interfaces/payment.interface';

@Injectable()
export class NowPaymentsGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(NowPaymentsGateway.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly ipnSecret: string;

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
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/payment`,
        {
          price_amount: amount,
          price_currency: currency,
          pay_currency: metadata?.currency || 'USDT',
          order_id: metadata?.orderId,
          order_description: `Order ${metadata?.orderId}`,
          ipn_callback_url: `${metadata?.returnUrl}/webhook/nowpayments`,
          success_url: metadata?.returnUrl,
          cancel_url: metadata?.cancelUrl,
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      const payment = response.data;

      return {
        id: payment.id,
        clientSecret: payment.pay_address,
        status: PaymentStatus.PENDING,
        amount: payment.price_amount,
        currency: payment.price_currency,
        metadata: {
          payAddress: payment.pay_address,
          paymentId: payment.id,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create NOWPayments payment intent', error);
      throw error;
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData?: any,
  ): Promise<PaymentResult> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/payment/${paymentIntentId}`,
        {
          headers: {
            'x-api-key': this.apiKey,
          },
        },
      );

      const payment = response.data;

      let status: PaymentStatus;
      switch (payment.payment_status) {
        case 'finished':
          status = PaymentStatus.COMPLETED;
          break;
        case 'failed':
          status = PaymentStatus.FAILED;
          break;
        case 'expired':
          status = PaymentStatus.CANCELLED;
          break;
        case 'waiting':
        case 'confirming':
          status = PaymentStatus.PENDING;
          break;
        case 'partially_paid':
          status = PaymentStatus.PENDING;
          break;
        default:
          status = PaymentStatus.PENDING;
      }

      return {
        success: status === PaymentStatus.COMPLETED,
        paymentId: payment.id,
        status,
        amount: payment.price_amount,
        currency: payment.price_currency,
        transactionId: payment.payin_hash,
      };
    } catch (error) {
      this.logger.error('Failed to confirm NOWPayments payment', error);
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
    try {
      const response = await axios.post(
        `${this.baseUrl}/payment/${paymentId}/refund`,
        {
          refund_amount: amount,
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      const refund = response.data;

      return {
        success: true,
        paymentId,
        status: PaymentStatus.REFUNDED,
        amount: refund.refund_amount,
        currency: refund.currency,
        transactionId: refund.id,
      };
    } catch (error) {
      this.logger.error('Failed to refund NOWPayments payment', error);
      return {
        success: false,
        paymentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'USD',
        error: error.message,
      };
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const response = await axios.get(`${this.baseUrl}/payment/${paymentId}`, {
        headers: {
          'x-api-key': this.apiKey,
        },
      });

      const payment = response.data;

      switch (payment.payment_status) {
        case 'finished':
          return PaymentStatus.COMPLETED;
        case 'failed':
          return PaymentStatus.FAILED;
        case 'expired':
          return PaymentStatus.CANCELLED;
        case 'waiting':
        case 'confirming':
          return PaymentStatus.PENDING;
        case 'partially_paid':
          return PaymentStatus.PENDING;
        default:
          return PaymentStatus.PENDING;
      }
    } catch (error) {
      this.logger.error('Failed to get NOWPayments payment status', error);
      return PaymentStatus.FAILED;
    }
  }

  async verifyWebhook(
    payload: string,
    signature: string,
  ): Promise<{
    id: string;
    type: string;
    data: any;
    signature?: string;
    timestamp: number;
  }> {
    try {
      const webhookData = JSON.parse(payload);

      // Verify signature using IPN secret
      if (signature !== this.ipnSecret) {
        throw new Error('Invalid webhook signature');
      }

      return {
        id: webhookData.id || webhookData.payment_id || 'unknown',
        type: `payment_${webhookData.payment_status}`,
        data: webhookData,
        signature,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to verify NOWPayments webhook', error);
      throw error;
    }
  }
}
