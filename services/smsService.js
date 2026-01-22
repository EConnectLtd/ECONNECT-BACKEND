// /services/smsService.js
const axios = require("axios");

class SMSService {
  constructor() {
    this.apiKey = process.env.NEXTSMS_API_KEY;
    this.baseURL = "https://messaging-service.co.tz/api/sms/v1/text/single";
    this.senderID = process.env.NEXTSMS_SENDER_ID || "ECONNECT";
  }

  /**
   * Core SMS sending function
   */
  async sendSMS(phoneNumber, message, type = "general") {
    try {
      if (!this.apiKey) {
        console.error("❌ NEXTSMS API Key not configured");
        return {
          success: false,
          error: "SMS service not configured",
        };
      }

      // Validate phone number
      if (!phoneNumber) {
        return { success: false, error: "Phone number is required" };
      }

      // Clean phone number (remove spaces, dashes)
      const cleanPhone = phoneNumber.replace(/[\s\-]/g, "");

      console.log(`📱 Sending ${type} SMS to ${cleanPhone}...`);

      const payload = {
        from: this.senderID,
        to: cleanPhone,
        text: message,
      };

      const response = await axios.post(this.baseURL, payload, {
        headers: {
          Authorization: `Basic ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 10000, // 10 seconds
      });

      if (response.data && response.status === 200) {
        console.log(`✅ SMS sent successfully to ${cleanPhone}`);
        return {
          success: true,
          messageId: response.data.messageId || response.data.data?.messageId,
          data: response.data,
        };
      } else {
        console.error("❌ SMS API returned error:", response.data);
        return {
          success: false,
          error: response.data.message || "SMS sending failed",
        };
      }
    } catch (error) {
      console.error("❌ SMS sending error:", error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Send password SMS (for account approval)
   */
  async sendPasswordSMS(phoneNumber, password, userName, userId) {
    const message = `Habari ${userName}! Akaunti yako ya ECONNECT imeidhinishwa! 🎉\n\nNenosiri lako: ${password}\n\nIngia kwenye mfumo kwa simu: ${phoneNumber}\n\nMaswali? Piga: 0758061582\n\nAsante!`;

    return this.sendSMS(phoneNumber, message, "password");
  }

  /**
   * ✅ NEW: Send welcome SMS to STUDENTS
   */
  async sendStudentWelcomeSMS(phoneNumber, firstName, userId) {
    const message = `Karibu ${firstName}! 🎓\n\nUmesajiliwa katika ECONNECT - Mfumo wa Talanta na Shule!\n\nID yako: ${userId}\n\nSimu yako: ${phoneNumber}\n\nMaswali? Piga: 0758061582\n\nKaribu sana!`;

    return this.sendSMS(phoneNumber, message, "student_welcome");
  }

  /**
   * ✅ NEW: Send welcome SMS to TEACHERS
   */
  async sendTeacherWelcomeSMS(phoneNumber, firstName, userId) {
    const message = `Karibu Mwalimu ${firstName}! 👨‍🏫\n\nUmesajiliwa katika ECONNECT - Mfumo wa Talanta na Shule!\n\nID yako: ${userId}\n\nSimu yako: ${phoneNumber}\n\nMaswali? Piga: 0758061582\n\nAsante kwa kujiunga nasi!`;

    return this.sendSMS(phoneNumber, message, "teacher_welcome");
  }

  /**
   * ✅ NEW: Send welcome SMS to ENTREPRENEURS
   */
  async sendEntrepreneurWelcomeSMS(phoneNumber, firstName, userId) {
    const message = `Karibu ${firstName}! 💼\n\nUmesajiliwa katika ECONNECT - Jukwaa la Biashara na Talanta!\n\nID yako: ${userId}\n\nSimu yako: ${phoneNumber}\n\nFungua biashara yako leo!\n\nMaswali? Piga: 0758061582\n\nKaribu sana!`;

    return this.sendSMS(phoneNumber, message, "entrepreneur_welcome");
  }

  /**
   * ✅ NEW: Send welcome SMS to NON-STUDENTS
   */
  async sendNonStudentWelcomeSMS(phoneNumber, firstName, userId) {
    const message = `Karibu ${firstName}! 🌟\n\nUmesajiliwa katika ECONNECT - Jukwaa la Talanta!\n\nID yako: ${userId}\n\nSimu yako: ${phoneNumber}\n\nOnyesha talanta yako!\n\nMaswali? Piga: 0758061582\n\nKaribu sana!`;

    return this.sendSMS(phoneNumber, message, "nonstudent_welcome");
  }

  /**
   * Send payment reminder SMS
   */
  async sendPaymentReminderSMS(phoneNumber, userName, amount, dueDate) {
    const message = `Habari ${userName}! Ukumbusho wa malipo:\n\nKiasi: TZS ${amount.toLocaleString()}\nTarehe: ${new Date(
      dueDate
    ).toLocaleDateString()}\n\nLipa kwa:\n- Vodacom Lipa: 5130676\n- CRDB: 0150814579600\n\nAsante!`;

    return this.sendSMS(phoneNumber, message, "payment_reminder");
  }

  /**
   * Send bulk SMS (for notifications, announcements, etc.)
   */
  async sendBulkSMS(phoneNumbers, message, type = "bulk") {
    const results = [];

    for (const phone of phoneNumbers) {
      const result = await this.sendSMS(phone, message, type);
      results.push({
        phone,
        success: result.success,
        error: result.error || null,
      });
    }

    return results;
  }
}

// Export singleton instance
module.exports = new SMSService();