import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User, UserRole, UserStatus } from '@prisma/client';

export interface GuestUserData {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

@Injectable()
export class UserIdentificationService {
  private readonly logger = new Logger(UserIdentificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create a user by email for guest checkout
   */
  async findOrCreateGuestUser(guestData: GuestUserData): Promise<User> {
    try {
      // First, try to find existing user by email
      let user = await this.prisma.user.findUnique({
        where: { email: guestData.email },
      });

      if (user) {
        // Update user information if provided
        user = await this.updateUserInfo(user.id, guestData);
        this.logger.log(`Found existing user: ${user.email}`);
        return user;
      }

      // Create new guest user
      user = await this.createGuestUser(guestData);
      this.logger.log(`Created new guest user: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error(
        'Failed to find or create guest user',
        (error as Error)?.stack,
      );
      throw new BadRequestException('Could not process user information');
    }
  }

  /**
   * Create a new guest user
   */
  private async createGuestUser(guestData: GuestUserData): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: {
          email: guestData.email,
          firstName: guestData.firstName,
          lastName: guestData.lastName,
          phone: guestData.phone,
          street: guestData.address,
          city: guestData.city,
          state: guestData.state,
          zipCode: guestData.zipCode,
          country: guestData.country,
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          password: this.generateTemporaryPassword(), // Generate temporary password
          notificationsEnabled: true,
          marketingEnabled: false,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create guest user', (error as Error)?.stack);
      throw new BadRequestException('Could not create user account');
    }
  }

  /**
   * Update existing user information
   */
  private async updateUserInfo(
    userId: string,
    guestData: GuestUserData,
  ): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          firstName: guestData.firstName,
          lastName: guestData.lastName,
          phone: guestData.phone || undefined,
          street: guestData.address || undefined,
          city: guestData.city || undefined,
          state: guestData.state || undefined,
          zipCode: guestData.zipCode || undefined,
          country: guestData.country || undefined,
        },
      });
    } catch (error) {
      this.logger.error('Failed to update user info', (error as Error)?.stack);
      throw new BadRequestException('Could not update user information');
    }
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { email },
      });
    } catch (error) {
      this.logger.error(
        'Failed to find user by email',
        (error as Error)?.stack,
      );
      return null;
    }
  }

  /**
   * Find user by ID
   */
  async findUserById(userId: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
      });
    } catch (error) {
      this.logger.error('Failed to find user by ID', (error as Error)?.stack);
      return null;
    }
  }

  /**
   * Validate email format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generate temporary password for guest users
   */
  private generateTemporaryPassword(): string {
    // Generate a random temporary password
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Create user from shipping information
   */
  createGuestUserFromShipping(shippingInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  }): GuestUserData {
    return {
      email: shippingInfo.email,
      firstName: shippingInfo.firstName,
      lastName: shippingInfo.lastName,
      phone: shippingInfo.phone,
      address: shippingInfo.address,
      city: shippingInfo.city,
      state: shippingInfo.state,
      zipCode: shippingInfo.zipCode,
      country: shippingInfo.country,
    };
  }

  /**
   * Check if user exists and is active
   */
  async isUserActiveByEmail(email: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { status: true },
      });

      return user?.status === UserStatus.ACTIVE;
    } catch (error) {
      this.logger.error('Failed to check user status', (error as Error)?.stack);
      return false;
    }
  }

  /**
   * Update user's last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastLogin: new Date() },
      });
    } catch (error) {
      this.logger.error('Failed to update last login', (error as Error)?.stack);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Get user's order history count
   */
  async getUserOrderCount(userId: string): Promise<number> {
    try {
      return await this.prisma.order.count({
        where: { userId },
      });
    } catch (error) {
      this.logger.error(
        'Failed to get user order count',
        (error as Error)?.stack,
      );
      return 0;
    }
  }
}
