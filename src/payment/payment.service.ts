import {
  Injectable,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentGatewayInterface,
  PaymentIntent,
  PaymentResult,
  PaymentStatus,
  PaymentGateway,
} from './interfaces/payment.interface';
import { StripeGateway } from './gateways/stripe.gateway';
import { PayPalGateway } from './gateways/paypal.gateway';
import { CryptoGateway } from './gateways/crypto.gateway';
import { BinancePayGateway } from './gateways/binance-pay.gateway';
import { NowPaymentsGateway } from './gateways/nowpayments.gateway';
import { BitPayGateway } from './gateways/bitpay.gateway';
import { CoinbaseGateway } from './gateways/coinbase.gateway';
import {
  PaymentMethodType,
  CreditCardGateway,
  CryptoGateway as CryptoGatewayEnum,
} from '../orders/dto/create-order.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly gateways: Map<string, PaymentGatewayInterface>;

  constructor(
    private readonly configService: ConfigService,
    private readonly stripeGateway: StripeGateway,
    private readonly paypalGateway: PayPalGateway,
    private readonly cryptoGateway: CryptoGateway,
    private readonly binancePayGateway: BinancePayGateway,
    private readonly nowPaymentsGateway: NowPaymentsGateway,
    private readonly bitPayGateway: BitPayGateway,
    private readonly coinbaseGateway: CoinbaseGateway,
  ) {
    this.gateways = new Map();
    this.initializeGateways();
  }

  private initializeGateways(): void {
    // Credit card gateways
    this.gateways.set(CreditCardGateway.STRIPE, this.stripeGateway);

    // PayPal gateway
    this.gateways.set(PaymentGateway.PAYPAL, this.paypalGateway);

    // Crypto gateways
    this.gateways.set(CryptoGatewayEnum.COINBASE, this.cryptoGateway);
    this.gateways.set(CryptoGatewayEnum.BITPAY, this.cryptoGateway);
    this.gateways.set(CryptoGatewayEnum.NOWPAYMENTS, this.cryptoGateway);

    // Binance Pay gateway
    this.gateways.set('binance_pay', this.binancePayGateway);

    // NOWPayments gateway
    // this.gateways.set(PaymentGateway.NOWPAYMENTS, this.nowPaymentsGateway);
  }

  async createPaymentIntent(
    paymentMethodType: PaymentMethodType,
    gatewayType: string,
    amount: number,
    currency: string,
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      const gateway = this.getGateway(gatewayType);

      this.logger.log(
        `Creating payment intent for ${paymentMethodType} via ${gatewayType}`,
      );

      const paymentIntent = await gateway.createPaymentIntent(
        amount,
        currency,
        {
          ...metadata,
          paymentMethodType,
          gatewayType,
        },
      );

      this.logger.log(`Payment intent created: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error) {
      this.logger.error('Failed to create payment intent', error);
      throw new BadRequestException(
        `Failed to create payment intent: ${error.message}`,
      );
    }
  }

  async processPayment(
    paymentMethodType: PaymentMethodType,
    gatewayType: string,
    paymentIntentId: string,
    paymentMethodData: any,
  ): Promise<PaymentResult> {
    try {
      const gateway = this.getGateway(gatewayType);

      this.logger.log(
        `Processing payment ${paymentIntentId} via ${gatewayType}`,
      );

      const result = await gateway.confirmPayment(
        paymentIntentId,
        paymentMethodData,
      );

      if (result.success) {
        this.logger.log(`Payment processed successfully: ${result.paymentId}`);
      } else {
        this.logger.warn(`Payment failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to process payment', error);
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
    gatewayType: string,
    paymentId: string,
    amount?: number,
  ): Promise<PaymentResult> {
    try {
      const gateway = this.getGateway(gatewayType);

      this.logger.log(`Processing refund for payment ${paymentId}`);

      const result = await gateway.refundPayment(paymentId, amount);

      if (result.success) {
        this.logger.log(
          `Refund processed successfully: ${result.transactionId}`,
        );
      } else {
        this.logger.warn(`Refund failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to process refund', error);
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

  async getPaymentStatus(
    gatewayType: string,
    paymentId: string,
  ): Promise<PaymentStatus> {
    try {
      const gateway = this.getGateway(gatewayType);
      return await gateway.getPaymentStatus(paymentId);
    } catch (error) {
      this.logger.error('Failed to get payment status', error);
      return PaymentStatus.FAILED;
    }
  }

  async handleWebhook(
    gatewayType: string,
    payload: string,
    signature: string,
  ): Promise<{
    success: boolean;
    eventType?: string;
    paymentId?: string;
    status?: PaymentStatus;
    error?: string;
  }> {
    try {
      const gateway = this.getGateway(gatewayType);
      const webhookEvent = await gateway.verifyWebhook(payload, signature);

      this.logger.log(
        `Webhook received: ${webhookEvent.type} for gateway ${gatewayType}`,
      );

      // Extract payment information from webhook
      const paymentId = this.extractPaymentIdFromWebhook(
        gatewayType,
        webhookEvent,
      );
      const status = this.extractStatusFromWebhook(gatewayType, webhookEvent);

      return {
        success: true,
        eventType: webhookEvent.type,
        paymentId,
        status,
      };
    } catch (error) {
      this.logger.error(`Webhook handling failed for ${gatewayType}`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private getGateway(gatewayType: string): PaymentGatewayInterface {
    const gateway = this.gateways.get(gatewayType);
    if (!gateway) {
      throw new BadRequestException(
        `Unsupported payment gateway: ${gatewayType}`,
      );
    }
    return gateway;
  }

  private extractPaymentIdFromWebhook(
    gatewayType: string,
    webhookEvent: any,
  ): string | undefined {
    switch (gatewayType) {
      case CreditCardGateway.STRIPE:
        return webhookEvent.data?.object?.id;
      case PaymentGateway.PAYPAL:
        return webhookEvent.data?.id;
      case CryptoGatewayEnum.COINBASE:
      case CryptoGatewayEnum.BITPAY:
        return webhookEvent.data?.id || webhookEvent.data?.payment_id;
      case CryptoGatewayEnum.NOWPAYMENTS:
        return webhookEvent.data?.payment_id;
      case 'binance_pay':
        return (
          webhookEvent.data?.merchantTradeNo || webhookEvent.data?.prepayId
        );
      default:
        return undefined;
    }
  }

  private extractStatusFromWebhook(
    gatewayType: string,
    webhookEvent: any,
  ): PaymentStatus | undefined {
    switch (gatewayType) {
      case CreditCardGateway.STRIPE:
        return this.mapStripeWebhookStatus(webhookEvent.type);
      case PaymentGateway.PAYPAL:
        return this.mapPayPalWebhookStatus(webhookEvent.type);
      case CryptoGatewayEnum.COINBASE:
      case CryptoGatewayEnum.BITPAY:
        return this.mapCryptoWebhookStatus(webhookEvent.type);
      case CryptoGatewayEnum.NOWPAYMENTS:
        return this.mapNowPaymentsWebhookStatus(
          webhookEvent.data?.payment_status,
        );
      case 'binance_pay':
        return this.mapBinancePayWebhookStatus(webhookEvent.type);
      default:
        return undefined;
    }
  }

  private mapStripeWebhookStatus(eventType: string): PaymentStatus {
    switch (eventType) {
      case 'payment_intent.succeeded':
        return PaymentStatus.COMPLETED;
      case 'payment_intent.payment_failed':
        return PaymentStatus.FAILED;
      case 'payment_intent.canceled':
        return PaymentStatus.CANCELLED;
      case 'charge.dispute.created':
        return PaymentStatus.REFUNDED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  private mapPayPalWebhookStatus(eventType: string): PaymentStatus {
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        return PaymentStatus.COMPLETED;
      case 'PAYMENT.CAPTURE.DENIED':
        return PaymentStatus.FAILED;
      case 'PAYMENT.CAPTURE.REFUNDED':
        return PaymentStatus.REFUNDED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  private mapCryptoWebhookStatus(eventType: string): PaymentStatus {
    switch (eventType) {
      case 'charge:confirmed':
      case 'payment.completed':
        return PaymentStatus.COMPLETED;
      case 'charge:failed':
      case 'payment.failed':
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  private mapNowPaymentsWebhookStatus(status: string): PaymentStatus {
    switch (status) {
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
      default:
        return PaymentStatus.PENDING;
    }
  }

  private mapBinancePayWebhookStatus(eventType: string): PaymentStatus {
    switch (eventType) {
      case 'PAY_SUCCESS':
        return PaymentStatus.COMPLETED;
      case 'PAY_CLOSE':
        return PaymentStatus.CANCELLED;
      case 'PAY_REFUND':
        return PaymentStatus.REFUNDED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  /**
   * Validate payment method configuration
   */
  validatePaymentMethod(
    paymentMethodType: PaymentMethodType,
    gatewayType: string,
  ): boolean {
    try {
      this.getGateway(gatewayType);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get supported payment methods
   */
  getSupportedPaymentMethods(): {
    type: PaymentMethodType;
    gateways: string[];
  }[] {
    return [
      {
        type: PaymentMethodType.CREDIT_CARD,
        gateways: [CreditCardGateway.STRIPE],
      },
      {
        type: PaymentMethodType.PAYPAL,
        gateways: [PaymentGateway.PAYPAL],
      },
      {
        type: PaymentMethodType.CRYPTO,
        gateways: [
          CryptoGatewayEnum.COINBASE,
          CryptoGatewayEnum.BITPAY,
          CryptoGatewayEnum.NOWPAYMENTS,
        ],
      },
      {
        type: PaymentMethodType.BINANCE_PAY,
        gateways: ['binance_pay'],
      },
    ];
  }
}
