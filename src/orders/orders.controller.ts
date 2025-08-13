import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderStatus } from '@prisma/client';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process a complete purchase transaction' })
  @ApiResponse({
    status: 200,
    description: 'Purchase processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid purchase data or insufficient stock',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error during purchase processing',
  })
  async processPurchase(@Body() createOrderDto: CreateOrderDto) {
    return await this.ordersService.processPurchase(createOrderDto);
  }

  @Post(':id/confirm-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm payment for an order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment confirmed successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Payment confirmation failed',
  })
  async confirmPayment(
    @Param('id') id: string,
    @Body() paymentMethodData: any,
  ) {
    return await this.ordersService.confirmPayment(id, paymentMethodData);
  }

  @Post(':id/retry-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry payment for a failed order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment retry initiated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Payment retry failed or order not eligible for retry',
  })
  async retryPayment(@Param('id') id: string, @Body() paymentMethodData: any) {
    // First check if order exists and is eligible for retry
    const order = await this.ordersService.findOne(id);

    if (order.paymentStatus === 'COMPLETED') {
      throw new BadRequestException('Order payment is already completed');
    }

    if (order.status === 'DELIVERED' || order.status === 'REFUNDED') {
      throw new BadRequestException('Order is not eligible for payment retry');
    }

    return await this.ordersService.confirmPayment(id, paymentMethodData);
  }

  @Get(':id/payment-status')
  @ApiOperation({ summary: 'Get payment status for an order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment status retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async getPaymentStatus(@Param('id') id: string) {
    const order = await this.ordersService.findOne(id);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      transactionId: order.transactionId,
      paymentMethod: order.paymentMethod,
      total: order.total,
      canRetry:
        order.paymentStatus === 'FAILED' || order.paymentStatus === 'PENDING',
      requiresAction:
        order.paymentStatus === 'PENDING' && order.status === 'PENDING',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders with pagination' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    example: 10,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by order status',
    enum: OrderStatus,
  })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
  })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: OrderStatus,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.ordersService.findAll(pageNum, limitNum, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async findOne(@Param('id') id: string) {
    return await this.ordersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return await this.ordersService.update(id, updateOrderDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel order' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel delivered order',
  })
  async remove(@Param('id') id: string) {
    return await this.ordersService.remove(id);
  }
}
