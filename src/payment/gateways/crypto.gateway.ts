import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
} from '../interfaces/payment.interface';
import { NowPaymentsGateway } from './nowpayments.gateway';
import { BitPayGateway } from './bitpay.gateway';
import { CoinbaseGateway } from './coinbase.gateway';

@Injectable()
export class CryptoGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(CryptoGateway.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly nowPaymentsGateway: NowPaymentsGateway,
    private readonly bitPayGateway: BitPayGateway,
    private readonly coinbaseGateway: CoinbaseGateway,
  ) {}

  async createPaymentIntent(
    amount: number,
    currency: string = 'USD',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    const gateway = this.getGatewayFromMetadata(metadata);
    return await gateway.createPaymentIntent(amount, currency, metadata);
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData: any,
  ): Promise<PaymentResult> {
    const gateway = this.getGatewayFromMetadata(paymentMethodData);
    return await gateway.confirmPayment(paymentIntentId, paymentMethodData);
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<PaymentResult> {
    // For refunds, we need to determine which gateway was used
    // This could be stored in the order metadata or payment details
    // For now, we'll try each gateway until we find the right one
    const gateways = [
      this.nowPaymentsGateway,
      this.bitPayGateway,
      this.coinbaseGateway,
    ];

    for (const gateway of gateways) {
      try {
        const result = await gateway.refundPayment(paymentId, amount);
        if (result.success) {
          return result;
        }
      } catch (error) {
        // Continue to next gateway
        continue;
      }
    }

    return {
      success: false,
      paymentId,
      status: PaymentStatus.FAILED,
      amount: 0,
      currency: 'USD',
      error: 'Unable to process refund with any crypto gateway',
    };
  }

  async verifyWebhook(
    payload: string,
    signature: string,
  ): Promise<WebhookEvent> {
    // Try to determine which gateway the webhook is from
    // This could be based on the payload structure or headers
    try {
      const webhookData = JSON.parse(payload);

      // Try NowPayments first (has payment_status field)
      if (webhookData.payment_status) {
        return await this.nowPaymentsGateway.verifyWebhook(payload, signature);
      }

      // Try Coinbase (has type field starting with 'charge:')
      if (webhookData.type && webhookData.type.startsWith('charge:')) {
        return await this.coinbaseGateway.verifyWebhook(payload, signature);
      }

      // Try BitPay (has data.status field)
      if (webhookData.data && webhookData.data.status) {
        return await this.bitPayGateway.verifyWebhook(payload, signature);
      }

      // Fallback to generic webhook
      return {
        id: webhookData.id || `webhook_${Date.now()}`,
        type: webhookData.type || 'payment.unknown',
        data: webhookData,
        signature,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to verify crypto webhook', error);
      throw new Error(`Crypto webhook verification failed: ${error.message}`);
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    // Try each gateway to find the payment
    const gateways = [
      this.nowPaymentsGateway,
      this.bitPayGateway,
      this.coinbaseGateway,
    ];

    for (const gateway of gateways) {
      try {
        const status = await gateway.getPaymentStatus(paymentId);
        if (status !== PaymentStatus.FAILED) {
          return status;
        }
      } catch (error) {
        // Continue to next gateway
        continue;
      }
    }

    return PaymentStatus.FAILED;
  }

  private getGatewayFromMetadata(
    metadata?: Record<string, any>,
  ): PaymentGatewayInterface {
    const gatewayType = metadata?.gateway || metadata?.cryptoGateway;

    switch (gatewayType) {
      case 'nowpayments':
        return this.nowPaymentsGateway;
      case 'bitpay':
        return this.bitPayGateway;
      case 'coinbase':
        return this.coinbaseGateway;
      default:
        // Default to NowPayments if no gateway specified
        return this.nowPaymentsGateway;
    }
  }
}
