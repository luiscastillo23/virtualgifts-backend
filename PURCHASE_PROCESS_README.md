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
- **BitPay** - Multi-cryptocurrency payments (22+ cryptocurrencies)
- **NOWPayments** - Multi-cryptocurrency payments (200+ cryptocurrencies)
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

# NOWPayments
NOWPAYMENTS_API_KEY=your_nowpayments_api_key
NOWPAYMENTS_IPN_SECRET=your_ipn_secret_key
NOWPAYMENTS_SANDBOX=false

# Binance Pay
BINANCE_PAY_API_KEY=your_binance_api_key
BINANCE_PAY_SECRET_KEY=your_binance_secret_key

# Email Configuration
MAIL_SERVICE=gmail
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your_email@gmail.com
MAIL_APP_PASSWORD=your_app_password
```

## NOWPayments Integration

### Overview

NOWPayments is a non-custodial cryptocurrency payment processing platform that supports 200+ cryptocurrencies. The implementation uses the official NOWPayments JavaScript SDK and follows their latest API specifications.

### Key Features

- **200+ Cryptocurrencies** - Support for Bitcoin, Ethereum, USDT, and many more
- **Non-custodial** - Payments go directly to your wallet
- **Instant Conversion** - Automatic conversion to your preferred cryptocurrency
- **Fixed Rate** - Option to lock exchange rates for payments
- **Partial Payments** - Support for multiple payments for one order
- **Sandbox Mode** - Full testing environment available

### Configuration

#### Required Environment Variables

```env
# Production
NOWPAYMENTS_API_KEY=your_production_api_key
NOWPAYMENTS_IPN_SECRET=your_ipn_secret_key
NOWPAYMENTS_SANDBOX=false

# Sandbox (for testing)
NOWPAYMENTS_API_KEY=your_sandbox_api_key
NOWPAYMENTS_IPN_SECRET=your_sandbox_ipn_secret
NOWPAYMENTS_SANDBOX=true
```

**Important Security Notes:**

- The `NOWPAYMENTS_IPN_SECRET` is now **required** for production environments
- Webhook verification will fail if the IPN secret is not configured
- This ensures all webhook communications are properly authenticated

#### Setup Steps

1. **Create NOWPayments Account**

   - Sign up at [nowpayments.io](https://nowpayments.io)
   - Complete KYC verification for production use

2. **Configure Outcome Wallet**

   - Set your preferred cryptocurrency for receiving payments
   - Configure wallet address in your NOWPayments dashboard

3. **Generate API Credentials**

   - Generate API key in your dashboard
   - Create IPN (Instant Payment Notification) secret key
   - Configure webhook URL: `https://yourdomain.com/payment/webhook/nowpayments`

4. **Test in Sandbox**
   - Use sandbox environment for testing
   - Sandbox API key and IPN secret are different from production

### Payment Flow

#### 1. Create Payment

```typescript
POST /orders/purchase
{
  "customerEmail": "customer@example.com",
  "items": [...],
  "paymentMethod": {
    "type": "crypto",
    "crypto": {
      "gateway": "nowpayments",
      "currency": "btc", // or any supported cryptocurrency
      "fixedRate": false // optional: lock exchange rate
    }
  },
  "shipping": {...}
}
```

#### 2. Payment Response

```typescript
{
  "success": true,
  "order": {...},
  "paymentIntent": {
    "id": "payment_id",
    "clientSecret": "wallet_address_to_send_to",
    "status": "PENDING",
    "amount": 25.99,
    "currency": "USD",
    "metadata": {
      "payAddress": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      "payCurrency": "btc",
      "payAmount": "0.00065432",
      "actuallyPaid": 0,
      "purchaseId": "purchase_id"
    }
  }
}
```

#### 3. Customer Payment

The customer sends the exact cryptocurrency amount to the provided wallet address within the time limit (usually 1 hour).

#### 4. Payment Confirmation

NOWPayments automatically detects the payment and sends webhooks to update the order status.

### Supported Cryptocurrencies

The gateway supports 200+ cryptocurrencies including:

- **Bitcoin (BTC)** - The original cryptocurrency
- **Ethereum (ETH)** - Smart contract platform
- **Tether (USDT)** - Stable coin pegged to USD
- **USD Coin (USDC)** - Another stable coin
- **Litecoin (LTC)** - Fast transaction cryptocurrency
- **Bitcoin Cash (BCH)** - Bitcoin fork with larger blocks
- **Dogecoin (DOGE)** - Popular meme cryptocurrency
- **Cardano (ADA)** - Proof-of-stake blockchain
- **Polkadot (DOT)** - Multi-chain protocol
- **Chainlink (LINK)** - Decentralized oracle network

### Advanced Features

#### Fixed Rate Payments

Lock the exchange rate for a payment to protect against volatility:

