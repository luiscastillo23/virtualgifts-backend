export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  clientSecret?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  success: boolean;
  paymentId: string;
  transactionId?: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  gatewayResponse?: any;
  error?: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  signature?: string;
  timestamp: number;
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentGateway {
  STRIPE = 'stripe',
  SQUARE = 'square',
  COINBASE = 'coinbase',
  BITPAY = 'bitpay',
  NOWPAYMENTS = 'nowpayments',
  BINANCE_PAY = 'binance_pay',
  PAYPAL = 'paypal',
}

export interface PaymentGatewayInterface {
  createPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent>;

  confirmPayment(
    paymentIntentId: string,
    paymentMethodData: any,
  ): Promise<PaymentResult>;

  refundPayment(paymentId: string, amount?: number): Promise<PaymentResult>;

  verifyWebhook(payload: string, signature: string): Promise<WebhookEvent>;

  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
}
