import { Module, forwardRef } from '@nestjs/common';
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
// 1. Import the OrdersModule
import { OrdersModule } from '../orders/orders.module';

@Module({
  // 2. Use forwardRef to import the OrdersModule
  imports: [ConfigModule, forwardRef(() => OrdersModule)],
  controllers: [PaymentController],
  // 3. This is now the single source of truth for these providers
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
  // 4. Export the services so other modules (like OrdersModule) can use them
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
