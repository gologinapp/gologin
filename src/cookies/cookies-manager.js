import { promises as fsPromises } from 'fs';
import { join } from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

import { ensureDirectoryExists } from '../utils/common.js';

const { access } = fsPromises;
const { Database, OPEN_READONLY } = sqlite3;

const MAX_SQLITE_VARIABLES = 76;

const SAME_SITE = {
  '-1': 'unspecified',
  0: 'no_restriction',
  1: 'lax',
  2: 'strict',
};

export const getDB = (filePath, readOnly = true) => {
  const connectionOpts = {
    filename: filePath,
    driver: Database,
  };

  if (readOnly) {
    connectionOpts.mode = OPEN_READONLY;
  }

  return open(connectionOpts);
};

export const createDBFile = async ({
  cookiesFilePath,
  cookiesFileSecondPath,
  createCookiesTableQuery,
}) => {
  await fsPromises.writeFile(cookiesFilePath, '', { mode: 0o666 });

  const connectionOpts = {
    filename: cookiesFilePath,
    driver: sqlite3.Database,
  };

  const db = await open(connectionOpts);
  await db.run(createCookiesTableQuery);
  await db.close();

  await ensureDirectoryExists(cookiesFilePath);
  await ensureDirectoryExists(cookiesFileSecondPath);
  cookiesFileSecondPath && await fsPromises.copyFile(cookiesFilePath, cookiesFileSecondPath).catch((error) => {
    console.error('error in copyFile createDBFile', error.message);
  });
};

export const getUniqueCookies = async (cookiesArr, cookiesFilePath) => {
  const cookiesInFile = await loadCookiesFromFile(cookiesFilePath);
  const existingCookieNames = new Set(cookiesInFile.map(c => `${c.name}-${c.domain}-${c.path}`));

  return cookiesArr.filter(cookie => !existingCookieNames.has(`${cookie.name}-${cookie.domain}-${cookie.path}`));
};

export const getChunckedInsertValues = (cookiesArr) => {
  const todayUnix = Math.floor(new Date().getTime() / 1000.0);
  const chunckedCookiesArr = chunk(cookiesArr, MAX_SQLITE_VARIABLES);

  return chunckedCookiesArr.map((cookies) => {
    const queryPlaceholders = cookies.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const query = `insert or replace into cookies (creation_utc, host_key, top_frame_site_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, last_access_utc, has_expires, is_persistent, priority, samesite, source_scheme, source_port, is_same_party, last_update_utc) values ${queryPlaceholders}`;
    const queryParams = cookies.flatMap((cookie) => {
      const creationDate = cookie.creationDate ? cookie.creationDate : unixToLDAP(todayUnix);
      let expirationDate = cookie.session ? 0 : unixToLDAP(cookie.expirationDate);
      const encryptedValue = cookie.value;
      const samesite = Object.keys(SAME_SITE).find((key) => SAME_SITE[key] === (cookie.sameSite || '-1'));
      const isSecure =
        cookie.name.startsWith('__Host-') || cookie.name.startsWith('__Secure-') ? 1 : Number(cookie.secure);

      const sourceScheme = isSecure === 1 ? 2 : 1;
      const sourcePort = isSecure === 1 ? 443 : 80;
      // eslint-disable-next-line no-undefined
      let isPersistent = [undefined, null].includes(cookie.session)
        ? Number(expirationDate !== 0)
        : Number(!cookie.session);

      if (/^(\.)?mail.google.com$/.test(cookie.domain) && cookie.name === 'COMPASS') {
        expirationDate = 0;
        isPersistent = 0;
      }

      return [
        creationDate,
        cookie.domain,
        '', // top_frame_site_key
        cookie.name,
        '', // value
        encryptedValue,
        cookie.path,
        expirationDate,
        isSecure,
        Number(cookie.httpOnly),
        0, // last_access_utc
        expirationDate === 0 ? 0 : 1, // has_expires
        isPersistent,
        1, // default priority value (https://github.com/chromium/chromium/blob/main/net/cookies/cookie_constants.h)
        samesite,
        sourceScheme,
        sourcePort,
        0, // is_same_party
        0, // last_update_utc
      ];
    });

    return [query, queryParams];
  });
};

export const loadCookiesFromFile = async (filePath, isSecondTry = false, profileId, tmpdir) => {
  let db;
  const cookies = [];
  let secondCookiesFilePath;
  try {
    const isNetworkFolder = filePath.includes('Network');
    secondCookiesFilePath = isNetworkFolder ?
      join(tmpdir, `gologin_profile_${profileId}`, 'Default', 'Cookies') :
      join(tmpdir, `gologin_profile_${profileId}`, 'Default', 'Network', 'Cookies');
  } catch (error) {
    console.log(error);
    console.log('error in loadCookiesFromFile', error.message);
  }

  console.log(1);

  try {
    db = await getDB(filePath);
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
        url: buildCookieURL(host_key, is_secure, path),
        domain: host_key,
        name,
        value: encrypted_value,
        path,
        sameSite: SAME_SITE[samesite],
        secure: Boolean(is_secure),
        httpOnly: Boolean(is_httponly),
        hostOnly: !host_key.startsWith('.'),
        session: !is_persistent,
        expirationDate: ldapToUnix(expires_utc),
        creationDate: ldapToUnix(creation_utc),
      });
    }
  } catch (error) {
    console.log('error in loadCookiesFromFile', error.message);
    if (!isSecondTry) {
      return await loadCookiesFromFile(secondCookiesFilePath, true, profileId, tmpdir);
    }
  } finally {
    db && await db.close();
  }

  if (!cookies.length && !isSecondTry) {
    return loadCookiesFromFile(secondCookiesFilePath, true, profileId, tmpdir);
  }

  return cookies;
};

export const unixToLDAP = (unixtime) => {
  if (unixtime === 0) {
    return unixtime;
  }

  const win32filetime = new Date(Date.UTC(1601, 0, 1)).getTime() / 1000;
  const sum = unixtime - win32filetime;

  return sum * 1000000;
};

export const ldapToUnix = (ldap) => {
  const ldapLength = ldap.toString().length;
  if (ldap === 0 || ldapLength > 18) {
    return ldap;
  }

  let _ldap = ldap;
  if (ldapLength < 18) {
    _ldap = Number(_ldap + '0'.repeat(18 - ldapLength));
  }

  const win32filetime = new Date(Date.UTC(1601, 0, 1)).getTime();

  return (_ldap / 10000 + win32filetime) / 1000;
};

export const buildCookieURL = (domain, secure, path) => {
  let domainWithoutDot = domain;
  if (domain.startsWith('.')) {
    domainWithoutDot = domain.substr(1);
  }

  return 'http' + (secure ? 's' : '') + '://' + domainWithoutDot + path;
};

export const chunk = (arr, chunkSize = 1, cache = []) => {
  const tmp = [...arr];
  if (chunkSize <= 0) {
    return cache;
  }

  while (tmp.length) {
    cache.push(tmp.splice(0, chunkSize));
  }

  return cache;
};

export const getCookiesFilePath = async (profileId, tmpdir) => {
  const baseCookiesFilePath = join(tmpdir, `gologin_profile_${profileId}`, 'Default', 'Cookies');
  const bypassCookiesFilePath = join(tmpdir, `gologin_profile_${profileId}`, 'Default', 'Network', 'Cookies');

  return access(baseCookiesFilePath)
    .then(() => baseCookiesFilePath)
    .catch(() => access(bypassCookiesFilePath)
      .then(() => bypassCookiesFilePath)
      .catch(() => baseCookiesFilePath),
    );
};
