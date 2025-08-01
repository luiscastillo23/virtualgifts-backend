import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class NowPaymentsDetailsDto {
  @ApiProperty({
    description: 'Cryptocurrency for payment',
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

  @ApiPropertyOptional({
    description: 'Payment ID from NOWPayments',
    example: 'payment_123456789',
  })
  @IsOptional()
  @IsString()
  paymentId?: string;

  @ApiPropertyOptional({
    description: 'Wallet address for payment',
    example: '0x1234567890abcdef',
  })
  @IsOptional()
  @IsString()
  walletAddress?: string;
}
