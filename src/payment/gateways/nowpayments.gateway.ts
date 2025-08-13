import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NowPaymentsApi = require('@nowpaymentsio/nowpayments-api-js');
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
} from '../interfaces/payment.interface';

interface NOWPaymentsApiClient {
  status(): Promise<{ message: string }>;
  createPayment(params: any): Promise<any>;
  getPaymentStatus(params: { payment_id: string }): Promise<any>;
  getCurrencies(): Promise<{ currencies: string[] }>;
  getEstimatePrice(params: any): Promise<any>;
  getMinimumPaymentAmount(params: any): Promise<any>;
  getListPayments(params?: any): Promise<any>;
  createInvoice(params: any): Promise<any>;
}

interface NOWPaymentsCreatePaymentParams {
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  order_id?: string;
  order_description?: string;
  ipn_callback_url?: string;
  success_url?: string;
  cancel_url?: string;
  payout_address?: string;
  payout_currency?: string;
  payout_extra_id?: string;
  fixed_rate?: boolean;
  purchase_id?: string;
}

interface NOWPaymentsPaymentResponse {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: string;
  price_currency: string;
  pay_amount: string;
  pay_currency: string;
  order_id: string;
  order_description: string;
  purchase_id: string;
  created_at: string;
  updated_at: string;
  outcome_amount?: string;
  outcome_currency?: string;
  payin_hash?: string;
  actually_paid?: string;
}

