import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CartService } from '../cart/cart.service';
import { StockValidationService } from '../common/services/stock-validation.service';
import { UserIdentificationService } from '../common/services/user-identification.service';
import { PaymentService } from '../payment/payment.service';
import { CreateOrderDto, PaymentMethodType } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderNumberUtils } from '../utils/order-number.utils';
import { generateOrderConfirmationEmail } from '../mail/templates/order/order-email';
import {
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  User,
  Product,
} from '@prisma/client';

export interface OrderWithItems extends Order {
  items: (OrderItem & {
    product: Product;
  })[];
  user: User;
}

export interface PurchaseResult {
  success: boolean;
  order?: OrderWithItems;
  paymentIntent?: any;
  error?: string;
  requiresAction?: boolean;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly cartService: CartService,
    private readonly stockValidationService: StockValidationService,
    private readonly userIdentificationService: UserIdentificationService,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * Process a complete purchase transaction
   */
  async processPurchase(
    createOrderDto: CreateOrderDto,
  ): Promise<PurchaseResult> {
    const transaction = await this.prisma.$transaction(async (prisma) => {
      try {
        this.logger.log(
          `Starting purchase process for ${createOrderDto.customerEmail}`,
        );

        // Step 1: Validate and prepare order items
        const orderItems = await this.prepareOrderItems(createOrderDto);

        // Step 2: Validate stock availability
        const stockValidation = await this.stockValidationService.validateStock(
          orderItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        );

        if (!stockValidation.valid) {
          throw new BadRequestException(
            `Stock validation failed: ${stockValidation.errors.join(', ')}`,
          );
        }

        // Step 3: Find or create user
        const guestUserData =
          this.userIdentificationService.createGuestUserFromShipping(
            createOrderDto.shipping,
          );
        const user =
          await this.userIdentificationService.findOrCreateGuestUser(
            guestUserData,
          );

        // Step 4: Calculate order totals
        const totals = this.calculateOrderTotals(
          orderItems,
          stockValidation.validatedProducts,
        );

        // Step 5: Create payment intent
        const paymentGateway = this.getPaymentGateway(
          createOrderDto.paymentMethod,
        );
        const orderNumber = OrderNumberUtils.generateOrderNumber();
        const paymentIntent = await this.paymentService.createPaymentIntent(
          createOrderDto.paymentMethod.type,
          paymentGateway,
          totals.total,
          'USD',
          {
            customerEmail: createOrderDto.customerEmail,
            orderId: orderNumber,
          },
        );

        // Step 6: Create order record
        const orderData = {
          orderNumber,
          status: OrderStatus.PENDING,
          total: totals.total,
          subtotal: totals.subtotal,
          tax: totals.tax,
          shipping: totals.shipping,
          discount: totals.discount,
          userId: user.id,
          shippingFirstName: createOrderDto.shipping.firstName,
          shippingLastName: createOrderDto.shipping.lastName,
          shippingEmail: createOrderDto.shipping.email,
          shippingAddress: createOrderDto.shipping.address,
          shippingCity: createOrderDto.shipping.city,
          shippingState: createOrderDto.shipping.state,
          shippingZipCode: createOrderDto.shipping.zipCode,
          shippingCountry: createOrderDto.shipping.country,
          shippingPhone: createOrderDto.shipping.phone,
          paymentMethod: createOrderDto.paymentMethod.type,
          paymentStatus: PaymentStatus.PENDING,
          transactionId: paymentIntent.id,
          paymentDetails: {
            gateway: paymentGateway,
            paymentIntentId: paymentIntent.id,
          },
        };

        const order = await prisma.order.create({
          data: orderData,
          include: {
            user: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        // Step 7: Create order items
        for (const item of orderItems) {
          const product = stockValidation.validatedProducts.find(
            (p) => p.id === item.productId,
          );
          if (!product) continue;

          await prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: item.productId,
              quantity: item.quantity,
              price: product.salePrice || product.price,
              total: Number(product.salePrice || product.price) * item.quantity,
            },
          });
        }

        // Step 8: Reserve stock
        await this.stockValidationService.reserveStock(
          orderItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        );

        // Step 9: Clear cart if used
        if (createOrderDto.cartId) {
          await this.cartService.clearCart(createOrderDto.cartId);
        }

        // Step 10: Get complete order with items
        const completeOrder = await this.getOrderWithItems(order.id);

        this.logger.log(`Order created successfully: ${order.orderNumber}`);

        // Step 11: Attempt automatic payment confirmation for certain payment methods
        if (this.shouldAutoConfirmPayment(createOrderDto.paymentMethod)) {
          try {
            const confirmationResult = await this.confirmPayment(
              order.id,
              this.preparePaymentMethodData(createOrderDto.paymentMethod),
            );

            if (confirmationResult.success) {
              return confirmationResult;
            } else {
              // If auto-confirmation fails, return the order for manual confirmation
              this.logger.warn(
                `Auto-confirmation failed for order ${order.orderNumber}: ${confirmationResult.error}`,
              );
            }
          } catch (error) {
            this.logger.warn(
              `Auto-confirmation error for order ${order.orderNumber}: ${error.message}`,
            );
          }
        }

        return {
          success: true,
          order: completeOrder,
          paymentIntent,
          requiresAction:
            (paymentIntent.status as string) === 'requires_action' ||
            (paymentIntent.status as string) === 'requires_payment_method',
        };
      } catch (error) {
        this.logger.error(
          'Purchase transaction failed',
          (error as Error)?.stack,
        );
        throw error;
      }
    });

    return transaction;
  }

