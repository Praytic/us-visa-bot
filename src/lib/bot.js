import { VisaHttpClient } from './client.js';
import { TelegramNotifier } from './telegram.js';
import { log } from './utils.js';

export class Bot {
  constructor(config, options = {}) {
    this.config = config;
    this.dryRun = options.dryRun || false;
    this.client = new VisaHttpClient(this.config.countryCode, this.config.email, this.config.password);
    this.notifier = new TelegramNotifier(this.config.telegram.botToken, this.config.telegram.chatId);
  }

  async initialize() {
    log('Initializing visa bot...');
    return await this.client.login();
  }

  async sendStartupNotification() {
    try {
      await this.notifier.sendStartupMessage(this.config);
    } catch (error) {
      log(`Failed to send startup notification: ${error.message}`);
      // Don't fail if notification fails
    }
  }

  async checkAvailableDate(sessionHeaders, currentBookedDate, minDate) {
    const dates = await this.client.checkAvailableDate(
      sessionHeaders,
      this.config.scheduleId,
      this.config.facilityId
    );

    if (!dates || dates.length === 0) {
      log("no dates available");
      return null;
    }

    // Send notification about available dates (successful API response)
    try {
      await this.notifier.sendAvailableDates(
        dates,
        this.config.facilityId,
        currentBookedDate,
        this.config.scheduleId,
        this.config.countryCode
      );
    } catch (error) {
      log(`Failed to send Telegram notification: ${error.message}`);
      // Don't fail the whole process if notification fails
    }

    // Filter dates that are better than current booked date and after minimum date
    const goodDates = dates.filter(date => {
      if (date >= currentBookedDate) {
        log(`date ${date} is further than already booked (${currentBookedDate})`);
        return false;
      }

      if (minDate && date < minDate) {
        log(`date ${date} is before minimum date (${minDate})`);
        return false;
      }

      return true;
    });

    if (goodDates.length === 0) {
      log("no good dates found after filtering");
      return null;
    }

    // Sort dates and return the earliest one
    goodDates.sort();
    const earliestDate = goodDates[0];

    log(`found ${goodDates.length} good dates: ${goodDates.join(', ')}, using earliest: ${earliestDate}`);
    return earliestDate;
  }

  async bookAppointment(sessionHeaders, date) {
    const time = await this.client.checkAvailableTime(
      sessionHeaders,
      this.config.scheduleId,
      this.config.facilityId,
      date
    );

    if (!time) {
      log(`no available time slots for date ${date}`);
      return false;
    }

    if (this.dryRun) {
      log(`[DRY RUN] Would book appointment at ${date} ${time} (not actually booking)`);
      return true;
    }

    await this.client.book(
      sessionHeaders,
      this.config.scheduleId,
      this.config.facilityId,
      date,
      time
    );

    log(`booked time at ${date} ${time}`);

    // Send booking confirmation notification
    try {
      await this.notifier.sendBookingConfirmation(date, time, this.config.facilityId);
    } catch (error) {
      log(`Failed to send Telegram notification: ${error.message}`);
      // Don't fail the whole process if notification fails
    }

    return true;
  }

}