@Injectable()
export class NowPaymentsGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(NowPaymentsGateway.name);
  private readonly apiKey: string;
  private readonly ipnSecret: string;
  private readonly sandboxMode: boolean;
  private readonly nowPaymentsApi: NOWPaymentsApiClient;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NOWPAYMENTS_API_KEY', '');
    this.ipnSecret = this.configService.get<string>(
      'NOWPAYMENTS_IPN_SECRET',
      '',
    );
    this.sandboxMode = this.configService.get<boolean>(
      'NOWPAYMENTS_SANDBOX',
      false,
    );

    // Set base URL based on sandbox mode
    this.baseUrl = this.sandboxMode
      ? 'https://api-sandbox.nowpayments.io/v1'
      : 'https://api.nowpayments.io/v1';

    // Initialize the official NOWPayments API client with proper configuration
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.nowPaymentsApi = new NowPaymentsApi({
      apiKey: this.apiKey,
      sandbox: this.sandboxMode,
    });

    if (!this.apiKey) {
      this.logger.warn('NOWPayments API key not configured');
    } else {
      this.logger.log(
        `NOWPayments initialized in ${this.sandboxMode ? 'SANDBOX' : 'PRODUCTION'} mode`,
      );
      // Perform initial API status check as recommended by NOWPayments
      this.performInitialHealthCheck();
    }
  }

  /**
   * Perform initial health check as recommended by NOWPayments best practices
   */
  private async performInitialHealthCheck(): Promise<void> {
    try {
      const isHealthy = await this.checkApiStatus();
      if (isHealthy) {
        this.logger.log('NOWPayments API health check passed');
      } else {
        this.logger.warn('NOWPayments API health check failed');
      }
    } catch (error) {
      this.logger.error('NOWPayments initial health check failed', error);
    }
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      // Validate required parameters
      if (!amount || amount <= 0) {
        throw new Error('Invalid payment amount');
      }

      if (!currency) {
        throw new Error('Currency is required');
      }

      // Check API status first (best practice as per NOWPayments documentation)
      const apiHealthy = await this.checkApiStatus();
      if (!apiHealthy) {
        throw new Error('NOWPayments API is currently unavailable');
      }

      // Validate minimum payment amount if pay_currency is specified
      const payCurrency = metadata?.payCurrency || 'usdt';
      if (payCurrency && currency.toLowerCase() !== payCurrency.toLowerCase()) {
        const minAmount = await this.getMinimumPaymentAmount(
          currency.toLowerCase(),
          payCurrency.toLowerCase(),
        );
        if (minAmount && amount < minAmount.minAmount) {
          throw new Error(
            `Amount ${amount} ${currency} is below minimum ${minAmount.minAmount} ${minAmount.currency}`,
          );
        }
      }

      // Prepare payment parameters according to NOWPayments API specification
      const paymentParams: NOWPaymentsCreatePaymentParams = {
        price_amount: amount,
        price_currency: currency.toLowerCase(),
        pay_currency: payCurrency.toLowerCase(),
        order_id: metadata?.orderId || `order_${Date.now()}`,
        order_description:
          metadata?.orderDescription || `Order ${metadata?.orderId}`,
        ipn_callback_url: metadata?.ipnCallbackUrl,
        success_url: metadata?.successUrl,
        cancel_url: metadata?.cancelUrl,
        payout_address: metadata?.payoutAddress,
        payout_currency: metadata?.payoutCurrency?.toLowerCase(),
        payout_extra_id: metadata?.payoutExtraId,
        fixed_rate: metadata?.fixedRate || false,
        purchase_id: metadata?.purchaseId,
      };

      // Remove undefined values to avoid API errors (NOWPayments best practice)
      Object.keys(paymentParams).forEach((key) => {
        if (
          paymentParams[key as keyof NOWPaymentsCreatePaymentParams] ===
          undefined
        ) {
          delete paymentParams[key as keyof NOWPaymentsCreatePaymentParams];
        }
      });

      // Validate required callback URL if provided
      if (
        paymentParams.ipn_callback_url &&
        !this.isValidUrl(paymentParams.ipn_callback_url)
      ) {
        throw new Error('Invalid IPN callback URL format');
      }

      this.logger.log(
        `Creating NOWPayments payment: ${paymentParams.price_amount} ${paymentParams.price_currency} -> ${paymentParams.pay_currency}`,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const payment: NOWPaymentsPaymentResponse =
        await this.nowPaymentsApi.createPayment(paymentParams);

      this.logger.log(`NOWPayments payment created: ${payment.payment_id}`);

      return {
        id: payment.payment_id.toString(),
        clientSecret: payment.pay_address,
        status: this.mapPaymentStatus(payment.payment_status),
        amount: parseFloat(payment.price_amount),
        currency: payment.price_currency.toUpperCase(),
        metadata: {
          payAddress: payment.pay_address,
          paymentId: payment.payment_id,
          payCurrency: payment.pay_currency,
          payAmount: payment.pay_amount,
          actuallyPaid: payment.actually_paid || '0',
          purchaseId: payment.purchase_id,
          createdAt: payment.created_at,
          updatedAt: payment.updated_at,
          outcomeAmount: payment.outcome_amount,
          outcomeCurrency: payment.outcome_currency,
          orderId: payment.order_id,
          orderDescription: payment.order_description,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create NOWPayments payment intent', error);
      throw new Error(
        `NOWPayments payment creation failed: ${(error as Error).message}`,
      );
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    paymentMethodData?: any,
  ): Promise<PaymentResult> {
    try {
      if (!paymentIntentId) {
        throw new Error('Payment ID is required');
      }

      this.logger.log(`Confirming NOWPayments payment: ${paymentIntentId}`);

      // Use the official NOWPayments API client to get payment status
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const payment: NOWPaymentsPaymentResponse =
        await this.nowPaymentsApi.getPaymentStatus({
          payment_id: paymentIntentId,
        });

      const status = this.mapPaymentStatus(payment.payment_status);
      const isSuccess = status === PaymentStatus.COMPLETED;

      this.logger.log(
        `NOWPayments payment ${paymentIntentId} status: ${payment.payment_status} -> ${status}`,
      );

      return {
        success: isSuccess,
        paymentId: payment.payment_id.toString(),
        status,
        amount: parseFloat(payment.price_amount),
        currency: payment.price_currency.toUpperCase(),
        transactionId: payment.payin_hash || payment.payment_id.toString(),
        gatewayResponse: {
          ...payment,
          actuallyPaid: parseFloat(payment.actually_paid || '0'),
          payAmount: parseFloat(payment.pay_amount),
          priceAmount: parseFloat(payment.price_amount),
          outcomeAmount: payment.outcome_amount
            ? parseFloat(payment.outcome_amount)
            : undefined,
        },
      };
    } catch (error) {
      this.logger.error('Failed to confirm NOWPayments payment', error);
      return {
        success: false,
        paymentId: paymentIntentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'USD',
        error: (error as Error).message,
      };
    }
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<PaymentResult> {
    // NOWPayments doesn't support automatic refunds through API
    // Refunds must be processed manually through the dashboard
    this.logger.warn(
      `NOWPayments refund requested for payment ${paymentId} - manual processing required`,
    );

    return {
      success: false,
      paymentId,
      status: PaymentStatus.FAILED,
      amount: amount || 0,
      currency: 'USD',
      error:
        'NOWPayments refunds must be processed manually through the dashboard',
    };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      if (!paymentId) {
        throw new Error('Payment ID is required');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const payment: NOWPaymentsPaymentResponse =
        await this.nowPaymentsApi.getPaymentStatus({
          payment_id: paymentId,
        });

      const status = this.mapPaymentStatus(payment.payment_status);

      this.logger.log(
        `NOWPayments payment ${paymentId} status: ${payment.payment_status} -> ${status}`,
      );

      return status;
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
      if (!payload) {
        throw new Error('Webhook payload is required');
      }

      const webhookData = JSON.parse(payload);

      // Verify signature using HMAC-SHA512 as per NOWPayments documentation
      const isValid = await this.verifyWebhookSignature(payload, signature);

      if (!isValid) {
        this.logger.warn(
          `Invalid webhook signature for payment ${webhookData.payment_id}`,
        );
        throw new Error('Invalid webhook signature');
      }

      const paymentId = webhookData.payment_id?.toString() || 'unknown';
      const eventType = `payment_${webhookData.payment_status}`;

      this.logger.log(
        `NOWPayments webhook verified: ${eventType} for payment ${paymentId}`,
      );

      return {
        id: paymentId,
        type: eventType,
        data: {
          ...webhookData,
          // Ensure numeric fields are properly typed
          payment_id: parseInt(webhookData.payment_id),
          price_amount: parseFloat(webhookData.price_amount),
          pay_amount: parseFloat(webhookData.pay_amount),
          actually_paid: parseFloat(webhookData.actually_paid || '0'),
          outcome_amount: webhookData.outcome_amount
            ? parseFloat(webhookData.outcome_amount)
            : undefined,
        },
        signature,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to verify NOWPayments webhook', error);
      throw error;
    }
  }

  /**
   * Map NOWPayments payment status to internal PaymentStatus enum
   * Based on official NOWPayments documentation
   */
  private mapPaymentStatus(nowPaymentsStatus: string): PaymentStatus {
    switch (nowPaymentsStatus?.toLowerCase()) {
      case 'finished':
        return PaymentStatus.COMPLETED;
      case 'failed':
        return PaymentStatus.FAILED;
      case 'expired':
        return PaymentStatus.CANCELLED;
      case 'waiting':
      case 'confirming':
      case 'partially_paid':
        return PaymentStatus.PENDING;
      case 'sending':
        return PaymentStatus.PROCESSING;
      case 'refunded':
        return PaymentStatus.REFUNDED;
      default:
        this.logger.warn(`Unknown NOWPayments status: ${nowPaymentsStatus}`);
        return PaymentStatus.PENDING;
    }
  }

  /**
   * Verify webhook signature using HMAC-SHA512 as per NOWPayments documentation
   * Implementation follows the exact specification from NOWPayments docs
   * Updated to match the latest NOWPayments IPN verification process
   */
  private async verifyWebhookSignature(
    payload: string,
    receivedSignature: string,
  ): Promise<boolean> {
    try {
      if (!this.ipnSecret) {
        this.logger.warn(
          'IPN secret not configured - webhook verification disabled for security',
        );
        return false; // Changed to false for better security - require IPN secret in production
      }

      if (!receivedSignature) {
        this.logger.warn('No signature provided in webhook');
        return false;
      }

      // Parse the payload to get the parameters
      const params = JSON.parse(payload);

      // Sort parameters alphabetically as per NOWPayments documentation
      // This is critical - the order must match exactly what NOWPayments expects
      const sortedParams = Object.keys(params)
        .sort()
        .reduce((result: Record<string, any>, key: string) => {
          result[key] = params[key];
          return result;
        }, {});

      // Create the string to sign using JSON.stringify with sorted keys
      // This matches the NOWPayments specification exactly
      // Use JSON.stringify with sorted keys as per the official documentation
      const stringToSign = JSON.stringify(
        sortedParams,
        Object.keys(sortedParams).sort(),
      );

      // Create HMAC signature using SHA-512
      const hmac = crypto.createHmac('sha512', this.ipnSecret);
      hmac.update(stringToSign);
      const calculatedSignature = hmac.digest('hex');

      // Compare signatures (case-insensitive comparison for safety)
      const isValid =
        calculatedSignature.toLowerCase() === receivedSignature.toLowerCase();

      if (!isValid) {
        this.logger.warn(
          `Webhook signature verification failed for payment ${params.payment_id}`,
        );
        this.logger.debug(`String to sign: ${stringToSign}`);
        this.logger.debug(
          `Expected signature: ${calculatedSignature}, Received: ${receivedSignature}`,
        );
      } else {
        this.logger.log(
          `Webhook signature verified successfully for payment ${params.payment_id}`,
        );
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying webhook signature', error);
      return false;
    }
  }

  /**
   * Check API status - recommended first step in NOWPayments integration
   */
  async checkApiStatus(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const response = await this.nowPaymentsApi.status();
      this.logger.log(`NOWPayments API status: ${response.message}`);
      return response.message === 'OK';
    } catch (error) {
      this.logger.error('NOWPayments API is not available', error);
      return false;
    }
  }

  /**
   * Validate URL format for callback URLs
   */
  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Get available currencies from NOWPayments
   */
  async getAvailableCurrencies(): Promise<string[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const response = await this.nowPaymentsApi.getCurrencies();
      const currencies = response.currencies || [];
      this.logger.log(`Retrieved ${currencies.length} available currencies`);
      return currencies;
    } catch (error) {
      this.logger.error('Failed to get available currencies', error);
      return [];
    }
  }

  /**
   * Get estimated price for a currency pair
   */
  async getEstimatedPrice(
    amount: number,
    currencyFrom: string,
    currencyTo: string,
  ): Promise<{ estimatedAmount: number; currency: string } | null> {
    try {
      if (!amount || amount <= 0) {
        throw new Error('Invalid amount for price estimation');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const response = await this.nowPaymentsApi.getEstimatePrice({
        amount,
        currency_from: currencyFrom.toLowerCase(),
        currency_to: currencyTo.toLowerCase(),
      });

      const estimatedAmount = parseFloat(response.estimated_amount);
      const currency = response.currency_to.toUpperCase();

      this.logger.log(
        `Price estimate: ${amount} ${currencyFrom.toUpperCase()} = ${estimatedAmount} ${currency}`,
      );

      return {
        estimatedAmount,
        currency,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get estimated price for ${amount} ${currencyFrom} -> ${currencyTo}`,
        error,
      );
      return null;
    }
  }

  /**
   * Get minimum payment amount for a currency pair
   */
  async getMinimumPaymentAmount(
    currencyFrom: string,
    currencyTo: string,
  ): Promise<{ minAmount: number; currency: string } | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const response = await this.nowPaymentsApi.getMinimumPaymentAmount({
        currency_from: currencyFrom.toLowerCase(),
        currency_to: currencyTo.toLowerCase(),
      });

      const minAmount = parseFloat(response.min_amount);
      const currency = response.currency_from.toUpperCase();

      this.logger.log(
        `Minimum payment amount: ${minAmount} ${currency} for ${currencyFrom} -> ${currencyTo}`,
      );

      return {
        minAmount,
        currency,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get minimum payment amount for ${currencyFrom} -> ${currencyTo}`,
        error,
      );
      return null;
    }
  }

  /**
   * Get list of payments - useful for reconciliation and monitoring
   */
  async getPaymentsList(params?: {
    limit?: number;
    page?: number;
    sortBy?: string;
    orderBy?: 'asc' | 'desc';
    dateFrom?: string;
    dateTo?: string;
  }): Promise<any[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const response = await this.nowPaymentsApi.getListPayments(params);
      this.logger.log(`Retrieved ${response.data?.length || 0} payments`);
      return response.data || [];
    } catch (error) {
      this.logger.error('Failed to get payments list', error);
      return [];
    }
  }

  /**
   * Create invoice - alternative payment flow
   */
  async createInvoice(params: {
    price_amount: number;
    price_currency: string;
    pay_currency?: string;
    order_id?: string;
    order_description?: string;
    ipn_callback_url?: string;
    success_url?: string;
    cancel_url?: string;
  }): Promise<{ invoice_id: string; invoice_url: string } | null> {
    try {
      // Validate required callback URL if provided
      if (
        params.ipn_callback_url &&
        !this.isValidUrl(params.ipn_callback_url)
      ) {
        throw new Error('Invalid IPN callback URL format');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const response = await this.nowPaymentsApi.createInvoice(params);

      this.logger.log(`NOWPayments invoice created: ${response.id}`);

      return {
        invoice_id: response.id,
        invoice_url: response.invoice_url,
      };
    } catch (error) {
      this.logger.error('Failed to create NOWPayments invoice', error);
      return null;
    }
  }
}
