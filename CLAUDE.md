# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an automated bot that monitors US visa appointment slots on https://ais.usvisa-info.com/ and automatically reschedules appointments when earlier dates become available. The bot continuously polls for available dates within specified constraints and books them automatically.

## Development Commands

```bash
# Run the bot
npm start -- -c <current_date> [-t <target_date>] [-m <min_date>]
node src/index.js -c <current_date> [-t <target_date>] [-m <min_date>]

# Example: Run with all options
node src/index.js -c 2023-06-15 -t 2023-06-01 -m 2023-05-01

# Dry-run mode (logs only, no booking)
node src/index.js -c 2023-06-15 --dry-run

# Development mode (alias for start)
npm run dev

# Testing (not configured)
npm test

# Linting (not configured)
npm lint
```

## Architecture

The codebase follows a layered architecture with clear separation of concerns:

### Entry Point & CLI (`src/index.js`, `src/commands/bot.js`)
- Uses `commander` for CLI argument parsing
- Supports both legacy root-level commands and new `bot` subcommand for backward compatibility
- Command options: `-c/--current` (required), `-t/--target`, `-m/--min`, `--dry-run`
- Main control loop in `botCommand()` handles continuous monitoring and error recovery with exponential backoff (1 hour cooldown for socket errors, immediate retry for auth errors)

### Core Bot Logic (`src/lib/bot.js`)
- **Bot class** orchestrates the appointment checking and booking workflow
- `checkAvailableDate()`: Fetches available dates, filters by constraints (earlier than current, after minimum), returns earliest good date
- `bookAppointment()`: Gets available time slot and books the appointment (respects dry-run mode)
- Date filtering logic: rejects dates >= current date or < minimum date

### HTTP Client (`src/lib/client.js`)
- **VisaHttpClient class** handles all API interactions with the visa appointment system
- Manages authentication flow: extracts CSRF tokens and session cookies from form pages
- Cookie handling: extracts and maintains `_yatri_session` cookie across requests
- Public methods:
  - `login()`: Performs form-based authentication and returns session headers
  - `checkAvailableDate()`: Fetches available dates for a facility
  - `checkAvailableTime()`: Gets available time slots for a specific date
  - `book()`: Submits appointment booking form with CSRF protection
- Uses cheerio for HTML parsing to extract CSRF tokens from meta tags
- Automatically constructs country-specific URLs from base URI

### Configuration (`src/lib/config.js`)
- Loads and validates environment variables from `.env`
- Required: `EMAIL`, `PASSWORD`, `SCHEDULE_ID`, `FACILITY_ID`, `COUNTRY_CODE`
- Optional: `REFRESH_DELAY` (defaults to 3 seconds)
- `getBaseUri()`: Constructs country-specific base URLs (e.g., `https://ais.usvisa-info.com/en-br/niv`)

### Utilities (`src/lib/utils.js`)
- `log()`: Timestamped logging
- `sleep()`: Promise-based delay
- `isSocketHangupError()`: Error type detection for retry logic

## Key Implementation Details

### Date Comparison Strategy
All dates are compared as strings in YYYY-MM-DD format, which works due to lexicographic ordering. The bot finds the earliest date that is:
1. Earlier than current booked date
2. On or after minimum date (if specified)
3. On or before target date (optional, causes exit when reached)

### Session Management
The bot maintains session state through headers object passed between methods. Session is established once at initialization via `login()` and reused across all subsequent API calls. Authentication errors trigger a recursive retry that re-initializes the session.

### Error Handling Strategy
- Socket hangup errors: 1-hour cooldown before retry (likely rate limiting)
- Authentication/session errors: Immediate recursive retry with re-login
- All errors in main loop are caught and trigger appropriate retry strategy

### Dry-Run Mode
When `--dry-run` flag is used, the bot logs what it would book but skips the actual booking API call. Useful for testing date filtering logic and monitoring behavior without making real appointments.

## Environment Variables

Create a `.env` file with:
```env
EMAIL=your.email@example.com
PASSWORD=your_password
COUNTRY_CODE=br  # e.g., br, fr, de
SCHEDULE_ID=12345  # From URL when rescheduling
FACILITY_ID=44  # Facility/consulate ID
REFRESH_DELAY=3  # Seconds between checks (optional)
```

## Project Structure

```
src/
├── index.js              # CLI entry point with commander setup
├── commands/
│   └── bot.js           # Main bot command implementation with control loop
└── lib/
    ├── bot.js           # Bot class with business logic
    ├── client.js        # VisaHttpClient class for API interactions
    ├── config.js        # Environment configuration management
    └── utils.js         # Shared utilities
```
