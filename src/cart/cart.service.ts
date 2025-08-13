import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Cart, CartItem, Product } from '@prisma/client';

export interface CartWithItems extends Cart {
  items: (CartItem & {
    product: Product;
  })[];
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new cart for a user
   */
  async create(createCartDto: CreateCartDto): Promise<Cart> {
    try {
      // Check if user already has a cart
      const existingCart = await this.prisma.cart.findFirst({
        where: { userId: createCartDto.userId },
      });

      if (existingCart) {
        throw new ConflictException('User already has a cart');
      }

      return await this.prisma.cart.create({
        data: createCartDto,
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error('Failed to create cart', (error as Error)?.stack);
      throw new BadRequestException('Could not create cart');
    }
  }

  /**
   * Get or create cart for a user
   */
  async getOrCreateCart(userId: string): Promise<CartWithItems> {
    try {
      let cart = await this.prisma.cart.findFirst({
        where: { userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!cart) {
        cart = await this.prisma.cart.create({
          data: { userId },
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        });
      }

      return cart;
    } catch (error) {
      this.logger.error(
        'Failed to get or create cart',
        (error as Error)?.stack,
      );
      throw new BadRequestException('Could not retrieve cart');
    }
  }

  /**
   * Add item to cart
   */
  async addToCart(addToCartDto: AddToCartDto): Promise<CartWithItems> {
    try {
      // Verify product exists and is active
      const product = await this.prisma.product.findUnique({
        where: { id: addToCartDto.productId },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      if (product.status !== 'ACTIVE') {
        throw new BadRequestException('Product is not available');
      }

      // Check if enough stock is available
      if (product.stock < addToCartDto.quantity) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${product.stock}`,
        );
      }

      // Get or create cart
      const cart = await this.getOrCreateCart(addToCartDto.userId);

      // Check if item already exists in cart
      const existingItem = cart.items.find(
        (item) => item.productId === addToCartDto.productId,
      );

      if (existingItem) {
        // Update quantity
        const newQuantity = existingItem.quantity + addToCartDto.quantity;

        // Check if total quantity exceeds stock
        if (newQuantity > product.stock) {
          throw new BadRequestException(
            `Cannot add ${addToCartDto.quantity} items. Total would exceed available stock (${product.stock})`,
          );
        }

        await this.prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: newQuantity },
        });
      } else {
        // Create new cart item
        await this.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: addToCartDto.productId,
            quantity: addToCartDto.quantity,
          },
        });
      }

      // Return updated cart
      return await this.getCartById(cart.id);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Failed to add item to cart', (error as Error)?.stack);
      throw new BadRequestException('Could not add item to cart');
    }
  }

  /**
   * Update cart item quantity
   */
  async updateCartItem(
    cartItemId: string,
    updateCartItemDto: UpdateCartItemDto,
  ): Promise<CartWithItems> {
    try {
      // Find cart item
      const cartItem = await this.prisma.cartItem.findUnique({
        where: { id: cartItemId },
        include: {
          product: true,
          cart: true,
        },
      });

      if (!cartItem) {
        throw new NotFoundException('Cart item not found');
      }

      // Check stock availability
      if (updateCartItemDto.quantity > cartItem.product.stock) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${cartItem.product.stock}`,
        );
      }

      // Update cart item
      await this.prisma.cartItem.update({
        where: { id: cartItemId },
        data: { quantity: updateCartItemDto.quantity },
      });

      // Return updated cart
      return await this.getCartById(cartItem.cartId);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Failed to update cart item', (error as Error)?.stack);
      throw new BadRequestException('Could not update cart item');
    }
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(cartItemId: string): Promise<CartWithItems> {
    try {
      const cartItem = await this.prisma.cartItem.findUnique({
        where: { id: cartItemId },
      });

      if (!cartItem) {
        throw new NotFoundException('Cart item not found');
      }

      await this.prisma.cartItem.delete({
        where: { id: cartItemId },
      });

      return await this.getCartById(cartItem.cartId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        'Failed to remove item from cart',
        (error as Error)?.stack,
      );
      throw new BadRequestException('Could not remove item from cart');
    }
  }

  /**
   * Get cart by ID
   */
  async getCartById(cartId: string): Promise<CartWithItems> {
    try {
      const cart = await this.prisma.cart.findUnique({
        where: { id: cartId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!cart) {
        throw new NotFoundException('Cart not found');
      }

      return cart;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to get cart', (error as Error)?.stack);
      throw new BadRequestException('Could not retrieve cart');
    }
  }

  /**
   * Get cart by user ID
   */
  async getCartByUserId(userId: string): Promise<CartWithItems | null> {
    try {
      return await this.prisma.cart.findFirst({
        where: { userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to get cart by user ID',
        (error as Error)?.stack,
      );
      throw new BadRequestException('Could not retrieve cart');
    }
  }

  /**
   * Clear cart (remove all items)
   */
  async clearCart(cartId: string): Promise<CartWithItems> {
    try {
      await this.prisma.cartItem.deleteMany({
        where: { cartId },
      });

      return await this.getCartById(cartId);
    } catch (error) {
      this.logger.error('Failed to clear cart', (error as Error)?.stack);
      throw new BadRequestException('Could not clear cart');
    }
  }

  /**
   * Calculate cart totals
   */
  calculateCartTotals(cart: CartWithItems) {
    let subtotal = 0;
    let totalItems = 0;

    cart.items.forEach((item) => {
      const price = item.product.salePrice || item.product.price;
      subtotal += Number(price) * item.quantity;
      totalItems += item.quantity;
    });

    return {
      subtotal: Number(subtotal.toFixed(2)),
      totalItems,
      items: cart.items.length,
    };
  }

  /**
   * Validate cart for checkout
   */
  async validateCartForCheckout(cartId: string): Promise<{
    valid: boolean;
    errors: string[];
    cart: CartWithItems;
  }> {
    const cart = await this.getCartById(cartId);
    const errors: string[] = [];

    if (cart.items.length === 0) {
      errors.push('Cart is empty');
    }

    // Check stock availability for each item
    for (const item of cart.items) {
      if (item.product.status !== 'ACTIVE') {
        errors.push(`Product "${item.product.name}" is no longer available`);
      }

      if (item.quantity > item.product.stock) {
        errors.push(
          `Insufficient stock for "${item.product.name}". Available: ${item.product.stock}, Requested: ${item.quantity}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      cart,
    };
  }
}
