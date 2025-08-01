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
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2024-06-20',
      },
    );
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'usd',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        metadata: metadata || {},
        automatic_payment_methods: {
          enabled: true,
        },
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
      this.logger.error('Failed to create Stripe payment intent', error);
      throw new Error(
        `Stripe payment intent creation failed: ${error.message}`,
      );
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData: any,
  ): Promise<PaymentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: paymentMethodData.payment_method,
          return_url: paymentMethodData.return_url,
        },
      );

      return {
        success: paymentIntent.status === 'succeeded',
        paymentId: paymentIntent.id,
        transactionId: paymentIntent.charges?.data[0]?.id,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        gatewayResponse: paymentIntent,
      };
    } catch (error) {
      this.logger.error('Failed to confirm Stripe payment', error);
      return {
        success: false,
        paymentId: paymentIntentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'usd',
        error: error.message,
      };
    }
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<PaymentResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentId,
        amount: amount ? Math.round(amount * 100) : undefined,
      });

      return {
        success: refund.status === 'succeeded',
        paymentId: refund.payment_intent as string,
        transactionId: refund.id,
        status:
          refund.status === 'succeeded'
            ? PaymentStatus.REFUNDED
            : PaymentStatus.FAILED,
        amount: refund.amount / 100,
        currency: refund.currency,
        gatewayResponse: refund,
      };
    } catch (error) {
      this.logger.error('Failed to refund Stripe payment', error);
      return {
        success: false,
        paymentId,
        status: PaymentStatus.FAILED,
        amount: 0,
        currency: 'usd',
        error: error.message,
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
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );

      return {
        id: event.id,
        type: event.type,
        data: event.data,
        timestamp: event.created,
      };
    } catch (error) {
      this.logger.error('Failed to verify Stripe webhook', error);
      throw new Error(`Stripe webhook verification failed: ${error.message}`);
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const paymentIntent =
        await this.stripe.paymentIntents.retrieve(paymentId);
      return this.mapStripeStatus(paymentIntent.status);
    } catch (error) {
      this.logger.error('Failed to get Stripe payment status', error);
      return PaymentStatus.FAILED;
    }
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
      default:
        return PaymentStatus.FAILED;
    }
  }
}
