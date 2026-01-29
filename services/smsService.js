const axios = require("axios");

// ✅ IMPORT PACKAGE PRICING UTILITY
const {
  getStudentRegistrationFee,
  getEntrepreneurRegistrationFee,
  getEntrepreneurPackage,
  STUDENT_PACKAGES,
  ENTREPRENEUR_PACKAGES,
} = require("../utils/packagePricing");

class SMSService {
  constructor() {
    this.username = process.env.NEXTSMS_USERNAME;
    this.password = process.env.NEXTSMS_PASSWORD;

    // ✅ FIX: PRIMARY sender ID (numeric works immediately without TCRA registration)
    // Defaults to a numeric sender if NEXTSMS_SENDER_ID is not set
    this.senderId = process.env.NEXTSMS_SENDER_ID || "255758061582";

    // ✅ FIX: FALLBACK sender ID (pre-approved generic sender)
    this.fallbackSenderId = process.env.NEXTSMS_FALLBACK_SENDER_ID || "INFO";

    this.baseUrl =
      process.env.NEXTSMS_BASE_URL || "https://messaging-service.co.tz";

    // Create Base64 encoded auth string
    if (this.username && this.password) {
      this.authToken = Buffer.from(
        `${this.username}:${this.password}`,
      ).toString("base64");

      console.log("✅ NEXTSMS Service Initialized");
      console.log(`   - Base URL: ${this.baseUrl}`);
      console.log(`   - Primary Sender: ${this.senderId}`);
      console.log(`   - Fallback Sender: ${this.fallbackSenderId}`);
    } else {
      console.warn("⚠️  NEXTSMS credentials not configured");
      console.warn(
        "   SMS functionality will be disabled until credentials are provided.",
      );
      this.authToken = null;
    }

    // ✅ FIX: Warn if using unregistered alphanumeric sender ID
    if (this.senderId && /^[A-Z]{3,11}$/.test(this.senderId)) {
      console.warn("\n⚠️  ========================================");
      console.warn("⚠️   SENDER ID WARNING");
      console.warn("⚠️  ========================================");
      console.warn(
        `⚠️  Using alphanumeric sender ID: "${this.senderId}"`,
      );
      console.warn(
        "⚠️  If SMS messages are not delivered to users,",
      );
      console.warn(
        "⚠️  this sender ID may not be registered with TCRA.",
      );
      console.warn("");
      console.warn("💡 SOLUTIONS:");
      console.warn(
        "   1. Use numeric sender (e.g., 255758061582) - works immediately",
      );
      console.warn(
        "   2. Register this sender ID with TCRA via NEXTSMS support",
      );
      console.warn("⚠️  ========================================\n");
    }
  }

  /**
   * Format phone number to NEXTSMS format (255XXXXXXXXX)
   * @param {string} phone - Phone number to format
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(phone) {
    if (!phone) return "";

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
    // If doesn't start with 255, add it
    else if (!cleaned.startsWith("255")) {
      cleaned = "255" + cleaned;
    }

    return cleaned;
  }

  /**
   * ✅ NEW: Internal method to send SMS with specific sender ID
   * @param {string} senderId - Sender ID to use
   * @param {string} phone - Formatted phone number
   * @param {string} message - SMS message content
   * @param {string} reference - Optional reference for tracking
   * @returns {Promise} SMS send response
   */
  async _sendWithSenderId(senderId, phone, message, reference = null) {
    try {
      const payload = {
        from: senderId,
        to: phone,
        text: message,
      };

      if (reference) {
        payload.reference = reference;
      }

      console.log("📤 Sending SMS:", {
        to: phone,
        from: senderId,
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
          timeout: 10000, // 10 second timeout
        },d
      );

      console.log("✅ SMS API Response:", {
        status: response.status,
        data: response.data,
      });

      // ✅ FIX: CHECK ACTUAL MESSAGE STATUS (not just API acceptance)
      const messages = response.data.messages || [];
      const firstMessage = messages[0];
      const messageStatus = firstMessage?.status;
      const messageId = firstMessage?.messageId;

      // Check if message was rejected by carrier
      if (messageStatus && messageStatus.groupName === "REJECTED") {
        console.error("❌ Message rejected by carrier:", {
          groupName: messageStatus.groupName,
          description: messageStatus.description,
          name: messageStatus.name,
        });

        return {
          success: false,
          error: `Message rejected: ${messageStatus.description || messageStatus.name || "Unknown reason"}`,
          messageId,
          statusDetails: messageStatus,
        };
      }

      // Check if message is pending (accepted but not yet delivered)
      if (messageStatus && messageStatus.groupName === "PENDING") {
        console.log("⏳ Message pending delivery:", {
          groupName: messageStatus.groupName,
          description: messageStatus.description,
          messageId,
        });
      }

      return {
        success: true,
        data: response.data,
        messageId: messageId,
        status: messageStatus,
        senderId: senderId, // ✅ Track which sender ID worked
      };
    } catch (error) {
      console.error("❌ SMS API call failed:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data,
        httpStatus: error.response?.status,
      };
    }
  }

