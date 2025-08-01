import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { StripeGateway } from './gateways/stripe.gateway';
import { PayPalGateway } from './gateways/paypal.gateway';
import { CryptoGateway } from './gateways/crypto.gateway';
import { BinancePayGateway } from './gateways/binance-pay.gateway';
import { NowPaymentsGateway } from './gateways/nowpayments.gateway';
import { BitPayGateway } from './gateways/bitpay.gateway';
import { CoinbaseGateway } from './gateways/coinbase.gateway';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [ConfigModule, OrdersModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    StripeGateway,
    PayPalGateway,
    CryptoGateway,
    BinancePayGateway,
    NowPaymentsGateway,
    BitPayGateway,
    CoinbaseGateway,
  ],
  exports: [
    PaymentService,
    StripeGateway,
    PayPalGateway,
    CryptoGateway,
    BinancePayGateway,
    NowPaymentsGateway,
    BitPayGateway,
    CoinbaseGateway,
  ],
})
export class PaymentModule {}
