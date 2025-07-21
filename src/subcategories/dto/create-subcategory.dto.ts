import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubcategoryStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateSubcategoryDto {
  @ApiProperty({
    description: 'Name of the subcategory',
    example: 'Video',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Name cannot be empty.' })
  name: string;

  @ApiProperty({
    description: 'Unique slug for the subcategory',
    example: 'video',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Slug cannot be empty.' })
  slug: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the subcategory',
    example: 'This subcategory includes video projects.',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'UUID of the category this project belongs to',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    required: true,
  })
  @IsUUID('4', { message: 'Category ID must be a valid UUID.' })
  @IsNotEmpty({ message: 'Category ID cannot be empty.' })
  categoryId: string;

  @ApiPropertyOptional({
    description: 'Status of the subcategory',
    enum: SubcategoryStatus,
    default: SubcategoryStatus.ACTIVE,
  })
  @IsEnum(SubcategoryStatus)
  @IsOptional()
  status?: SubcategoryStatus;
}
