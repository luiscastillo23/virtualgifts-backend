import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsDecimal,
  IsInt,
  Min,
  IsArray,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty({
    description: 'Name of the product (must be unique)',
    example: 'Premium Gift Card',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Product name cannot be empty.' })
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'Unique slug for the product',
    example: 'premium-gift-card',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Slug cannot be empty.' })
  slug: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the product',
    example: 'A premium digital gift card perfect for any occasion',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Regular price of the product',
    example: 25.99,
    required: true,
  })
  @IsNotEmpty({ message: 'Price cannot be empty.' })
  @Transform(({ value }) => parseFloat(value))
  @IsDecimal(
    { decimal_digits: '0,2' },
    { message: 'Price must be a valid decimal with up to 2 decimal places.' },
  )
  @Min(0, { message: 'Price must be greater than or equal to 0.' })
  price: number;

  @ApiPropertyOptional({
    description: 'Sale price of the product (optional)',
    example: 19.99,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  @IsDecimal(
    { decimal_digits: '0,2' },
    {
      message:
        'Sale price must be a valid decimal with up to 2 decimal places.',
    },
  )
  @Min(0, { message: 'Sale price must be greater than or equal to 0.' })
  salePrice?: number;

  @ApiProperty({
    description: 'Unique SKU (Stock Keeping Unit) for inventory tracking',
    example: 'PGC-001',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'SKU cannot be empty.' })
  @MaxLength(50)
  sku: string;

  @ApiProperty({
    description: 'Stock quantity available',
    example: 100,
    required: true,
  })
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'Stock must be an integer.' })
  @Min(0, { message: 'Stock must be greater than or equal to 0.' })
  stock: number;

  @ApiProperty({
    description: 'Array of image URLs for the product',
    example: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
    required: true,
  })
  @IsNotEmpty({ message: 'Images cannot be empty.' })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiPropertyOptional({
    description: 'Whether the product is featured',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  @ApiProperty({
    description: 'Status of the product',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
    required: true,
    example: ProductStatus.ACTIVE,
  })
  @IsEnum(ProductStatus)
  @IsNotEmpty({ message: 'Product status cannot be empty.' })
  status: ProductStatus;

  @ApiProperty({
    description: 'Category ID that the product belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Category ID cannot be empty.' })
  @IsUUID(4, { message: 'Category ID must be a valid UUID.' })
  categoryId: string;

  @ApiPropertyOptional({
    description: 'Subcategory ID that the product belongs to (optional)',
    example: '123e4567-e89b-12d3-a456-426614174001',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsUUID(4, { message: 'Subcategory ID must be a valid UUID.' })
  subcategoryId?: string;
}
