import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Category } from '@prisma/client';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  //  @UseGuards(JwtAuthGuard, RolesGuard)
  //  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({
    status: 201,
    description: 'The category has been successfully created.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @UseInterceptors(FileInterceptor('image'))
  create(
    @UploadedFile() image: Express.Multer.File,
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<Category> {
    console.log('Creating category with data - controller:', createCategoryDto);
    return this.categoriesService.create(image, createCategoryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all categories' })
  @ApiResponse({ status: 200, description: 'Return all categories.' })
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by id' })
  @ApiResponse({ status: 200, description: 'Return the category.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Category> {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a category' })
  @ApiResponse({
    status: 200,
    description: 'The category has been successfully updated.',
  })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<Category> {
    return this.categoriesService.update(id, updateCategoryDto, image);
  }

  @Delete(':id')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category' })
  @ApiResponse({
    status: 204,
    description: 'The category has been successfully deleted.',
  })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean }> {
    return this.categoriesService.remove(id);
  }

  @Get(':id/subcategories')
  @ApiOperation({ summary: 'Get all subcategories for a category' })
  @ApiResponse({
    status: 200,
    description: 'Return all subcategories for the category.',
  })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  findSubcategories(@Param('id') id: string) {
    return this.categoriesService.findSubcategories(id);
  }

  @Get(':id/products')
  @ApiOperation({ summary: 'Get all products for a category' })
  @ApiResponse({
    status: 200,
    description: 'Return all products for the category.',
  })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  findProducts(@Param('id') id: string) {
    return this.categoriesService.findProducts(id);
  }
}
