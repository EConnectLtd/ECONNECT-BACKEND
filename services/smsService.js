const axios = require("axios");

class SMSService {
  constructor() {
    this.username = process.env.NEXTSMS_USERNAME;
    this.password = process.env.NEXTSMS_PASSWORD;
    this.senderId = process.env.NEXTSMS_SENDER_ID || "ECONNECT";
    this.baseUrl =
      process.env.NEXTSMS_BASE_URL || "https://messaging-service.co.tz";

    // Create Base64 encoded auth string
    this.authToken = Buffer.from(`${this.username}:${this.password}`).toString(
      "base64"
    );
  }

  /**
   * Send SMS to a single recipient
   * @param {string} phone - Phone number in format 255XXXXXXXXX
   * @param {string} message - SMS message content
   * @param {string} reference - Optional reference for tracking
   * @returns {Promise} SMS send response
   */
  async sendSMS(phone, message, reference = null) {
    try {
      // Ensure phone number is in correct format (255XXXXXXXXX)
      const formattedPhone = this.formatPhoneNumber(phone);

      const payload = {
        from: this.senderId,
        to: formattedPhone,
        text: message,
      };

      if (reference) {
        payload.reference = reference;
      }

      console.log("📤 Sending SMS:", {
        to: formattedPhone,
        from: this.senderId,
        messageLength: message.length,
        reference,
      });

      const response = await axios.post(
        `${this.baseUrl}/api/sms/v1/text/single`,
        payload,
        {
          headers: {
            Authorization: `Basic ${this.authToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      console.log("✅ SMS sent successfully:", response.data);
      return {
        success: true,
        data: response.data,
        messageId: response.data.messages?.[0]?.messageId || null,
      };
    } catch (error) {
      console.error(
        "❌ SMS sending failed:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Send SMS to multiple recipients
   * @param {Array} phones - Array of phone numbers
   * @param {string} message - SMS message content
   * @param {string} reference - Optional reference for tracking
   * @returns {Promise} SMS send response
   */
  async sendBulkSMS(phones, message, reference = null) {
    try {
      const formattedPhones = phones.map((phone) =>
        this.formatPhoneNumber(phone)
      );

      const payload = {
        from: this.senderId,
        to: formattedPhones,
        text: message,
      };

      if (reference) {
        payload.reference = reference;
      }

      console.log("📤 Sending Bulk SMS:", {
        recipients: formattedPhones.length,
        from: this.senderId,
        messageLength: message.length,
        reference,
      });

      const response = await axios.post(
        `${this.baseUrl}/api/sms/v1/text/single`,
        payload,
        {
          headers: {
            Authorization: `Basic ${this.authToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      console.log("✅ Bulk SMS sent successfully");
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error(
        "❌ Bulk SMS sending failed:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Format phone number to NEXTSMS format (255XXXXXXXXX)
   * @param {string} phone - Phone number to format
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(phone) {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, "");

    // If starts with +255, remove the +
    if (phone.startsWith("+255")) {
      cleaned = phone.substring(1).replace(/\D/g, "");
    }
    // If starts with 0, replace with 255
    else if (cleaned.startsWith("0")) {
      cleaned = "255" + cleaned.substring(1);
    }
    // If starts with 255, keep as is
    else if (!cleaned.startsWith("255")) {
      // If doesn't start with 255, assume it's a local number without country code
      cleaned = "255" + cleaned;
    }

    return cleaned;
  }

  /**
   * Send password to new user
   * @param {string} phone - User's phone number
   * @param {string} password - Auto-generated password
   * @param {string} userName - User's name
   * @param {string} userId - User ID for reference
   * @returns {Promise} SMS send response
   */
  async sendPasswordSMS(phone, password, userName, userId = null) {
    const message = `Hello ${userName},\n\nWelcome to ECONNECT!\n\nYour login credentials:\nPhone: ${phone}\nPassword: ${password}\n\nPlease change your password after first login.\n\n- ECONNECT Team`;

    const reference = userId ? `pwd_${userId}` : null;

    return await this.sendSMS(phone, message, reference);
  }

  /**
   * Send payment confirmation SMS
   * @param {string} phone - User's phone number
   * @param {string} userName - User's name
   * @param {number} amount - Payment amount
   * @param {string} packageType - Package type (CTM, Silver, Gold, Platinum)
   * @returns {Promise} SMS send response
   */
  async sendPaymentConfirmationSMS(phone, userName, amount, packageType) {
    const message = `Hello ${userName},\n\nYour ${packageType} package payment of TZS ${amount.toLocaleString()} has been received and is pending verification.\n\nYou will be notified once approved.\n\n- ECONNECT Team`;

    return await this.sendSMS(phone, message, `payment_${packageType}`);
  }

  /**
   * Send payment approval SMS
   * @param {string} phone - User's phone number
   * @param {string} userName - User's name
   * @param {string} packageType - Package type
   * @returns {Promise} SMS send response
   */
  async sendPaymentApprovalSMS(phone, userName, packageType) {
    const message = `Hello ${userName},\n\nGreat news! Your ${packageType} package payment has been approved.\n\nYou now have full access to all ${packageType} features.\n\nLogin at: econnect.co.tz\n\n- ECONNECT Team`;

    return await this.sendSMS(phone, message, `approval_${packageType}`);
  }

  /**
   * Get SMS delivery report
   * @param {string} messageId - Message ID from send response
   * @returns {Promise} Delivery report
   */
  async getDeliveryReport(messageId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/sms/v1/reports?messageId=${messageId}`,
        {
          headers: {
            Authorization: `Basic ${this.authToken}`,
            Accept: "application/json",
          },
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error(
        "❌ Failed to get delivery report:",
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }
}

module.exports = new SMSService();