  /**
   * ✅ IMPROVED: Send SMS to a single recipient with automatic fallback
   * @param {string} phone - Phone number in format 255XXXXXXXXX
   * @param {string} message - SMS message content
   * @param {string} reference - Optional reference for tracking
   * @returns {Promise} SMS send response
   */
  async sendSMS(phone, message, reference = null) {
    try {
      // Check if credentials are configured
      if (!this.authToken) {
        console.log(
          "⚠️  NEXTSMS not configured. SMS would have been sent to:",
          phone,
        );
        console.log("📱 Message:", message);
        return {
          success: false,
          error: "NEXTSMS credentials not configured",
          fallbackMode: true,
        };
      }

      // Ensure phone number is in correct format (255XXXXXXXXX)
      const formattedPhone = this.formatPhoneNumber(phone);

      if (!formattedPhone || formattedPhone.length < 12) {
        console.error("❌ Invalid phone number format:", phone);
        return {
          success: false,
          error: `Invalid phone number format: ${phone}`,
        };
      }

      // ✅ FIX: TRY PRIMARY SENDER ID FIRST
      console.log(`🔄 Attempting SMS with primary sender: ${this.senderId}`);
      const primaryResult = await this._sendWithSenderId(
        this.senderId,
        formattedPhone,
        message,
        reference,
      );

      // ✅ FIX: If primary sender failed, try fallback sender ID
      if (!primaryResult.success && this.fallbackSenderId) {
        console.warn(
          `⚠️  Primary sender "${this.senderId}" failed: ${primaryResult.error}`,
        );
        console.log(
          `🔄 Retrying with fallback sender: ${this.fallbackSenderId}`,
        );

        const fallbackResult = await this._sendWithSenderId(
          this.fallbackSenderId,
          formattedPhone,
          message,
          reference,
        );

        if (fallbackResult.success) {
          console.log(
            `✅ SMS sent successfully using fallback sender: ${this.fallbackSenderId}`,
          );
          return {
            ...fallbackResult,
            usedFallback: true,
            primaryError: primaryResult.error,
          };
        } else {
          console.error("❌ Both primary and fallback senders failed");
          return {
            success: false,
            error: "Both primary and fallback senders failed",
            primaryError: primaryResult.error,
            fallbackError: fallbackResult.error,
          };
        }
      }

      // Primary sender succeeded
      if (primaryResult.success) {
        console.log(
          `✅ SMS sent successfully using primary sender: ${this.senderId}`,
        );
      }

      return primaryResult;
    } catch (error) {
      console.error("❌ SMS sending failed with exception:", error.message);
      return {
        success: false,
        error: error.message,
        exception: true,
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
      if (!this.authToken) {
        console.log(
          "⚠️  NEXTSMS not configured. Bulk SMS would have been sent to",
          phones.length,
          "recipients",
        );
        return {
          success: false,
          error: "NEXTSMS credentials not configured",
        };
      }

      const formattedPhones = phones
        .map((phone) => this.formatPhoneNumber(phone))
        .filter((p) => p && p.length >= 12);

      if (formattedPhones.length === 0) {
        return {
          success: false,
          error: "No valid phone numbers provided",
        };
      }

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
          timeout: 15000, // 15 second timeout for bulk
        },
      );

      console.log(`✅ Bulk SMS sent to ${formattedPhones.length} recipients`);
      console.log("Response:", response.data);

      return {
        success: true,
        data: response.data,
        sentCount: formattedPhones.length,
      };
    } catch (error) {
      console.error(
        "❌ Bulk SMS sending failed:",
        error.response?.data || error.message,
      );
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
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
    const message = `Karibu ECONNECT ${userName}!\n\nNeno lako la siri: ${password}\n\nBadilisha baada ya kuingia mara ya kwanza.\n\nIngia: econnect.co.tz\n\nUna maswali? Piga: 0758061582`;

    const reference = userId ? `pwd_${userId}` : `pwd_${Date.now()}`;

    return await this.sendSMS(phone, message, reference);
  }

