import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { CategoryStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Name of the category (must be unique)',
    example: 'Gifts for Her',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Category name cannot be empty.' })
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Unique slug for the category',
    example: 'gifts-for-her',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Slug cannot be empty.' })
  slug: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the category',
    example: 'This category includes gifts specifically',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Icon for the category',
    example: 'https://example.com/icon.png',
    required: false,
  })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Image URL for the category',
    example: 'https://example.com/image.png',
    required: false,
  })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({
    description: 'Status of the category',
    enum: CategoryStatus,
    default: CategoryStatus.ACTIVE,
  })
  @IsEnum(CategoryStatus)
  @IsOptional()
  status?: CategoryStatus;
}
