import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Product } from '@prisma/client';

export interface StockValidationItem {
  productId: string;
  quantity: number;
}

export interface StockValidationResult {
  valid: boolean;
  errors: string[];
  validatedProducts: Product[];
}

@Injectable()
export class StockValidationService {
  private readonly logger = new Logger(StockValidationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate stock availability for multiple items
   */
  async validateStock(
    items: StockValidationItem[],
  ): Promise<StockValidationResult> {
    const errors: string[] = [];
    const validatedProducts: Product[] = [];

    try {
      // Get all product IDs
      const productIds = items.map((item) => item.productId);

      // Fetch all products at once
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: productIds },
        },
      });

      // Create a map for quick lookup
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Validate each item
      for (const item of items) {
        const product = productMap.get(item.productId);

        if (!product) {
          errors.push(`Product with ID ${item.productId} not found`);
          continue;
        }

        // Check if product is active
        if (product.status !== 'ACTIVE') {
          errors.push(
            `Product "${product.name}" is not available (status: ${product.status})`,
          );
          continue;
        }

        // Check stock availability
        if (product.stock < item.quantity) {
          errors.push(
            `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`,
          );
          continue;
        }

        validatedProducts.push(product);
      }

      return {
        valid: errors.length === 0,
        errors,
        validatedProducts,
      };
    } catch (error) {
      this.logger.error('Failed to validate stock', (error as Error)?.stack);
      throw new BadRequestException('Could not validate stock availability');
    }
  }

  /**
   * Validate stock for a single product
   */
  async validateSingleProduct(
    productId: string,
    quantity: number,
  ): Promise<{
    valid: boolean;
    error?: string;
    product?: Product;
  }> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return {
          valid: false,
          error: `Product with ID ${productId} not found`,
        };
      }

      if (product.status !== 'ACTIVE') {
        return {
          valid: false,
          error: `Product "${product.name}" is not available (status: ${product.status})`,
        };
      }

      if (product.stock < quantity) {
        return {
          valid: false,
          error: `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${quantity}`,
        };
      }

      return {
        valid: true,
        product,
      };
    } catch (error) {
      this.logger.error(
        'Failed to validate single product stock',
        (error as Error)?.stack,
      );
      throw new BadRequestException('Could not validate product stock');
    }
  }

  /**
   * Reserve stock for products (reduce available stock)
   */
  async reserveStock(items: StockValidationItem[]): Promise<void> {
    try {
      // First validate all items
      const validation = await this.validateStock(items);

      if (!validation.valid) {
        throw new BadRequestException(
          `Stock validation failed: ${validation.errors.join(', ')}`,
        );
      }

      // Update stock for each product
      const updatePromises = items.map((item) =>
        this.prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        }),
      );

      await Promise.all(updatePromises);

      this.logger.log(
        `Successfully reserved stock for ${items.length} products`,
      );
    } catch (error) {
      this.logger.error('Failed to reserve stock', (error as Error)?.stack);
      throw error;
    }
  }

  /**
   * Release reserved stock (increase available stock) - for order cancellation
   */
  async releaseStock(items: StockValidationItem[]): Promise<void> {
    try {
      const updatePromises = items.map((item) =>
        this.prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.quantity,
            },
          },
        }),
      );

      await Promise.all(updatePromises);

      this.logger.log(
        `Successfully released stock for ${items.length} products`,
      );
    } catch (error) {
      this.logger.error('Failed to release stock', (error as Error)?.stack);
      throw new BadRequestException('Could not release reserved stock');
    }
  }

  /**
   * Check if products are out of stock and update status
   */
  async updateOutOfStockStatus(): Promise<void> {
    try {
      // Find products with zero stock that are still active
      const outOfStockProducts = await this.prisma.product.findMany({
        where: {
          stock: 0,
          status: 'ACTIVE',
        },
      });

      if (outOfStockProducts.length > 0) {
        // Update their status to OUT_OF_STOCK
        await this.prisma.product.updateMany({
          where: {
            id: { in: outOfStockProducts.map((p) => p.id) },
          },
          data: {
            status: 'OUT_OF_STOCK',
          },
        });

        this.logger.log(
          `Updated ${outOfStockProducts.length} products to OUT_OF_STOCK status`,
        );
      }

      // Find products with stock that are marked as out of stock
      const backInStockProducts = await this.prisma.product.findMany({
        where: {
          stock: { gt: 0 },
          status: 'OUT_OF_STOCK',
        },
      });

      if (backInStockProducts.length > 0) {
        // Update their status back to ACTIVE
        await this.prisma.product.updateMany({
          where: {
            id: { in: backInStockProducts.map((p) => p.id) },
          },
          data: {
            status: 'ACTIVE',
          },
        });

        this.logger.log(
          `Updated ${backInStockProducts.length} products back to ACTIVE status`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to update out of stock status',
        (error as Error)?.stack,
      );
      // Don't throw error as this is a background task
    }
  }

  /**
   * Get low stock products (configurable threshold)
   */
  async getLowStockProducts(threshold: number = 10): Promise<Product[]> {
    try {
      return await this.prisma.product.findMany({
        where: {
          stock: { lte: threshold, gt: 0 },
          status: 'ACTIVE',
        },
        orderBy: {
          stock: 'asc',
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to get low stock products',
        (error as Error)?.stack,
      );
      throw new BadRequestException('Could not retrieve low stock products');
    }
  }
}
