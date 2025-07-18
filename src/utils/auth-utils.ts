import * as crypto from 'crypto';

// Generate a secure activation token
export function generateActivationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateResetPasswordToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Verify if the provided token matches the stored token
export function verifyActivationToken(
  storedToken: string,
  providedToken: string,
): boolean {
  // Use a constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(storedToken, 'hex'),
    Buffer.from(providedToken, 'hex'),
  );
}