```typescript
{
  "paymentMethod": {
    "type": "crypto",
    "crypto": {
      "gateway": "nowpayments",
      "currency": "btc",
      "fixedRate": true // Lock the current exchange rate
    }
  }
}
```

#### Custom Payout Settings

Override the default payout settings for specific payments:

```typescript
{
  "paymentMethod": {
    "type": "crypto",
    "crypto": {
      "gateway": "nowpayments",
      "currency": "btc",
      "payoutAddress": "your_custom_wallet_address",
      "payoutCurrency": "eth", // Convert to different currency
      "payoutExtraId": "memo_or_tag" // For currencies requiring memo/tag
    }
  }
}
```

#### Partial Payments

NOWPayments supports multiple payments for one order:

```typescript
// If customer pays only part of the amount, they can make additional payments
// The system automatically tracks partial payments and completes the order
// when the full amount is received
```

### Webhook Handling

#### IPN (Instant Payment Notifications)

NOWPayments sends webhooks for payment status updates:

```typescript
POST /payment/webhook/nowpayments
Headers: {
  "x-nowpayments-sig": "hmac_sha512_signature"
}
Body: {
  "payment_id": 5077125051,
  "payment_status": "finished", // waiting, confirming, finished, failed, expired
  "pay_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "price_amount": 170,
  "price_currency": "usd",
  "pay_amount": 0.00456789,
  "actually_paid": 0.00456789,
  "pay_currency": "btc",
  "order_id": "order_123",
  "order_description": "Order #123",
  "purchase_id": "6084744717",
  "created_at": "2021-04-12T14:22:54.942Z",
  "updated_at": "2021-04-12T14:23:06.244Z",
  "outcome_amount": 165.50,
  "outcome_currency": "usdt"
}
```

#### Signature Verification

All webhooks are verified using HMAC-SHA512:

```typescript
// The implementation automatically verifies webhook signatures
// using the IPN secret key configured in environment variables
const hmac = crypto.createHmac('sha512', ipnSecret);
hmac.update(JSON.stringify(sortedParams));
const signature = hmac.digest('hex');
```

### Payment Statuses

NOWPayments uses the following payment statuses:

