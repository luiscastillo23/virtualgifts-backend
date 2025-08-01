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
export class CoinbaseGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(CoinbaseGateway.name);
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('COINBASE_API_KEY', '');
    this.webhookSecret = this.configService.get<string>(
      'COINBASE_WEBHOOK_SECRET',
      '',
    );
    this.baseUrl = 'https://api.commerce.coinbase.com';
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'USD',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      this.logger.log(`Creating Coinbase charge for ${amount} ${currency}`);

      const chargeData = {
        name: metadata?.description || 'Digital Product Purchase',
        description: metadata?.description || 'Purchase from Virtual Gifts',
        pricing_type: 'fixed_price',
        local_price: {
          amount: amount.toString(),
          currency: currency,
        },
        metadata: {
          customer_id: metadata?.customerId,
          customer_name: metadata?.customerName,
          order_id: metadata?.orderId,
        },
        redirect_url: metadata?.returnUrl,
        cancel_url: metadata?.cancelUrl,
      };

      const response = await axios.post(`${this.baseUrl}/charges`, chargeData, {
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Api-Key': this.apiKey,
          'X-CC-Version': '2018-03-22',
        },
      });

      const charge = response.data.data;

      return {
        id: charge.id,
        amount: parseFloat(charge.pricing.local.amount),
        currency: charge.pricing.local.currency,
        status: this.mapCoinbaseStatus(
          charge.timeline[charge.timeline.length - 1]?.status,
        ),
        clientSecret: charge.hosted_url,
        metadata: {
          chargeId: charge.id,
          hostedUrl: charge.hosted_url,
          expiresAt: charge.expires_at,
          addresses: charge.addresses,
          pricing: charge.pricing,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create Coinbase charge', error);
      throw new Error(`Coinbase charge creation failed: ${error.message}`);
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData?: any,
  ): Promise<PaymentResult> {
    try {
      this.logger.log(`Confirming Coinbase payment: ${paymentIntentId}`);

      const response = await axios.get(
        `${this.baseUrl}/charges/${paymentIntentId}`,
        {
          headers: {
            'X-CC-Api-Key': this.apiKey,
            'X-CC-Version': '2018-03-22',
          },
        },
      );

      const charge = response.data.data;
      const latestTimeline = charge.timeline[charge.timeline.length - 1];
      const status = this.mapCoinbaseStatus(latestTimeline?.status);

      return {
        success: status === PaymentStatus.COMPLETED,
        paymentId: charge.id,
        transactionId: charge.id,
        status,
        amount: parseFloat(charge.pricing.local.amount),
        currency: charge.pricing.local.currency,
        gatewayResponse: {
          timeline: charge.timeline,
          payments: charge.payments,
          addresses: charge.addresses,
          pricing: charge.pricing,
          expiresAt: charge.expires_at,
        },
      };
    } catch (error) {
      this.logger.error('Failed to confirm Coinbase payment', error);
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
    // Coinbase Commerce doesn't support automatic refunds
    // Refunds must be processed manually through the Coinbase Commerce dashboard
    this.logger.warn(
      `Coinbase refund requested for payment ${paymentId} - manual processing required`,
    );

    return {
      success: false,
      paymentId,
      status: PaymentStatus.FAILED,
      amount: 0,
      currency: 'USD',
      error:
        'Coinbase Commerce refunds require manual processing through the dashboard',
    };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const response = await axios.get(`${this.baseUrl}/charges/${paymentId}`, {
        headers: {
          'X-CC-Api-Key': this.apiKey,
          'X-CC-Version': '2018-03-22',
        },
      });

      const charge = response.data.data;
      const latestTimeline = charge.timeline[charge.timeline.length - 1];
      return this.mapCoinbaseStatus(latestTimeline?.status);
    } catch (error) {
      this.logger.error('Failed to get Coinbase payment status', error);
      return PaymentStatus.FAILED;
    }
  }

  async verifyWebhook(
    payload: string,
    signature: string,
  ): Promise<WebhookEvent> {
    try {
      // Verify Coinbase webhook signature
      const computedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      if (signature !== computedSignature) {
        throw new Error('Invalid webhook signature');
      }

      const webhookData = JSON.parse(payload);

      return {
        id: webhookData.id || `webhook_${Date.now()}`,
        type: webhookData.type || 'charge:unknown',
        data: webhookData.data,
        signature,
        timestamp: new Date(webhookData.created_at).getTime() / 1000,
      };
    } catch (error) {
      this.logger.error('Failed to verify Coinbase webhook', error);
      throw new Error(`Coinbase webhook verification failed: ${error.message}`);
    }
  }

  private mapCoinbaseStatus(coinbaseStatus: string): PaymentStatus {
    switch (coinbaseStatus?.toLowerCase()) {
      case 'new':
        return PaymentStatus.PENDING;
      case 'pending':
        return PaymentStatus.PROCESSING;
      case 'completed':
        return PaymentStatus.COMPLETED;
      case 'expired':
        return PaymentStatus.CANCELLED;
      case 'unresolved':
      case 'resolved':
        return PaymentStatus.PROCESSING;
      case 'canceled':
        return PaymentStatus.CANCELLED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  /**
   * Get supported cryptocurrencies from Coinbase Commerce
   */
  async getSupportedCurrencies(): Promise<string[]> {
    try {
      // Coinbase Commerce typically supports these currencies
      // In a real implementation, you might fetch this from their API
      return ['BTC', 'ETH', 'LTC', 'BCH', 'USDC', 'DAI', 'DOGE', 'SHIB', 'APE'];
    } catch (error) {
      this.logger.error('Failed to get Coinbase supported currencies', error);
      return ['BTC', 'ETH', 'LTC', 'BCH', 'USDC'];
    }
  }

  /**
   * Get exchange rates for supported cryptocurrencies
   */
  async getExchangeRates(): Promise<Record<string, number>> {
    try {
      const response = await axios.get(`${this.baseUrl}/exchange-rates`, {
        headers: {
          'X-CC-Api-Key': this.apiKey,
          'X-CC-Version': '2018-03-22',
        },
      });

      return response.data.data.rates;
    } catch (error) {
      this.logger.error('Failed to get Coinbase exchange rates', error);
      return {};
    }
  }
}
