import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { CartModule } from '../cart/cart.module';
import { StockValidationService } from '../common/services/stock-validation.service';
import { UserIdentificationService } from '../common/services/user-identification.service';
import { PaymentService } from '../payment/payment.service';
import { StripeGateway } from '../payment/gateways/stripe.gateway';
import { PayPalGateway } from '../payment/gateways/paypal.gateway';
import { BinancePayGateway } from '../payment/gateways/binance-pay.gateway';
import { CryptoGateway } from '../payment/gateways/crypto.gateway';
import { NowPaymentsGateway } from '../payment/gateways/nowpayments.gateway';
import { BitPayGateway } from '../payment/gateways/bitpay.gateway';
import { CoinbaseGateway } from '../payment/gateways/coinbase.gateway';

@Module({
  imports: [ConfigModule, PrismaModule, MailModule, CartModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    StockValidationService,
    UserIdentificationService,
    PaymentService,
    StripeGateway,
    PayPalGateway,
    CryptoGateway,
    BinancePayGateway,
    NowPaymentsGateway,
    BitPayGateway,
    CoinbaseGateway,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
