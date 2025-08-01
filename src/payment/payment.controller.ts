import {
  Controller,
  Post,
  Body,
  Headers,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { OrdersService } from '../orders/orders.service';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly ordersService: OrdersService,
  ) {}

  @Post('webhook/:gateway')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle payment gateway webhooks' })
  @ApiParam({
    name: 'gateway',
    description: 'Payment gateway name',
    example: 'stripe',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid webhook data',
  })
  async handleWebhook(
    @Param('gateway') gateway: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
  ) {
    try {
      this.logger.log(`Received webhook from ${gateway}`);

      // Get signature from headers (different for each gateway)
      const signature = this.getSignatureFromHeaders(gateway, headers);

      // Verify and process webhook
      const webhookResult = await this.paymentService.handleWebhook(
        gateway,
        JSON.stringify(payload),
        signature,
      );

      if (!webhookResult.success) {
        throw new BadRequestException(webhookResult.error);
      }

      // Update order status based on webhook
      if (webhookResult.paymentId && webhookResult.status) {
        await this.updateOrderFromWebhook(
          webhookResult.paymentId,
          webhookResult.status,
          webhookResult.eventType,
        );
      }

      this.logger.log(
        `Webhook processed successfully: ${webhookResult.eventType}`,
      );

      return {
        success: true,
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Webhook processing failed: ${errorMessage}`,
        errorStack,
      );
      throw new BadRequestException(
        `Webhook processing failed: ${errorMessage}`,
      );
    }
  }

  @Post('retry/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry failed payment' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment retry initiated',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async retryPayment(
    @Param('orderId') orderId: string,
    @Body() paymentMethodData: any,
  ) {
    try {
      this.logger.log(`Retrying payment for order: ${orderId}`);

      const result = await this.ordersService.confirmPayment(
        orderId,
        paymentMethodData,
      );

      if (result.success) {
        this.logger.log(`Payment retry successful for order: ${orderId}`);
      } else {
        this.logger.warn(`Payment retry failed for order: ${orderId}`);
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Payment retry failed: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  @Post('refund/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process refund for order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Refund processed successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async processRefund(
    @Param('orderId') orderId: string,
    @Body() refundData: { amount?: number; reason?: string },
  ) {
    try {
      this.logger.log(`Processing refund for order: ${orderId}`);

      const order = await this.ordersService.findOne(orderId);
      const gateway = this.getPaymentGatewayFromOrder(order);

      const refundResult = await this.paymentService.refundPayment(
        gateway,
        order.transactionId,
        refundData.amount,
      );

      if (refundResult.success) {
        // Update order status
        await this.ordersService.update(orderId, {
          status: 'REFUNDED' as const,
          paymentStatus: 'REFUNDED' as const,
        });

        this.logger.log(`Refund processed successfully for order: ${orderId}`);
      } else {
        this.logger.warn(`Refund failed for order: ${orderId}`);
      }

      return refundResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Refund processing failed: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  private getSignatureFromHeaders(
    gateway: string,
    headers: Record<string, string>,
  ): string {
    switch (gateway.toLowerCase()) {
      case 'stripe':
        return headers['stripe-signature'] || '';
      case 'paypal':
        return headers['paypal-transmission-sig'] || '';
      case 'coinbase':
        return headers['x-cc-webhook-signature'] || '';
      case 'bitpay':
        return headers['x-signature'] || '';
      case 'binance_pay':
        return headers['binancepay-signature'] || '';
      case 'nowpayments':
        return headers['x-nowpayments-sig'] || '';
      default:
        return '';
    }
  }

  private async updateOrderFromWebhook(
    paymentId: string,
    paymentStatus: any,
    eventType?: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Processing webhook update: Payment ${paymentId} status changed to ${paymentStatus} (${eventType})`,
      );

      // Update order status from webhook using the existing method in OrdersService
      await this.ordersService.updatePaymentStatusFromWebhook(
        paymentId,
        paymentStatus,
        eventType,
      );

      // If payment is completed, trigger the confirmPayment process to ensure order completion
      if (paymentStatus === 'COMPLETED') {
        const order = await this.ordersService.findByTransactionId(paymentId);
        if (order && order.paymentStatus !== 'COMPLETED') {
          this.logger.log(
            `Triggering payment confirmation for order ${order.orderNumber} via webhook`,
          );

          // Prepare payment method data based on the order's payment method
          const paymentMethodData = this.prepareWebhookPaymentData(
            order,
            eventType,
          );

          // Confirm the payment to complete the order process
          await this.ordersService.confirmPayment(order.id, paymentMethodData);
        }
      }

      this.logger.log(
        `Successfully processed webhook update for payment ${paymentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update order from webhook for payment ${paymentId}`,
        error.stack,
      );
      // Don't throw error to avoid webhook retry loops
      // The payment gateway will retry if needed
    }
  }

  /**
   * Prepare payment method data for webhook-triggered confirmation
   */
  private prepareWebhookPaymentData(order: any, eventType?: string): any {
    const paymentMethod = order.paymentMethod;
    const paymentDetails = order.paymentDetails as any;

    switch (paymentMethod) {
      case 'credit_card':
        return {
          payment_method:
            paymentDetails?.paymentMethodId || 'webhook_confirmed',
          confirmed_via_webhook: true,
          webhook_event_type: eventType,
        };
      case 'crypto':
        return {
          transaction_hash: paymentDetails?.transactionHash,
          wallet_address: paymentDetails?.walletAddress,
          currency: paymentDetails?.currency,
          confirmed_via_webhook: true,
          webhook_event_type: eventType,
        };
      case 'paypal':
        return {
          paymentId: paymentDetails?.paymentId,
          payerId: paymentDetails?.payerId,
          confirmed_via_webhook: true,
          webhook_event_type: eventType,
        };
      case 'binance_pay':
        return {
          prepayId: paymentDetails?.prepayId,
          merchantTradeNo: paymentDetails?.merchantTradeNo,
          confirmed_via_webhook: true,
          webhook_event_type: eventType,
        };
      default:
        return {
          confirmed_via_webhook: true,
          webhook_event_type: eventType,
        };
    }
  }

  private getPaymentGatewayFromOrder(order: any): string {
    // Extract gateway from order payment details
    const paymentDetails = order.paymentDetails as any;
    return paymentDetails?.gateway || 'stripe';
  }
}
