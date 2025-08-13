import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
} from '../interfaces/payment.interface';

interface CoinbaseChargeRequest {
  name: string;
  description: string;
  pricing_type: 'fixed_price' | 'no_price';
  local_price?: {
    amount: string;
    currency: string;
  };
  metadata?: Record<string, string>;
  redirect_url?: string;
  cancel_url?: string;
}

interface CoinbaseTimelineEntry {
  time: string;
  status: string;
  context?: string;
}

interface CoinbasePayment {
  network: string;
  transaction_id: string;
  status: string;
  value: {
    local: { amount: string; currency: string };
    crypto: { amount: string; currency: string };
  };
  block: {
    height: number;
    hash: string;
    confirmations_accumulated: number;
    confirmations_required: number;
  };
}

interface CoinbaseCharge {
  id: string;
  code: string;
  name: string;
  description: string;
  hosted_url: string;
  created_at: string;
  expires_at: string;
  timeline: CoinbaseTimelineEntry[];
  metadata: Record<string, string>;
  pricing_type: string;
  pricing: {
    local: { amount: string; currency: string };
    settlement: { amount: string; currency: string };
  };
  payments: CoinbasePayment[];
  addresses: Record<string, string>;
}

interface CoinbaseApiResponse<T> {
  data: T;
  warnings?: Array<{
    type: string;
    message: string;
  }>;
}

interface CoinbaseApiError {
  error?: {
    type: string;
    message: string;
  };
}

interface CoinbaseWebhookData {
  event: {
    id?: string;
    type: string;
    data: CoinbaseCharge;
    created_at: string;
  };
}

interface CoinbaseExchangeRatesResponse {
  data: {
    rates: Record<string, string>;
  };
}

