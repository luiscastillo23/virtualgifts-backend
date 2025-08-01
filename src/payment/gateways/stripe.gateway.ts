import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
} from '../interfaces/payment.interface';

@Injectable()
export class StripeGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(StripeGateway.name);
  private readonly stripe: Stripe;

  constructor(private readonly configService: ConfigService) {
    const apiVersion = this.configService.get<string>(
      'STRIPE_API_VERSION',
      '2024-11-20',
    );
    const timeout = this.configService.get<number>('STRIPE_TIMEOUT', 20000);
    const maxRetries = this.configService.get<number>('STRIPE_MAX_RETRIES', 3);

    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: apiVersion as Stripe.LatestApiVersion,
        typescript: true,
        timeout,
        maxNetworkRetries: maxRetries,
        appInfo: {
          name: 'VirtualGifts Backend',
          version: this.configService.get<string>('APP_VERSION', '1.0.0'),
          url: this.configService.get<string>('APP_URL'),
        },
      },
    );

    this.logger.log(`Stripe initialized with API version: ${apiVersion}`);
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'usd',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      // Generate idempotency key for safe retries
      const idempotencyKey = `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount: Math.round(amount * 100), // Convert to cents
          currency: currency.toLowerCase(),
          metadata: metadata || {},
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never', // Better UX for SPA
          },
          confirmation_method: 'manual',
          capture_method: 'automatic',
          // Enhanced security and compliance
          setup_future_usage: undefined, // Don't store payment methods by default
        },
        {
          idempotencyKey,
        },
      );

      this.logger.log(`Payment intent created: ${paymentIntent.id}`, {
        amount,
        currency,
        status: paymentIntent.status,
      });

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount / 100, // Convert back to dollars
        currency: paymentIntent.currency,
        status: this.mapStripeStatus(paymentIntent.status),
        clientSecret: paymentIntent.client_secret,
        metadata: paymentIntent.metadata,
      };
    } catch (error) {
      this.logger.error('Failed to create Stripe payment intent', {
        error: (error as Error).message,
        amount,
        currency,
        metadata: this.sanitizeMetadata(metadata),
      });
      throw new Error(
        `Stripe payment intent creation failed: ${this.sanitizeError(error)}`,
      );
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData: {
      payment_method?: string;
      return_url?: string;
      payment_method_types?: string[];
    },
  ): Promise<PaymentResult> {
    try {
      // Validate payment method if provided
      if (paymentMethodData.payment_method) {
        const isValid = await this.validatePaymentMethod(
          paymentMethodData.payment_method,
        );
        if (!isValid) {
          return {
            success: false,
            paymentId: paymentIntentId,
            status: PaymentStatus.FAILED,
            amount: 0,
            currency: 'usd',
            error: 'Invalid payment method',
          };
        }
      }

      const confirmParams: Stripe.PaymentIntentConfirmParams = {};

      if (paymentMethodData.payment_method) {
        confirmParams.payment_method = paymentMethodData.payment_method;
      }

      if (paymentMethodData.return_url) {
        confirmParams.return_url = paymentMethodData.return_url;
      }

      const paymentIntent = await this.stripe.paymentIntents.confirm(
        paymentIntentId,
        confirmParams,
      );

      // Get transaction ID from the latest charge
      let transactionId: string | undefined;
      try {
        if (paymentIntent.latest_charge) {
          transactionId =
            typeof paymentIntent.latest_charge === 'string'
              ? paymentIntent.latest_charge
              : paymentIntent.latest_charge.id;
        }
      } catch (chargeError) {
        this.logger.warn('Could not retrieve charge ID', {
          paymentIntentId,
          error: (chargeError as Error).message,
        });
      }

      const result: PaymentResult = {
        success: paymentIntent.status === 'succeeded',
        paymentId: paymentIntent.id,
        transactionId,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        gatewayResponse: this.sanitizeGatewayResponse(paymentIntent),
      };

      this.logger.log(`Payment confirmation result: ${paymentIntent.status}`, {
        paymentIntentId,
        status: result.status,
        success: result.success,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to confirm Stripe payment', {
        paymentIntentId,
        error: (error as Error).message,
        type: (error as any).type,
      });

      return {
        success: false,
        paymentId: paymentIntentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'usd',
        error: this.sanitizeError(error),
      };
    }
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
    reason?: string,
  ): Promise<PaymentResult> {
    try {
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentId,
      };

      if (amount) {
        refundParams.amount = Math.round(amount * 100);
      }

      if (reason) {
        refundParams.reason = reason as Stripe.RefundCreateParams.Reason;
      }

      // Generate idempotency key for refunds
      const idempotencyKey = `rf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const refund = await this.stripe.refunds.create(refundParams, {
        idempotencyKey,
      });

      const result: PaymentResult = {
        success: refund.status === 'succeeded',
        paymentId: refund.payment_intent as string,
        transactionId: refund.id,
        status:
          refund.status === 'succeeded'
            ? PaymentStatus.REFUNDED
            : PaymentStatus.FAILED,
        amount: refund.amount / 100,
        currency: refund.currency,
        gatewayResponse: this.sanitizeGatewayResponse(refund),
      };

      this.logger.log(`Refund processed: ${refund.status}`, {
        refundId: refund.id,
        paymentId,
        amount: result.amount,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to refund Stripe payment', {
        paymentId,
        amount,
        error: (error as Error).message,
        type: (error as any).type,
      });

      return {
        success: false,
        paymentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'usd',
        error: this.sanitizeError(error),
      };
    }
  }

  async verifyWebhook(
    payload: string,
    signature: string,
  ): Promise<WebhookEvent> {
    try {
      const webhookSecret = this.configService.get<string>(
        'STRIPE_WEBHOOK_SECRET',
      );

      if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );

      // Enhanced event validation
      if (!this.isValidWebhookEvent(event)) {
        throw new Error('Invalid webhook event structure');
      }

      this.logger.log(`Webhook verified: ${event.type}`, {
        eventId: event.id,
        type: event.type,
        created: event.created,
      });

      return {
        id: event.id,
        type: event.type,
        data: event.data,
        timestamp: event.created,
      };
    } catch (error) {
      this.logger.error('Webhook verification failed', {
        error: (error as Error).message,
        signature: signature.substring(0, 20) + '...',
      });

      throw new Error(
        `Stripe webhook verification failed: ${this.sanitizeError(error)}`,
      );
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const paymentIntent =
        await this.stripe.paymentIntents.retrieve(paymentId);
      const status = this.mapStripeStatus(paymentIntent.status);

      this.logger.debug(`Payment status retrieved: ${paymentIntent.status}`, {
        paymentId,
        mappedStatus: status,
      });

      return status;
    } catch (error) {
      this.logger.error('Failed to get Stripe payment status', {
        paymentId,
        error: (error as Error).message,
      });
      return PaymentStatus.FAILED;
    }
  }

  // Enhanced helper methods

  private async validatePaymentMethod(
    paymentMethodId: string,
  ): Promise<boolean> {
    try {
      const paymentMethod =
        await this.stripe.paymentMethods.retrieve(paymentMethodId);
      return paymentMethod && paymentMethod.id === paymentMethodId;
    } catch (error) {
      this.logger.warn('Payment method validation failed', {
        paymentMethodId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  private isValidWebhookEvent(event: any): boolean {
    return (
      event &&
      event.id &&
      event.type &&
      event.data &&
      typeof event.created === 'number' &&
      event.object === 'event'
    );
  }

  private mapStripeStatus(stripeStatus: string): PaymentStatus {
    switch (stripeStatus) {
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return PaymentStatus.PENDING;
      case 'processing':
        return PaymentStatus.PROCESSING;
      case 'succeeded':
        return PaymentStatus.COMPLETED;
      case 'canceled':
        return PaymentStatus.CANCELLED;
      case 'requires_capture':
        return PaymentStatus.PROCESSING;
      default:
        this.logger.warn(`Unknown Stripe status: ${stripeStatus}`);
        return PaymentStatus.FAILED;
    }
  }

  private sanitizeError(error: unknown): string {
    if (!error) return 'Unknown error';

    // Handle Stripe-specific errors
    const stripeError = error as any;

    if (stripeError.type) {
      switch (stripeError.type) {
        case 'StripeCardError':
          return `Card error: ${stripeError.message || 'Card declined'}`;
        case 'StripeInvalidRequestError':
          return `Invalid request: ${stripeError.message || 'Invalid parameters'}`;
        case 'StripeAPIError':
          return 'Payment service temporarily unavailable';
        case 'StripeConnectionError':
          return 'Network error, please try again';
        case 'StripeAuthenticationError':
          return 'Authentication error';
        case 'StripeRateLimitError':
          return 'Too many requests, please try again later';
        case 'StripeIdempotencyError':
          return 'Duplicate request detected';
        default:
          return stripeError.message || 'Payment processing error';
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'An unexpected error occurred';
  }

  private sanitizeGatewayResponse(response: any): any {
    // Remove sensitive information from gateway response
    if (!response) return response;

    const sanitized = { ...response };

    // Remove sensitive fields
    delete sanitized.client_secret;
    delete sanitized.source;
    delete sanitized.payment_method;

    return sanitized;
  }

  private sanitizeMetadata(
    metadata?: Record<string, any>,
  ): Record<string, any> {
    if (!metadata) return {};

    const sanitized = { ...metadata };

    // Remove potentially sensitive fields
    delete sanitized.customerEmail;
    delete sanitized.userId;

    return sanitized;
  }

  // Additional utility methods

  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent | null> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      this.logger.error('Failed to retrieve payment intent', {
        paymentIntentId,
        error: (error as Error).message,
      });
      return null;
    }
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<boolean> {
    try {
      const paymentIntent =
        await this.stripe.paymentIntents.cancel(paymentIntentId);

      this.logger.log(`Payment intent cancelled: ${paymentIntentId}`, {
        status: paymentIntent.status,
      });

      return paymentIntent.status === 'canceled';
    } catch (error) {
      this.logger.error('Failed to cancel payment intent', {
        paymentIntentId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  async updatePaymentIntent(
    paymentIntentId: string,
    updates: Partial<Stripe.PaymentIntentUpdateParams>,
  ): Promise<Stripe.PaymentIntent | null> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.update(
        paymentIntentId,
        updates,
      );

      this.logger.log(`Payment intent updated: ${paymentIntentId}`, {
        updates: Object.keys(updates),
      });

      return paymentIntent;
    } catch (error) {
      this.logger.error('Failed to update payment intent', {
        paymentIntentId,
        updates,
        error: (error as Error).message,
      });
      return null;
    }
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      // Simple API call to verify connectivity
      await this.stripe.balance.retrieve();
      return true;
    } catch (error) {
      this.logger.error('Stripe health check failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }
}
