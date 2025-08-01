import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  Environment,
  OrdersController,
  PaymentsController,
  CheckoutPaymentIntent,
} from '@paypal/paypal-server-sdk';
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
  private payPalClient: Client;
  private ordersController: OrdersController;
  private paymentsController: PaymentsController;

  constructor(private readonly configService: ConfigService) {
    const mode = this.configService.get<string>('PAYPAL_MODE', 'sandbox');
    const clientId = this.configService.get<string>('PAYPAL_CLIENT_ID');
    const clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET');

    this.payPalClient = new Client({
      environment:
        mode === 'live' ? Environment.Production : Environment.Sandbox,
      clientCredentialsAuthCredentials: {
        oAuthClientId: clientId,
        oAuthClientSecret: clientSecret,
      },
    });

    this.ordersController = new OrdersController(this.payPalClient);
    this.paymentsController = new PaymentsController(this.payPalClient);
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'USD',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      const orderRequest = {
        body: {
          intent: CheckoutPaymentIntent.Capture,
          purchaseUnits: [
            {
              amount: {
                currencyCode: currency.toUpperCase(),
                value: amount.toFixed(2),
              },
              customId: metadata?.orderId || '',
            },
          ],
          applicationContext: {
            returnUrl: metadata?.returnUrl || 'https://example.com/success',
            cancelUrl: metadata?.cancelUrl || 'https://example.com/cancel',
          },
        },
        prefer: 'return=representation',
      };

      const order = await this.ordersController.createOrder(orderRequest);
      const approvalUrl = order.result.links?.find(
        (link) => link.rel === 'approve',
      )?.href;

      return {
        id: order.result.id!,
        amount,
        currency: currency.toUpperCase(),
        status: this.mapPayPalStatus(order.result.status!),
        clientSecret: approvalUrl,
        metadata: { ...metadata, approvalUrl },
      };
    } catch (error: any) {
      this.logger.error('Failed to create PayPal payment intent', error);
      throw new Error(
        `PayPal payment intent creation failed: ${error.message}`,
      );
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    _paymentMethodData?: any,
  ): Promise<PaymentResult> {
    try {
      const captureRequest = {
        body: {},
      };

      const capture = await this.ordersController.captureOrder({
        id: paymentIntentId,
        ...captureRequest,
      });
      const captureData =
        capture.result.purchaseUnits?.[0]?.payments?.captures?.[0];

      if (!captureData) {
        throw new Error('No capture data found in response');
      }

      return {
        success: captureData.status === 'COMPLETED',
        paymentId: paymentIntentId,
        transactionId: captureData.id || '',
        status: this.mapPayPalStatus(captureData.status || ''),
        amount: parseFloat(captureData.amount?.value || '0'),
        currency: captureData.amount?.currencyCode || 'USD',
        gatewayResponse: capture.result,
      };
    } catch (error: any) {
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
      const order = await this.ordersController.getOrder({ id: paymentId });
      const captureId =
        order.result.purchaseUnits?.[0]?.payments?.captures?.[0]?.id;

      if (!captureId) {
        throw new Error('No capture ID found for this order');
      }

      const refund = await this.paymentsController.refundCapturedPayment({
        captureId: captureId,
        body: amount
          ? {
              amount: {
                value: amount.toFixed(2),
                currencyCode: 'USD',
              },
            }
          : undefined,
      });

      return {
        success: refund.result.status === 'COMPLETED',
        paymentId,
        transactionId: refund.result.id || '',
        status:
          refund.result.status === 'COMPLETED'
            ? PaymentStatus.REFUNDED
            : PaymentStatus.FAILED,
        amount: parseFloat(refund.result.amount?.value || '0'),
        currency: refund.result.amount?.currencyCode || 'USD',
        gatewayResponse: refund.result,
      };
    } catch (error: any) {
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
      const order = await this.ordersController.getOrder({ id: paymentId });
      return this.mapPayPalStatus(order.result.status || '');
    } catch (error: any) {
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
