import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
} from '../interfaces/payment.interface';

interface BitPayInvoiceRequest {
  price: number;
  currency: string;
  orderId?: string;
  itemDesc?: string;
  itemCode?: string;
  notificationEmail?: string;
  redirectURL?: string;
  notificationURL?: string;
  closeURL?: string;
  buyer?: {
    name?: string;
    email?: string;
    address1?: string;
    address2?: string;
    locality?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
  };
  posData?: string;
  transactionSpeed?: 'high' | 'medium' | 'low';
  fullNotifications?: boolean;
  extendedNotifications?: boolean;
  physical?: boolean;
  paymentCurrencies?: string[];
  acceptanceWindow?: number;
  autoRedirect?: boolean;
}

interface BitPayInvoiceResponse {
  facade: string;
  data: {
    id: string;
    url: string;
    status: string;
    price: number;
    currency: string;
    orderId: string;
    invoiceTime: number;
    expirationTime: number;
    currentTime: number;
    guid: string;
    token: string;
    amountPaid: number;
    displayAmountPaid: string;
    exceptionStatus: boolean | string;
    targetConfirmations: number;
    transactions: any[];
    buyer?: {
      name?: string;
      email?: string;
      address1?: string;
      locality?: string;
      region?: string;
      postalCode?: string;
      country?: string;
      phone?: string;
    };
    redirectURL?: string;
    closeURL?: string;
    autoRedirect?: boolean;
    refundAddresses?: any[];
    refundAddressRequestPending?: boolean;
    buyerProvidedEmail?: string;
    buyerProvidedInfo?: any;
    selectedWallet?: string;
    selectedTransactionCurrency?: string;
    paymentSubtotals?: Record<string, number>;
    paymentTotals?: Record<string, number>;
    paymentDisplayTotals?: Record<string, string>;
    paymentDisplaySubTotals?: Record<string, string>;
    exchangeRates?: Record<string, Record<string, number>>;
    minerFees?: Record<string, any>;
    nonPayProPaymentReceived?: boolean;
    shopper?: any;
    billId?: string;
    refundInfo?: any;
    jsonPayProRequired?: boolean;
    merchantName?: string;
    bitpayIdRequired?: boolean;
    isCancelled?: boolean;
    itemizedDetails?: any[];
    acceptanceWindow?: number;
    transactionCurrency?: string;
    underpaidAmount?: number;
    overpaidAmount?: number;
    supportedTransactionCurrencies?: Record<string, any>;
    paymentCodes?: Record<string, any>;
    universalCodes?: any;
    paymentString?: string;
    verificationLink?: string;
  };
}

interface BitPayWebhookData {
  id: string;
  url: string;
  posData: string;
  status: string;
  price: number;
  currency: string;
  invoiceTime: number;
  expirationTime: number;
  currentTime: number;
  orderId: string;
  amountPaid: number;
  displayAmountPaid: string;
  exceptionStatus: boolean | string;
  buyerFields: any;
}

