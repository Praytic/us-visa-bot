import { Bot } from '../lib/bot.js';
import { getConfig } from '../lib/config.js';
import { log, sleep, isSocketHangupError } from '../lib/utils.js';

const COOLDOWN = 3600; // 1 hour in seconds
const MAX_CONSECUTIVE_AUTH_ERRORS = 5;

export async function botCommand(options, consecutiveAuthErrors = 0, isFirstRun = true) {
  const config = getConfig();
  const bot = new Bot(config, { dryRun: options.dryRun });
  let currentBookedDate = options.current;
  const targetDate = options.target;
  const minDate = options.min;

  log(`Initializing with current date ${currentBookedDate}`);

  if (options.dryRun) {
    log(`[DRY RUN MODE] Bot will only log what would be booked without actually booking`);
  }

  if (targetDate) {
    log(`Target date: ${targetDate}`);
  }

  if (minDate) {
    log(`Minimum date: ${minDate}`);
  }

  // Send startup notification only on first run
  if (isFirstRun) {
    await bot.sendStartupNotification();
  }

  try {
    const sessionHeaders = await bot.initialize();

    while (true) {
      const availableDate = await bot.checkAvailableDate(
        sessionHeaders,
        currentBookedDate,
        minDate
      );

      if (availableDate) {
        const booked = await bot.bookAppointment(sessionHeaders, availableDate);

        if (booked) {
          // Update current date to the new available date
          currentBookedDate = availableDate;

          options = {
            ...options,
            current: currentBookedDate
          };

          if (targetDate && availableDate <= targetDate) {
            log(`Target date reached! Successfully booked appointment on ${availableDate}`);
            process.exit(0);
          }
        }
      }

      await sleep(config.refreshDelay);
    }
  } catch (err) {
    if (isSocketHangupError(err)) {
      log(`Socket hangup error: ${err.message}. Trying again after ${COOLDOWN} seconds...`);
      await sleep(COOLDOWN);
      return botCommand(options, 0, false); // Reset auth error counter on socket errors, not first run
    } else {
      // Check if we've hit max consecutive auth errors
      if (consecutiveAuthErrors >= MAX_CONSECUTIVE_AUTH_ERRORS) {
        log(`ERROR: Hit maximum consecutive authentication errors (${MAX_CONSECUTIVE_AUTH_ERRORS}). Stopping.`);
        log(`Please check your credentials, SCHEDULE_ID, FACILITY_ID, and network connection.`);
        log(`Error details: ${err.message}`);
        process.exit(1);
      }

      log(`Session/authentication error: ${err.message}. Retrying immediately... (attempt ${consecutiveAuthErrors + 1}/${MAX_CONSECUTIVE_AUTH_ERRORS})`);
      await sleep(2); // Small delay to avoid hammering the server
      return botCommand(options, consecutiveAuthErrors + 1, false); // Not first run
    }
  }
}