  /**
   * Send payment confirmation SMS
   * @param {string} phone - User's phone number
   * @param {string} userName - User's name
   * @param {number} amount - Payment amount
   * @param {string} packageType - Package type
   * @returns {Promise} SMS send response
   */
  async sendPaymentConfirmationSMS(phone, userName, amount, packageType) {
    const message = `Habari ${userName},\n\nMalipo yako ya ${packageType} TZS ${amount.toLocaleString()} yamepokelewa. Unahitaji kuthibitishwa.\n\nUna maswali? Piga: 0758061582\n\nAsante,\nECONNECT`;

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
    const message = `Hongera ${userName}!\n\nMalipo yako ya ${packageType} yamethibitishwa. Una ufikiaji kamili sasa.\n\nIngia: econnect.co.tz\n\nUna maswali? Piga: 0758061582\n\nECONNECT`;

    return await this.sendSMS(phone, message, `approval_${packageType}`);
  }

  // ============================================
  // 🆕 NEW WELCOME SMS METHODS (Called by server.js)
  // ============================================

  /**
   * Send student welcome SMS after registration
   * @param {string} phone - Student's phone number
   * @param {string} userName - Student's name
   * @param {string} userId - User ID for reference
   * @returns {Promise} SMS send response
   */
  async sendStudentWelcomeSMS(phone, userName, userId) {
    const message = `Hongera ${userName}!\nUmefanikiwa kujisajili EConnect kama Mwanafunzi.\nUtapokea neno la siri baada ya kuidhinishwa.\n\nKwa maswali zaidi piga simu 0758061582`;

    return await this.sendSMS(phone, message, `student_welcome_${userId}`);
  }

  /**
   * Send teacher welcome SMS after registration
   * @param {string} phone - Teacher's phone number
   * @param {string} userName - Teacher's name
   * @param {string} userId - User ID for reference
   * @returns {Promise} SMS send response
   */
  async sendTeacherWelcomeSMS(phone, userName, userId) {
    const message = `Karibu ECONNECT, ${userName}!\nUmefanikiwa kujisajili kama Mwalimu.\nUtapokea neno la siri baada ya kuidhinishwa.\n\nKwa maswali Piga simu 0758061582\n\nAsante!`;

    return await this.sendSMS(phone, message, `teacher_welcome_${userId}`);
  }

  /**
   * ✅ Send entrepreneur welcome SMS after registration (WITH PRICING INFO)
   * @param {string} phone - Entrepreneur's phone number
   * @param {string} userName - Entrepreneur's name
   * @param {string} userId - User ID for reference
   * @param {string} packageType - Package type (silver, gold, platinum)
   * @returns {Promise} SMS send response
   */
  async sendEntrepreneurWelcomeSMS(
    phone,
    userName,
    userId,
    packageType = "silver",
  ) {
    // ✅ GET PRICING FROM UTILITY
    const pkg = getEntrepreneurPackage(packageType);
    const registrationFee = pkg.registrationFee;
    const monthlyFee = pkg.monthlyFee;

    const message = `Karibu ECONNECT, ${userName}!\nUmefanikiwa kujisajili kama Mjasiriamali.\nAkaunti yako inasubiri idhini.\n\nUna maswali? Piga: 0758061582\n\nAsante!`;

    return await this.sendSMS(phone, message, `entrepreneur_welcome_${userId}`);
  }

  /**
   * Send non-student welcome SMS after registration
   * @param {string} phone - User's phone number
   * @param {string} userName - User's name
   * @param {string} userId - User ID for reference
   * @returns {Promise} SMS send response
   */
  async sendNonStudentWelcomeSMS(phone, userName, userId) {
    const message = `Karibu ECONNECT, ${userName}!\n\nUmefanikiwa kujisajili. Akaunti yako inasubiri idhini.\n\nUtapokea neno la siri baada ya kuidhinishwa.\n\nUna maswali? Piga simu: 0758061582\n\nAsante!`;

    return await this.sendSMS(phone, message, `nonstudent_welcome_${userId}`);
  }

  // ============================================
  // ORIGINAL REGISTRATION SMS METHODS (KEPT FOR BACKWARD COMPATIBILITY)
  // ============================================

  /**
   * ✅ Send entrepreneur registration congratulations SMS (WITH PRICING)
   * @param {string} phone - User's phone number
   * @param {string} userName - User's name (e.g., "James Juma")
   * @param {string} packageType - Package type (silver, gold, platinum)
   * @returns {Promise} SMS send response
   */
  async sendEntrepreneurRegistrationSMS(
    phone,
    userName,
    packageType = "silver",
  ) {
    // ✅ GET PRICING FROM UTILITY
    const pkg = getEntrepreneurPackage(packageType);
    const registrationFee = pkg.registrationFee;
    const monthlyFee = pkg.monthlyFee;

    const message = `Hongera ${userName}!\n\nUmefanikiwa kujisajili EConnect kama Mjasiriamali - ${pkg.name}.\n\nMalipo:\n• Usajili: TZS ${registrationFee.toLocaleString()}\n• Kila mwezi: TZS ${monthlyFee.toLocaleString()}\n\nUtapokea neno la siri baada ya kuidhinishwa.\n\nUna maswali? Piga: 0758061582\n\nAsante!\nECONNECT`;

    return await this.sendSMS(phone, message, "entrepreneur_registration");
  }

