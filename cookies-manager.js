const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const MAX_SQLITE_VARIABLES = 76;

const SAME_SITE = {
  '-1': 'unspecified',
  0: 'no_restriction',
  1: 'lax',
  2: 'strict',
};

class CookiesManager {
  static getDB(filePath, readOnly = true) {
    const connectionOpts = {
      filename: filePath,
      driver: sqlite3.Database,
    };

    if (readOnly) {
      connectionOpts.mode = sqlite3.OPEN_READONLY;
    }

    return open(connectionOpts);
  }

  static getChunckedInsertValues(cookiesArr) {
    const todayUnix = Math.floor(new Date().getTime() / 1000.0);
    const chunckedCookiesArr = this.chunk(cookiesArr, MAX_SQLITE_VARIABLES);

    return chunckedCookiesArr.map((cookies) => {
      const queryPlaceholders = cookies.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const query = `insert or replace into cookies (creation_utc, host_key, name, value, path, expires_utc, is_secure, is_httponly, last_access_utc, is_persistent, encrypted_value, samesite, has_expires) values ${queryPlaceholders}`;
      const queryParams = cookies.flatMap((cookie) => {
        const creationDate = cookie.creationDate ? cookie.creationDate : this.unixToLDAP(todayUnix);
        const encryptedValue = cookie.value;
        const samesite = Object.keys(SAME_SITE).find((key) => SAME_SITE[key] === (cookie.sameSite || '-1'));
        const isSecure =
          cookie.name.startsWith('__Host-') || cookie.name.startsWith('__Secure-') ? 1 : Number(cookie.secure);
        let isPersistent = [undefined, null].includes(cookie.session)
          ? Number(expirationDate !== 0)
          : Number(!cookie.session);
        let expirationDate = cookie.session ? 0 : this.unixToLDAP(cookie.expirationDate);

        if (/^(\.)?mail.google.com$/.test(cookie.domain) && cookie.name === 'COMPASS') {
          expirationDate = 0;
          isPersistent = 0;
        }

        return [
          creationDate,
          cookie.domain,
          cookie.name,
          '', // value
          cookie.path,
          expirationDate,
          isSecure,
          Number(cookie.httpOnly),
          0, // last_access_utc
          isPersistent,
          encryptedValue,
          samesite,
          expirationDate === 0 ? 0 : 1, // has_expires
        ];
      });

      return [query, queryParams];
    });
  }

  static async loadCookiesFromFile(filePath) {
    let db;
    const cookies = [];

    try {
      db = await this.getDB(filePath);
      const cookiesRows = await db.all('select * from cookies');
      for (const row of cookiesRows) {
        const {
          host_key,
          name,
          encrypted_value,
          path,
          is_secure,
          is_httponly,
          expires_utc,
          is_persistent,
          samesite,
          creation_utc,
        } = row;

        cookies.push({
          url: this.buildCookieURL(host_key, is_secure, path),
          domain: host_key,
          name: name,
          value: encrypted_value,
          path: path,
          sameSite: SAME_SITE[samesite],
          secure: Boolean(is_secure),
          httpOnly: Boolean(is_httponly),
          hostOnly: !host_key.startsWith('.'),
          session: !Boolean(is_persistent),
          expirationDate: this.ldapToUnix(expires_utc),
          creationDate: this.ldapToUnix(creation_utc),
        });
      }
    } catch (error) {
      console.log(error);
    } finally {
      await db && db.close();
    }

    return cookies;
  };

  static unixToLDAP(unixtime) {
    if (unixtime === 0) return unixtime;
    const win32filetime = new Date(Date.UTC(1601, 0, 1)).getTime() / 1000;
    const sum = unixtime - win32filetime;
    return sum * 1000000;
  }

  static ldapToUnix(ldap) {
    const ldapLength = ldap.toString().length;
    if (ldap === 0 || ldapLength > 18) return ldap;

    let _ldap = ldap;
    if (ldapLength < 18) {
      _ldap = Number(_ldap + '0'.repeat(18 - ldapLength));
    }

    const win32filetime = new Date(Date.UTC(1601, 0, 1)).getTime();
    return (_ldap / 10000 + win32filetime) / 1000;
  }

  static buildCookieURL(domain, secure, path) {
    let domainWithoutDot = domain;
    if (domain.startsWith('.')) {
      domainWithoutDot = domain.substr(1);
    }

    return 'http' + (secure ? 's' : '') + '://' + domainWithoutDot + path;
  }

  static chunk(arr, chunkSize = 1, cache = []) {
    const tmp = [...arr];
    if (chunkSize <= 0) return cache;
    while (tmp.length) cache.push(tmp.splice(0, chunkSize));
    return cache;
  }
}

module.exports = {
  CookiesManager,
}
