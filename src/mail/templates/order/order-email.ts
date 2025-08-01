interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  type: 'streaming' | 'license' | 'gift-card' | 'service';
  downloadLink?: string;
  activationCode?: string;
}

interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

export function generateOrderConfirmationEmail(data: OrderEmailData): string {
  const {
    orderNumber,
    customerName,
    customerEmail,
    orderDate,
    items,
    subtotal,
    tax,
    total,
    paymentMethod,
    billingAddress,
  } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation - ${orderNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #374151;
            background-color: #f9fafb;
        }
        
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
        }
        
        .header h1 {
            color: #ffffff;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        
        .header p {
            color: #e5e7eb;
            font-size: 16px;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 20px;
        }
        
        .order-summary {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 24px;
            margin: 24px 0;
        }
        
        .order-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .order-number {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
        }
        
        .order-date {
            color: #6b7280;
            font-size: 14px;
        }
        
        .items-list {
            margin: 20px 0;
        }
        
        .item {
            display: flex;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid #f1f5f9;
        }
        
        .item:last-child {
            border-bottom: none;
        }
        
        .item-image {
            width: 60px;
            height: 60px;
            background-color: #e5e7eb;
            border-radius: 8px;
            margin-right: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #6b7280;
        }
        
        .item-details {
            flex: 1;
        }
        
        .item-name {
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 4px;
        }
        
        .item-type {
            font-size: 12px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .item-price {
            font-weight: 600;
            color: #1f2937;
            text-align: right;
        }
        
        .totals {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
        }
        
        .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        
        .total-row.final {
            font-weight: 700;
            font-size: 18px;
            color: #1f2937;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            margin-top: 8px;
        }
        
        .download-section {
            background-color: #ecfdf5;
            border: 1px solid #d1fae5;
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
        }
        
        .download-title {
            font-weight: 600;
            color: #065f46;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
        }
        
        .download-icon {
            margin-right: 8px;
        }
        
        .download-item {
            margin-bottom: 12px;
            padding: 12px;
            background-color: #ffffff;
            border-radius: 6px;
            border: 1px solid #d1fae5;
        }
        
        .download-link {
            display: inline-block;
            background-color: #10b981;
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            font-size: 14px;
            margin-top: 8px;
        }
        
        .activation-code {
            background-color: #f3f4f6;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-weight: 600;
            color: #1f2937;
            margin-top: 8px;
            display: inline-block;
        }
        
        .billing-info {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
        }
        
        .billing-title {
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 12px;
        }
        
        .billing-details {
            color: #6b7280;
            font-size: 14px;
        }
        
        .support-section {
            background-color: #fef3c7;
            border: 1px solid #fbbf24;
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
            text-align: center;
        }
        
        .support-title {
            font-weight: 600;
            color: #92400e;
            margin-bottom: 8px;
        }
        
        .support-text {
            color: #a16207;
            font-size: 14px;
            margin-bottom: 12px;
        }
        
        .support-link {
            color: #92400e;
            text-decoration: none;
            font-weight: 500;
        }
        
        .footer {
            background-color: #1f2937;
            color: #d1d5db;
            padding: 30px;
            text-align: center;
        }
        
        .footer-logo {
            font-size: 20px;
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 16px;
        }
        
        .footer-text {
            font-size: 14px;
            margin-bottom: 20px;
        }
        
        .social-links {
            margin-bottom: 20px;
        }
        
        .social-link {
            display: inline-block;
            margin: 0 8px;
            color: #9ca3af;
            text-decoration: none;
            font-size: 14px;
        }
        
        .footer-bottom {
            font-size: 12px;
            color: #6b7280;
            border-top: 1px solid #374151;
            padding-top: 16px;
        }
        
        @media only screen and (max-width: 600px) {
            .email-container {
                margin: 0;
                box-shadow: none;
            }
            
            .header, .content, .footer {
                padding: 20px;
            }
            
            .order-header {
                flex-direction: column;
                align-items: flex-start;
            }
            
            .order-date {
                margin-top: 4px;
            }
            
            .item {
                flex-direction: column;
                align-items: flex-start;
                text-align: left;
            }
            
            .item-image {
                margin-bottom: 12px;
                margin-right: 0;
            }
            
            .item-price {
                text-align: left;
                margin-top: 8px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="header">
            <h1>VirtualGifts</h1>
            <p>Your Digital Marketplace</p>
        </div>
        
        <!-- Content -->
        <div class="content">
            <div class="greeting">
                Hello ${customerName},
            </div>
            
            <p>Thank you for your purchase! Your order has been confirmed and is being processed. Below are the details of your order:</p>
            
            <!-- Order Summary -->
            <div class="order-summary">
                <div class="order-header">
                    <div class="order-number">Order #${orderNumber}</div>
                    <div class="order-date">${orderDate}</div>
                </div>
                
                <div class="items-list">
                    ${items
                      .map(
                        (item) => `
                        <div class="item">
                            <div class="item-image">
                                ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` : 'IMG'}
                            </div>
                            <div class="item-details">
                                <div class="item-name">${item.name}</div>
                                <div class="item-type">${item.type.replace('-', ' ')}</div>
                                ${item.quantity > 1 ? `<div style="font-size: 14px; color: #6b7280;">Quantity: ${item.quantity}</div>` : ''}
                            </div>
                            <div class="item-price">$${(item.price * item.quantity).toFixed(2)}</div>
                        </div>
                    `,
                      )
                      .join('')}
                </div>
                
                <div class="totals">
                    <div class="total-row">
                        <span>Subtotal:</span>
                        <span>$${subtotal.toFixed(2)}</span>
                    </div>
                    <div class="total-row">
                        <span>Tax:</span>
                        <span>$${tax.toFixed(2)}</span>
                    </div>
                    <div class="total-row final">
                        <span>Total:</span>
                        <span>$${total.toFixed(2)}</span>
                    </div>
                </div>
            </div>
            
            <!-- Download Section -->
            ${
              items.some((item) => item.downloadLink || item.activationCode)
                ? `
            <div class="download-section">
                <div class="download-title">
                    <span class="download-icon">📥</span>
                    Your Digital Products
                </div>
                ${items
                  .filter((item) => item.downloadLink || item.activationCode)
                  .map(
                    (item) => `
                    <div class="download-item">
                        <div style="font-weight: 600; margin-bottom: 8px;">${item.name}</div>
                        ${
                          item.downloadLink
                            ? `
                            <div>
                                <a href="${item.downloadLink}" class="download-link">Download Now</a>
                            </div>
                        `
                            : ''
                        }
                        ${
                          item.activationCode
                            ? `
                            <div>
                                <div style="font-size: 14px; color: #065f46; margin-bottom: 4px;">Activation Code:</div>
                                <div class="activation-code">${item.activationCode}</div>
                            </div>
                        `
                            : ''
                        }
                    </div>
                `,
                  )
                  .join('')}
                <p style="font-size: 14px; color: #065f46; margin-top: 16px;">
                    <strong>Note:</strong> Download links will be available for 30 days. Please save your products to your device.
                </p>
            </div>
            `
                : ''
            }
            
            <!-- Billing Information -->
            ${
              billingAddress
                ? `
            <div class="billing-info">
                <div class="billing-title">Billing Information</div>
                <div class="billing-details">
                    <div><strong>Payment Method:</strong> ${paymentMethod}</div>
                    <div style="margin-top: 12px;"><strong>Billing Address:</strong></div>
                    <div>${billingAddress.street}</div>
                    <div>${billingAddress.city}, ${billingAddress.state} ${billingAddress.zipCode}</div>
                    <div>${billingAddress.country}</div>
                </div>
            </div>
            `
                : ''
            }
            
            <!-- Support Section -->
            <div class="support-section">
                <div class="support-title">Need Help?</div>
                <div class="support-text">
                    If you have any questions about your order or need assistance with your digital products, our support team is here to help.
                </div>
                <a href="mailto:support@virtualgifts.com" class="support-link">Contact Support</a>
            </div>
            
            <p>Thank you for choosing VirtualGifts. We hope you enjoy your digital products!</p>
            
            <p style="margin-top: 24px;">
                Best regards,<br>
                <strong>The VirtualGifts Team</strong>
            </p>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="footer-logo">VirtualGifts</div>
            <div class="footer-text">
                Your trusted digital marketplace for streaming services, software licenses, gift cards, and more.
            </div>
            
            <div class="social-links">
                <a href="#" class="social-link">Facebook</a>
                <a href="#" class="social-link">Twitter</a>
                <a href="#" class="social-link">Instagram</a>
                <a href="#" class="social-link">LinkedIn</a>
            </div>
            
            <div class="footer-bottom">
                © 2025 VirtualGifts. All rights reserved.<br>
                This email was sent to ${customerEmail}
            </div>
        </div>
    </div>
</body>
</html>
  `.trim();
}

// Helper function to send order confirmation email
export async function sendOrderConfirmationEmail(orderData: OrderEmailData) {
  const emailHtml = generateOrderConfirmationEmail(orderData);

  // This would integrate with your email service (SendGrid, AWS SES, etc.)
  // Example implementation:
  /*
  const emailService = new EmailService();
  await emailService.send({
    to: orderData.customerEmail,
    subject: `Order Confirmation - ${orderData.orderNumber}`,
    html: emailHtml,
    from: 'orders@virtualgifts.com'
  });
  */

  return emailHtml;
}

// Example usage
export function createSampleOrderEmail(): string {
  const sampleOrder: OrderEmailData = {
    orderNumber: 'VG-2025-001234',
    customerName: 'John Doe',
    customerEmail: 'john.doe@example.com',
    orderDate: 'January 23, 2025',
    items: [
      {
        id: '1',
        name: 'Netflix Premium Subscription - 1 Year',
        price: 179.99,
        quantity: 1,
        type: 'streaming',
        activationCode: 'NFLX-2025-ABCD-1234',
      },
      {
        id: '2',
        name: 'Microsoft Office 365 Personal',
        price: 69.99,
        quantity: 1,
        type: 'license',
        downloadLink:
          'https://download.virtualgifts.com/office365/download?token=abc123',
      },
      {
        id: '3',
        name: 'Amazon Gift Card',
        price: 50.0,
        quantity: 2,
        type: 'gift-card',
        activationCode: 'AMZN-GC-5000-WXYZ',
      },
    ],
    subtotal: 349.98,
    tax: 28.0,
    total: 377.98,
    paymentMethod: 'Credit Card ending in 4242',
    billingAddress: {
      street: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'United States',
    },
  };

  return generateOrderConfirmationEmail(sampleOrder);
}
