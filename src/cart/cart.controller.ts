import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new cart' })
  @ApiResponse({ status: 201, description: 'Cart created successfully' })
  @ApiResponse({ status: 409, description: 'User already has a cart' })
  create(@Body() createCartDto: CreateCartDto) {
    return this.cartService.create(createCartDto);
  }

  @Post('add')
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiResponse({ status: 200, description: 'Item added to cart successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({
    status: 400,
    description: 'Insufficient stock or invalid data',
  })
  addToCart(@Body() addToCartDto: AddToCartDto) {
    return this.cartService.addToCart(addToCartDto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get cart by user ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Cart retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Cart not found' })
  getCartByUserId(@Param('userId') userId: string) {
    return this.cartService.getOrCreateCart(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get cart by ID' })
  @ApiParam({ name: 'id', description: 'Cart ID' })
  @ApiResponse({ status: 200, description: 'Cart retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Cart not found' })
  getCartById(@Param('id') id: string) {
    return this.cartService.getCartById(id);
  }

  @Get(':id/totals')
  @ApiOperation({ summary: 'Get cart totals' })
  @ApiParam({ name: 'id', description: 'Cart ID' })
  @ApiResponse({
    status: 200,
    description: 'Cart totals calculated successfully',
  })
  async getCartTotals(@Param('id') id: string) {
    const cart = await this.cartService.getCartById(id);
    return this.cartService.calculateCartTotals(cart);
  }

  @Get(':id/validate')
  @ApiOperation({ summary: 'Validate cart for checkout' })
  @ApiParam({ name: 'id', description: 'Cart ID' })
  @ApiResponse({ status: 200, description: 'Cart validation completed' })
  validateCart(@Param('id') id: string) {
    return this.cartService.validateCartForCheckout(id);
  }

  @Patch('item/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiParam({ name: 'itemId', description: 'Cart item ID' })
  @ApiResponse({ status: 200, description: 'Cart item updated successfully' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  @ApiResponse({ status: 400, description: 'Insufficient stock' })
  updateCartItem(
    @Param('itemId') itemId: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartService.updateCartItem(itemId, updateCartItemDto);
  }

  @Delete('item/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiParam({ name: 'itemId', description: 'Cart item ID' })
  @ApiResponse({
    status: 200,
    description: 'Item removed from cart successfully',
  })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  removeFromCart(@Param('itemId') itemId: string) {
    return this.cartService.removeFromCart(itemId);
  }

  @Delete(':id/clear')
  @ApiOperation({ summary: 'Clear all items from cart' })
  @ApiParam({ name: 'id', description: 'Cart ID' })
  @ApiResponse({ status: 200, description: 'Cart cleared successfully' })
  clearCart(@Param('id') id: string) {
    return this.cartService.clearCart(id);
  }
}
