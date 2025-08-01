# VirtualGifts Purchase Process Implementation

## Overview

This document describes the comprehensive purchase process implementation for the VirtualGifts backend application. The system supports guest checkout, multiple payment methods, stock management, and email notifications.

## Architecture

### Core Components

1. **Cart Module** - Shopping cart management
2. **Orders Module** - Order processing and management
3. **Payment Module** - Multi-gateway payment processing
4. **Stock Validation Service** - Inventory management
5. **User Identification Service** - Guest user handling
6. **Email Service** - Order confirmation emails

### Payment Gateways Supported

- **Stripe** - Credit card processing
- **PayPal** - PayPal payments
- **Coinbase Commerce** - Cryptocurrency payments
- **BitPay** - Bitcoin payments
- **Binance Pay** - Binance ecosystem payments

## Purchase Flow

### 1. Cart Management

Users can add products to their cart without authentication:

```typescript
POST /cart/add
{
  "userId": "guest-user-id",
  "productId": "product-uuid",
  "quantity": 2
}
```

### 2. Purchase Process

The main purchase endpoint handles the complete transaction:

```typescript
POST /orders/purchase
{
  "customerEmail": "customer@example.com",
  "cartId": "cart-uuid", // OR provide items directly
  "items": [
    {
      "productId": "product-uuid",
      "quantity": 1,
      "price": 25.99
    }
  ],
  "paymentMethod": {
    "type": "credit_card",
    "creditCard": {
      "token": "stripe-token",
      "gateway": "stripe"
    }
  },
  "shipping": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA",
    "phone": "+1-555-123-4567"
  }
}
```

### 3. Transaction Steps

1. **Validate Cart Items** - Ensure all products exist and are active
2. **Stock Validation** - Check availability for requested quantities
3. **User Creation** - Find or create guest user by email
4. **Payment Intent** - Create payment intent with selected gateway
5. **Order Creation** - Create order record with PENDING status
6. **Stock Reservation** - Reduce available stock atomically
7. **Payment Processing** - Process payment through gateway
8. **Order Completion** - Update status and send confirmation email
9. **Cart Cleanup** - Clear user's cart after successful purchase

### 4. Payment Confirmation

For payments requiring additional confirmation (3D Secure, etc.):

```typescript
POST /orders/{orderId}/confirm-payment
{
  "payment_method": "pm_card_visa",
  "return_url": "https://example.com/return"
}
```

## Payment Methods Configuration

### Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox

# Coinbase Commerce
COINBASE_COMMERCE_API_KEY=your_coinbase_api_key
COINBASE_COMMERCE_WEBHOOK_SECRET=your_webhook_secret

# Binance Pay
BINANCE_PAY_API_KEY=your_binance_api_key
BINANCE_PAY_SECRET_KEY=your_binance_secret

# Email Configuration
MAIL_SERVICE=gmail
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your_email@gmail.com
MAIL_APP_PASSWORD=your_app_password
```

## Stock Management

### Automatic Stock Updates

- **Stock Reservation** - Stock is reduced when order is created
- **Stock Release** - Stock is restored if payment fails or order is cancelled
- **Out of Stock Detection** - Products automatically marked as OUT_OF_STOCK when stock reaches 0
- **Stock Restoration** - Products marked as ACTIVE when stock is replenished

### Stock Validation API

```typescript
// Validate stock for multiple products
const validation = await stockValidationService.validateStock([
  { productId: 'uuid1', quantity: 2 },
  { productId: 'uuid2', quantity: 1 },
]);

if (!validation.valid) {
  console.log('Errors:', validation.errors);
}
```

## Email Notifications

### Order Confirmation Email

Automatically sent after successful payment confirmation:

- **Order Details** - Order number, date, items
- **Customer Information** - Name, email, shipping address
- **Payment Information** - Method, amount, transaction ID
- **Digital Products** - Download links and activation codes
- **Support Information** - Contact details for assistance

### Email Template Features

- **Responsive Design** - Works on desktop and mobile
- **Product Images** - Displays product thumbnails
- **Digital Delivery** - Special section for digital products
- **Professional Styling** - Branded email template

## Webhook Handling

### Payment Gateway Webhooks

```typescript
POST / payment / webhook / { gateway };
```

Supported webhooks:

- **Stripe** - `payment_intent.succeeded`, `payment_intent.payment_failed`
- **PayPal** - `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`
- **Coinbase** - `charge:confirmed`, `charge:failed`

### Webhook Security

- **Signature Verification** - All webhooks verified using gateway signatures
- **Idempotency** - Duplicate webhook handling prevention
- **Error Handling** - Comprehensive error logging and recovery

## Error Handling

### Common Error Scenarios

1. **Insufficient Stock** - Returns specific stock availability
2. **Payment Failures** - Detailed error messages from gateways
3. **Invalid Products** - Product not found or inactive
4. **User Creation Errors** - Email validation and duplicate handling
5. **Network Issues** - Retry mechanisms for external API calls

### Error Response Format

```json
{
  "success": false,
  "error": "Insufficient stock for Product Name. Available: 5, Requested: 10",
  "code": "INSUFFICIENT_STOCK"
}
```

## Database Schema

### Key Tables

- **orders** - Main order records
- **order_items** - Individual order line items
- **carts** - Shopping cart sessions
- **cart_items** - Cart line items
- **users** - Customer information (including guests)
- **products** - Product catalog with stock levels

### Order Status Flow

```
PENDING → PROCESSING → SHIPPED → DELIVERED
    ↓
