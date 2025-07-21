import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SubcategoriesService } from './subcategories.service';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Subcategory } from '@prisma/client';

@ApiTags('subcategories')
@Controller('subcategories')
export class SubcategoriesController {
  constructor(private readonly subcategoriesService: SubcategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new subcategory' })
  @ApiResponse({
    status: 201,
    description: 'The subcategory has been successfully created.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  create(
    @Body() createSubcategoryDto: CreateSubcategoryDto,
  ): Promise<Subcategory> {
    return this.subcategoriesService.create(createSubcategoryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all subcategories' })
  @ApiResponse({ status: 200, description: 'Return all subcategories.' })
  findAll(): Promise<Subcategory[]> {
    return this.subcategoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a subcategory by id' })
  @ApiResponse({ status: 200, description: 'Return the subcategory.' })
  @ApiResponse({ status: 404, description: 'Subcategory not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Subcategory> {
    return this.subcategoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a subcategory' })
  @ApiResponse({
    status: 200,
    description: 'The subcategory has been successfully updated.',
  })
  @ApiResponse({ status: 404, description: 'Subcategory not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSubcategoryDto: UpdateSubcategoryDto,
  ): Promise<Subcategory> {
    return this.subcategoriesService.update(id, updateSubcategoryDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a subcategory' })
  @ApiResponse({
    status: 204,
    description: 'The subcategory has been successfully deleted.',
  })
  @ApiResponse({ status: 404, description: 'Subcategory not found.' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean }> {
    return this.subcategoriesService.remove(id);
  }
}