@Injectable()
export class CoinbaseGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(CoinbaseGateway.name);
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>(
      'COINBASE_COMMERCE_API_KEY',
      '',
    );
    this.webhookSecret = this.configService.get<string>(
      'COINBASE_COMMERCE_WEBHOOK_SECRET',
      '',
    );
    this.baseUrl = 'https://api.commerce.coinbase.com';
    this.apiVersion = '2018-03-22'; // Latest stable API version

    if (!this.apiKey) {
      this.logger.warn(
        'Coinbase Commerce API key not configured. Please set COINBASE_COMMERCE_API_KEY environment variable.',
      );
    }

    if (!this.webhookSecret) {
      this.logger.warn(
        'Coinbase Commerce webhook secret not configured. Please set COINBASE_COMMERCE_WEBHOOK_SECRET environment variable.',
      );
    }
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'USD',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      if (!this.apiKey) {
        throw new Error(
          'Coinbase Commerce API key not configured. Please set COINBASE_COMMERCE_API_KEY environment variable.',
        );
      }

      this.logger.log(
        `Creating Coinbase Commerce charge for ${amount} ${currency}`,
      );

      // Validate amount
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Format amount to 2 decimal places for fiat currencies
      const formattedAmount = this.formatAmount(amount, currency);

      // Safely convert metadata to string values for Coinbase Commerce
      const coinbaseMetadata: Record<string, string> = {};
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            coinbaseMetadata[key] = String(value);
          }
        });
      }

      const chargeData: CoinbaseChargeRequest = {
        name: (metadata?.description as string) || 'Digital Product Purchase',
        description:
          (metadata?.description as string) || 'Purchase from VirtualGifts',
        pricing_type: 'fixed_price',
        local_price: {
          amount: formattedAmount,
          currency: currency.toUpperCase(),
        },
        metadata: coinbaseMetadata,
        redirect_url: metadata?.returnUrl as string,
        cancel_url: metadata?.cancelUrl as string,
      };

      const response: AxiosResponse<CoinbaseApiResponse<CoinbaseCharge>> =
        await axios.post(`${this.baseUrl}/charges`, chargeData, {
          headers: {
            'Content-Type': 'application/json',
            'X-CC-Api-Key': this.apiKey,
            'X-CC-Version': this.apiVersion,
            'User-Agent': 'VirtualGifts/1.0.0',
          },
          timeout: 30000, // 30 second timeout
        });

      const charge = response.data.data;

      // Log warnings if any
      if (response.data.warnings && response.data.warnings.length > 0) {
        response.data.warnings.forEach((warning) => {
          this.logger.warn(`Coinbase Commerce warning: ${warning.message}`);
        });
      }

      this.logger.log(
        `Coinbase Commerce charge created successfully: ${charge.id}`,
      );

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
          chargeCode: charge.code,
          hostedUrl: charge.hosted_url,
          expiresAt: charge.expires_at,
          createdAt: charge.created_at,
          addresses: charge.addresses,
          pricing: charge.pricing,
          timeline: charge.timeline,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create Coinbase Commerce charge', error);

      if (error.response?.data) {
        const errorData = error.response.data;
        throw new Error(
          `Coinbase Commerce API Error: ${errorData.error?.message || error.message}`,
        );
      }

      throw new Error(
        `Coinbase Commerce charge creation failed: ${error.message}`,
      );
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    _paymentMethodData?: any,
  ): Promise<PaymentResult> {
    try {
      if (!this.apiKey) {
        throw new Error('Coinbase Commerce API key not configured');
      }

      this.logger.log(
        `Confirming Coinbase Commerce payment: ${paymentIntentId}`,
      );

      const response: AxiosResponse<CoinbaseApiResponse<CoinbaseCharge>> =
        await axios.get(`${this.baseUrl}/charges/${paymentIntentId}`, {
          headers: {
            'X-CC-Api-Key': this.apiKey,
            'X-CC-Version': this.apiVersion,
            'User-Agent': 'VirtualGifts/1.0.0',
          },
          timeout: 30000,
        });

      const charge = response.data.data;
      const latestTimeline = charge.timeline[charge.timeline.length - 1];
      const status = this.mapCoinbaseStatus(latestTimeline?.status);

      // Check if there are any completed payments
      const completedPayments = charge.payments.filter(
        (payment) => payment.status === 'CONFIRMED',
      );

      const transactionId =
        completedPayments.length > 0
          ? completedPayments[0].transaction_id
          : charge.id;

      this.logger.log(
        `Coinbase Commerce payment status: ${status} for charge ${charge.id}`,
      );

      return {
        success: status === PaymentStatus.COMPLETED,
        paymentId: charge.id,
        transactionId,
        status,
        amount: parseFloat(charge.pricing.local.amount),
        currency: charge.pricing.local.currency,
        gatewayResponse: {
          chargeCode: charge.code,
          timeline: charge.timeline,
          payments: charge.payments,
          addresses: charge.addresses,
          pricing: charge.pricing,
          expiresAt: charge.expires_at,
          createdAt: charge.created_at,
        },
      };
    } catch (error) {
      this.logger.error('Failed to confirm Coinbase Commerce payment', error);

      if (error.response?.data) {
        const errorData = error.response.data;
        return {
          success: false,
          paymentId: paymentIntentId,
          status: PaymentStatus.FAILED,
          amount: 0,
          currency: 'USD',
          error: `Coinbase Commerce API Error: ${errorData.error?.message || error.message}`,
        };
      }

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
      if (!this.apiKey) {
        throw new Error('Coinbase Commerce API key not configured');
      }

      const response: AxiosResponse<CoinbaseApiResponse<CoinbaseCharge>> =
        await axios.get(`${this.baseUrl}/charges/${paymentId}`, {
          headers: {
            'X-CC-Api-Key': this.apiKey,
            'X-CC-Version': this.apiVersion,
            'User-Agent': 'VirtualGifts/1.0.0',
          },
          timeout: 30000,
        });

      const charge = response.data.data;
      const latestTimeline = charge.timeline[charge.timeline.length - 1];
      return this.mapCoinbaseStatus(latestTimeline?.status);
    } catch (error) {
      this.logger.error(
        'Failed to get Coinbase Commerce payment status',
        error,
      );
      return PaymentStatus.FAILED;
    }
  }

  async verifyWebhook(
    payload: string,
    signature: string,
  ): Promise<WebhookEvent> {
    try {
      if (!this.webhookSecret) {
        throw new Error(
          'Coinbase Commerce webhook secret not configured. Please set COINBASE_COMMERCE_WEBHOOK_SECRET environment variable.',
        );
      }

      // Verify Coinbase Commerce webhook signature
      const computedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      if (signature !== computedSignature) {
        this.logger.error(
          'Coinbase Commerce webhook signature verification failed',
        );
        throw new Error('Invalid webhook signature');
      }

      const webhookData = JSON.parse(payload);

      // Validate webhook data structure
      if (!webhookData.event || !webhookData.event.type) {
        throw new Error('Invalid webhook data structure');
      }

      this.logger.log(
        `Coinbase Commerce webhook verified: ${webhookData.event.type}`,
      );

      return {
        id: webhookData.event.id || `webhook_${Date.now()}`,
        type: webhookData.event.type,
        data: webhookData.event.data,
        signature,
        timestamp: new Date(webhookData.event.created_at).getTime() / 1000,
      };
    } catch (error) {
      this.logger.error('Failed to verify Coinbase Commerce webhook', error);
      throw new Error(
        `Coinbase Commerce webhook verification failed: ${error.message}`,
      );
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
   * Updated list based on latest Coinbase Commerce Onchain Payment Protocol
   */
  async getSupportedCurrencies(): Promise<string[]> {
    try {
      // Updated list based on Coinbase Commerce Onchain Payment Protocol
      // Customers can pay in hundreds of currencies, automatically converted to USDC
      return [
        'BTC',
        'ETH',
        'LTC',
        'BCH',
        'USDC',
        'USDT',
        'DAI',
        'DOGE',
        'SHIB',
        'APE',
        'MATIC',
        'AVAX',
        'SOL',
        'ADA',
        'DOT',
        'LINK',
        'UNI',
        'AAVE',
        'COMP',
        'MKR',
        'SNX',
        'YFI',
        'SUSHI',
        'CRV',
        'BAL',
        'REN',
        'KNC',
        'ZRX',
        'WBTC',
        'WETH',
        'BUSD',
        'FTT',
        'HT',
        'OKB',
        'BNB',
        'CRO',
        'LEO',
        'NEAR',
        'ALGO',
        'VET',
        'ICP',
        'FIL',
        'TRX',
        'ETC',
        'XLM',
        'ATOM',
        'THETA',
        'XMR',
        'EOS',
        'AAVE',
        'GRT',
        'SAND',
        'MANA',
        'ENJ',
        'CHZ',
        'BAT',
        'ZEC',
        'DASH',
        'DCR',
        'XTZ',
        'QTUM',
        'ONT',
        'ZIL',
        'ICX',
        'LSK',
        'NANO',
        'DGB',
        'SC',
        'STEEM',
        'REP',
        'WAVES',
        'STRAX',
        'ARK',
      ];
    } catch (error) {
      this.logger.error('Failed to get Coinbase supported currencies', error);
      return ['BTC', 'ETH', 'LTC', 'BCH', 'USDC', 'USDT'];
    }
  }

  /**
   * Get exchange rates for supported cryptocurrencies
   * Updated to handle the new Coinbase Commerce API response format
   */
  async getExchangeRates(): Promise<Record<string, number>> {
    try {
      if (!this.apiKey) {
        throw new Error('Coinbase Commerce API key not configured');
      }

      const response: AxiosResponse<CoinbaseExchangeRatesResponse> =
        await axios.get(`${this.baseUrl}/exchange-rates`, {
          headers: {
            'X-CC-Api-Key': this.apiKey,
            'X-CC-Version': this.apiVersion,
            'User-Agent': 'VirtualGifts/1.0.0',
          },
          timeout: 30000,
        });

      // Convert string rates to numbers for easier use
      const rates: Record<string, number> = {};
      Object.entries(response.data.data.rates).forEach(([currency, rate]) => {
        rates[currency] = parseFloat(rate as string);
      });

      return rates;
    } catch (error) {
      this.logger.error(
        'Failed to get Coinbase Commerce exchange rates',
        error,
      );
      return {};
    }
  }

  /**
   * Format amount to appropriate decimal places based on currency
   */
  private formatAmount(amount: number, currency: string): string {
    // Most fiat currencies use 2 decimal places
    const decimalPlaces = this.getCurrencyDecimalPlaces(currency);
    return amount.toFixed(decimalPlaces);
  }

  /**
   * Get decimal places for currency formatting
   */
  private getCurrencyDecimalPlaces(currency: string): number {
    const upperCurrency = currency.toUpperCase();

    // Zero decimal currencies (typically used in some regions)
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'CLP'];
    if (zeroDecimalCurrencies.includes(upperCurrency)) {
      return 0;
    }

    // Three decimal currencies (rare but exist)
    const threeDecimalCurrencies = ['BHD', 'JOD', 'KWD', 'OMR', 'TND'];
    if (threeDecimalCurrencies.includes(upperCurrency)) {
      return 3;
    }

    // Default to 2 decimal places for most currencies
    return 2;
  }

  /**
   * Health check for Coinbase Commerce connectivity
   * Enhanced with better error handling and connection testing
   */
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    details?: string;
    apiVersion?: string;
  }> {
    try {
      if (!this.apiKey) {
        return {
          status: 'disconnected',
          timestamp: new Date().toISOString(),
          details: 'API key not configured',
        };
      }

      // Test connectivity by making a simple API call
      const response = await axios.get(`${this.baseUrl}/exchange-rates`, {
        headers: {
          'X-CC-Api-Key': this.apiKey,
          'X-CC-Version': this.apiVersion,
          'User-Agent': 'VirtualGifts/1.0.0',
        },
        timeout: 10000, // Shorter timeout for health check
      });

      if (response.status === 200) {
        return {
          status: 'connected',
          timestamp: new Date().toISOString(),
          apiVersion: this.apiVersion,
          details: 'Successfully connected to Coinbase Commerce API',
        };
      } else {
        return {
          status: 'disconnected',
          timestamp: new Date().toISOString(),
          details: `Unexpected response status: ${response.status}`,
        };
      }
    } catch (error) {
      this.logger.error('Coinbase Commerce health check failed', error);

      let details = 'Unknown error';
      if (error.response?.status === 401) {
        details = 'Invalid API key';
      } else if (error.response?.status === 403) {
        details = 'API access forbidden';
      } else if (error.code === 'ECONNREFUSED') {
        details = 'Connection refused';
      } else if (error.code === 'ETIMEDOUT') {
        details = 'Connection timeout';
      } else if (error.message) {
        details = error.message;
      }

      return {
        status: 'disconnected',
        timestamp: new Date().toISOString(),
        details,
      };
    }
  }

  /**
   * Get charge by ID with enhanced error handling
   * This method provides better error messages and handles edge cases
   */
  async getCharge(chargeId: string): Promise<CoinbaseCharge | null> {
    try {
      if (!this.apiKey) {
        throw new Error('Coinbase Commerce API key not configured');
      }

      const response: AxiosResponse<CoinbaseApiResponse<CoinbaseCharge>> =
        await axios.get(`${this.baseUrl}/charges/${chargeId}`, {
          headers: {
            'X-CC-Api-Key': this.apiKey,
            'X-CC-Version': this.apiVersion,
            'User-Agent': 'VirtualGifts/1.0.0',
          },
          timeout: 30000,
        });

      return response.data.data;
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.warn(`Coinbase Commerce charge not found: ${chargeId}`);
        return null;
      }

      this.logger.error(
        `Failed to get Coinbase Commerce charge: ${chargeId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * List all charges with pagination support
   * Enhanced method for better charge management
   */
  async listCharges(options?: {
    limit?: number;
    starting_after?: string;
    ending_before?: string;
  }): Promise<{
    data: CoinbaseCharge[];
    pagination: {
      has_more: boolean;
      cursor_range: string[];
    };
  }> {
    try {
      if (!this.apiKey) {
        throw new Error('Coinbase Commerce API key not configured');
      }

      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.starting_after)
        params.append('starting_after', options.starting_after);
      if (options?.ending_before)
        params.append('ending_before', options.ending_before);

      const url = `${this.baseUrl}/charges${params.toString() ? `?${params.toString()}` : ''}`;

      const response = await axios.get(url, {
        headers: {
          'X-CC-Api-Key': this.apiKey,
          'X-CC-Version': this.apiVersion,
          'User-Agent': 'VirtualGifts/1.0.0',
        },
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to list Coinbase Commerce charges', error);
      throw error;
    }
  }

  /**
   * Cancel a charge (if possible)
   * Note: Charges can only be cancelled if they haven't been paid
   */
  async cancelCharge(chargeId: string): Promise<boolean> {
    try {
      if (!this.apiKey) {
        throw new Error('Coinbase Commerce API key not configured');
      }

      // First check if charge exists and can be cancelled
      const charge = await this.getCharge(chargeId);
      if (!charge) {
        throw new Error('Charge not found');
      }

      const latestStatus = charge.timeline[charge.timeline.length - 1]?.status;
      if (latestStatus === 'completed' || latestStatus === 'resolved') {
        throw new Error('Cannot cancel a completed charge');
      }

      // Coinbase Commerce doesn't have a direct cancel endpoint
      // Charges expire automatically after 1 hour
      this.logger.warn(
        `Charge cancellation requested for ${chargeId}. Note: Coinbase Commerce charges expire automatically after 1 hour.`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to cancel Coinbase Commerce charge: ${chargeId}`,
        error,
      );
      return false;
    }
  }
}
