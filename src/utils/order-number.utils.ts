import { v4 as uuidv4 } from 'uuid';

export class OrderNumberUtils {
  /**
   * Generate a unique order number
   * Format: VG-YYYY-XXXXXX (VG = VirtualGifts, YYYY = Year, XXXXXX = Random)
   */
  static generateOrderNumber(): string {
    const year = new Date().getFullYear();
    const randomPart = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `VG-${year}-${randomPart}`;
  }

  /**
   * Generate a sequential order number (requires database counter)
   * Format: VG-YYYY-NNNNNN (NNNNNN = Sequential number)
   */
  static generateSequentialOrderNumber(sequenceNumber: number): string {
    const year = new Date().getFullYear();
    const paddedNumber = sequenceNumber.toString().padStart(6, '0');
    return `VG-${year}-${paddedNumber}`;
  }

  /**
   * Generate order number with timestamp
   * Format: VG-YYYYMMDD-HHMMSS-XXX
   */
  static generateTimestampOrderNumber(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 3).toUpperCase();

    return `VG-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
  }

  /**
   * Generate UUID-based order number
   * Format: VG-UUID (shortened)
   */
  static generateUUIDOrderNumber(): string {
    const uuid = uuidv4().replace(/-/g, '').substr(0, 12).toUpperCase();
    return `VG-${uuid}`;
  }

  /**
   * Validate order number format
   */
  static validateOrderNumber(orderNumber: string): boolean {
    // Basic validation for VG-YYYY-XXXXXX format
    const pattern = /^VG-\d{4}-[A-Z0-9]{6,}$/;
    return pattern.test(orderNumber);
  }

  /**
   * Extract year from order number
   */
  static extractYearFromOrderNumber(orderNumber: string): number | null {
    const match = orderNumber.match(/^VG-(\d{4})-/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Generate transaction ID for payment reference
   */
  static generateTransactionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 8);
    return `TXN-${timestamp}-${random}`.toUpperCase();
  }
}