- **waiting** - Payment created, waiting for customer to send cryptocurrency
- **confirming** - Payment received, waiting for blockchain confirmations
- **partially_paid** - Customer sent less than required amount
- **finished** - Payment completed successfully
- **failed** - Payment failed (insufficient amount, expired, etc.)
- **expired** - Payment expired (customer didn't send within time limit)
- **sending** - Payment is being sent to your outcome wallet

### Error Handling

#### Common Error Scenarios

1. **Insufficient Payment** - Customer sends less than required amount
2. **Payment Expired** - Customer didn't send payment within time limit
3. **Network Congestion** - Blockchain confirmation delays
4. **Wrong Currency** - Customer sends different cryptocurrency
5. **API Rate Limits** - Too many requests to NOWPayments API

#### Error Response Examples

```typescript
// Insufficient payment
{
  "success": false,
  "error": "Payment amount insufficient. Required: 0.00456789 BTC, Received: 0.00400000 BTC",
  "code": "INSUFFICIENT_PAYMENT"
}

// Payment expired
{
  "success": false,
  "error": "Payment expired. Please create a new payment.",
  "code": "PAYMENT_EXPIRED"
}
```

### Testing

#### Sandbox Environment

NOWPayments provides a full sandbox environment for testing:

```env
NOWPAYMENTS_SANDBOX=true
NOWPAYMENTS_API_KEY=sandbox_api_key
NOWPAYMENTS_IPN_SECRET=sandbox_ipn_secret
```

#### Test Scenarios

1. **Successful Payment** - Complete payment flow with test cryptocurrencies
2. **Partial Payment** - Send less than required amount
3. **Payment Expiration** - Let payment expire without sending
4. **Webhook Processing** - Test all webhook status updates
5. **Multiple Currencies** - Test different cryptocurrency payments
6. **Fixed Rate** - Test fixed rate vs floating rate payments

### Monitoring and Analytics

#### Payment Tracking

Monitor NOWPayments through:

- **NOWPayments Dashboard** - Real-time payment tracking
- **API Status Checks** - Programmatic payment status monitoring
- **Webhook Logs** - Track all payment status updates
- **Application Logs** - Internal payment processing logs

#### Key Metrics

- **Payment Success Rate** - Percentage of completed payments
- **Average Confirmation Time** - Time from payment to completion
- **Popular Cryptocurrencies** - Most used payment currencies
- **Conversion Rates** - Customer payment completion rates

### Best Practices

#### Security

1. **Always Verify Webhooks** - Use HMAC signature verification
2. **Use HTTPS** - Secure webhook endpoints with SSL
3. **Validate Payment Amounts** - Check received amounts match expected
4. **Monitor for Duplicates** - Prevent duplicate payment processing
5. **Log All Transactions** - Maintain audit trail

#### Performance

1. **Cache Currency Lists** - Cache supported currencies to reduce API calls
2. **Async Webhook Processing** - Process webhooks asynchronously
3. **Retry Failed Requests** - Implement retry logic for API failures
4. **Rate Limit Handling** - Respect NOWPayments API rate limits

#### User Experience

1. **Clear Instructions** - Provide clear payment instructions to customers
2. **QR Codes** - Generate QR codes for easy mobile payments
3. **Real-time Updates** - Show payment status updates in real-time
4. **Multiple Currencies** - Offer popular cryptocurrency options
5. **Payment Timeouts** - Clearly communicate payment time limits

### Troubleshooting

#### Common Issues

1. **Webhook Not Received**

   - Check webhook URL configuration
   - Verify SSL certificate is valid
   - Check firewall settings

2. **Signature Verification Failed**

   - Verify IPN secret key is correct
   - Check parameter sorting implementation
   - Ensure JSON encoding matches NOWPayments format

3. **Payment Not Detected**

   - Check blockchain confirmation requirements
   - Verify customer sent to correct address
   - Check for network congestion

4. **API Errors**
   - Verify API key is valid and active
   - Check rate limit status
   - Ensure request format matches API specification

### Migration from Custom Implementation

If migrating from a custom NOWPayments implementation:

1. **Install Official SDK** - `npm install @nowpaymentsio/nowpayments-api-js`
2. **Update Environment Variables** - Add sandbox mode configuration
3. **Implement Proper Signature Verification** - Use HMAC-SHA512
4. **Update Error Handling** - Handle new error scenarios
5. **Test Thoroughly** - Verify all payment flows work correctly

## PayPal Integration

### Overview

PayPal is integrated using the latest official PayPal Server SDK (@paypal/paypal-server-sdk), providing secure payment processing with comprehensive error handling and webhook support. The implementation follows PayPal's latest best practices and API specifications.

### Key Features

- **Latest PayPal SDK** - Uses @paypal/paypal-server-sdk v1.1.0+ for reliable integration
- **Enhanced Security** - Proper webhook signature verification and secure API calls
- **Multi-currency Support** - Support for 29+ currencies with proper decimal handling
- **Comprehensive Error Handling** - Detailed error messages and proper status mapping
- **Production Ready** - Full sandbox and production environment support
- **Order Lifecycle Management** - Complete order creation, capture, and refund flow
- **Health Monitoring** - Built-in connectivity health checks

### Configuration

#### Required Environment Variables

```env
# PayPal Configuration
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox # or 'live' for production
PAYPAL_WEBHOOK_ID=your_webhook_id # Optional but recommended for production
```

### Payment Flow

#### 1. Create Payment Intent

```typescript
POST /orders/purchase
{
  "customerEmail": "customer@example.com",
  "items": [...],
  "paymentMethod": {
    "type": "paypal",
    "paypal": {
      "returnUrl": "https://yoursite.com/success",
      "cancelUrl": "https://yoursite.com/cancel"
    }
  },
  "shipping": {...}
}
```

#### 2. Enhanced Payment Response

```typescript
{
  "success": true,
  "order": {...},
  "paymentIntent": {
    "id": "paypal_order_id",
    "clientSecret": "https://www.paypal.com/checkoutnow?token=...",
    "status": "PENDING",
    "amount": 25.99,
    "currency": "USD",
    "metadata": {
      "approvalUrl": "https://www.paypal.com/checkoutnow?token=...",
      "paypalOrderId": "paypal_order_id",
      "createTime": "2023-12-01T10:00:00Z",
      "links": [...]
    }
  }
}
```

### Advanced Features

#### Enhanced Order Creation with Breakdown

```typescript
{
  "metadata": {
    "breakdown": {
      "itemTotal": 20.00,
      "shipping": 5.00,
      "taxTotal": 2.00,
      "discount": 1.00
    },
    "items": [
      {
        "name": "Digital Product",
        "quantity": 1,
        "unitAmount": 20.00,
        "description": "Product description",
        "sku": "PROD-001",
        "category": "DIGITAL_GOODS"
      }
    ]
  }
}
```

#### Payer Information Support

```typescript
{
  "metadata": {
    "payer": {
      "name": {
        "givenName": "John",
        "surname": "Doe"
      },
      "emailAddress": "john@example.com",
      "phone": "+1-555-123-4567",
      "address": {
        "addressLine1": "123 Main St",
        "adminArea2": "New York",
        "adminArea1": "NY",
        "postalCode": "10001",
        "countryCode": "US"
      }
    }
  }
}
```

### Supported Currencies

PayPal supports 29+ currencies with proper decimal place handling:

- **Major Currencies**: USD, EUR, GBP, JPY, CAD, AUD, CHF
- **Asian Currencies**: CNY, SGD, HKD, JPY, KRW, TWD, THB, MYR, PHP
- **European Currencies**: EUR, GBP, CHF, SEK, NOK, DKK, PLN, CZK, HUF
- **Other Currencies**: BRL, ILS, TRY, RUB, INR, ZAR

**Note**: Zero-decimal currencies (JPY, KRW, TWD) are automatically handled without decimal places.

### Error Handling Improvements

#### Enhanced Error Messages

```typescript
// Specific PayPal error handling
{
  "success": false,
  "error": "PayPal order has not been approved by the payer",
  "code": "ORDER_NOT_APPROVED"
}

// Currency validation
{
  "success": false,
  "error": "Unsupported currency: XYZ",
  "code": "CURRENCY_NOT_SUPPORTED"
}

// Amount validation
{
  "success": false,
  "error": "Amount too small: minimum 0.01 USD",
  "code": "AMOUNT_TOO_SMALL"
}
```

### Webhook Handling

#### Secure Webhook Verification

The implementation includes proper webhook signature verification:

```typescript
// Required webhook headers
{
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-transmission-id": "transmission_id",
  "paypal-cert-id": "cert_id",
  "paypal-transmission-time": "timestamp",
  "paypal-transmission-sig": "signature"
}
```

#### Supported Webhook Events

- `PAYMENT.CAPTURE.COMPLETED` - Payment successfully captured
- `PAYMENT.CAPTURE.DENIED` - Payment was denied
- `PAYMENT.CAPTURE.REFUNDED` - Payment was refunded
- `CHECKOUT.ORDER.APPROVED` - Order approved by customer

### Health Check and Monitoring

#### Connectivity Health Check

```typescript
// Health check endpoint response
{
  "status": "connected", // or "disconnected"
  "environment": "sandbox", // or "production"
  "timestamp": "2023-12-01T10:00:00Z"
}
```

### Best Practices Implementation

1. **Proper SDK Usage** - Uses official PayPal Server SDK with latest patterns
2. **Security First** - Webhook signature verification and secure credential handling
3. **Error Resilience** - Comprehensive error handling with specific error codes
4. **Currency Compliance** - Proper decimal place handling for all supported currencies
5. **Production Ready** - Full environment separation and configuration management
6. **Monitoring Support** - Built-in health checks and detailed logging

### Migration Notes

If upgrading from an older PayPal implementation:

1. **Update Dependencies** - Install latest @paypal/paypal-server-sdk
2. **Review Configuration** - Update environment variables format
3. **Test Webhook Verification** - Ensure proper signature validation
4. **Validate Currency Handling** - Test decimal place formatting
5. **Update Error Handling** - Use new error response format

## Binance Pay Integration

### Overview

Binance Pay is integrated using the official Binance Pay API V3, providing secure cryptocurrency payment processing with comprehensive error handling and webhook support. The implementation follows Binance Pay's latest best practices and API specifications as of 2025.

### Key Features

- **Latest API V3** - Uses Binance Pay API V3 with latest patterns and security (migrated from deprecated V2)
- **Enhanced Security** - Proper webhook signature verification using HMAC-SHA512
- **Expanded Cryptocurrency Support** - Support for USDT, USDC, BNB, BTC, BUSD, and MBOX payments
- **Mandatory Description Field** - Complies with API V3 requirement for order descriptions
- **Updated Goods Structure** - Uses `goodsDetails` array structure as required by API V3
- **Comprehensive Error Handling** - Detailed error messages and proper status mapping
- **Production Ready** - Full environment separation and configuration management
- **Order Lifecycle Management** - Complete order creation, query, and refund flow
- **Health Monitoring** - Built-in connectivity health checks

### Configuration

#### Required Environment Variables

```env
# Binance Pay Configuration
BINANCE_PAY_API_KEY=your_binance_api_key
BINANCE_PAY_SECRET_KEY=your_binance_secret_key
```

**Important Notes:**

- Binance Pay uses the same URL for both sandbox and production
- Environment is controlled by API keys (sandbox vs production keys)
- No separate environment variable needed

### Payment Flow

#### 1. Create Payment Intent

```typescript
POST /orders/purchase
{
  "customerEmail": "customer@example.com",
  "items": [...],
  "paymentMethod": {
    "type": "binance_pay",
    "binancePay": {
      "currency": "USDT", // USDT, BUSD, or MBOX
      "terminalType": "WEB", // WEB, APP, WAP, MINI_PROGRAM
      "returnUrl": "https://yoursite.com/success",
      "cancelUrl": "https://yoursite.com/cancel"
    }
  },
  "shipping": {...}
}
```

#### 2. Enhanced Payment Response

```typescript
{
  "success": true,
  "order": {...},
  "paymentIntent": {
    "id": "binance_prepay_id",
    "clientSecret": "https://pay.binance.com/checkout/...",
    "status": "PENDING",
    "amount": 25.99,
    "currency": "USDT",
    "metadata": {
      "merchantTradeNo": "VG_1640995200000_abc12345",
      "checkoutUrl": "https://pay.binance.com/checkout/...",
      "qrcodeLink": "https://qrservice.binance.com/...",
      "qrContent": "binancepay://pay?...",
      "deeplink": "bnc://app.binance.com/payment/...",
      "universalUrl": "https://app.binance.com/payment/...",
      "expireTime": 1640999200000
    }
  }
}
```

### Advanced Features

#### Enhanced Order Creation Options

```typescript
{
  "metadata": {
    "terminalType": "WEB", // WEB, APP, WAP, MINI_PROGRAM, PAYMENT_LINK
    "clientIp": "192.168.1.1", // Customer IP address
    "productDetail": "Detailed product description",
    "supportPayCurrency": "BUSD,USDT", // Limit payment currencies
    "expireTime": 1640999200000, // Custom expiration timestamp
    "webhookUrl": "https://yoursite.com/webhook/binance",
    "passThroughInfo": {
      "orderId": "internal_order_123",
      "customData": "any_custom_data"
    }
  }
}
```

### Supported Currencies

Binance Pay supports only cryptocurrency payments (updated for API V3):

- **USDT** - Tether (most commonly used stablecoin)
- **USDC** - USD Coin (MICA-compliant stablecoin, preferred for EU users)
- **BNB** - Binance Coin (native Binance ecosystem token)
- **BTC** - Bitcoin (original cryptocurrency)
- **BUSD** - Binance USD (Binance's native stablecoin, being phased out)
- **MBOX** - Mobox token (gaming ecosystem token)

**Important Notes:**

- Fiat currencies are not supported directly
- All amounts support up to 8 decimal places
- Minimum payment amount: 0.00000001
- USDC is now preferred for MICA-compliant users in the EU
- EUR is no longer supported as order currency (use USDC instead)

### Error Handling Improvements

#### Enhanced Error Messages

```typescript
// Currency validation
{
  "success": false,
  "error": "Unsupported currency: BTC. Supported currencies: BUSD, USDT, MBOX",
  "code": "CURRENCY_NOT_SUPPORTED"
}

// Amount validation
{
  "success": false,
  "error": "Amount too small: minimum 0.00000001",
  "code": "AMOUNT_TOO_SMALL"
}

// API errors
{
  "success": false,
  "error": "Binance Pay API Error: INVALID_MERCHANT_TRADE_NO",
  "code": "BINANCE_API_ERROR"
}

// Credential errors
{
  "success": false,
  "error": "Binance Pay API credentials not configured. Please set BINANCE_PAY_API_KEY and BINANCE_PAY_SECRET_KEY environment variables.",
  "code": "CREDENTIALS_NOT_CONFIGURED"
}
```

### Webhook Handling

#### Secure Webhook Verification

The implementation includes proper webhook signature verification using HMAC-SHA512:

```typescript
// Required webhook headers
{
  "binancepay-timestamp": "1640995200000",
  "binancepay-nonce": "32-character-random-hex-string",
  "binancepay-signature": "HMAC-SHA512-signature-in-uppercase"
}

// Webhook payload example
{
  "data": {
    "merchantId": 98729382672,
    "prepayId": "383729303729303",
    "transactionId": "23729202729220282",
    "merchantTradeNo": "VG_1640995200000_abc12345",
    "status": "PAID",
    "currency": "USDT",
    "totalFee": 25.99,
    "transactTime": 1640995200123,
    "openUserId": "user_123",
    "passThroughInfo": "{\"orderId\":\"internal_order_123\"}"
  },
  "bizType": "PAY_SUCCESS"
}
```

#### Supported Webhook Events

- `PAY_SUCCESS` - Payment successfully completed
- `PAY_CLOSE` - Payment was cancelled by user
- `PAY_REFUND` - Payment was refunded
- `PAY_FAILED` - Payment failed or expired
- `PAY_UPDATE` - General payment status update

### Order Status Mapping

Binance Pay uses the following order statuses:

- **INITIAL** - Order created, waiting for payment
- **PENDING** - Payment in progress
- **PAID** - Payment completed successfully
- **CANCELED/CANCELLED** - Payment cancelled by user
- **REFUNDING** - Refund in progress
- **REFUNDED** - Payment refunded successfully
- **ERROR** - Payment error occurred
- **EXPIRED** - Payment expired (user didn't pay within time limit)

### Health Check and Monitoring

#### Connectivity Health Check

```typescript
// Health check endpoint response
{
  "status": "connected", // or "disconnected"
  "timestamp": "2023-12-01T10:00:00Z"
}
```

The health check works by:

1. Testing API credentials with a minimal query
2. If ORDER_NOT_FOUND (400202) is returned, credentials are working
3. Other errors indicate connection or credential issues

### Best Practices Implementation

1. **Latest API Version** - Uses Binance Pay API V2 with latest security patterns
2. **Security First** - Proper webhook signature verification and credential validation
3. **Error Resilience** - Comprehensive error handling with specific error codes
4. **Precision Handling** - Proper decimal place handling (up to 8 decimal places)
5. **Production Ready** - Full environment separation and configuration management
6. **Monitoring Support** - Built-in health checks and detailed logging
7. **Timeout Management** - Proper request timeouts (30 seconds)
8. **Secure Nonce Generation** - Cryptographically secure random nonce generation

### Payment Integration Examples

#### Basic Payment

```typescript
// Create a basic USDT payment
const paymentIntent = await binancePayGateway.createPaymentIntent(
  25.99,
  'USDT',
  {
    orderId: 'ORDER_123',
    description: 'VirtualGifts Purchase',
    returnUrl: 'https://yoursite.com/success',
    cancelUrl: 'https://yoursite.com/cancel',
  },
);
```

#### Advanced Payment with Custom Settings

```typescript
// Create payment with advanced options
const paymentIntent = await binancePayGateway.createPaymentIntent(
  0.00123456, // High precision amount
  'BUSD',
  {
    terminalType: 'APP',
    clientIp: '192.168.1.100',
    productDetail: 'Premium digital license',
    supportPayCurrency: 'BUSD,USDT',
    expireTime: Date.now() + 30 * 60 * 1000, // 30 minutes
    webhookUrl: 'https://yoursite.com/webhook/binance',
    passThroughInfo: {
      orderId: 'INTERNAL_123',
      userId: 'USER_456',
      metadata: 'custom_data',
    },
  },
);
```

### Refund Processing

```typescript
// Process full refund
const refundResult = await binancePayGateway.refundPayment('prepay_id_123');

// Process partial refund
const partialRefund = await binancePayGateway.refundPayment(
  'prepay_id_123',
  10.5, // Refund amount
);
```

### Migration Notes

If upgrading from an older Binance Pay implementation:

1. **Update to V2 API** - Migrate from deprecated V1 endpoints to V2
2. **Review Webhook Verification** - Implement proper HMAC-SHA512 signature verification
3. **Update Error Handling** - Use new comprehensive error handling
4. **Test Currency Support** - Verify supported currencies (USDT, BUSD, MBOX only)
5. **Validate Precision** - Test decimal place formatting (up to 8 decimal places)
6. **Update Configuration** - Ensure proper environment variable setup
7. **Test Health Checks** - Verify connectivity monitoring works correctly

### Troubleshooting

#### Common Issues

1. **Invalid Signature**

   - Ensure timestamp and nonce are included in webhook headers
   - Verify HMAC-SHA512 signature calculation
   - Check that signature is uppercase

2. **Currency Not Supported**

   - Only USDT, BUSD, and MBOX are supported
   - Verify currency parameter is uppercase

3. **Amount Too Small**

   - Minimum amount is 0.00000001
   - Use proper decimal precision (up to 8 places)

4. **Order Not Found**

   - Check prepayId format and validity
   - Verify order was created successfully

5. **API Credentials**
   - Ensure both API key and secret key are configured
   - Verify keys are for correct environment (sandbox vs production)

## Coinbase Commerce Integration

### Overview

Coinbase Commerce is integrated using the latest official Coinbase Commerce API, providing secure cryptocurrency payment processing with comprehensive error handling and webhook support. The implementation follows Coinbase Commerce's latest best practices and API specifications as of 2025.

### Key Features

- **Latest API Version** - Uses Coinbase Commerce API v2018-03-22 with latest patterns and security
- **Enhanced Security** - Proper webhook signature verification using HMAC-SHA256
- **Extensive Cryptocurrency Support** - Support for 70+ cryptocurrencies including BTC, ETH, USDC, and many more
- **Onchain Payment Protocol** - Built on Coinbase's Onchain Payment Protocol for automatic USDC settlement
- **Comprehensive Error Handling** - Detailed error messages and proper status mapping
- **Production Ready** - Full environment separation and configuration management
- **Charge Lifecycle Management** - Complete charge creation, retrieval, and status tracking
- **Health Monitoring** - Built-in connectivity health checks

### Configuration

#### Required Environment Variables

```env
# Coinbase Commerce Configuration
COINBASE_COMMERCE_API_KEY=your_coinbase_api_key
COINBASE_COMMERCE_WEBHOOK_SECRET=your_webhook_secret
```

**Setup Steps:**

1. **Create Coinbase Commerce Account**

   - Sign up at [commerce.coinbase.com](https://beta.commerce.coinbase.com/)
   - Add an EVM compatible wallet address to receive crypto deposits

2. **Generate API Credentials**

   - Go to Settings > Security in your Coinbase Commerce dashboard
   - Click "New API key" and copy your key
   - Generate webhook secret for secure webhook verification

3. **Configure Webhook URL**
   - Set webhook URL: `https://yourdomain.com/payment/webhook/coinbase`
   - Ensure proper SSL certificate for webhook security

### Payment Flow

#### 1. Create Payment Intent

```typescript
POST /orders/purchase
{
  "customerEmail": "customer@example.com",
  "items": [...],
  "paymentMethod": {
    "type": "crypto",
    "crypto": {
      "gateway": "coinbase",
      "currency": "BTC" // or any supported cryptocurrency
    }
  },
  "shipping": {...}
}
```

#### 2. Enhanced Payment Response

```typescript
{
  "success": true,
  "order": {...},
  "paymentIntent": {
    "id": "coinbase_charge_id",
    "clientSecret": "https://commerce.coinbase.com/charges/...",
    "status": "PENDING",
    "amount": 25.99,
    "currency": "USD",
    "metadata": {
      "chargeId": "coinbase_charge_id",
      "chargeCode": "ABCD1234",
      "hostedUrl": "https://commerce.coinbase.com/charges/...",
      "expiresAt": "2023-12-01T11:00:00Z",
      "addresses": {
        "bitcoin": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "ethereum": "0x1234567890123456789012345678901234567890",
        "litecoin": "ltc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
      },
      "pricing": {
        "local": { "amount": "25.99", "currency": "USD" },
        "settlement": { "amount": "25.99", "currency": "USDC" }
      }
    }
  }
}
```

### Supported Cryptocurrencies

Coinbase Commerce supports 70+ cryptocurrencies with automatic USDC settlement:

#### Major Cryptocurrencies

- **Bitcoin (BTC)** - The original cryptocurrency
- **Ethereum (ETH)** - Smart contract platform
- **Litecoin (LTC)** - Fast transaction cryptocurrency
- **Bitcoin Cash (BCH)** - Bitcoin fork with larger blocks

#### Stablecoins

- **USDC** - USD Coin (primary settlement currency)
- **USDT** - Tether
- **DAI** - Decentralized stablecoin

#### Popular Altcoins

- **DOGE** - Dogecoin
- **SHIB** - Shiba Inu
- **APE** - ApeCoin
- **MATIC** - Polygon
- **AVAX** - Avalanche
- **SOL** - Solana
- **ADA** - Cardano
- **DOT** - Polkadot
- **LINK** - Chainlink

#### DeFi Tokens

- **UNI** - Uniswap
- **AAVE** - Aave Protocol
- **COMP** - Compound
- **MKR** - Maker
- **SNX** - Synthetix
- **YFI** - Yearn Finance
- **SUSHI** - SushiSwap
- **CRV** - Curve

#### Exchange Tokens

- **BNB** - Binance Coin
- **CRO** - Crypto.com Coin
- **LEO** - UNUS SED LEO
- **FTT** - FTX Token
- **HT** - Huobi Token
- **OKB** - OKEx Token

**And many more**: 70+ cryptocurrencies supported with automatic conversion to USDC

### Advanced Features

#### Onchain Payment Protocol

Coinbase Commerce is built on the **Onchain Payment Protocol**, providing:

- **Automatic Conversion**: Customers pay in their preferred currency, automatically converted to USDC
- **Guaranteed Settlement**: No volatility risk with automatic USDC settlement
- **Multi-network Support**: Support for Base, Polygon, and other EVM networks
- **Instant Confirmation**: Low-cost transactions with instant confirmation
- **Global Accessibility**: Accept payments from customers worldwide

#### Enhanced Charge Management

```typescript
// Get charge details with full timeline
const charge = await coinbaseGateway.getCharge('charge_id');

// List charges with pagination
const charges = await coinbaseGateway.listCharges({
  limit: 25,
  starting_after: 'cursor_id',
});

// Health check with detailed status
const health = await coinbaseGateway.healthCheck();

// Get real-time exchange rates
const rates = await coinbaseGateway.getExchangeRates();

// Get supported currencies
const currencies = await coinbaseGateway.getSupportedCurrencies();
```

### Webhook Handling

#### Secure Webhook Verification

```typescript
POST /payment/webhook/coinbase
Headers: {
  "x-cc-webhook-signature": "hmac_sha256_signature"
}
Body: {
  "event": {
    "id": "event_id",
    "type": "charge:confirmed",
    "data": {
      "id": "charge_id",
      "code": "ABCD1234",
      "timeline": [
        {
          "time": "2023-12-01T10:00:00Z",
          "status": "NEW"
        },
        {
          "time": "2023-12-01T10:05:00Z",
          "status": "PENDING"
        },
        {
          "time": "2023-12-01T10:10:00Z",
          "status": "COMPLETED"
        }
      ],
      "payments": [
        {
          "network": "ethereum",
          "transaction_id": "0x1234...",
          "status": "CONFIRMED",
          "value": {
            "local": { "amount": "25.99", "currency": "USD" },
            "crypto": { "amount": "0.025", "currency": "ETH" }
          }
        }
      ]
    },
    "created_at": "2023-12-01T10:00:00Z"
  }
}
```

#### Supported Webhook Events

- `charge:created` - Charge created successfully
- `charge:confirmed` - Payment confirmed on blockchain
- `charge:failed` - Payment failed or expired
- `charge:delayed` - Payment detected but needs more confirmations
- `charge:pending` - Payment detected, waiting for confirmations
- `charge:resolved` - Payment issue resolved

### Error Handling

#### Enhanced Error Messages

```typescript
// API key not configured
{
  "success": false,
  "error": "Coinbase Commerce API key not configured. Please set COINBASE_COMMERCE_API_KEY environment variable.",
  "code": "CREDENTIALS_NOT_CONFIGURED"
}

// Charge not found
{
  "success": false,
  "error": "Coinbase Commerce charge not found: charge_id",
  "code": "CHARGE_NOT_FOUND"
}

// Payment expired
{
  "success": false,
  "error": "Charge expired. Charges expire after 1 hour.",
  "code": "CHARGE_EXPIRED"
}

// Invalid amount
{
  "success": false,
  "error": "Amount must be greater than 0",
  "code": "INVALID_AMOUNT"
}
```

### Health Check and Monitoring

#### Connectivity Health Check

```typescript
// Health check endpoint response
{
  "status": "connected", // or "disconnected"
  "timestamp": "2023-12-01T10:00:00Z",
  "apiVersion": "2018-03-22",
  "details": "Successfully connected to Coinbase Commerce API"
}
```

### Payment Integration Examples

#### Basic Cryptocurrency Payment

```typescript
// Create a basic cryptocurrency payment
const paymentIntent = await coinbaseGateway.createPaymentIntent(25.99, 'USD', {
  description: 'VirtualGifts Purchase',
  orderId: 'ORDER_123',
  returnUrl: 'https://yoursite.com/success',
  cancelUrl: 'https://yoursite.com/cancel',
});
```

#### Advanced Payment with Custom Metadata

```typescript
// Create payment with custom metadata
const paymentIntent = await coinbaseGateway.createPaymentIntent(100.5, 'USD', {
  description: 'Premium License Bundle',
  orderId: 'ORDER_456',
  customerEmail: 'customer@example.com',
  productType: 'license',
  quantity: 5,
  customData: {
    userId: 'USER_123',
    affiliateId: 'AFF_456',
  },
});
```

### Refund Processing

**Important Note**: Coinbase Commerce does not support automatic refunds through the API. All refunds must be processed manually through the Coinbase Commerce dashboard.

```typescript
// Refund attempt (will return error with instructions)
const refundResult = await coinbaseGateway.refundPayment('charge_id');
// Returns: "Coinbase Commerce refunds require manual processing through the dashboard"
```

### Best Practices Implementation

1. **Latest API Version** - Uses Coinbase Commerce API v2018-03-22
2. **Security First** - Proper webhook signature verification and secure credential handling
3. **Error Resilience** - Comprehensive error handling with specific error codes
4. **Automatic Settlement** - Leverages Onchain Payment Protocol for USDC settlement
5. **Production Ready** - Full environment separation and configuration management
6. **Monitoring Support** - Built-in health checks and detailed logging
7. **Timeout Management** - Proper request timeouts and retry logic
8. **Currency Flexibility** - Support for 70+ cryptocurrencies with automatic conversion

### Migration Notes

If upgrading from an older Coinbase Commerce implementation:

1. **Update API Calls** - Ensure using latest API version (2018-03-22)
2. **Review Webhook Verification** - Implement proper HMAC-SHA256 signature verification
3. **Update Error Handling** - Use new comprehensive error handling
4. **Test Cryptocurrency Support** - Verify expanded cryptocurrency list (70+ currencies)
5. **Update Configuration** - Ensure proper environment variable setup
6. **Test Health Checks** - Verify connectivity monitoring works correctly
7. **Review Settlement** - Understand automatic USDC settlement process

### Troubleshooting

#### Common Issues

1. **Invalid API Key**

   - Verify API key is correct and active
   - Check API key permissions in Coinbase Commerce dashboard
   - Ensure API key is for correct environment

2. **Webhook Signature Verification Failed**

   - Ensure webhook secret is configured correctly
   - Verify HMAC-SHA256 signature calculation
   - Check webhook URL is accessible and has valid SSL

3. **Charge Not Found**

   - Check charge ID format and validity
   - Verify charge was created successfully
   - Ensure using correct API version

4. **Payment Expired**

   - Charges expire after 1 hour automatically
   - Create new charge for expired payments
   - Consider implementing payment retry logic

5. **Network Issues**

   - Check internet connectivity
   - Verify Coinbase Commerce API status
   - Implement proper timeout and retry logic

6. **Currency Not Supported**
   - Verify cryptocurrency is in supported list
   - Check currency code format (uppercase)
   - Use getSupportedCurrencies() method for current list

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
