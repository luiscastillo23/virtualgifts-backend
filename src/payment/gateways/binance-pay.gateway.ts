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

interface BinancePayOrderRequest {
  env: {
    terminalType: string;
    osType?: string;
    orderClientIp?: string;
    cookieId?: string;
  };
  merchantTradeNo: string;
  orderAmount?: number;
  currency?: string;
  fiatAmount?: number;
  fiatCurrency?: string;
  description: string; // Mandatory in API v3
  goodsDetails: Array<{
    goodsType: string;
    goodsCategory: string;
    referenceGoodsId: string;
    goodsName: string;
    goodsDetail?: string;
    goodsUnitAmount?: {
      currency: string;
      amount: number;
    };
  }>; // Updated structure for API v3
  returnUrl?: string;
  cancelUrl?: string;
  orderExpireTime?: number;
  supportPayCurrency?: string;
  passThroughInfo?: string;
  webhookUrl?: string;
  orderTags?: {
    ifProfitSharing?: boolean;
  };
  voucherCode?: string;
  qrCodeReferId?: string;
}

interface BinancePayOrderResponse {
  status: string;
  code: string;
  data?: {
    prepayId: string;
    terminalType: string;
    expireTime: number;
    qrcodeLink: string;
    qrContent: string;
    checkoutUrl: string;
    deeplink: string;
    universalUrl: string;
    currency: string;
    totalFee: string;
    fiatCurrency?: string;
    fiatAmount?: string;
  };
  errorMessage?: string;
}

interface BinancePayQueryResponse {
  status: string;
  code: string;
  data?: {
    merchantId: number;
    prepayId: string;
    transactionId?: string;
    merchantTradeNo: string;
    tradeType: string;
    status: string;
    currency: string;
    totalFee: number;
    productName?: string;
    productDetail?: string;
    openUserId?: string;
    passThroughInfo?: string;
    transactTime?: number;
    createTime: number;
  };
  errorMessage?: string;
}

interface BinancePayRefundRequest {
  refundRequestId: string;
  prepayId: string;
  refundAmount?: string;
  refundReason?: string;
}

interface BinancePayRefundResponse {
  status: string;
  code: string;
  data?: {
    refundId: string;
    refundAmount: string;
    currency: string;
    status: string;
  };
  errorMessage?: string;
}

