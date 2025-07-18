import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
// import type { PaginationDto } from '../common/dto/pagination.dto';

import { Prisma, Category } from '@prisma/client';
import { AwsS3Service } from 'src/common/services/aws-s3.service';
import { sanitizeFilename } from 'src/utils/sanitize-filenames-utils';

@Injectable()
export class CategoriesService {
  // Inject PrismaService
  constructor(
    private readonly prisma: PrismaService,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  // Optional: Initialize logger for this service context
  private readonly logger = new Logger(CategoriesService.name);

  /**
   * Create a new category
   * @param createCategoryDto - Data transfer object for creating a category
   * @returns The created category
   */
  async create(
    image: Express.Multer.File,
    createCategoryDto: CreateCategoryDto,
  ): Promise<Category> {
    try {
      console.log('Creating category with data:', createCategoryDto);

      const sanitizedImageFilename = sanitizeFilename(image.originalname);

      // Check if category with the same name already exists
      const existingCategory = await this.prisma.category.findFirst({
        where: { name: createCategoryDto.name },
      });

      if (existingCategory) {
        throw new ConflictException('Category with this name already exists');
      }

      // Create slug from name if not provided
      if (!createCategoryDto.slug) {
        createCategoryDto.slug = createCategoryDto.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      }

      // Check if slug is unique
      const existingSlug = await this.prisma.category.findFirst({
        where: { slug: createCategoryDto.slug },
      });

      if (existingSlug) {
        throw new ConflictException('Category with this slug already exists');
      }
      const imageKey = `categories/images/${Date.now()}-${sanitizedImageFilename}`;

      // Upload the image to S3
      await this.awsS3Service.uploadFile(
        imageKey,
        image.buffer,
        image.mimetype,
      );

      const categoryData = {
        ...createCategoryDto,
        // Store only the S3 keys, not the presigned URLs
        image: imageKey,
      };
      // Create the category
      return this.prisma.category.create({
        data: categoryData,
      });
    } catch (error) {
      // Check for Prisma's unique constraint violation error
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Log the specific conflict
        this.logger.warn(
          `Attempted to create category with existing name: ${createCategoryDto.name}`,
          error.stack,
        );
        throw new ConflictException(
          `Role with name '${createCategoryDto.name}' already exists`,
        );
      }
      // Log the unexpected error
      this.logger.error('Failed to create category', error.stack);
      // Throw a generic server error for other issues
      throw new InternalServerErrorException('Could not create category.');
    }
  }

  /**
   * Get all categories
   * @returns An array of categories
   */
  async findAll(): Promise<Category[]> {
    try {
      return await this.prisma.category.findMany({
        orderBy: {
          ['createdAt']: 'desc',
        },
      });
    } catch (error) {
      this.logger.error('Failed to fetch all roles', error.stack);
      throw new InternalServerErrorException('Could not retrieve roles.');
    }
  }