  /**
   * ✅ Send student registration congratulations SMS (WITH PRICING FROM UTILITY)
   * @param {string} phone - User's phone number
   * @param {string} userName - User's name
   * @param {string} packageType - Package type (e.g., 'ctm-club', 'silver', 'gold', 'platinum')
   * @param {string} institutionType - Institution type (government/private)
   * @returns {Promise} SMS send response
   */
  async sendStudentRegistrationSMS(
    phone,
    userName,
    packageType = "ctm-club",
    institutionType = "government",
  ) {
    let message;

    // ✅ GET ACTUAL PRICING FROM UTILITY
    const fee = getStudentRegistrationFee(packageType, institutionType);
    const packageInfo =
      STUDENT_PACKAGES[packageType] || STUDENT_PACKAGES["ctm-club"];

    // Special message for CTM package
    if (packageType === "ctm-club") {
      message = `Hongera ${userName}!\n\nUsajili wako umefanikiwa EConnect - ${packageInfo.name}.\n\nMalipo ya usajili: TZS ${fee.toLocaleString()}\n\nFanya malipo ili kuwa mshiriki hai.\n\nUna maswali? Piga: 0758061582\n\nAsante!\nECONNECT`;
    }
    // Paid packages (Silver, Gold, Platinum) - with payment instructions
    else if (["silver", "gold", "platinum"].includes(packageType)) {
      message = `Hongera ${userName}!\n\nUsajili wako umefanikiwa EConnect - ${packageInfo.name}.\n\nMalipo ya usajili: TZS ${fee.toLocaleString()}\n\nHATUA IFUATAYO:\n1. Fanya malipo\n2. Tuma risiti kwa +255758061582\n3. Tutathibitisha malipo\n4. Utapokea neno la siri\n\nAsante!\nECONNECT`;
    }
    // Default
    else {
      message = `Hongera ${userName}!\n\nUmefanikiwa kujisajili EConnect kama Mwanafunzi.\n\nUtapokea neno la siri baada ya kuidhinishwa.\n\nUna maswali? Piga: 0758061582\n\nAsante!\nECONNECT`;
    }

    return await this.sendSMS(phone, message, "student_registration");
  }

  /**
   * Send teacher registration congratulations SMS
   * @param {string} phone - User's phone number
   * @param {string} userName - User's name
   * @returns {Promise} SMS send response
   */
  async sendTeacherRegistrationSMS(phone, userName) {
    const message = `Hongera ${userName}!\n\nUsajili wako umefanikiwa ECONNECT kama Mwalimu.\n\nAkaunti yako inasubiri idhini kutoka kwa Mkuu wa Shule. Utapokea neno la siri baada ya kuidhinishwa.\n\nUna maswali? Piga simu: 0758061582\n\nAsante!\nECONNECT`;

    return await this.sendSMS(phone, message, "teacher_registration");
  }

  /**
   * Get SMS delivery report
   * @param {string} messageId - Message ID from send response
   * @returns {Promise} Delivery report
   */
  async getDeliveryReport(messageId) {
    try {
      if (!this.authToken) {
        return {
          success: false,
          error: "NEXTSMS credentials not configured",
        };
      }

      console.log(`📊 Fetching delivery report for message: ${messageId}`);

      const response = await axios.get(
        `${this.baseUrl}/api/sms/v1/reports?messageId=${messageId}`,
        {
          headers: {
            Authorization: `Basic ${this.authToken}`,
            Accept: "application/json",
          },
          timeout: 10000,
        },
      );

      console.log("✅ Delivery report retrieved:", response.data);

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error(
        "❌ Failed to get delivery report:",
        error.response?.data || error.message,
      );
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * ✅ NEW: Check SMS account balance
   * @returns {Promise} Account balance information
   */
  async getAccountBalance() {
    try {
      if (!this.authToken) {
        return {
          success: false,
          error: "NEXTSMS credentials not configured",
        };
      }

      console.log("💰 Fetching NEXTSMS account balance...");

      const response = await axios.get(`${this.baseUrl}/api/me`, {
        headers: {
          Authorization: `Basic ${this.authToken}`,
          Accept: "application/json",
        },
        timeout: 10000,
      });

      console.log("✅ Account balance retrieved:", response.data);

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error(
        "❌ Failed to get account balance:",
        error.response?.data || error.message,
      );
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }
}

// Export singleton instance
module.exports = new SMSService();
