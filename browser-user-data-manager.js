const path = require('path');
const os = require('os');
const request = require('requestretry');
const { rmdirSync, createWriteStream } = require('fs');
const { access, readFile, writeFile, mkdir, readdir, copyFile } = require('fs').promises;

const fontsCollection = require('./fonts');

const FONTS_URL = 'https://fonts.gologin.com/';
const FONTS_DIR_NAME = 'fonts';

const HOMEDIR = os.homedir();
const BROWSER_PATH = path.join(HOMEDIR, '.gologin', 'browser');
const OS_PLATFORM = process.platform;

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

  static async downloadFonts(fontsList = [], profilePath) {
    if (!fontsList.length) {
      return;
    }

    const browserFontsPath = path.join(BROWSER_PATH, FONTS_DIR_NAME);
    await mkdir(browserFontsPath, { recursive: true });

    const files = await readdir(browserFontsPath);
    const fontsToDownload = fontsList.filter(font => !files.includes(font));

    let promises = fontsToDownload.map(font => request.get(FONTS_URL + font, {
      maxAttempts: 3,
      retryDelay: 2000,
      timeout: 10 * 1000,
    })
      .pipe(createWriteStream(path.join(browserFontsPath, font)))
    );

    if (promises.length) {
      await Promise.all(promises);
    }

    promises = fontsList.map((font) =>
      copyFile(path.join(browserFontsPath, font), path.join(profilePath, FONTS_DIR_NAME, font)));

    await Promise.all(promises);
  }

  static async composeFonts(fontsList = [], profilePath, differentOs = false) {
    if (!(fontsList.length && profilePath)) {
      return;
    }

    const fontsToDownload = fontsCollection
      .filter(elem => fontsList.includes(elem.value))
      .reduce((res, elem) => res.concat(elem.fileNames || []), []);

    if (differentOs && !fontsToDownload.length) {
      throw new Error('No fonts to download found. Use getAvailableFonts() method and set some fonts from this list');
    }
    fontsToDownload.push('LICENSE.txt');
    fontsToDownload.push('OFL.txt');

    const pathToFontsDir = path.join(profilePath, FONTS_DIR_NAME);
    const fontsDirExists = await access(pathToFontsDir).then(() => true, () => false);
    if (fontsDirExists) {
      rmdirSync(pathToFontsDir, { recursive: true });
    }

    await mkdir(pathToFontsDir, { recursive: true });
    await this.downloadFonts(fontsToDownload, profilePath);

    if (OS_PLATFORM === 'linux') {
      await this.copyFontsConfigFile(profilePath);
    }
  }

  static async copyFontsConfigFile(profilePath) {
    if (!profilePath) {
      return;
    }

    const fileContent = await readFile(path.resolve(__dirname, 'fonts_config'), 'utf-8');
    const result = fileContent.replace(/\$\$GOLOGIN_FONTS\$\$/g, path.join(profilePath, FONTS_DIR_NAME));
    await writeFile(path.join(profilePath, 'Default', 'fonts_config'), result);
  }
}

module.exports = {
  BrowserUserDataManager,
}
