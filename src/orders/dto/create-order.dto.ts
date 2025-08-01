import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsEnum,
  IsUUID,
  ValidateNested,
  IsArray,
  ArrayMinSize,
  IsNumber,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NowPaymentsDetailsDto } from './nowpayments-details.dto';

// Payment method enums and interfaces
export enum PaymentMethodType {
  CREDIT_CARD = 'credit_card',
  CRYPTO = 'crypto',
  BINANCE_PAY = 'binance_pay',
  PAYPAL = 'paypal',
}

export enum CryptoGateway {
  COINBASE = 'coinbase',
  BITPAY = 'bitpay',
  NOWPAYMENTS = 'nowpayments',
}

export enum CreditCardGateway {
  STRIPE = 'stripe',
  SQUARE = 'square',
}

export enum CryptoCurrency {
  BTC = 'BTC',
  ETH = 'ETH',
  LTC = 'LTC',
  BCH = 'BCH',
  USDT = 'USDT',
  USDC = 'USDC',
}

// Payment details DTOs
export class CreditCardDetailsDto {
  @ApiProperty({
    description: 'Payment token from gateway',
    example: 'tok_1234567890',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'Credit card gateway',
    enum: CreditCardGateway,
    example: CreditCardGateway.STRIPE,
  })
  @IsEnum(CreditCardGateway)
  gateway: CreditCardGateway;

  @ApiPropertyOptional({
    description: 'Last 4 digits of card (for display)',
    example: '4242',
  })
  @IsOptional()
  @IsString()
  last4?: string;

  @ApiPropertyOptional({
    description: 'Card brand',
    example: 'visa',
  })
  @IsOptional()
  @IsString()
  brand?: string;
}

export class CryptoDetailsDto {
  @ApiProperty({
    description: 'Cryptocurrency type',
    enum: CryptoCurrency,
    example: CryptoCurrency.BTC,
  })
  @IsEnum(CryptoCurrency)
  currency: CryptoCurrency;

  @ApiProperty({
    description: 'Crypto payment gateway',
    enum: CryptoGateway,
    example: CryptoGateway.COINBASE,
  })
  @IsEnum(CryptoGateway)
  gateway: CryptoGateway;

  @ApiPropertyOptional({
    description: 'Wallet address for payment',
    example: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  })
  @IsOptional()
  @IsString()
  walletAddress?: string;
}

export class BinancePayDetailsDto {
  @ApiProperty({
    description: 'Currency for Binance Pay',
    example: 'USDT',
  })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    description: 'Return URL after payment',
    example: 'https://example.com/payment/success',
  })
  @IsString()
  @IsNotEmpty()
  returnUrl: string;

  @ApiProperty({
    description: 'Cancel URL if payment is cancelled',
    example: 'https://example.com/payment/cancel',
  })
  @IsString()
  @IsNotEmpty()
  cancelUrl: string;
}

export class PayPalDetailsDto {
  @ApiPropertyOptional({
    description: 'PayPal payment ID',
    example: 'PAYID-123456789',
  })
  @IsOptional()
  @IsString()
  paymentId?: string;

  @ApiPropertyOptional({
    description: 'PayPal payer ID',
    example: 'PAYER123456789',
  })
  @IsOptional()
  @IsString()
  payerId?: string;

  @ApiPropertyOptional({
    description: 'Return URL after payment',
    example: 'https://example.com/payment/success',
  })
  @IsOptional()
  @IsString()
  returnUrl?: string;

  @ApiPropertyOptional({
    description: 'Cancel URL if payment is cancelled',
    example: 'https://example.com/payment/cancel',
  })
  @IsOptional()
  @IsString()
  cancelUrl?: string;
}

// Payment method DTO
export class PaymentMethodDto {
  @ApiProperty({
    description: 'Payment method type',
    enum: PaymentMethodType,
    example: PaymentMethodType.CREDIT_CARD,
  })
  @IsEnum(PaymentMethodType)
  type: PaymentMethodType;

  @ApiPropertyOptional({
    description: 'Credit card payment details',
    type: CreditCardDetailsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardDetailsDto)
  creditCard?: CreditCardDetailsDto;

  @ApiPropertyOptional({
    description: 'Cryptocurrency payment details',
    type: CryptoDetailsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CryptoDetailsDto)
  crypto?: CryptoDetailsDto;

  @ApiPropertyOptional({
    description: 'Binance Pay payment details',
    type: BinancePayDetailsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BinancePayDetailsDto)
  binancePay?: BinancePayDetailsDto;

  @ApiPropertyOptional({
    description: 'PayPal payment details',
    type: PayPalDetailsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PayPalDetailsDto)
  paypal?: PayPalDetailsDto;

  /*
  @ApiPropertyOptional({
    description: 'NOWPayments payment details',
    type: NowPaymentsDetailsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NowPaymentsDetailsDto)
  nowPayments?: NowPaymentsDetailsDto; */
}

// Shipping address DTO
export class ShippingAddressDto {
  @ApiProperty({
    description: 'First name for shipping',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    description: 'Last name for shipping',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    description: 'Email address for shipping notifications',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Street address',
    example: '123 Main Street',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'City',
    example: 'New York',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'State or province',
    example: 'NY',
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({
    description: 'ZIP or postal code',
    example: '10001',
  })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({
    description: 'Country',
    example: 'United States',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+1-555-123-4567',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}

// Order item DTO
export class OrderItemDto {
  @ApiProperty({
    description: 'Product ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID(4, { message: 'Product ID must be a valid UUID.' })
  productId: string;

  @ApiProperty({
    description: 'Quantity to order',
    example: 2,
    minimum: 1,
  })
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1, { message: 'Quantity must be at least 1.' })
  quantity: number;

  @ApiProperty({
    description: 'Price per unit at time of order',
    example: 25.99,
  })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Price must be greater than or equal to 0.' })
  price: number;
}

// Main CreateOrderDto
export class CreateOrderDto {
  @ApiProperty({
    description: 'Customer email (for guest checkout)',
    example: 'customer@example.com',
  })
  @IsEmail()
  customerEmail: string;

  @ApiPropertyOptional({
    description: 'User ID if authenticated user',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  @IsUUID(4, { message: 'User ID must be a valid UUID.' })
  userId?: string;

  @ApiPropertyOptional({
    description: 'Cart ID to convert to order',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsString()
  @IsUUID(4, { message: 'Cart ID must be a valid UUID.' })
  cartId?: string;

  @ApiPropertyOptional({
    description: 'Order items (if not using cart)',
    type: [OrderItemDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one order item is required.' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @ApiProperty({
    description: 'Payment method details',
    type: PaymentMethodDto,
  })
  @ValidateNested()
  @Type(() => PaymentMethodDto)
  paymentMethod: PaymentMethodDto;

  @ApiProperty({
    description: 'Shipping information',
    type: ShippingAddressDto,
  })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shipping: ShippingAddressDto;

  @ApiPropertyOptional({
    description: 'Order subtotal',
    example: 51.98,
  })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal?: number;

  @ApiPropertyOptional({
    description: 'Tax amount',
    example: 4.16,
  })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax?: number;

  @ApiPropertyOptional({
    description: 'Shipping cost',
    example: 0.0,
  })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shipping_cost?: number;

  @ApiPropertyOptional({
    description: 'Discount amount',
    example: 5.0,
  })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({
    description: 'Order total',
    example: 51.14,
  })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total?: number;

  @ApiPropertyOptional({
    description: 'Additional notes for the order',
    example: 'Please deliver after 5 PM',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