  /**
   * Confirm payment and complete order
   */
  async confirmPayment(
    orderId: string,
    paymentMethodData: any,
  ): Promise<PurchaseResult> {
    try {
      const order = await this.findOne(orderId);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.paymentStatus === PaymentStatus.COMPLETED) {
        this.logger.log(`Order ${order.orderNumber} already completed`);
        return { success: true, order };
      }

      // Check if this is a webhook-triggered confirmation
      const isWebhookConfirmation = paymentMethodData?.confirmed_via_webhook;

      let paymentResult: any;

      if (isWebhookConfirmation) {
        // For webhook confirmations, we trust the webhook verification
        this.logger.log(
          `Processing webhook confirmation for order ${order.orderNumber}`,
        );
        paymentResult = {
          success: true,
          paymentId: order.transactionId,
          transactionId: order.transactionId,
          status: PaymentStatus.COMPLETED,
          amount: Number(order.total),
          currency: 'USD',
        };
      } else {
        // Process payment confirmation through gateway
        const paymentGateway = this.getPaymentGatewayFromOrder(order);
        paymentResult = await this.paymentService.processPayment(
          order.paymentMethod as PaymentMethodType,
          paymentGateway,
          order.transactionId,
          paymentMethodData,
        );
      }

      if (paymentResult.success) {
        // Update order status in a transaction to ensure consistency
        const updatedOrder = await this.prisma.$transaction(async (prisma) => {
          // Update order status
          const orderUpdate = await prisma.order.update({
            where: { id: orderId },
            data: {
              status: OrderStatus.PROCESSING,
              paymentStatus: PaymentStatus.COMPLETED,
              transactionId: paymentResult.transactionId || order.transactionId,
              paymentDetails: {
                ...((order.paymentDetails as any) || {}),
                confirmedAt: new Date().toISOString(),
                confirmationMethod: isWebhookConfirmation
                  ? 'webhook'
                  : 'manual',
                webhookEventType: paymentMethodData?.webhook_event_type,
              },
            },
            include: {
              user: true,
              items: {
                include: {
                  product: true,
                },
              },
            },
          });

          // Update stock levels (reduce available stock)
          for (const item of order.items) {
            await prisma.product.update({
              where: { id: item.productId },
              data: {
                stock: {
                  decrement: item.quantity,
                },
              },
            });
          }

          return orderUpdate;
        });

        // Send confirmation email (outside transaction to avoid blocking)
        try {
          await this.sendOrderConfirmationEmail(updatedOrder);
        } catch (emailError) {
          this.logger.error(
            `Failed to send confirmation email for order ${order.orderNumber}`,
            (emailError as Error)?.stack,
          );
          // Don't fail the entire process if email fails
        }

        this.logger.log(`Payment confirmed for order: ${order.orderNumber}`);

        return {
          success: true,
          order: updatedOrder,
        };
      } else {
        // Payment failed - handle failure
        await this.handlePaymentFailure(orderId, paymentResult.error);

        return {
          success: false,
          error: paymentResult.error || 'Payment failed',
        };
      }
    } catch (error) {
      this.logger.error('Payment confirmation failed', (error as Error)?.stack);

      // If this is a critical error, mark the order as failed
      try {
        await this.handlePaymentFailure(orderId, error.message);
      } catch (failureError) {
        this.logger.error(
          'Failed to handle payment failure',
          (failureError as Error)?.stack,
        );
      }

      throw new BadRequestException(
        `Payment confirmation failed: ${error.message}`,
      );
    }
  }

  /**
   * Handle payment failure - update order status and release stock
   */
  private async handlePaymentFailure(
    orderId: string,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) return;

      // Update order status
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.FAILED,
          paymentDetails: {
            ...((order.paymentDetails as any) || {}),
            failedAt: new Date().toISOString(),
            failureReason: errorMessage,
          },
        },
      });

      // Release reserved stock
      if (order.items.length > 0) {
        await this.stockValidationService.releaseStock(
          order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        );
      }

      this.logger.log(
        `Payment failure handled for order ${order.orderNumber}: ${errorMessage}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle payment failure for order ${orderId}`,
        (error as Error)?.stack,
      );
    }
  }

  /**
   * Get order by ID with all related data
   */
  async findOne(id: string): Promise<OrderWithItems> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id },
        include: {
          user: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException(`Order with ID ${id} not found`);
      }

      return order;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to find order', (error as Error)?.stack);
      throw new BadRequestException('Could not retrieve order');
    }
  }

  /**
   * Get all orders with pagination
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: OrderStatus,
  ): Promise<{
    orders: OrderWithItems[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const where = status ? { status } : {};

      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            user: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        orders,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Failed to find orders', (error as Error)?.stack);
      throw new BadRequestException('Could not retrieve orders');
    }
  }

  /**
   * Update order status
   */
  async update(
    id: string,
    updateOrderDto: UpdateOrderDto,
  ): Promise<OrderWithItems> {
    try {
      // Only allow updating status and paymentStatus
      const allowedUpdates: {
        status?: OrderStatus;
        paymentStatus?: PaymentStatus;
      } = {};

      if (updateOrderDto.status !== undefined) {
        allowedUpdates.status = updateOrderDto.status;
      }

      if (updateOrderDto.paymentStatus !== undefined) {
        allowedUpdates.paymentStatus = updateOrderDto.paymentStatus;
      }

      // First update the order
      await this.prisma.order.update({
        where: { id },
        data: allowedUpdates,
      });

      // Then fetch the complete order with relations
      const order = await this.findOne(id);

      this.logger.log(`Order updated: ${order.orderNumber}`);
      return order;
    } catch (error) {
      this.logger.error('Failed to update order', (error as Error)?.stack);
      throw new BadRequestException('Could not update order');
    }
  }

  /**
   * Cancel order and release stock
   */
  async remove(id: string): Promise<{ success: boolean }> {
    try {
      const order = await this.findOne(id);

      if (order.status === OrderStatus.DELIVERED) {
        throw new BadRequestException('Cannot cancel delivered order');
      }

      // Release stock if order was not completed
      if (order.paymentStatus !== PaymentStatus.COMPLETED) {
        await this.stockValidationService.releaseStock(
          order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        );
      }

      // Update order status
      await this.prisma.order.update({
        where: { id },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });

      this.logger.log(`Order cancelled: ${order.orderNumber}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to cancel order', (error as Error)?.stack);
      throw new BadRequestException('Could not cancel order');
    }
  }

  // Helper methods

  private async prepareOrderItems(createOrderDto: CreateOrderDto) {
    if (createOrderDto.cartId) {
      // Get items from cart
      const cart = await this.cartService.getCartById(createOrderDto.cartId);
      return cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }));
    } else if (createOrderDto.items) {
      // Use provided items
      return createOrderDto.items;
    } else {
      throw new BadRequestException('Either cartId or items must be provided');
    }
  }

  private calculateOrderTotals(orderItems: any[], products: Product[]) {
    let subtotal = 0;

    orderItems.forEach((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (product) {
        const price = Number(product.salePrice || product.price);
        subtotal += price * item.quantity;
      }
    });

    const tax = subtotal * 0.08; // 8% tax
    const shipping = 0; // Free shipping for digital products
    const discount = 0; // No discount for now
    const total = subtotal + tax + shipping - discount;

    return {
      subtotal: Number(subtotal.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      shipping: Number(shipping.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }

  private getPaymentGateway(paymentMethod: any): string {
    switch (paymentMethod.type) {
      case PaymentMethodType.CREDIT_CARD:
        return paymentMethod.creditCard?.gateway || 'stripe';
      case PaymentMethodType.CRYPTO:
        return paymentMethod.crypto?.gateway || 'coinbase';
      case PaymentMethodType.PAYPAL:
        return 'paypal';
      case PaymentMethodType.BINANCE_PAY:
        return 'binance_pay';
      default:
        throw new BadRequestException('Unsupported payment method');
    }
  }

  private getPaymentGatewayFromOrder(order: Order): string {
    const paymentDetails = order.paymentDetails as any;
    return paymentDetails?.gateway || 'stripe';
  }

  private async getOrderWithItems(orderId: string): Promise<OrderWithItems> {
    return await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  private async sendOrderConfirmationEmail(
    order: OrderWithItems,
  ): Promise<void> {
    try {
      const emailData = {
        orderNumber: order.orderNumber,
        customerName: `${order.user.firstName} ${order.user.lastName}`,
        customerEmail: order.user.email,
        orderDate: order.createdAt.toLocaleDateString(),
        items: order.items.map((item) => ({
          id: item.id,
          name: item.product.name,
          price: Number(item.price),
          quantity: item.quantity,
          type: 'license' as const,
        })),
        subtotal: Number(order.subtotal),
        tax: Number(order.tax),
        total: Number(order.total),
        paymentMethod: order.paymentMethod || 'Unknown',
      };

      const emailHtml = generateOrderConfirmationEmail(emailData);

      await this.mailService.sendEmail(
        order.user.email,
        `Order Confirmation - ${order.orderNumber}`,
        emailHtml,
      );

      this.logger.log(
        `Confirmation email sent for order: ${order.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to send confirmation email',
        (error as Error)?.stack,
      );
      // Don't throw error as email failure shouldn't block order completion
    }
  }

  /**
   * Determine if payment should be auto-confirmed based on payment method
   */
  private shouldAutoConfirmPayment(paymentMethod: any): boolean {
    // Auto-confirm for certain payment methods that don't require additional user action
    switch (paymentMethod.type) {
      case PaymentMethodType.CREDIT_CARD:
        // Only auto-confirm if we have a payment token (not requiring 3D Secure)
        return !!paymentMethod.creditCard?.token;
      case PaymentMethodType.CRYPTO:
        // Crypto payments typically require manual confirmation
        return false;
      case PaymentMethodType.PAYPAL:
        // PayPal payments with payment ID can be auto-confirmed
        return !!paymentMethod.paypal?.paymentId;
      case PaymentMethodType.BINANCE_PAY:
        // Binance Pay typically requires user interaction
        return false;
      default:
        return false;
    }
  }

  /**
   * Prepare payment method data for confirmation
   */
  private preparePaymentMethodData(paymentMethod: any): any {
    switch (paymentMethod.type) {
      case PaymentMethodType.CREDIT_CARD:
        return {
          payment_method: paymentMethod.creditCard?.token,
          return_url:
            paymentMethod.creditCard?.returnUrl || 'https://example.com/return',
        };
      case PaymentMethodType.PAYPAL:
        return {
          paymentId: paymentMethod.paypal?.paymentId,
          payerId: paymentMethod.paypal?.payerId,
        };
      case PaymentMethodType.CRYPTO:
        return {
          walletAddress: paymentMethod.crypto?.walletAddress,
          currency: paymentMethod.crypto?.currency,
        };
      case PaymentMethodType.BINANCE_PAY:
        return {
          currency: paymentMethod.binancePay?.currency,
          returnUrl: paymentMethod.binancePay?.returnUrl,
        };
      default:
        return {};
    }
  }

  /**
   * Find order by transaction ID (for webhook processing)
   */
  async findByTransactionId(
    transactionId: string,
  ): Promise<OrderWithItems | null> {
    try {
      const order = await this.prisma.order.findFirst({
        where: { transactionId },
        include: {
          user: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      return order;
    } catch (error) {
      this.logger.error(
        'Failed to find order by transaction ID',
        (error as Error)?.stack,
      );
      return null;
    }
  }

  /**
   * Update order payment status from webhook
   */
  async updatePaymentStatusFromWebhook(
    transactionId: string,
    paymentStatus: PaymentStatus,
    eventType?: string,
  ): Promise<void> {
    try {
      const order = await this.findByTransactionId(transactionId);
      if (!order) {
        this.logger.warn(
          `Order not found for transaction ID: ${transactionId}`,
        );
        return;
      }

      // Don't update if already in final state
      if (
        order.paymentStatus === PaymentStatus.COMPLETED ||
        order.paymentStatus === PaymentStatus.REFUNDED
      ) {
        return;
      }

      let orderStatus = order.status;

      // Update order status based on payment status
      switch (paymentStatus) {
        case PaymentStatus.COMPLETED:
          orderStatus = OrderStatus.PROCESSING;
          break;
        case PaymentStatus.FAILED:
          orderStatus = OrderStatus.CANCELLED;
          // Release reserved stock
          await this.stockValidationService.releaseStock(
            order.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          );
          break;
        case PaymentStatus.REFUNDED:
          orderStatus = OrderStatus.REFUNDED;
          break;
      }

      // Update order
      const updatedOrder = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus,
          status: orderStatus,
        },
        include: {
          user: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      // Send confirmation email for successful payments
      if (paymentStatus === PaymentStatus.COMPLETED) {
        await this.sendOrderConfirmationEmail(updatedOrder);
      }

      this.logger.log(
        `Order ${order.orderNumber} updated via webhook: ${eventType} - ${paymentStatus}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to update order from webhook',
        (error as Error)?.stack,
      );
    }
  }
}
