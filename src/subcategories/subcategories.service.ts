import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Category, Prisma, Subcategory } from '@prisma/client';

@Injectable()
export class SubcategoriesService {
  // Inject PrismaService
  constructor(private readonly prisma: PrismaService) {}

  // Optional: Initialize logger for this service context
  private readonly logger = new Logger(SubcategoriesService.name);

  /**
   * Create a new subcategory
   * @param createSubcategoryDto - Data transfer object for creating a category
   * @returns The created subcategory
   */
  async create(
    createSubcategoryDto: CreateSubcategoryDto,
  ): Promise<Subcategory> {
    try {
      // Check if category with the same name already exists
      const existingSubcategoryByName: Subcategory =
        await this.prisma.subcategory.findFirst({
          where: { name: createSubcategoryDto.name },
        });

      if (existingSubcategoryByName) {
        throw new ConflictException(
          'Subcategory with this name already exists',
        );
      }

      // Create slug from name if not provided
      if (!createSubcategoryDto.slug) {
        createSubcategoryDto.slug = createSubcategoryDto.name

          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      }

      // Check if slug is unique
      const existingSubcategoryBySlug: Subcategory =
        await this.prisma.subcategory.findFirst({
          where: { slug: createSubcategoryDto.slug },
        });

      if (existingSubcategoryBySlug) {
        throw new ConflictException(
          'Subcategory with this slug already exists',
        );
      }

      if (createSubcategoryDto.categoryId) {
        // Ensure the category exists
        const categoryExists: Category = await this.prisma.category.findUnique({
          where: { id: createSubcategoryDto.categoryId },
        });
        if (!categoryExists) {
          throw new ConflictException(
            'Category with the specified ID does not exist',
          );
        }
      }

      // Create the subcategory
      return this.prisma.subcategory.create({
        data: createSubcategoryDto,
      });
    } catch (error) {
      // Check for Prisma's unique constraint violation error
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Log the specific conflict
        this.logger.warn(
          `Attempted to create subcategory with existing name: ${createSubcategoryDto.name}`,
          error.stack,
        );
        throw new ConflictException(
          `Subcategory with name '${createSubcategoryDto.name}' already exists`,
        );
      }
      // Log the unexpected error
      this.logger.error(
        'Failed to create subcategory',
        (error as Error)?.stack,
      );

      // Throw a generic server error for other issues
      throw new InternalServerErrorException('Could not create subcategory.');
    }
  }

  /**
   * Get all subcategories
   * @returns An array of subcategories
   */
  async findAll(): Promise<Subcategory[]> {
    try {
      return await this.prisma.subcategory.findMany({
        orderBy: {
          ['createdAt']: 'desc',
        },
        include: {
          category: true, // Include the related category
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to fetch all subcategories',
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException(
        'Could not retrieve subcategories.',
      );
    }
  }

  /**
   * Get a subcategory by ID
   * @param id - The ID of the subcategory
   * @returns The subcategory if found
   */
  async findOne(id: string): Promise<Subcategory> {
    try {
      const subcategory: Subcategory = await this.prisma.subcategory.findUnique(
        {
          where: { id },
        },
      );

      if (!subcategory) {
        throw new NotFoundException(`Subcategory with ID ${id} not found`);
      }

      return subcategory;
    } catch (error) {
      this.logger.error('Failed to fetch subcategory', (error as Error)?.stack);
      throw new InternalServerErrorException('Could not retrieve subcategory.');
    }
  }

  /**
   * Find a category by slug
   * @param slug - The slug of the category to retrieve
   * @returns The category with the specified slug
   */
  async findBySlug(slug: string): Promise<Subcategory> {
    try {
      const subcategory: Subcategory = await this.prisma.subcategory.findUnique(
        {
          where: { slug },
        },
      );

      if (!subcategory) {
        throw new NotFoundException(`Subcategory with slug ${slug} not found`);
      }

      return subcategory;
    } catch (error) {
      this.logger.error('Failed to fetch subcategory', (error as Error)?.stack);
      throw new InternalServerErrorException('Could not retrieve subcategory.');
    }
  }

  /**
   * Update a subcategory
   * @param id - The ID of the subcategory to update
   * @param updateSubcategoryDto - Data transfer object for updating a category
   * @returns The updated subcategory
   */
  async update(
    id: string,
    updateSubcategoryDto: UpdateSubcategoryDto,
  ): Promise<Subcategory> {
    try {
      // Check if category exists
      const subcategoryFound: Subcategory = await this.findOne(id);

      // Check if name is being changed and if it's already in use
      if (updateSubcategoryDto.name) {
        const existingSubcategoryByName: Subcategory =
          await this.prisma.subcategory.findFirst({
            where: {
              name: updateSubcategoryDto.name,
              id: { not: id },
            },
          });

        if (existingSubcategoryByName) {
          throw new ConflictException(
            'Subcategory with this name already exists',
          );
        }

        // Update slug if name is changing and slug is not provided
        if (!updateSubcategoryDto.slug) {
          updateSubcategoryDto.slug = updateSubcategoryDto.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        }
      }

      // Check if slug is being changed and if it's already in use
      if (updateSubcategoryDto.slug) {
        const existingSubcategoryBySlug: Subcategory =
          await this.prisma.subcategory.findFirst({
            where: {
              slug: updateSubcategoryDto.slug,
              id: { not: id },
            },
          });

        if (existingSubcategoryBySlug) {
          throw new ConflictException(
            'Subcategory with this slug already exists',
          );
        }
      }

      if (updateSubcategoryDto.categoryId) {
        // Ensure the category exists
        const categoryExists: Category = await this.prisma.category.findUnique({
          where: { id: updateSubcategoryDto.categoryId },
        });
        if (!categoryExists) {
          throw new ConflictException(
            'Category with the specified ID does not exist',
          );
        }
      }

      // Update the subcategory
      return await this.prisma.subcategory.update({
        where: { id },
        data: updateSubcategoryDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Check for record not found error during update
        if (error.code === 'P2025') {
          this.logger.warn(
            `Attempted to update non-existent subcategory with ID: ${id}`,
          );
          throw new NotFoundException(`Subcategory with ID "${id}" not found`);
        }
        // Check for unique constraint violation on update
        if (error.code === 'P2002') {
          // Extract the field causing the conflict if possible (depends on error meta)
          const conflictingField =
            (error.meta?.target as string[])?.join(', ') || 'name';
          this.logger.warn(
            `Update failed due to conflict on field(s): ${conflictingField} for subcategory ID: ${id}`,
          );
          throw new ConflictException(
            `Cannot update subcategory. The value for '${conflictingField}' is already in use.`,
          );
        }
      }
      // Log unexpected errors during update
      this.logger.error(
        `Failed to update subcategory with ID: ${id}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Could not update subcategory.');
    }
  }

  /**
   * Delete a subcategory
   * @param id - The ID of the subcategory to delete
   * @returns A success message or object
   */
  async remove(id: string): Promise<{ success: boolean }> {
    // Check if subcategory exists
    const subcategoryFound: Subcategory = await this.findOne(id);

    try {
      // Check if subcategory has products
      const productsCount: number = await this.prisma.product.count({
        where: { categoryId: id },
      });

      if (productsCount > 0) {
        throw new ConflictException('Cannot delete subcategory with products');
      }

      // Delete the subcategory
      await this.prisma.subcategory.delete({
        where: { id },
      });

      return { success: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025' // Record to delete not found
      ) {
        this.logger.warn(
          `Attempted to delete non-existent subcategory with ID: ${id}`,
        );
        // Throw NotFoundException if the record to delete doesn't exist
        throw new NotFoundException(`Subcategory with ID "${id}" not found`);
      }
      // Log unexpected errors during deletion
      this.logger.error(
        `Failed to delete subcategory with ID: ${id}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Could not delete subcategory.');
    }
  }
}
