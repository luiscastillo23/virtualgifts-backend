import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { IsArray, IsOptional } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    description: 'Array of existing image keys to keep',
    example: ['key1', 'key2'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  existingImages?: string[];
}
