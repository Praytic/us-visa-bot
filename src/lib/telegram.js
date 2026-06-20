import fetch from 'node-fetch';
import { log } from './utils.js';

/**
 * Telegram Notification Service
 * Based on camply's notification system
 */
export class TelegramNotifier {
  constructor(botToken, chatId) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.apiEndpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
    this.enabled = Boolean(botToken && chatId);

    if (!this.enabled) {
      log('Telegram notifications are disabled (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    } else {
      log('Telegram notifications enabled');
    }
  }

  /**
   * Escape text for Telegram MarkdownV2 format
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeMarkdown(text) {
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escaped = String(text);

    for (const char of specialChars) {
      escaped = escaped.split(char).join(`\\${char}`);
    }

    return escaped;
  }

  /**
   * Send a message via Telegram
   * @param {string} message - Message text to send
   * @param {boolean} escaped - Whether the message is already escaped
   * @returns {Promise<Object>} Response from Telegram API
   */
  async sendMessage(message, escaped = false) {
    if (!this.enabled) {
      log('[TELEGRAM] Notifications disabled, skipping message');
      return null;
    }

    const text = escaped ? message : this.escapeMarkdown(message);

    const payload = {
      chat_id: this.chatId,
      text: text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    };

    log('[TELEGRAM] Sending notification');
    log(`[TELEGRAM MESSAGE] ${message}`);

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        log(`[TELEGRAM ERROR] Failed to send notification: ${response.status} ${response.statusText}`);
        log(`[TELEGRAM ERROR DETAILS] ${errorText}`);
        throw new Error(`Telegram API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      log('[TELEGRAM] Notification sent successfully');
      return result;
    } catch (error) {
      log(`[TELEGRAM ERROR] ${error.message}`);
      throw error;
    }
  }

  /**
   * Send startup notification when bot launches
   * @param {Object} config - Bot configuration
   * @returns {Promise<Object>} Response from Telegram API
   */
  async sendStartupMessage(config) {
    if (!this.enabled) {
      return null;
    }

    const title = `🤖 US Visa Bot Started for ${config.email}`;
    const timestamp = new Date().toISOString();
    const fields = [
      `Country: ${config.countryCode.toUpperCase()}`,
      `Facility ID: ${config.facilityId}`,
      `Schedule ID: ${config.scheduleId}`,
      `Refresh Delay: ${config.refreshDelay}s`,
      `Started at: ${timestamp}`
    ];

    const message = `*${this.escapeMarkdown(title)}*\n\n${fields.map(f => this.escapeMarkdown(f)).join('\n')}\n\n${this.escapeMarkdown('Bot is now monitoring for available appointments...')}`;

    return this.sendMessage(message, true);
  }

  /**
   * Send notification about available appointment dates
   * @param {Array<string>} dates - Array of available dates
   * @param {string} facilityId - Facility ID
   * @param {string} currentDate - Current booked date
   * @param {string} scheduleId - Schedule ID for payment link
   * @param {string} countryCode - Country code for payment link
   * @returns {Promise<Object>} Response from Telegram API
   */
  async sendAvailableDates(dates, facilityId, currentDate, scheduleId, countryCode) {
    if (!this.enabled) {
      return null;
    }

    const title = '🎯 US Visa Appointment Available';
    const datesList = dates.map(date => `• ${date}`).join('\n');
    const paymentUrl = `https://ais.usvisa-info.com/en-${countryCode}/niv/schedule/${scheduleId}/payment`;

    const fields = [
      `Facility ID: ${facilityId}`,
      `Current Date: ${currentDate}`,
      `Available Dates:\n${datesList}`,
      `Found: ${dates.length} date(s)`,
      `\nReschedule: ${paymentUrl}`
    ];

    const message = `*${this.escapeMarkdown(title)}*\n\n${fields.map(f => this.escapeMarkdown(f)).join('\n')}`;

    return this.sendMessage(message, true);
  }

  /**
   * Send notification about successful booking
   * @param {string} date - Booked date
   * @param {string} time - Booked time
   * @param {string} facilityId - Facility ID
   * @returns {Promise<Object>} Response from Telegram API
   */
  async sendBookingConfirmation(date, time, facilityId) {
    if (!this.enabled) {
      return null;
    }

    const title = '✅ Appointment Booked Successfully';
    const fields = [
      `Date: ${date}`,
      `Time: ${time}`,
      `Facility ID: ${facilityId}`
    ];

    const message = `*${this.escapeMarkdown(title)}*\n\n${fields.map(f => this.escapeMarkdown(f)).join('\n')}`;

    return this.sendMessage(message, true);
  }

  /**
   * Send error notification
   * @param {string} error - Error message
   * @returns {Promise<Object>} Response from Telegram API
   */
  async sendError(error) {
    if (!this.enabled) {
      return null;
    }

    const title = '❌ Bot Error';
    const message = `*${this.escapeMarkdown(title)}*\n\n${this.escapeMarkdown(error)}`;

    return this.sendMessage(message, true);
  }
}
