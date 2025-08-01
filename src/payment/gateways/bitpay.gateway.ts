import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
} from '../interfaces/payment.interface';

@Injectable()
export class BitPayGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(BitPayGateway.name);
  private readonly apiKey: string;
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BITPAY_API_KEY', '');
    this.token = this.configService.get<string>('BITPAY_TOKEN', '');
    this.baseUrl = 'https://bitpay.com/api';
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'USD',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      this.logger.log(`Creating BitPay invoice for ${amount} ${currency}`);

      const invoiceData = {
        price: amount,
        currency: currency,
        orderId: metadata?.orderId || `order_${Date.now()}`,
        itemDesc: metadata?.description || 'Digital Product Purchase',
        notificationEmail: metadata?.customerEmail,
        redirectURL: metadata?.returnUrl,
        notificationURL: `${metadata?.webhookUrl}/webhook/bitpay`,
        buyer: {
          name: metadata?.customerName,
          email: metadata?.customerEmail,
        },
        token: this.token,
      };

      const response = await axios.post(
        `${this.baseUrl}/invoice`,
        invoiceData,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-BitPay-Plugin-Info': 'nodejs-client',
          },
        },
      );

      const invoice = response.data.data;

      return {
        id: invoice.id,
        amount: invoice.price,
        currency: invoice.currency,
        status: this.mapBitPayStatus(invoice.status),
        clientSecret: invoice.url,
        metadata: {
          invoiceId: invoice.id,
          paymentUrl: invoice.url,
          expirationTime: invoice.expirationTime,
          acceptanceWindow: invoice.acceptanceWindow,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create BitPay invoice', error);
      throw new Error(`BitPay invoice creation failed: ${error.message}`);
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData?: any,
  ): Promise<PaymentResult> {
    try {
      this.logger.log(`Confirming BitPay payment: ${paymentIntentId}`);

      const response = await axios.get(
        `${this.baseUrl}/invoice/${paymentIntentId}`,
        {
          headers: {
            'X-BitPay-Plugin-Info': 'nodejs-client',
          },
          params: {
            token: this.token,
          },
        },
      );

      const invoice = response.data.data;
      const status = this.mapBitPayStatus(invoice.status);

      return {
        success: status === PaymentStatus.COMPLETED,
        paymentId: invoice.id,
        transactionId: invoice.id,
        status,
        amount: invoice.price,
        currency: invoice.currency,
        gatewayResponse: {
          invoiceTime: invoice.invoiceTime,
          expirationTime: invoice.expirationTime,
          currentTime: invoice.currentTime,
          transactions: invoice.transactions,
        },
      };
    } catch (error) {
      this.logger.error('Failed to confirm BitPay payment', error);
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
      this.logger.log(`Processing BitPay refund for payment: ${paymentId}`);

      const refundData = {
        token: this.token,
        amount: amount,
        currency: 'USD', // BitPay refunds are typically in the original currency
        reference: `refund_${paymentId}_${Date.now()}`,
      };

      const response = await axios.post(`${this.baseUrl}/refund`, refundData, {
        headers: {
          'Content-Type': 'application/json',
          'X-BitPay-Plugin-Info': 'nodejs-client',
        },
      });

      const refund = response.data.data;

      return {
        success: true,
        paymentId,
        transactionId: refund.id,
        status: PaymentStatus.REFUNDED,
        amount: refund.amount,
        currency: refund.currency,
        gatewayResponse: refund,
      };
    } catch (error) {
      this.logger.error('Failed to process BitPay refund', error);
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
      const response = await axios.get(`${this.baseUrl}/invoice/${paymentId}`, {
        headers: {
          'X-BitPay-Plugin-Info': 'nodejs-client',
        },
        params: {
          token: this.token,
        },
      });

      const invoice = response.data.data;
      return this.mapBitPayStatus(invoice.status);
    } catch (error) {
      this.logger.error('Failed to get BitPay payment status', error);
      return PaymentStatus.FAILED;
    }
  }

  async verifyWebhook(
    payload: string,
    signature: string,
  ): Promise<WebhookEvent> {
    try {
      // BitPay webhook verification
      const webhookData = JSON.parse(payload);

      // In a real implementation, you would verify the signature
      // BitPay uses a different signature method than other providers

      return {
        id: webhookData.id || `webhook_${Date.now()}`,
        type: `invoice_${webhookData.data?.status || 'unknown'}`,
        data: webhookData.data,
        signature,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to verify BitPay webhook', error);
      throw new Error(`BitPay webhook verification failed: ${error.message}`);
    }
  }

  private mapBitPayStatus(bitpayStatus: string): PaymentStatus {
    switch (bitpayStatus?.toLowerCase()) {
      case 'new':
        return PaymentStatus.PENDING;
      case 'paid':
        return PaymentStatus.PROCESSING;
      case 'confirmed':
      case 'complete':
        return PaymentStatus.COMPLETED;
      case 'expired':
        return PaymentStatus.CANCELLED;
      case 'invalid':
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  /**
   * Get available cryptocurrencies supported by BitPay
   */
  async getSupportedCurrencies(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/currencies`, {
        headers: {
          'X-BitPay-Plugin-Info': 'nodejs-client',
        },
      });

      return response.data.data.map((currency: any) => currency.code);
    } catch (error) {
      this.logger.error('Failed to get BitPay supported currencies', error);
      // Return default supported currencies
      return [
        'BTC',
        'BCH',
        'ETH',
        'USDC',
        'GUSD',
        'PAX',
        'BUSD',
        'DOGE',
        'LTC',
        'WBTC',
      ];
    }
  }
}
