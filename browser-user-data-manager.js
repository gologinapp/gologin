const request = require('requestretry');

class BrowserUserDataManager {
  static downloadCookies({ profileId, ACCESS_TOKEN, API_BASE_URL }) {
    return request.get(`${API_BASE_URL}/browser/${profileId}/cookies?encrypted=true`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'user-agent': 'gologin-api',
      },
      json: true,
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 10 * 1000,
    }).catch((e) => {
      console.log(e);
      return { body: [] };
    });
  }

  static uploadCookies({ cookies = [], profileId, ACCESS_TOKEN, API_BASE_URL }) {
    return request.post(`${API_BASE_URL}/browser/${profileId}/cookies?encrypted=true`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'User-Agent': 'gologin-api',
      },
      json: cookies,
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 20 * 1000,
    }).catch((e) => {
      console.log(e);
      return e;
    });
  }
}

module.exports = {
  BrowserUserDataManager,
}
