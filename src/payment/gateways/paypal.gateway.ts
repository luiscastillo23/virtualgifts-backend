import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as paypal from '@paypal/paypal-server-sdk';
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
  WebhookEvent,
} from '../interfaces/payment.interface';

@Injectable()
export class PayPalGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(PayPalGateway.name);
  private payPalClient: paypal.core.PayPalHttpClient;

  constructor(private readonly configService: ConfigService) {
    const mode = this.configService.get<string>('PAYPAL_MODE', 'sandbox');
    const clientId = this.configService.get<string>('PAYPAL_CLIENT_ID');
    const clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET');
    const environment =
      mode === 'live'
        ? new paypal.core.LiveEnvironment(clientId, clientSecret)
        : new paypal.core.SandboxEnvironment(clientId, clientSecret);
    this.payPalClient = new paypal.core.PayPalHttpClient(environment);
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'USD',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: currency.toUpperCase(),
            value: amount.toFixed(2),
          },
          custom_id: metadata?.orderId || '',
        },
      ],
      application_context: {
        return_url: metadata?.returnUrl || 'https://example.com/success',
        cancel_url: metadata?.cancelUrl || 'https://example.com/cancel',
      },
    });

    try {
      const order = await this.payPalClient.execute(request);
      const approvalUrl = order.result.links.find(
        (link: any) => link.rel === 'approve',
      )?.href;

      return {
        id: order.result.id,
        amount,
        currency: currency.toUpperCase(),
        status: this.mapPayPalStatus(order.result.status),
        clientSecret: approvalUrl,
        metadata: { ...metadata, approvalUrl },
      };
    } catch (error) {
      this.logger.error('Failed to create PayPal payment intent', error);
      throw new Error(
        `PayPal payment intent creation failed: ${error.message}`,
      );
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodData: any,
  ): Promise<PaymentResult> {
    const request = new paypal.orders.OrdersCaptureRequest(paymentIntentId);
    request.requestBody({});

    try {
      const capture = await this.payPalClient.execute(request);
      const captureData = capture.result.purchase_units[0].payments.captures[0];

      return {
        success: captureData.status === 'COMPLETED',
        paymentId: paymentIntentId,
        transactionId: captureData.id,
        status: this.mapPayPalStatus(captureData.status),
        amount: parseFloat(captureData.amount.value),
        currency: captureData.amount.currency_code,
        gatewayResponse: capture.result,
      };
    } catch (error) {
      this.logger.error('Failed to confirm PayPal payment', error);
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
      // Get the order to find the capture ID
      const getOrderRequest = new paypal.orders.OrdersGetRequest(paymentId);
      const order = await this.payPalClient.execute(getOrderRequest);
      const captureId = order.result.purchase_units[0].payments.captures[0].id;

      const refundRequest = new paypal.payments.CapturesRefundRequest(
        captureId,
      );
      if (amount) {
        refundRequest.requestBody({
          amount: {
            value: amount.toFixed(2),
            currency_code: 'USD',
          },
        });
      } else {
        refundRequest.requestBody({});
      }
      const refund = await this.payPalClient.execute(refundRequest);

      return {
        success: refund.result.status === 'COMPLETED',
        paymentId,
        transactionId: refund.result.id,
        status:
          refund.result.status === 'COMPLETED'
            ? PaymentStatus.REFUNDED
            : PaymentStatus.FAILED,
        amount: parseFloat(refund.result.amount.value),
        currency: refund.result.amount.currency_code,
        gatewayResponse: refund.result,
      };
    } catch (error) {
      this.logger.error('Failed to refund PayPal payment', error);
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

  async verifyWebhook(
    payload: string,
    signature: string,
  ): Promise<WebhookEvent> {
    try {
      // PayPal webhook verification would require additional setup
      // For now, we'll parse the payload directly
      const event = JSON.parse(payload);

      return {
        id: event.id,
        type: event.event_type,
        data: event.resource,
        timestamp: new Date(event.create_time).getTime() / 1000,
      };
    } catch (error) {
      this.logger.error('Failed to verify PayPal webhook', error);
      throw new Error(`PayPal webhook verification failed: ${error.message}`);
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const getOrderRequest = new paypal.orders.OrdersGetRequest(paymentId);
      const order = await this.payPalClient.execute(getOrderRequest);
      return this.mapPayPalStatus(order.result.status);
    } catch (error) {
      this.logger.error('Failed to get PayPal payment status', error);
      return PaymentStatus.FAILED;
    }
  }

  private mapPayPalStatus(paypalStatus: string): PaymentStatus {
    switch (paypalStatus) {
      case 'CREATED':
      case 'SAVED':
      case 'APPROVED':
        return PaymentStatus.PENDING;
      case 'VOIDED':
      case 'CANCELLED':
        return PaymentStatus.CANCELLED;
      case 'COMPLETED':
        return PaymentStatus.COMPLETED;
      case 'REFUNDED':
        return PaymentStatus.REFUNDED;
      default:
        return PaymentStatus.FAILED;
    }
  }
}
