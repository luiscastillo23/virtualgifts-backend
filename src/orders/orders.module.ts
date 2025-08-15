import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { CartModule } from '../cart/cart.module';
import { StockValidationService } from '../common/services/stock-validation.service';
import { UserIdentificationService } from '../common/services/user-identification.service';
// 1. Import the PaymentModule
import { PaymentModule } from '../payment/payment.module';

@Module({
  // 2. Import PaymentModule using forwardRef to break the cycle
  imports: [
    ConfigModule,
    PrismaModule,
    MailModule,
    CartModule,
    forwardRef(() => PaymentModule),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    StockValidationService,
    UserIdentificationService,
    // 3. CRITICAL: Remove PaymentService and ALL gateways from this providers array.
    // They are now correctly provided by the imported PaymentModule.
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
