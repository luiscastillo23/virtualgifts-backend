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
export class BinancePayGateway implements PaymentGatewayInterface {
  private readonly logger = new Logger(BinancePayGateway.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    const environment = this.configService.get<string>(
      'BINANCE_PAY_ENVIRONMENT',
      'sandbox',
    );
    this.baseUrl =
      environment === 'production'
        ? 'https://bpay.binanceapi.com'
        : 'https://bpay.binanceapi.com'; // Binance Pay uses same URL for both
    this.apiKey = this.configService.get<string>('BINANCE_PAY_API_KEY');
    this.secretKey = this.configService.get<string>('BINANCE_PAY_SECRET_KEY');
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'USDT',
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    try {
      const timestamp = Date.now();
      const nonce = this.generateNonce();

      const requestBody = {
        env: {
          terminalType: 'WEB',
        },
        merchantTradeNo: `VG_${timestamp}_${nonce}`,
        orderAmount: amount.toFixed(2),
        currency: currency.toUpperCase(),
        goods: {
          goodsType: '02', // Virtual goods
          goodsCategory: 'Z000', // Others
          referenceGoodsId: metadata?.orderId || 'VG_ORDER',
          goodsName: metadata?.description || 'VirtualGifts Purchase',
        },
        returnUrl: metadata?.returnUrl || 'https://example.com/payment/success',
        cancelUrl: metadata?.cancelUrl || 'https://example.com/payment/cancel',
      };

      const signature = this.generateSignature(requestBody, timestamp, nonce);

      const response = await axios.post(
        `${this.baseUrl}/binancepay/openapi/v2/order`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'BinancePay-Timestamp': timestamp.toString(),
            'BinancePay-Nonce': nonce,
            'BinancePay-Certificate-SN': this.apiKey,
            'BinancePay-Signature': signature,
          },
        },
      );

      const { data } = response.data;

      return {
        id: data.prepayId,
        amount,
        currency: currency.toUpperCase(),
        status: this.mapBinancePayStatus(data.status),
        clientSecret: data.qrcodeLink || data.qrContent,
        metadata: {
          ...metadata,
          merchantTradeNo: requestBody.merchantTradeNo,
          qrcodeLink: data.qrcodeLink,
          qrContent: data.qrContent,
          deeplink: data.deeplink,
          checkoutUrl: data.checkoutUrl,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create Binance Pay payment intent', error);
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
      // Query payment status
      const status = await this.getPaymentStatus(paymentIntentId);

      return {
        success: status === PaymentStatus.COMPLETED,
        paymentId: paymentIntentId,
        transactionId: paymentMethodData.transactionId || paymentIntentId,
        status,
        amount: paymentMethodData.amount || 0,
        currency: paymentMethodData.currency || 'USDT',
        gatewayResponse: {
          prepayId: paymentIntentId,
          status: status,
        },
      };
    } catch (error) {
      this.logger.error('Failed to confirm Binance Pay payment', error);
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
      const timestamp = Date.now();
      const nonce = this.generateNonce();

      const requestBody = {
        refundRequestId: `REF_${timestamp}_${nonce}`,
        prepayId: paymentId,
        refundAmount: amount?.toFixed(2),
        refundReason: 'Customer requested refund',
      };

      const signature = this.generateSignature(requestBody, timestamp, nonce);

      const response = await axios.post(
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
        },
      );

      const { data } = response.data;

      return {
        success: data.status === 'SUCCESS',
        paymentId,
        transactionId: data.refundId,
        status:
          data.status === 'SUCCESS'
            ? PaymentStatus.REFUNDED
            : PaymentStatus.FAILED,
        amount: parseFloat(data.refundAmount || '0'),
        currency: data.currency || 'USDT',
        gatewayResponse: data,
      };
    } catch (error) {
      this.logger.error('Failed to refund Binance Pay payment', error);
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
  ): Promise<WebhookEvent> {
    try {
      // Verify webhook signature
      const isValid = this.verifyWebhookSignature(payload, signature);

      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      const event = JSON.parse(payload);

      return {
        id: event.data?.merchantTradeNo || `webhook_${Date.now()}`,
        type: event.bizType || 'PAY_SUCCESS',
        data: event.data,
        timestamp: event.bizIdStr
          ? parseInt(event.bizIdStr) / 1000
          : Date.now() / 1000,
      };
    } catch (error) {
      this.logger.error('Failed to verify Binance Pay webhook', error);
      throw new Error(
        `Binance Pay webhook verification failed: ${error.message}`,
      );
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const timestamp = Date.now();
      const nonce = this.generateNonce();

      const requestBody = {
        prepayId: paymentId,
      };

      const signature = this.generateSignature(requestBody, timestamp, nonce);

      const response = await axios.post(
        `${this.baseUrl}/binancepay/openapi/v2/order/query`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'BinancePay-Timestamp': timestamp.toString(),
            'BinancePay-Nonce': nonce,
            'BinancePay-Certificate-SN': this.apiKey,
            'BinancePay-Signature': signature,
          },
        },
      );

      const { data } = response.data;
      return this.mapBinancePayStatus(data.status);
    } catch (error) {
      this.logger.error('Failed to get Binance Pay payment status', error);
      return PaymentStatus.FAILED;
    }
  }

  private generateNonce(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

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

  private verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      // Extract timestamp and nonce from headers (would be passed separately in real implementation)
      const timestamp = Date.now(); // In real implementation, get from headers
      const nonce = 'webhook_nonce'; // In real implementation, get from headers

      const stringToSign = `${timestamp}\n${nonce}\n${payload}\n`;
      const expectedSignature = crypto
        .createHmac('sha512', this.secretKey)
        .update(stringToSign)
        .digest('hex')
        .toUpperCase();

      return signature === expectedSignature;
    } catch (error) {
      this.logger.error('Failed to verify webhook signature', error);
      return false;
    }
  }

  private mapBinancePayStatus(binanceStatus: string): PaymentStatus {
    switch (binanceStatus) {
      case 'INITIAL':
      case 'PENDING':
        return PaymentStatus.PENDING;
      case 'PAID':
      case 'SUCCESS':
        return PaymentStatus.COMPLETED;
      case 'CANCELED':
      case 'CANCELLED':
        return PaymentStatus.CANCELLED;
      case 'ERROR':
      case 'EXPIRED':
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.PENDING;
    }
  }
}
