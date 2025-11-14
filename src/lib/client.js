import fetch from "node-fetch";
import cheerio from 'cheerio';
import { log } from './utils.js';
import { getBaseUri } from './config.js';

// Common headers
const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-store'
};

export class VisaHttpClient {
  constructor(countryCode, email, password) {
    this.baseUri = getBaseUri(countryCode);
    this.email = email;
    this.password = password;
  }

  // Public API methods
  async login() {
    log('Logging in');

    const anonymousHeaders = await this._anonymousRequest(`${this.baseUri}/users/sign_in`)
      .then(response => this._extractHeaders(response));

    const loginData = {
      'utf8': '✓',
      'user[email]': this.email,
      'user[password]': this.password,
      'policy_confirmed': '1',
      'commit': 'Sign In'
    };

    return this._submitForm(`${this.baseUri}/users/sign_in`, anonymousHeaders, loginData)
      .then(res => ({
        ...anonymousHeaders,
        'Cookie': this._extractRelevantCookies(res)
      }));
  }

  async checkAvailableDate(headers, scheduleId, facilityId) {
    const url = `${this.baseUri}/schedule/${scheduleId}/appointment/days/${facilityId}.json?appointments[expedite]=false`;
    
    return this._jsonRequest(url, headers)
      .then(data => data.map(item => item.date));
  }

  async checkAvailableTime(headers, scheduleId, facilityId, date) {
    const url = `${this.baseUri}/schedule/${scheduleId}/appointment/times/${facilityId}.json?date=${date}&appointments[expedite]=false`;
    
    return this._jsonRequest(url, headers)
      .then(data => data['business_times'][0] || data['available_times'][0]);
  }

  async book(headers, scheduleId, facilityId, date, time) {
    const url = `${this.baseUri}/schedule/${scheduleId}/appointment`;

    const bookingHeaders = await this._anonymousRequest(url, headers)
      .then(response => this._extractHeaders(response));

    const bookingData = {
      'utf8': '✓',
      'authenticity_token': bookingHeaders['X-CSRF-Token'],
      'confirmed_limit_message': '1',
      'use_consulate_appointment_capacity': 'true',
      'appointments[consulate_appointment][facility_id]': facilityId,
      'appointments[consulate_appointment][date]': date,
      'appointments[consulate_appointment][time]': time,
      'appointments[asc_appointment][facility_id]': '',
      'appointments[asc_appointment][date]': '',
      'appointments[asc_appointment][time]': ''
    };

    return this._submitFormWithRedirect(url, bookingHeaders, bookingData);
  }

  // Private request methods
  async _anonymousRequest(url, headers = {}) {
    const requestHeaders = {
      "User-Agent": "",
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      ...headers
    };

    log(`[HTTP GET] ${url}`);

    const response = await fetch(url, {
      headers: requestHeaders
    });

    return response;
  }

  async _jsonRequest(url, headers = {}) {
    const requestHeaders = {
      ...headers,
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    };

    log(`[HTTP GET JSON] ${url}`);

    const response = await fetch(url, {
      headers: requestHeaders,
      cache: "no-store"
    });

    // Check if response is OK
    if (!response.ok) {
      const text = await response.text();
      log(`API request failed with status ${response.status}: ${text.substring(0, 200)}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type before parsing JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      log(`Expected JSON but got content-type: ${contentType}`);
      log(`Response preview: ${text.substring(0, 200)}`);
      throw new Error(`Expected JSON response but got ${contentType || 'unknown content type'}`);
    }

    const data = await response.json();
    return this._handleErrors(data);
  }

  async _submitForm(url, headers = {}, formData = {}) {
    const requestHeaders = {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    };
    const body = new URLSearchParams(formData);

    log(`[HTTP POST] ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: body
    });

    return response;
  }

  async _submitFormWithRedirect(url, headers = {}, formData = {}) {
    const requestHeaders = {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    const body = new URLSearchParams(formData);

    log(`[HTTP POST WITH REDIRECT] ${url}`);

    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: requestHeaders,
      body: body
    });

    return response;
  }

  // Private utility methods
  async _extractHeaders(res) {
    const cookies = this._extractRelevantCookies(res);
    const html = await res.text();
    const $ = cheerio.load(html);
    const csrfToken = $('meta[name="csrf-token"]').attr('content');

    return {
      ...COMMON_HEADERS,
      "Cookie": cookies,
      "X-CSRF-Token": csrfToken,
      "Referer": this.baseUri,
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };
  }

  _extractRelevantCookies(res) {
    const parsedCookies = this._parseCookies(res.headers.get('set-cookie'));
    return `_yatri_session=${parsedCookies['_yatri_session']}`;
  }

  _parseCookies(cookies) {
    const parsedCookies = {};

    cookies.split(';').map(c => c.trim()).forEach(c => {
      const [name, value] = c.split('=', 2);
      parsedCookies[name] = value;
    });

    return parsedCookies;
  }

  _handleErrors(response) {
    const errorMessage = response['error'];

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return response;
  }
}
