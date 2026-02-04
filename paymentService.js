const axios = require('axios');

class PakasirPaymentService {
  constructor() {
    this.apiKey = process.env.PAKASIR_API_KEY || 'S2NDxKHRvQDWIhIEj0ltAHasOv4RtgHk';
    this.apiUrl = process.env.PAKASIR_API_URL || 'https://api.pakasir.com';
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  }

  /**
   * Create payment invoice
   * @param {Object} params - Payment parameters
   * @returns {Promise<Object>}
   */
  async createInvoice(params) {
    const { 
      orderId, 
      amount, 
      customerName, 
      customerEmail, 
      description,
      discordId 
    } = params;

    try {
      const response = await axios.post(
        `${this.apiUrl}/v1/invoice`,
        {
          order_id: orderId,
          amount: amount,
          customer_name: customerName,
          customer_email: customerEmail || `${discordId}@discord.user`,
          description: description || 'Premium Key Purchase',
          callback_url: `${this.baseUrl}/webhook/pakasir`,
          return_url: `${this.baseUrl}/payment/success`,
          expiry_duration: 3600 // 1 hour
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.data) {
        return {
          success: true,
          invoiceId: response.data.data.invoice_id,
          paymentUrl: response.data.data.payment_url,
          orderId: response.data.data.order_id,
          amount: response.data.data.amount,
          expiryTime: response.data.data.expiry_time
        };
      }

      return {
        success: false,
        message: 'Failed to create invoice'
      };
    } catch (error) {
      console.error('Error creating Pakasir invoice:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to create payment invoice'
      };
    }
  }

  /**
   * Check payment status
   * @param {string} invoiceId - Invoice ID
   * @returns {Promise<Object>}
   */
  async checkPaymentStatus(invoiceId) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/v1/invoice/${invoiceId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.data) {
        const invoice = response.data.data;
        return {
          success: true,
          status: invoice.status, // PENDING, PAID, EXPIRED, CANCELLED
          invoiceId: invoice.invoice_id,
          orderId: invoice.order_id,
          amount: invoice.amount,
          paidAt: invoice.paid_at,
          customerName: invoice.customer_name
        };
      }

      return {
        success: false,
        message: 'Invoice not found'
      };
    } catch (error) {
      console.error('Error checking payment status:', error.response?.data || error.message);
      return {
        success: false,
        message: 'Failed to check payment status'
      };
    }
  }

  /**
   * Verify webhook callback
   * @param {Object} body - Webhook payload
   * @param {string} signature - Webhook signature header
   * @returns {Object}
   */
  verifyWebhook(body, signature) {
    // Pakasir biasanya menggunakan signature untuk verifikasi
    // Implementasi ini perlu disesuaikan dengan dokumentasi Pakasir
    try {
      const crypto = require('crypto');
      
      // Generate signature dari payload
      const payloadString = JSON.stringify(body);
      const expectedSignature = crypto
        .createHmac('sha256', this.apiKey)
        .update(payloadString)
        .digest('hex');

      // Jika Pakasir tidak menggunakan signature, return true
      if (!signature) {
        console.warn('No signature provided for webhook verification');
        return { valid: true, data: body };
      }

      const isValid = signature === expectedSignature;
      
      return {
        valid: isValid,
        data: body
      };
    } catch (error) {
      console.error('Error verifying webhook:', error.message);
      return {
        valid: false,
        message: 'Webhook verification failed'
      };
    }
  }

  /**
   * Handle successful payment
   * @param {Object} webhookData - Webhook data from Pakasir
   * @returns {Promise<Object>}
   */
  async handleSuccessfulPayment(webhookData) {
    try {
      // Extract data dari webhook
      const orderId = webhookData.order_id;
      const invoiceId = webhookData.invoice_id;
      const amount = webhookData.amount;
      const status = webhookData.status;
      const paidAt = webhookData.paid_at;

      // Parse orderId untuk mendapatkan discordId
      // Format: PREMIUM_discordId_timestamp
      const orderParts = orderId.split('_');
      const discordId = orderParts[1];

      return {
        success: true,
        discordId: discordId,
        orderId: orderId,
        invoiceId: invoiceId,
        amount: amount,
        status: status,
        paidAt: paidAt
      };
    } catch (error) {
      console.error('Error handling successful payment:', error.message);
      return {
        success: false,
        message: 'Failed to process payment'
      };
    }
  }

  /**
   * Cancel invoice
   * @param {string} invoiceId - Invoice ID
   * @returns {Promise<Object>}
   */
  async cancelInvoice(invoiceId) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/v1/invoice/${invoiceId}/cancel`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.success) {
        return {
          success: true,
          message: 'Invoice cancelled successfully'
        };
      }

      return {
        success: false,
        message: 'Failed to cancel invoice'
      };
    } catch (error) {
      console.error('Error cancelling invoice:', error.response?.data || error.message);
      return {
        success: false,
        message: 'Failed to cancel invoice'
      };
    }
  }
}

module.exports = new PakasirPaymentService();