  /**
   * Get a category by ID
   * @param id - The ID of the category to retrieve
   * @returns The category with the specified ID
   */
  async findOne(id: string): Promise<Category> {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id },
      });

      if (!category) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }

      return category;
    } catch (error) {
      this.logger.error('Failed to fetch category', error.stack);
      throw new InternalServerErrorException('Could not retrieve category.');
    }
  }

  /**
   * Find a category by slug
   * @param slug - The slug of the category to retrieve
   * @returns The category with the specified slug
   */
  async findBySlug(slug: string) {
    try {
      const category = await this.prisma.category.findUnique({
        where: { slug },
      });

      if (!category) {
        throw new NotFoundException(`Category with slug ${slug} not found`);
      }

      return category;
    } catch (error) {
      this.logger.error('Failed to fetch category', error.stack);
      throw new InternalServerErrorException('Could not retrieve category.');
    }
  }

  /**
   * Update a category
   * @param id - The ID of the category to update
   * @param updateCategoryDto - Data transfer object for updating a category
   * @returns The updated category
   */
  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    try {
      // Check if category exists
      await this.findOne(id);

      // Check if name is being changed and if it's already in use
      if (updateCategoryDto.name) {
        const existingCategory = await this.prisma.category.findFirst({
          where: {
            name: updateCategoryDto.name,
            id: { not: id },
          },
        });

        if (existingCategory) {
          throw new ConflictException('Category with this name already exists');
        }

        // Update slug if name is changing and slug is not provided
        if (!updateCategoryDto.slug) {
          updateCategoryDto.slug = updateCategoryDto.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        }
      }

      // Check if slug is being changed and if it's already in use
      if (updateCategoryDto.slug) {
        const existingSlug = await this.prisma.category.findFirst({
          where: {
            slug: updateCategoryDto.slug,
            id: { not: id },
          },
        });

        if (existingSlug) {
          throw new ConflictException('Category with this slug already exists');
        }
      }

      // Update the category
      return await this.prisma.category.update({
        where: { id },
        data: updateCategoryDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Check for record not found error during update
        if (error.code === 'P2025') {
          this.logger.warn(
            `Attempted to update non-existent category with ID: ${id}`,
          );
          throw new NotFoundException(`Category with ID "${id}" not found`);
        }
        // Check for unique constraint violation on update
        if (error.code === 'P2002') {
          // Extract the field causing the conflict if possible (depends on error meta)
          const conflictingField =
            (error.meta?.target as string[])?.join(', ') || 'name';
          this.logger.warn(
            `Update failed due to conflict on field(s): ${conflictingField} for role ID: ${id}`,
          );
          throw new ConflictException(
            `Cannot update category. The value for '${conflictingField}' is already in use.`,
          );
        }
      }
      // Log unexpected errors during update
      this.logger.error(
        `Failed to update category with ID: ${id}`,
        error.stack,
      );
      throw new InternalServerErrorException('Could not update category.');
    }
  }

  /**
   * Delete a category
   * @param id - The ID of the category to delete
   * @returns A success message or object
   */
  async remove(id: string): Promise<{ success: boolean }> {
    // Check if category exists
    await this.findOne(id);

    try {
      // Check if category has subcategories
      const subcategoriesCount = await this.prisma.subcategory.count({
        where: { categoryId: id },
      });

      if (subcategoriesCount > 0) {
        throw new ConflictException(
          'Cannot delete category with subcategories',
        );
      }

      // Check if category has products
      const productsCount = await this.prisma.product.count({
        where: { categoryId: id },
      });

      if (productsCount > 0) {
        throw new ConflictException('Cannot delete category with products');
      }

      // Delete the category
      await this.prisma.category.delete({
        where: { id },
      });

      return { success: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025' // Record to delete not found
      ) {
        this.logger.warn(
          `Attempted to delete non-existent category with ID: ${id}`,
        );
        // Throw NotFoundException if the record to delete doesn't exist
        throw new NotFoundException(`Category with ID "${id}" not found`);
      }
      // Log unexpected errors during deletion
      this.logger.error(
        `Failed to delete category with ID: ${id}`,
        error.stack,
      );
      throw new InternalServerErrorException('Could not delete category.');
    }
  }

  /**
   * Find all subcategories for a category
   * @param id - The ID of the category to find subcategories for
   * @returns An array of subcategories for the specified category
   */
  async findSubcategories(id: string) {
    // Check if category exists
    await this.findOne(id);
    try {
      return await this.prisma.subcategory.findMany({
        where: { categoryId: id },
        orderBy: {
          ['createdAt']: 'desc',
        },
      });
    } catch (error) {
      this.logger.error('Failed to fetch subcategories', error.stack);
      throw new InternalServerErrorException(
        'Could not retrieve subcategories.',
      );
    }
  }

  /**
   * Find all products for a category
   * @param id - The ID of the category to find products for
   * @returns An array of products for the specified category
   */
  async findProducts(id: string) {
    // Check if category exists
    await this.findOne(id);

    try {
      return this.prisma.product.findMany({
        where: { categoryId: id },
        orderBy: {
          ['createdAt']: 'desc',
        },
        include: {
          category: true,
          subcategory: true,
        },
      });
    } catch (error) {
      this.logger.error('Failed to fetch products', error.stack);
      throw new InternalServerErrorException('Could not retrieve products.');
    }
  }
}