@Injectable()
export class BinancePayGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(BinancePayGateway.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    // Binance Pay uses the same URL for both sandbox and production
    // Environment is controlled by API keys
    this.baseUrl = 'https://bpay.binanceapi.com';
    this.apiKey = this.configService.get<string>('BINANCE_PAY_API_KEY');
    this.secretKey = this.configService.get<string>('BINANCE_PAY_SECRET_KEY');

    if (!this.apiKey || !this.secretKey) {
      this.logger.warn(
        'Binance Pay API credentials not configured. Please set BINANCE_PAY_API_KEY and BINANCE_PAY_SECRET_KEY environment variables.',
      );
    }
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'USDT',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      this.validateCredentials();

      const timestamp = Date.now();
      const nonce = this.generateNonce();

      // Validate currency - only crypto currencies are supported (updated for API v3)
      const supportedCurrencies = [
        'USDT',
        'USDC',
        'BNB',
        'BTC',
        'BUSD',
        'MBOX',
      ];
      const normalizedCurrency = currency.toUpperCase();

      if (!supportedCurrencies.includes(normalizedCurrency)) {
        throw new Error(
          `Unsupported currency: ${currency}. Supported currencies: ${supportedCurrencies.join(', ')}`,
        );
      }

      // Validate amount - minimum 0.00000001
      if (amount < 0.00000001) {
        throw new Error('Amount too small: minimum 0.00000001');
      }

      const requestBody: BinancePayOrderRequest = {
        env: {
          terminalType: (metadata?.terminalType as string) || 'WEB',
          orderClientIp: metadata?.clientIp as string,
        },
        merchantTradeNo: `VG_${timestamp}_${nonce.substring(0, 8)}`,
        orderAmount: parseFloat(amount.toFixed(8)), // Support up to 8 decimal places
        currency: normalizedCurrency,
        description:
          (metadata?.description as string) || 'VirtualGifts Purchase', // Mandatory in API v3
        goodsDetails: [
          {
            goodsType: '02', // Virtual goods
            goodsCategory: 'Z000', // Others
            referenceGoodsId:
              (metadata?.orderId as string) || `VG_${timestamp}`,
            goodsName:
              (metadata?.description as string) || 'VirtualGifts Purchase',
            goodsDetail: metadata?.productDetail as string,
          },
        ],
        returnUrl: metadata?.returnUrl as string,
        cancelUrl: metadata?.cancelUrl as string,
        orderExpireTime:
          (metadata?.expireTime as number) || Date.now() + 60 * 60 * 1000, // 1 hour default
        supportPayCurrency: metadata?.supportPayCurrency as string,
        passThroughInfo: metadata?.passThroughInfo
          ? JSON.stringify(metadata.passThroughInfo)
          : undefined,
        webhookUrl: metadata?.webhookUrl as string,
      };

      const signature = this.generateSignature(requestBody, timestamp, nonce);

      const response: AxiosResponse<BinancePayOrderResponse> = await axios.post(
        `${this.baseUrl}/binancepay/openapi/v3/order`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'BinancePay-Timestamp': timestamp.toString(),
            'BinancePay-Nonce': nonce,
            'BinancePay-Certificate-SN': this.apiKey,
            'BinancePay-Signature': signature,
          },
          timeout: 30000, // 30 second timeout
        },
      );

      this.validateApiResponse(response.data);

      const { data } = response.data;

      this.logger.log(
        `Binance Pay order created successfully: ${data.prepayId}`,
      );

      return {
        id: data.prepayId,
        amount: parseFloat(data.totalFee),
        currency: data.currency,
        status: PaymentStatus.PENDING, // New orders are always pending
        clientSecret: data.checkoutUrl, // Use checkout URL as primary payment method
        metadata: {
          ...metadata,
          merchantTradeNo: requestBody.merchantTradeNo,
          qrcodeLink: data.qrcodeLink,
          qrContent: data.qrContent,
          deeplink: data.deeplink,
          checkoutUrl: data.checkoutUrl,
          universalUrl: data.universalUrl,
          expireTime: data.expireTime,
          terminalType: data.terminalType,
          fiatCurrency: data.fiatCurrency,
          fiatAmount: data.fiatAmount,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create Binance Pay payment intent', {
        error: error.message,
        stack: error.stack,
        amount,
        currency,
      });

      if (error.response?.data) {
        const errorData = error.response.data;
        throw new Error(
          `Binance Pay API Error: ${errorData.errorMessage || errorData.code || 'Unknown error'}`,
        );
      }

      throw new Error(
        `Binance Pay payment intent creation failed: ${error.message}`,
      );
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData: any,
  ): Promise<PaymentResult> {
    try {
      this.validateCredentials();

      // Query payment status to confirm
      const queryResult = await this.queryOrderDetails(paymentIntentId);

      if (!queryResult) {
        throw new Error('Payment not found');
      }

      const status = this.mapBinancePayStatus(queryResult.status);
      const isSuccess = status === PaymentStatus.COMPLETED;

      this.logger.log(
        `Binance Pay payment confirmation: ${paymentIntentId} - ${queryResult.status} -> ${status}`,
      );

      return {
        success: isSuccess,
        paymentId: paymentIntentId,
        transactionId: queryResult.transactionId || paymentIntentId,
        status,
        amount: queryResult.totalFee || 0,
        currency: queryResult.currency || 'USDT',
        gatewayResponse: {
          prepayId: queryResult.prepayId,
          merchantTradeNo: queryResult.merchantTradeNo,
          transactionId: queryResult.transactionId,
          status: queryResult.status,
          transactTime: queryResult.transactTime,
          openUserId: queryResult.openUserId,
          passThroughInfo: queryResult.passThroughInfo,
        },
      };
    } catch (error) {
      this.logger.error('Failed to confirm Binance Pay payment', {
        error: error.message,
        paymentIntentId,
      });

      return {
        success: false,
        paymentId: paymentIntentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'USDT',
        error: error.message,
      };
    }
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<PaymentResult> {
    try {
      this.validateCredentials();

      const timestamp = Date.now();
      const nonce = this.generateNonce();

      const requestBody: BinancePayRefundRequest = {
        refundRequestId: `REF_${timestamp}_${nonce.substring(0, 8)}`,
        prepayId: paymentId,
        refundAmount: amount ? amount.toFixed(8) : undefined, // Full refund if amount not specified
        refundReason: 'Customer requested refund',
      };

      const signature = this.generateSignature(requestBody, timestamp, nonce);

      const response: AxiosResponse<BinancePayRefundResponse> =
        await axios.post(
          `${this.baseUrl}/binancepay/openapi/v2/refund`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              'BinancePay-Timestamp': timestamp.toString(),
              'BinancePay-Nonce': nonce,
              'BinancePay-Certificate-SN': this.apiKey,
              'BinancePay-Signature': signature,
            },
            timeout: 30000,
          },
        );

      this.validateApiResponse(response.data);

      const { data } = response.data;
      const isSuccess = data.status === 'SUCCESS';

      this.logger.log(
        `Binance Pay refund ${isSuccess ? 'successful' : 'failed'}: ${data.refundId}`,
      );

      return {
        success: isSuccess,
        paymentId,
        transactionId: data.refundId,
        status: isSuccess ? PaymentStatus.REFUNDED : PaymentStatus.FAILED,
        amount: parseFloat(data.refundAmount || '0'),
        currency: data.currency || 'USDT',
        gatewayResponse: data,
      };
    } catch (error) {
      this.logger.error('Failed to refund Binance Pay payment', {
        error: error.message,
        paymentId,
        amount,
      });

      return {
        success: false,
        paymentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'USDT',
        error: error.message,
      };
    }
  }

  async verifyWebhook(
    payload: string,
    signature: string,
    headers?: Record<string, string>,
  ): Promise<WebhookEvent> {
    try {
      this.validateCredentials();

      // Extract required headers for webhook verification
      const timestamp = headers?.['binancepay-timestamp'];
      const nonce = headers?.['binancepay-nonce'];

      if (!timestamp || !nonce) {
        throw new Error(
          'Missing required webhook headers: BinancePay-Timestamp and BinancePay-Nonce',
        );
      }

      // Verify webhook signature
      const isValid = this.verifyWebhookSignature(
        payload,
        signature,
        timestamp,
        nonce,
      );

      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      const event = JSON.parse(payload);

      // Extract event information based on Binance Pay webhook structure
      const eventId =
        event.data?.merchantTradeNo ||
        event.data?.prepayId ||
        `webhook_${Date.now()}`;
      const eventType = this.determineWebhookEventType(event);

      this.logger.log(
        `Binance Pay webhook verified: ${eventType} for ${eventId}`,
      );

      return {
        id: eventId,
        type: eventType,
        data: event.data || event,
        timestamp: parseInt(timestamp) / 1000, // Convert to seconds
      };
    } catch (error) {
      this.logger.error('Failed to verify Binance Pay webhook', {
        error: error.message,
        signature,
      });

      throw new Error(
        `Binance Pay webhook verification failed: ${error.message}`,
      );
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const orderDetails = await this.queryOrderDetails(paymentId);

      if (!orderDetails) {
        return PaymentStatus.FAILED;
      }

      return this.mapBinancePayStatus(orderDetails.status);
    } catch (error) {
      this.logger.error('Failed to get Binance Pay payment status', {
        error: error.message,
        paymentId,
      });

      return PaymentStatus.FAILED;
    }
  }

  /**
   * Query order details from Binance Pay
   */
  private async queryOrderDetails(
    paymentId: string,
  ): Promise<BinancePayQueryResponse['data'] | null> {
    try {
      this.validateCredentials();

      const timestamp = Date.now();
      const nonce = this.generateNonce();

      const requestBody = {
        prepayId: paymentId,
      };

      const signature = this.generateSignature(requestBody, timestamp, nonce);

      const response: AxiosResponse<BinancePayQueryResponse> = await axios.post(
        `${this.baseUrl}/binancepay/openapi/order/query`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'BinancePay-Timestamp': timestamp.toString(),
            'BinancePay-Nonce': nonce,
            'BinancePay-Certificate-SN': this.apiKey,
            'BinancePay-Signature': signature,
          },
          timeout: 30000,
        },
      );

      this.validateApiResponse(response.data);

      return response.data.data || null;
    } catch (error) {
      if (error.response?.data?.code === '400202') {
        // Order not found
        this.logger.warn(`Binance Pay order not found: ${paymentId}`);
        return null;
      }

      throw error;
    }
  }

  /**
   * Generate a secure random nonce (32 characters)
   */
  private generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate HMAC-SHA512 signature for API requests
   */
  private generateSignature(
    requestBody: any,
    timestamp: number,
    nonce: string,
  ): string {
    const payload = JSON.stringify(requestBody);
    const stringToSign = `${timestamp}\n${nonce}\n${payload}\n`;

    return crypto
      .createHmac('sha512', this.secretKey)
      .update(stringToSign)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string,
    nonce: string,
  ): boolean {
    try {
      const stringToSign = `${timestamp}\n${nonce}\n${payload}\n`;
      const expectedSignature = crypto
        .createHmac('sha512', this.secretKey)
        .update(stringToSign)
        .digest('hex')
        .toUpperCase();

      return signature.toUpperCase() === expectedSignature;
    } catch (error) {
      this.logger.error('Failed to verify webhook signature', error);
      return false;
    }
  }

  /**
   * Map Binance Pay status to internal PaymentStatus
   */
  private mapBinancePayStatus(binanceStatus: string): PaymentStatus {
    switch (binanceStatus?.toUpperCase()) {
      case 'INITIAL':
      case 'PENDING':
        return PaymentStatus.PENDING;
      case 'PAID':
      case 'SUCCESS':
        return PaymentStatus.COMPLETED;
      case 'CANCELED':
      case 'CANCELLED':
        return PaymentStatus.CANCELLED;
      case 'REFUNDING':
        return PaymentStatus.PROCESSING;
      case 'REFUNDED':
        return PaymentStatus.REFUNDED;
      case 'ERROR':
      case 'EXPIRED':
        return PaymentStatus.FAILED;
      default:
        this.logger.warn(`Unknown Binance Pay status: ${binanceStatus}`);
        return PaymentStatus.PENDING;
    }
  }

  /**
   * Determine webhook event type based on order status
   */
  private determineWebhookEventType(event: any): string {
    const status = event.data?.status || event.bizType;

    switch (status?.toUpperCase()) {
      case 'PAID':
      case 'SUCCESS':
        return 'PAY_SUCCESS';
      case 'CANCELED':
      case 'CANCELLED':
        return 'PAY_CLOSE';
      case 'REFUNDED':
        return 'PAY_REFUND';
      case 'ERROR':
      case 'EXPIRED':
        return 'PAY_FAILED';
      default:
        return event.bizType || 'PAY_UPDATE';
    }
  }

  /**
   * Validate API credentials
   */
  private validateCredentials(): void {
    if (!this.apiKey || !this.secretKey) {
      throw new Error(
        'Binance Pay API credentials not configured. Please set BINANCE_PAY_API_KEY and BINANCE_PAY_SECRET_KEY environment variables.',
      );
    }
  }

  /**
   * Validate API response and throw appropriate errors
   */
  private validateApiResponse(response: any): void {
    if (response.status !== 'SUCCESS') {
      const errorMessage =
        response.errorMessage || `API Error: ${response.code}`;
      throw new Error(errorMessage);
    }

    if (!response.data) {
      throw new Error('Invalid API response: missing data');
    }
  }

  /**
   * Health check method to verify connectivity
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      this.validateCredentials();

      // Test with a minimal query (this will fail but we can check if credentials work)
      const timestamp = Date.now();
      const nonce = this.generateNonce();
      const requestBody = { prepayId: 'health_check' };
      const signature = this.generateSignature(requestBody, timestamp, nonce);

      await axios.post(
        `${this.baseUrl}/binancepay/openapi/order/query`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'BinancePay-Timestamp': timestamp.toString(),
            'BinancePay-Nonce': nonce,
            'BinancePay-Certificate-SN': this.apiKey,
            'BinancePay-Signature': signature,
          },
          timeout: 10000,
        },
      );

      return {
        status: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // If we get a 400202 (ORDER_NOT_FOUND), it means our credentials are working
      if (error.response?.data?.code === '400202') {
        return {
          status: 'connected',
          timestamp: new Date().toISOString(),
        };
      }

      // Other errors indicate connection or credential issues
      this.logger.error('Binance Pay health check failed', error);
      return {
        status: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