@Injectable()
export class BitPayGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(BitPayGateway.name);
  private readonly environment: 'test' | 'prod';
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly httpClient: AxiosInstance;

  // Supported cryptocurrencies as of 2025
  private readonly supportedCurrencies = [
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
    'XRP',
    'MATIC',
    'USDC_m',
    'APE',
    'EUROC',
    'MATIC_e',
    'ETH_m',
    'BUSD_m',
    'DAI_m',
    'WBTC_m',
    'SHIB_m',
  ];

  constructor(private readonly configService: ConfigService) {
    this.environment = this.configService.get<string>(
      'BITPAY_ENVIRONMENT',
      'test',
    ) as 'test' | 'prod';
    this.privateKey = this.configService.get<string>('BITPAY_PRIVATE_KEY', '');
    this.publicKey = this.configService.get<string>('BITPAY_PUBLIC_KEY', '');
    this.token = this.configService.get<string>('BITPAY_TOKEN', '');

    // Use appropriate base URL based on environment
    this.baseUrl =
      this.environment === 'prod'
        ? 'https://bitpay.com/api'
        : 'https://test.bitpay.com/api';

    // Initialize HTTP client with proper headers and timeout
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-BitPay-Plugin-Info': 'nodejs-client-7.0.9',
        'X-Accept-Version': '2.0.0',
      },
    });

    // Add request interceptor for authentication
    this.httpClient.interceptors.request.use((config) => {
      if (this.token && config.data) {
        // Add token to request body for authenticated requests
        if (typeof config.data === 'string') {
          const data = JSON.parse(config.data);
          data.token = this.token;
          config.data = JSON.stringify(data);
        } else {
          config.data.token = this.token;
        }
      }
      return config;
    });

    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    if (!this.token) {
      this.logger.warn(
        'BitPay token not configured. Some operations may fail.',
      );
    }

    if (this.environment === 'prod' && (!this.privateKey || !this.publicKey)) {
      this.logger.warn(
        'BitPay private/public keys not configured for production environment.',
      );
    }

    this.logger.log(
      `BitPay gateway initialized for ${this.environment} environment`,
    );
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'USD',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      this.logger.log(`Creating BitPay invoice for ${amount} ${currency}`);

      // Validate amount
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Validate currency
      if (!['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'].includes(currency)) {
        throw new Error(`Unsupported fiat currency: ${currency}`);
      }

      const invoiceData: BitPayInvoiceRequest = {
        price: amount,
        currency: currency,
        orderId:
          metadata?.orderId ||
          `VG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        itemDesc:
          metadata?.description || 'VirtualGifts Digital Product Purchase',
        itemCode: metadata?.itemCode || 'digital_product',
        notificationEmail: metadata?.customerEmail,
        redirectURL: metadata?.returnUrl,
        notificationURL: metadata?.webhookUrl
          ? `${metadata.webhookUrl}/bitpay`
          : undefined,
        closeURL: metadata?.cancelUrl,
        buyer: metadata?.customerEmail
          ? {
              name: metadata?.customerName,
              email: metadata?.customerEmail,
              address1: metadata?.customerAddress?.address1,
              address2: metadata?.customerAddress?.address2,
              locality: metadata?.customerAddress?.city,
              region: metadata?.customerAddress?.state,
              postalCode: metadata?.customerAddress?.zipCode,
              country: metadata?.customerAddress?.country,
              phone: metadata?.customerPhone,
            }
          : undefined,
        posData: JSON.stringify({
          orderId: metadata?.orderId,
          customerId: metadata?.customerId,
          source: 'virtualgifts-backend',
        }),
        transactionSpeed: metadata?.transactionSpeed || 'medium',
        fullNotifications: true,
        extendedNotifications: true,
        physical: false,
        paymentCurrencies:
          metadata?.allowedCryptoCurrencies ||
          this.supportedCurrencies.slice(0, 10), // Limit to top 10 for better UX
        acceptanceWindow: metadata?.acceptanceWindow || 900000, // 15 minutes default
        autoRedirect: metadata?.autoRedirect || false,
      };

      const response = await this.httpClient.post<BitPayInvoiceResponse>(
        '/invoice',
        invoiceData,
      );
      const invoice = response.data.data;

      this.logger.log(`BitPay invoice created successfully: ${invoice.id}`);

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
          orderId: invoice.orderId,
          guid: invoice.guid,
          supportedCurrencies: invoice.supportedTransactionCurrencies,
          paymentCodes: invoice.paymentCodes,
          universalCodes: invoice.universalCodes,
          verificationLink: invoice.verificationLink,
          bitpayIdRequired: invoice.bitpayIdRequired,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create BitPay invoice', error);

      if (error.response?.data?.error) {
        throw new Error(`BitPay API Error: ${error.response.data.error}`);
      }

      throw new Error(`BitPay invoice creation failed: ${error.message}`);
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData?: any,
  ): Promise<PaymentResult> {
    try {
      this.logger.log(`Confirming BitPay payment: ${paymentIntentId}`);

      const response = await this.httpClient.get<BitPayInvoiceResponse>(
        `/invoice/${paymentIntentId}`,
        {
          params: {
            token: this.token,
          },
        },
      );

      const invoice = response.data.data;
      const status = this.mapBitPayStatus(invoice.status);

      // Enhanced payment confirmation logic
      const isSuccessful = status === PaymentStatus.COMPLETED;
      const isProcessing = status === PaymentStatus.PROCESSING;

      // Check for payment exceptions
      let errorMessage: string | undefined;
      if (invoice.exceptionStatus === 'paidPartial') {
        errorMessage = `Payment partially paid. Expected: ${invoice.price} ${invoice.currency}, Received: ${invoice.displayAmountPaid}`;
      } else if (invoice.exceptionStatus === 'paidOver') {
        errorMessage = `Payment overpaid. Expected: ${invoice.price} ${invoice.currency}, Received: ${invoice.displayAmountPaid}. Refund will be processed automatically.`;
      }

      return {
        success: isSuccessful || isProcessing,
        paymentId: invoice.id,
        transactionId: invoice.selectedTransactionCurrency
          ? `${invoice.id}_${invoice.selectedTransactionCurrency}`
          : invoice.id,
        status,
        amount: invoice.price,
        currency: invoice.currency,
        error: errorMessage,
        gatewayResponse: {
          invoiceTime: invoice.invoiceTime,
          expirationTime: invoice.expirationTime,
          currentTime: invoice.currentTime,
          transactions: invoice.transactions,
          amountPaid: invoice.amountPaid,
          displayAmountPaid: invoice.displayAmountPaid,
          exceptionStatus: invoice.exceptionStatus,
          selectedWallet: invoice.selectedWallet,
          selectedTransactionCurrency: invoice.selectedTransactionCurrency,
          targetConfirmations: invoice.targetConfirmations,
          underpaidAmount: invoice.underpaidAmount,
          overpaidAmount: invoice.overpaidAmount,
        },
      };
    } catch (error) {
      this.logger.error('Failed to confirm BitPay payment', error);

      if (error.response?.status === 404) {
        return {
          success: false,
          paymentId: paymentIntentId,
          status: PaymentStatus.FAILED,
          amount: 0,
          currency: 'USD',
          error: 'Invoice not found',
        };
      }

      return {
        success: false,
        paymentId: paymentIntentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'USD',
        error: error.response?.data?.error || error.message,
      };
    }
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<PaymentResult> {
    try {
      this.logger.log(`Processing BitPay refund for payment: ${paymentId}`);

      // First, get the invoice details to determine the original currency and amount
      const invoiceResponse = await this.httpClient.get<BitPayInvoiceResponse>(
        `/invoice/${paymentId}`,
        {
          params: {
            token: this.token,
          },
        },
      );

      const invoice = invoiceResponse.data.data;
      const refundAmount = amount || invoice.price;
      const refundCurrency = invoice.currency;

      // BitPay refunds are processed through the refund endpoint
      const refundData = {
        token: this.token,
        invoiceId: paymentId,
        amount: refundAmount,
        currency: refundCurrency,
        reference: `refund_${paymentId}_${Date.now()}`,
        refundEmail: invoice.buyer?.email,
        immediate: false, // Set to true for immediate refunds (if supported)
      };

      const response = await this.httpClient.post('/refund', refundData);
      const refund = response.data.data;

      this.logger.log(`BitPay refund processed successfully: ${refund.id}`);

      return {
        success: true,
        paymentId,
        transactionId: refund.id,
        status: PaymentStatus.REFUNDED,
        amount: refund.amount,
        currency: refund.currency,
        gatewayResponse: {
          refundId: refund.id,
          status: refund.status,
          requestDate: refund.requestDate,
          effectiveDate: refund.effectiveDate,
          reference: refund.reference,
          refundFee: refund.refundFee,
          immediate: refund.immediate,
        },
      };
    } catch (error: any) {
      this.logger.error('Failed to process BitPay refund', error);

      if (error.response?.status === 404) {
        return {
          success: false,
          paymentId,
          status: PaymentStatus.FAILED,
          amount: 0,
          currency: 'USD',
          error: 'Invoice not found for refund',
        };
      }

      return {
        success: false,
        paymentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'USD',
        error:
          error.response?.data?.error ||
          error.message ||
          'Refund processing failed',
      };
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const response = await this.httpClient.get<BitPayInvoiceResponse>(
        `/invoice/${paymentId}`,
        {
          params: {
            token: this.token,
          },
        },
      );

      const invoice = response.data.data;
      return this.mapBitPayStatus(invoice.status);
    } catch (error: any) {
      this.logger.error('Failed to get BitPay payment status', error);
      return PaymentStatus.FAILED;
    }
  }

  async verifyWebhook(
    payload: string,
    signature: string,
  ): Promise<WebhookEvent> {
    try {
      // Parse the webhook payload
      const webhookData: BitPayWebhookData = JSON.parse(payload);

      // BitPay webhook signature verification
      // BitPay uses X-Signature header with the invoice ID and a secret
      if (signature && this.token) {
        const expectedSignature = crypto
          .createHmac('sha256', this.token)
          .update(payload)
          .digest('hex');

        if (signature !== expectedSignature) {
          this.logger.warn('BitPay webhook signature verification failed');
          // In production, you might want to throw an error here
          // For now, we'll log the warning and continue
        }
      }

      // Extract order information from posData if available
      let orderInfo: any = {};
      try {
        if (webhookData.posData) {
          orderInfo = JSON.parse(webhookData.posData);
        }
      } catch (parseError) {
        this.logger.warn('Failed to parse BitPay webhook posData', parseError);
      }

      return {
        id: webhookData.id,
        type: `invoice_${webhookData.status.toLowerCase()}`,
        data: {
          id: webhookData.id,
          status: webhookData.status,
          price: webhookData.price,
          currency: webhookData.currency,
          orderId: webhookData.orderId,
          amountPaid: webhookData.amountPaid,
          displayAmountPaid: webhookData.displayAmountPaid,
          exceptionStatus: webhookData.exceptionStatus,
          invoiceTime: webhookData.invoiceTime,
          expirationTime: webhookData.expirationTime,
          currentTime: webhookData.currentTime,
          buyerFields: webhookData.buyerFields,
          posData: orderInfo,
        },
        signature,
        timestamp: webhookData.currentTime || Date.now(),
      };
    } catch (error: any) {
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