CANCELLED ← REFUNDED
```

### Payment Status Flow

```
PENDING → PROCESSING → COMPLETED
    ↓
FAILED ← REFUNDED
```

## API Endpoints

### Cart Management

- `POST /cart/add` - Add item to cart
- `GET /cart/user/{userId}` - Get user's cart
- `PATCH /cart/item/{itemId}` - Update cart item quantity
- `DELETE /cart/item/{itemId}` - Remove item from cart
- `DELETE /cart/{id}/clear` - Clear entire cart

### Order Management

- `POST /orders/purchase` - Process complete purchase
- `POST /orders/{id}/confirm-payment` - Confirm payment
- `GET /orders` - List orders (with pagination)
- `GET /orders/{id}` - Get order details
- `PATCH /orders/{id}` - Update order
- `DELETE /orders/{id}` - Cancel order

### Payment Management

- `POST /payment/webhook/{gateway}` - Handle payment webhooks
- `POST /payment/retry/{orderId}` - Retry failed payment
- `POST /payment/refund/{orderId}` - Process refund

## Security Considerations

### Data Protection

- **No Sensitive Data Storage** - Credit card details never stored
- **Payment Tokens** - Only secure tokens stored
- **Email Encryption** - Sensitive order data encrypted in emails
- **Webhook Verification** - All webhooks cryptographically verified

### Input Validation

- **DTO Validation** - Comprehensive input validation using class-validator
- **Stock Validation** - Atomic stock operations prevent overselling
- **Email Validation** - Proper email format validation
- **UUID Validation** - All IDs validated as proper UUIDs

## Testing

### Test Scenarios

1. **Successful Purchase Flow** - Complete end-to-end purchase
2. **Stock Validation** - Insufficient stock handling
3. **Payment Failures** - Various payment failure scenarios
4. **Webhook Processing** - Payment status updates
5. **Email Delivery** - Confirmation email sending
6. **Cart Management** - Add, update, remove operations
7. **Guest User Creation** - User identification and creation

### Test Data

Use the following test data for different payment methods:

```typescript
// Stripe Test Cards
const testCards = {
  success: '4242424242424242',
  decline: '4000000000000002',
  requiresAuth: '4000002500003155',
};

// PayPal Test Account
const paypalTest = {
  email: 'sb-test@business.example.com',
  password: 'testpassword',
};
```

## Deployment

### Required Dependencies

```bash
npm install stripe paypal-rest-sdk @paypal/checkout-server-sdk coinbase-commerce-node axios uuid
```

### Environment Setup

1. Configure payment gateway credentials
2. Set up email service (Gmail, SendGrid, etc.)
3. Configure database connection
4. Set up webhook endpoints with proper SSL

### Production Considerations

- **Rate Limiting** - Implement rate limiting for API endpoints
- **Monitoring** - Set up payment and order monitoring
- **Backup Strategy** - Regular database backups
- **Error Alerting** - Real-time error notifications
- **Performance Optimization** - Database indexing and query optimization

## Support and Maintenance

### Monitoring

- **Payment Success Rates** - Track payment gateway performance
- **Order Completion Rates** - Monitor purchase funnel
- **Stock Levels** - Alert on low stock situations
- **Email Delivery** - Monitor email sending success

### Maintenance Tasks

- **Stock Reconciliation** - Regular stock level verification
- **Payment Reconciliation** - Match payments with orders
- **Failed Order Cleanup** - Handle abandoned orders
- **Email Queue Management** - Monitor email sending queue

## Conclusion

This implementation provides a robust, scalable purchase process supporting multiple payment methods, comprehensive error handling, and excellent user experience. The modular architecture allows for easy extension and maintenance while ensuring data integrity and security throughout the purchase flow.
