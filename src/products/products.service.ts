import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
// import type { PaginationDto } from '../common/dto/pagination.dto';

import { Prisma, Product, ProductStatus } from '@prisma/client';
import { S3Service } from 'src/common/services/aws-s3.service';
import { sanitizeFilename } from 'src/utils/sanitize-filenames-utils';

interface ProductFilters {
  categoryId?: string;
  subcategoryId?: string;
  featured?: boolean;
  status?: string;
}

@Injectable()
export class ProductsService {
  // Inject PrismaService
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  // Optional: Initialize logger for this service context
  private readonly logger = new Logger(ProductsService.name);

  /**
   * Create a new product
   * @param images - Array of uploaded image files
   * @param createProductDto - Data transfer object for creating a product
   * @returns The created product
   */
  async create(
    images: Express.Multer.File[],
    createProductDto: CreateProductDto,
  ): Promise<Product> {
    try {
      console.log('Creating product with data:', createProductDto);
      console.log('Uploaded images:', images);

      // Check if product with the same name already exists
      const existingProduct = await this.prisma.product.findFirst({
        where: { name: createProductDto.name },
      });

      if (existingProduct) {
        throw new ConflictException('Product with this name already exists');
      }

      // Check if SKU already exists
      const existingSku = await this.prisma.product.findFirst({
        where: { sku: createProductDto.sku },
      });

      if (existingSku) {
        throw new ConflictException('Product with this SKU already exists');
      }

      // Create slug from name if not provided
      if (!createProductDto.slug) {
        createProductDto.slug = createProductDto.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      }

      // Check if slug is unique
      const existingSlug = await this.prisma.product.findFirst({
        where: { slug: createProductDto.slug },
      });

      if (existingSlug) {
        throw new ConflictException('Product with this slug already exists');
      }

      // Verify category exists
      const category = await this.prisma.category.findUnique({
        where: { id: createProductDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException(
          `Category with ID ${createProductDto.categoryId} not found`,
        );
      }

      // Verify subcategory exists if provided
      if (createProductDto.subcategoryId) {
        const subcategory = await this.prisma.subcategory.findUnique({
          where: { id: createProductDto.subcategoryId },
        });

        if (!subcategory) {
          throw new NotFoundException(
            `Subcategory with ID ${createProductDto.subcategoryId} not found`,
          );
        }

        // Verify subcategory belongs to the specified category
        if (subcategory.categoryId !== createProductDto.categoryId) {
          throw new BadRequestException(
            'Subcategory does not belong to the specified category',
          );
        }
      }

      // Validate sale price is less than regular price
      if (
        createProductDto.salePrice &&
        createProductDto.salePrice >= createProductDto.price
      ) {
        throw new BadRequestException(
          'Sale price must be less than regular price',
        );
      }

      if (createProductDto.popularityScore !== undefined) {
        if (createProductDto.popularityScore < 0) {
          throw new BadRequestException('Popularity score cannot be negative');
        }
        if (createProductDto.popularityScore > 100) {
          throw new BadRequestException('Popularity score cannot exceed 100');
        }
      }

      // Upload images to S3 if provided
      let imageKeys: string[] = [];
      if (images && images.length > 0) {
        for (const image of images) {
          const sanitizedImageFilename = sanitizeFilename(image.originalname);
          const imageKey = `products/images/${Date.now()}-${sanitizedImageFilename}`;

          // Upload the image to S3
          await this.s3Service.uploadFile(image, imageKey);
          imageKeys.push(imageKey);
        }
      }

      const productData = {
        ...createProductDto,
        // Store only the S3 keys, not the presigned URLs
        images: imageKeys,
        // Convert price and salePrice to Decimal
        price: createProductDto.price,
        salePrice: createProductDto.salePrice || null,
      };

      // Create the product
      return this.prisma.product.create({
        data: productData,
        include: {
          category: true,
          subcategory: true,
        },
      });
    } catch (error) {
      // Check for Prisma's unique constraint violation error
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Log the specific conflict
        this.logger.warn(
          `Attempted to create product with existing unique field: ${createProductDto.name}`,
          error.stack,
        );
        throw new ConflictException(
          `Product with this ${error.meta?.target} already exists`,
        );
      }
      // Re-throw known exceptions
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      // Log the unexpected error
      this.logger.error('Failed to create product', error.stack);
      // Throw a generic server error for other issues
      throw new InternalServerErrorException('Could not create product.');
    }
  }

  /**
   * Get all products with optional filters
   * @param filters - Optional filters for products
   * @returns An array of products
   */
  async findAll(filters: ProductFilters = {}): Promise<Product[]> {
    try {
      const where: Prisma.ProductWhereInput = {};

      if (filters.categoryId) {
        where.categoryId = filters.categoryId;
      }

      if (filters.subcategoryId) {
        where.subcategoryId = filters.subcategoryId;
      }

      if (filters.featured !== undefined) {
        where.featured = filters.featured;
      }

      if (filters.status) {
        where.status = filters.status as ProductStatus;
      }

      const prod = await this.prisma.product.findMany({
        where,
        orderBy: {
          ['createdAt']: 'desc',
        },
      });
      // const prodCopie = JSON.parse(JSON.stringify(prod));

      // Replace each image key with its presigned URL (download URL)
      await Promise.all(
        prod.map(async (p) => {
          if (Array.isArray(p.images)) {
            p.images = await Promise.all(
              p.images.map((imageKey) =>
                this.s3Service.getPresignedDownloadUrl(imageKey),
              ),
            );
          }
        }),
      );
      prod.forEach((product) => {
        console.log('Product id:', product.id);
        console.log(product.images);
        console.log('======== extractKey =========');
        const ImageKeys = product.images.map((imageKey) => {
          return this.s3Service.extractKeyFromUrl(imageKey);
        });
        console.log(ImageKeys);
      });

      return await this.prisma.product.findMany({
        where,
        orderBy: {
          ['createdAt']: 'desc',
        },
        include: {
          category: true,
          subcategory: true,
        },
      });
    } catch (error) {
      this.logger.error('Failed to fetch all products', error.stack);
      throw new InternalServerErrorException('Could not retrieve products.');
    }
  }

  /**
   * Get all featured products
   * @returns An array of featured products
   */
  async findFeatured(): Promise<Product[]> {
    try {
      return await this.prisma.product.findMany({
        where: {
          featured: true,
          status: ProductStatus.ACTIVE,
        },
        orderBy: {
          ['createdAt']: 'desc',
        },
        include: {
          category: true,
          subcategory: true,
        },
      });
    } catch (error) {
      this.logger.error('Failed to fetch featured products', error.stack);
      throw new InternalServerErrorException(
        'Could not retrieve featured products.',
      );
    }
  }

  /**
   * Get products by category
   * @param categoryId - The ID of the category
   * @returns An array of products in the category
   */
  async findByCategory(categoryId: string): Promise<Product[]> {
    try {
      // Verify category exists
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new NotFoundException(`Category with ID ${categoryId} not found`);
      }

      return await this.prisma.product.findMany({
        where: { categoryId },
        orderBy: {
          ['createdAt']: 'desc',
        },
        include: {
          category: true,
          subcategory: true,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to fetch products by category', error.stack);
      throw new InternalServerErrorException('Could not retrieve products.');
    }
  }

  /**
   * Get products by subcategory
   * @param subcategoryId - The ID of the subcategory
   * @returns An array of products in the subcategory
   */
  async findBySubcategory(subcategoryId: string): Promise<Product[]> {
    try {
      // Verify subcategory exists
      const subcategory = await this.prisma.subcategory.findUnique({
        where: { id: subcategoryId },
      });

      if (!subcategory) {
        throw new NotFoundException(
          `Subcategory with ID ${subcategoryId} not found`,
        );
      }

      return await this.prisma.product.findMany({
        where: { subcategoryId },
        orderBy: {
          ['createdAt']: 'desc',
        },
        include: {
          category: true,
          subcategory: true,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to fetch products by subcategory', error.stack);
      throw new InternalServerErrorException('Could not retrieve products.');
    }
  }

  /**
   * Search products by name or description
   * @param query - Search query
   * @returns An array of matching products
   */
  async search(query: string): Promise<Product[]> {
    try {
      if (!query || query.trim().length === 0) {
        return [];
      }

      return await this.prisma.product.findMany({
        where: {
          OR: [
            {
              name: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
          status: ProductStatus.ACTIVE,
        },
        orderBy: {
          ['createdAt']: 'desc',
        },
        include: {
          category: true,
          subcategory: true,
        },
      });
    } catch (error) {
      this.logger.error('Failed to search products', error.stack);
      throw new InternalServerErrorException('Could not search products.');
    }
  }

  /**
   * Get a product by ID
   * @param id - The ID of the product to retrieve
   * @returns The product with the specified ID
   */
  async findOne(id: string): Promise<Product> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id },
        include: {
          category: true,
          subcategory: true,
        },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      return product;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to fetch product', error.stack);
      throw new InternalServerErrorException('Could not retrieve product.');
    }
  }

  /**
   * Find a product by slug
   * @param slug - The slug of the product to retrieve
   * @returns The product with the specified slug
   */
  async findBySlug(slug: string): Promise<Product> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { slug },
        include: {
          category: true,
          subcategory: true,
        },
      });

      if (!product) {
        throw new NotFoundException(`Product with slug ${slug} not found`);
      }

      return product;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to fetch product', error.stack);
      throw new InternalServerErrorException('Could not retrieve product.');
    }
  }

  /**
   * Update a product
   * @param id - The ID of the product to update
   * @param updateProductDto - Data transfer object for updating a product
   * @param images - Optional array of new image files
   * @returns The updated product
   */
  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    images?: Express.Multer.File[],
  ): Promise<Product> {
    console.log('Existing images:', updateProductDto.existingImages);
    try {
      // Check if product exists
      const productFound = await this.findOne(id);
      // let updateProduct: any = { ...updateProductDto };

      // Check if name is being changed and if it's already in use
      if (updateProductDto.name) {
        const existingProduct = await this.prisma.product.findFirst({
          where: {
            name: updateProductDto.name,
            id: { not: id },
          },
        });

        if (existingProduct) {
          throw new ConflictException('Product with this name already exists');
        }

        // Update slug if name is changing and slug is not provided
        if (!updateProductDto.slug) {
          updateProductDto.slug = updateProductDto.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        }
      }

      // Check if SKU is being changed and if it's already in use
      if (updateProductDto.sku) {
        const existingSku = await this.prisma.product.findFirst({
          where: {
            sku: updateProductDto.sku,
            id: { not: id },
          },
        });

        if (existingSku) {
          throw new ConflictException('Product with this SKU already exists');
        }
      }

      // Check if slug is being changed and if it's already in use
      if (updateProductDto.slug) {
        const existingSlug = await this.prisma.product.findFirst({
          where: {
            slug: updateProductDto.slug,
            id: { not: id },
          },
        });

        if (existingSlug) {
          throw new ConflictException('Product with this slug already exists');
        }
      }

      // Verify category exists if being updated
      if (updateProductDto.categoryId) {
        const category = await this.prisma.category.findUnique({
          where: { id: updateProductDto.categoryId },
        });

        if (!category) {
          throw new NotFoundException(
            `Category with ID ${updateProductDto.categoryId} not found`,
          );
        }
      }

      // Verify subcategory exists if being updated
      if (updateProductDto.subcategoryId) {
        const subcategory = await this.prisma.subcategory.findUnique({
          where: { id: updateProductDto.subcategoryId },
        });

        if (!subcategory) {
          throw new NotFoundException(
            `Subcategory with ID ${updateProductDto.subcategoryId} not found`,
          );
        }

        // Verify subcategory belongs to the specified category
        const categoryId =
          updateProductDto.categoryId || productFound.categoryId;
        if (subcategory.categoryId !== categoryId) {
          throw new BadRequestException(
            'Subcategory does not belong to the specified category',
          );
        }
      }

      // Validate sale price is less than regular price
      const price = updateProductDto.price || productFound.price;
      if (
        updateProductDto.salePrice &&
        updateProductDto.salePrice >= Number(price)
      ) {
        throw new BadRequestException(
          'Sale price must be less than regular price',
        );
      }

      if (updateProductDto.popularityScore !== undefined) {
        if (updateProductDto.popularityScore < 0) {
          throw new BadRequestException('Popularity score cannot be negative');
        }
        if (updateProductDto.popularityScore > 100) {
          throw new BadRequestException('Popularity score cannot exceed 100');
        }
      }

      // --- Image Handling ---
      let imagesToKeep: string[] = [];
      const imagesToDelete: string[] = [];
      const currentImages = updateProductDto.existingImages || [];
      console.log('Current images:', currentImages);

      // Step 1: Process existing images
      if (currentImages.length > 0 && Array.isArray(currentImages)) {
        // Extract S3 keys from presigned URLs
        const existingImageKeys = currentImages.map((imageKey) => {
          return this.s3Service.extractKeyFromUrl(imageKey);
        });
        this.logger.debug('Existing image keys:', existingImageKeys);

        // Find images to keep and delete
        productFound.images.forEach((imageKey) => {
          if (existingImageKeys.includes(imageKey)) {
            imagesToKeep.push(imageKey);
          } else {
            imagesToDelete.push(imageKey);
          }
        });
      } else {
        // If no existingImages provided, delete all existing images
        imagesToDelete.push(...productFound.images);
      }
      this.logger.debug(`Images to keep: ${imagesToKeep.join(', ')}`);
      this.logger.debug(`Images to delete: ${imagesToDelete.join(', ')}`);

      // Delete images marked for removal directly using the key
      if (imagesToDelete.length > 0) {
        await Promise.all(
          imagesToDelete.map(async (imageKey) => {
            try {
              this.logger.log(`Deleting image with key: ${imageKey}`);
              await this.s3Service.deleteFile(imageKey); // Use the key directly
            } catch (error) {
              // Log error but potentially continue? Or should failure stop the update?
              this.logger.error(
                `Failed to delete image ${imageKey} from S3:`,
                error.stack,
              );
            }
          }),
        );
      }

      // Upload new images
      const newImageKeys: string[] = [];
      if (images && images.length > 0) {
        await Promise.all(
          images.map(async (image) => {
            // *** Apply sanitization to new image filenames ***
            const sanitizedImageFilename = sanitizeFilename(image.originalname);
            const imageKey = `products/images/${Date.now()}-${sanitizedImageFilename}`;
            this.logger.debug(`Uploading new image with key: ${imageKey}`);

            // uploadFileToS3 now returns the key
            const uploadedKey = await this.s3Service.uploadFile(
              image,
              imageKey,
            );
            newImageKeys.push(imageKey);
          }),
        );

        /* 
        const uploadPromises = images.map(async (image) => {
          // *** Apply sanitization to new image filenames ***
          const sanitizedImageFilename = sanitizeFilename(image.originalname);
          const imageKey = `products/images/${Date.now()}-${sanitizedImageFilename}`;
          this.logger.debug(`Uploading new image with key: ${imageKey}`);

          // uploadFileToS3 now returns the key
          return await this.s3Service.uploadFile(image, imageKey);
        });
        newImageKeys.push(...(await Promise.all(uploadPromises))); */
      }

      // Combine kept and new image keys
      const imagesToDto: string[] = [...imagesToKeep, ...newImageKeys];
      this.logger.debug(
        `Final images to store in product: ${imagesToDto.join(', ')}`,
      );
      // Clean up DTO field if it exists
      if ('existingImages' in updateProductDto)
        delete updateProductDto.existingImages;
      // delete updateProduct.existingImages;

      /*
      // Prepare imageKeys array for update
      let imageKeys: string[] = productFound.images
        ? [...productFound.images]
        : [];
      // Handle image uploads if provided
      if (images && images.length > 0) {
        // Delete old images from S3
        if (productFound.images && productFound.images.length > 0) {
          for (const imageKey of productFound.images) {
            if (imageKey.startsWith('products/images/')) {
              await this.s3Service.deleteFile(imageKey);
            }
          }
        }

        // Upload new images
        imageKeys = [];
        for (const image of images) {
          const sanitizedImageFilename = sanitizeFilename(image.originalname);
          const imageKey = `products/images/${Date.now()}-${sanitizedImageFilename}`;

          await this.s3Service.uploadFile(image, imageKey);
          imageKeys.push(imageKey);
        }
      } */

      // Prepare data for update
      const updateProduct = {
        ...updateProductDto,
        // Convert price and salePrice to Decimal
        price: updateProductDto.price || productFound.price,
        salePrice: updateProductDto.salePrice || productFound.salePrice,
        images: imagesToDto,
      };

      // Update the product
      return await this.prisma.product.update({
        where: { id },
        data: updateProduct,
        include: {
          category: true,
          subcategory: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Check for record not found error during update
        if (error.code === 'P2025') {
          this.logger.warn(
            `Attempted to update non-existent product with ID: ${id}`,
          );
          throw new NotFoundException(`Product with ID "${id}" not found`);
        }
        // Check for unique constraint violation on update
        if (error.code === 'P2002') {
          const conflictingField =
            (error.meta?.target as string[])?.join(', ') || 'field';
          this.logger.warn(
            `Update failed due to conflict on field(s): ${conflictingField} for product ID: ${id}`,
          );
          throw new ConflictException(
            `Cannot update product. The value for '${conflictingField}' is already in use.`,
          );
        }
      }
      // Re-throw known exceptions
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      // Log unexpected errors during update
      this.logger.error(`Failed to update product with ID: ${id}`, error.stack);
      throw new InternalServerErrorException('Could not update product.');
    }
  }

  /**
   * Delete a product
   * @param id - The ID of the product to delete
   * @returns A success message or object
   */
  async remove(id: string): Promise<{ success: boolean }> {
    // Check if product exists
    const productFound: Product = await this.findOne(id);

    try {
      // Check if product has order items
      const orderItemsCount = await this.prisma.orderItem.count({
        where: { productId: id },
      });

      if (orderItemsCount > 0) {
        throw new ConflictException(
          'Cannot delete product that has been ordered',
        );
      }

      // Check if product has cart items
      const cartItemsCount = await this.prisma.cartItem.count({
        where: { productId: id },
      });

      if (cartItemsCount > 0) {
        throw new ConflictException(
          'Cannot delete product that is in shopping carts',
        );
      }

      // Delete images from S3
      if (productFound.images && productFound.images.length > 0) {
        for (const imageKey of productFound.images) {
          if (imageKey.startsWith('products/images/')) {
            await this.s3Service.deleteFile(imageKey);
          }
        }
      }

      // Delete the product
      await this.prisma.product.delete({
        where: { id },
      });

      return { success: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025' // Record to delete not found
      ) {
        this.logger.warn(
          `Attempted to delete non-existent product with ID: ${id}`,
        );
        // Throw NotFoundException if the record to delete doesn't exist
        throw new NotFoundException(`Product with ID "${id}" not found`);
      }
      // Re-throw known exceptions
      if (error instanceof ConflictException) {
        throw error;
      }
      // Log unexpected errors during deletion
      this.logger.error(`Failed to delete product with ID: ${id}`, error.stack);
      throw new InternalServerErrorException('Could not delete product.');
    }
  }
}
