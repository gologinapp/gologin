import { exec as execNonPromise } from 'child_process';
import decompress from 'decompress';
import decompressUnzip from 'decompress-unzip';
import { createWriteStream, promises as _promises } from 'fs';
import { get } from 'https';
import { homedir } from 'os';
import { join } from 'path';
import ProgressBar from 'progress';
import util from 'util';
import { createInterface } from 'readline';

import { API_URL, getOS } from '../utils/common.js';

const exec = util.promisify(execNonPromise);
const { access, mkdir, readdir, rmdir, unlink, copyFile, readlink, symlink, lstat, rename, writeFile, readFile } = _promises;

const PLATFORM = process.platform;
const ARCH = process.arch;

const VERSION_FILE = 'latest-version.txt';

const WIN_FOLDERSIZE_FILE = 'foldersize.txt';
const WIN_FOLDERSIZE_FILE_LINK = `https://orbita-browser-windows.gologin.com/${WIN_FOLDERSIZE_FILE}`;

const BROWSER_ARCHIVE_NAME = `orbita-browser-latest.${PLATFORM === 'win32' ? 'zip' : 'tar.gz'}`;

const MAC_HASH_FILE = 'hashfile.mtree';
const DEB_HASH_FILE = 'hashfile.txt';
const WIN_HASH_FILE = DEB_HASH_FILE;
const MAC_HASHFILE_LINK = `https://orbita-browser-mac.gologin.com/${MAC_HASH_FILE}`;
const DEB_HASHFILE_LINK = `https://orbita-browser-linux.gologin.com/${DEB_HASH_FILE}`;
const WIN_HASHFILE_LINK = `https://orbita-browser-windows.gologin.com/${WIN_HASH_FILE}`;
const MAC_ARM_HASHFILE_LINK = `https://orbita-browser-mac-arm.gologin.com/${MAC_HASH_FILE}`;

const FAIL_SUM_MATCH_MESSAGE = 'hash_sum_not_matched';
const EXTRACTED_FOLDER = 'extracted-browser';

export class BrowserChecker {
  #homedir = homedir();
  #browserPath = join(this.#homedir, '.gologin', 'browser');
  #executableFilePath;
  #skipOrbitaHashChecking = false;

  constructor() {

  }

  async checkBrowser({ autoUpdateBrowser, checkBrowserUpdate, majorVersion }) {
    const isBrowserFolderExists = await access(join(this.#browserPath, `orbita-browser-${majorVersion}`)).then(() => true).catch(() => false);

    if (!isBrowserFolderExists || autoUpdateBrowser) {
      await this.downloadBrowser(majorVersion);

      return this.getBrowserExecutablePath(majorVersion);
    }

    return this.getBrowserExecutablePath(majorVersion);

    // TO DO: add check for browser update
    // const { latestVersion: browserLatestVersion } = await this.getLatestBrowserVersion();
    // const [latestBrowserMajorVersion] = browserLatestVersion.split('.');
    // const currentVersion = await this.getCurrentVersion(majorVersion);

    // const isCurrentVersionsLatest = majorVersion === latestBrowserMajorVersion;
    // console.log('browserLatestVersion', browserLatestVersion);
    // console.log('currentVersion', currentVersion);
    // console.log('isCurrentVersionsLatest', isCurrentVersionsLatest);
    // console.log('checkBrowserUpdate', checkBrowserUpdate);
    // console.log('autoUpdateBrowser', autoUpdateBrowser);
    // if (browserLatestVersion === currentVersion || !(checkBrowserUpdate && isCurrentVersionsLatest)) {
    //   return this.getBrowserExecutablePath(majorVersion);
    // }



    // return new Promise(resolve => {
    //   const rl = createInterface(process.stdin, process.stdout);
    //   const timeout = setTimeout(() => {
    //     console.log(`\nContinue with current ${currentVersion} version.`);
    //     resolve();
    //   }, 10000);

    //   rl.question(`New Orbita ${browserLatestVersion} is available. Update? [y/n] `, (answer) => {
    //     clearTimeout(timeout);
    //     rl.close();
    //     if (answer && answer[0].toString().toLowerCase() === 'y') {
    //       return this.downloadBrowser(majorVersion).then(() => resolve(this.getBrowserExecutablePath(majorVersion)));
    //     }

    //     console.log(`Continue with current ${currentVersion} version.`);
    //     resolve(this.getBrowserExecutablePath(majorVersion));
    //   });
    // });
  }

  async downloadBrowser(majorVersion) {
    await mkdir(this.#browserPath, { recursive: true });

    const browserPath = join(this.#browserPath, BROWSER_ARCHIVE_NAME);

    const browserDownloadUrl = this.getBrowserDownloadUrl(majorVersion);

    await this.downloadBrowserArchive(browserDownloadUrl, browserPath);
    await this.extractBrowser();
    await this.replaceBrowser(majorVersion);
    await this.deleteOldArchives();
  }

  getBrowserExecutablePath(majorVersion) {
    const os = getOS();
    switch (os) {
      case 'mac':
        return join(this.#browserPath, `orbita-browser-${majorVersion}`, 'Orbita-Browser.app', 'Contents', 'MacOS', 'Orbita');
      case 'win':
        return join(this.#browserPath, `orbita-browser-${majorVersion}`, 'chrome.exe');
      case 'macM1':
        return join(this.#browserPath, `orbita-browser-${majorVersion}`, 'Orbita-Browser.app', 'Contents', 'MacOS', 'Orbita');
      default:
        return join(this.#browserPath, `orbita-browser-${majorVersion}`, 'chrome');
    }
  }

  getBrowserDownloadUrl(majorVersion) {
    const os = getOS();
    switch (os) {
      case 'mac':
        return `https://orbita-browser-mac.gologin.com/orbita-browser-latest-${majorVersion}.tar.gz`;
      case 'win':
        return `https://orbita-browser-windows.gologin.com/orbita-browser-latest-${majorVersion}.zip`;
      case 'macM1':
        return `https://orbita-browser-mac-arm.gologin.com/orbita-browser-latest-${majorVersion}.tar.gz`;
      default:
        return `https://orbita-browser-linux.gologin.com/orbita-browser-latest-${majorVersion}.tar.gz`;
    }
  }

  addLatestVersion(latestVersion) {
    return mkdir(join(this.#browserPath, 'orbita-browser', 'version'), { recursive: true })
      .then(() => writeFile(join(this.#browserPath, 'orbita-browser', 'version', 'latest-version.txt'), latestVersion));
  }

  async downloadBrowserArchive(link, pathStr) {
    return new Promise((resolve, reject) => {
      const writableStream = createWriteStream(pathStr);
      writableStream.on('error', async err => {
        await unlink(pathStr);
        reject(err);
      });
      writableStream.on('finish', () => resolve());

      const req = get(link, {
        timeout: 15 * 1000,
      }, (res) => {
        const len = parseInt(res.headers['content-length'], 10);
        const formattedLen = len / 1024 / 1024;
        if (isNaN(formattedLen)) {
          reject(new Error('Error downloading browser'));
          return;
        }

        const bar = new ProgressBar('Orbita downloading [:bar] :rate/mps :downloadedMb/:fullMbMB :percent :etas', {
          complete: '=',
          incomplete: ' ',
          width: 30,
          total: Math.round(formattedLen),
        });

        let downloadedMb = 0;

        res.on('data', (chunk) => {
          const formattedChunckLenght = chunk.length / 1024 / 1024;
          downloadedMb += formattedChunckLenght;
          bar.tick(formattedChunckLenght, {
            fullMb: formattedLen.toFixed(2),
            downloadedMb: downloadedMb.toFixed(2),
          });
        });

        res.on('end', () => {
          bar.tick(bar.total, {
            fullMb: formattedLen.toFixed(2),
            downloadedMb: formattedLen.toFixed(2),
          });
          console.log('\nDownload completed');
          writableStream.end();
        });

        res.pipe(writableStream);
      });

      req.on('error', (err) => writableStream.destroy(err));
      req.end();
    });
  }

  async checkBrowserArchive(pathStr) {
    console.log('Checking Orbita archive');
    try {
      await access(pathStr);
    } catch (e) {
      throw new Error('Archive has not been found. Please run script again.');
    }
  }

  async extractBrowser() {
    console.log('Extracting Orbita');
    await mkdir(join(this.#browserPath, EXTRACTED_FOLDER), { recursive: true });
    if (PLATFORM === 'win32') {
      return decompress(join(this.#browserPath, BROWSER_ARCHIVE_NAME), join(this.#browserPath, EXTRACTED_FOLDER),
        {
          plugins: [decompressUnzip()],
          filter: file => !file.path.endsWith('/'),
        },
      );
    }

    return exec(
      `tar xzf ${join(this.#browserPath, BROWSER_ARCHIVE_NAME)} --directory ${join(this.#browserPath, EXTRACTED_FOLDER)}`,
    );
  }

  async downloadHashFile(latestVersion) {
    let hashLink = DEB_HASHFILE_LINK;
    let resultPath = join(this.#browserPath, DEB_HASH_FILE);
    if (PLATFORM === 'darwin') {
      hashLink = MAC_HASHFILE_LINK;
      if (ARCH === 'arm64') {
        hashLink = MAC_ARM_HASHFILE_LINK;
      }

      resultPath = join(this.#browserPath, MAC_HASH_FILE);
    }

    if (latestVersion) {
      const [majorVer] = latestVersion.split('.');
      hashLink = hashLink.replace('hashfile.', `hashfile-${majorVer}.`);
    }

    const writableStream = createWriteStream(resultPath);
    writableStream.on('error', async (err) => {
      await unlink(resultPath);
      throw err;
    });

    await new Promise(resolve => get(hashLink,
      {
        timeout: 10 * 1000,
      }, (res) => {
        res.on('end', () => {
          console.log('Hashfile downloading completed');
          writableStream.end();
          resolve();
        });

        res.pipe(writableStream);
      }).on('error', (err) => writableStream.destroy(err)));

    const hashFile = PLATFORM === 'darwin' ? MAC_HASH_FILE : DEB_HASH_FILE;
    const hashFilePath = join(this.#browserPath, hashFile);

    return access(hashFilePath);
  }

  async checkBrowserSum(latestVersion) {
    if (this.#skipOrbitaHashChecking) {
      return Promise.resolve();
    }

    console.log('Orbita hash checking');
    if (PLATFORM === 'win32') {
      return Promise.resolve();
    }

    await this.downloadHashFile(latestVersion);
    if (PLATFORM === 'darwin') {
      const calculatedHash = await exec(
        `mtree -p ${join(this.#browserPath, EXTRACTED_FOLDER, 'Orbita-Browser.app')} < ${join(this.#browserPath, MAC_HASH_FILE)} || echo ${FAIL_SUM_MATCH_MESSAGE}`,
      );

      const checkedRes = (calculatedHash || '').toString().trim();
      if (checkedRes.includes(FAIL_SUM_MATCH_MESSAGE)) {
        throw new Error('Error in sum matching. Please run script again.');
      }

      return;
    }

    const hashFileContent = await exec(`cat ${join(this.#browserPath, DEB_HASH_FILE)}`);
    let serverRes = (hashFileContent.stdout || '').toString().trim();
    serverRes = serverRes.split(' ')[0];

    const calculateLocalBrowserHash = await exec(
      `cd ${join(this.#browserPath, EXTRACTED_FOLDER)} && find orbita-browser -type f -print0 | sort -z | \
            xargs -0 sha256sum > ${this.#browserPath}/calculatedFolderSha.txt`,
    );

    const localHashContent = await exec(`cd ${this.#browserPath} && sha256sum calculatedFolderSha.txt`);
    let userRes = (localHashContent.stdout || '').toString().trim();
    userRes = userRes.split(' ')[0];
    if (userRes !== serverRes) {
      throw new Error('Error in sum matching. Please run script again.');
    }
  }

  async replaceBrowser(majorVersion) {
    console.log('Copy Orbita to target path');
    const targetBrowserPath = join(this.#browserPath, `orbita-browser-${majorVersion}`);
    await this.deleteDir(targetBrowserPath);

    if (PLATFORM === 'darwin') {
      return rename(join(this.#browserPath, EXTRACTED_FOLDER), targetBrowserPath);
    }

    await this.copyDir(
      join(this.#browserPath, EXTRACTED_FOLDER, 'orbita-browser'),
      targetBrowserPath,
    );
  }

  async deleteOldArchives() {
    await this.deleteDir(join(this.#browserPath, EXTRACTED_FOLDER));

    return readdir(this.#browserPath)
      .then((files) => {
        const promises = [];
        files.forEach((filename) => {
          if (filename.match(/(txt|dylib|mtree)/)) {
            promises.push(unlink(join(this.#browserPath, filename)));
          }
        });

        return Promise.all(promises);
      })
      .catch(e => {
        console.log(`Error in deleting old archives. ${e.message}`);

        return Promise.resolve();
      });
  }

  async copyDir(src, dest) {
    await mkdir(dest);
    const files = await readdir(src);
    for (let i = 0; i < files.length; i++) {
      const current = await lstat(join(src, files[i]));
      if (current.isDirectory()) {
        await this.copyDir(join(src, files[i]), join(dest, files[i]));
      } else if (current.isSymbolicLink()) {
        const symlinkObj = await readlink(join(src, files[i]));
        await symlink(symlinkObj, join(dest, files[i]));
      } else {
        await copyFile(join(src, files[i]), join(dest, files[i]));
      }
    }
  }

  async getCurrentVersion(majorVersion) {
    let versionFilePath = join(this.#browserPath, `orbita-browser-${majorVersion}`, 'version');
    if (PLATFORM === 'darwin') {
      versionFilePath = join(this.#browserPath, `orbita-browser-${majorVersion}`, 'version', VERSION_FILE);
    }

    return (await readFile(versionFilePath, 'utf8').catch(() => '0.0.0')).replace(/[\r\n\t\f\v\u0000-\u001F\u007F]/g, '');
  }

  getLatestBrowserVersion() {
    const userOs = getOS();

    return new Promise(resolve => get(`${API_URL}/gologin-global-settings/latest-browser-info?os=${userOs}`,
      {
        timeout: 15 * 1000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'gologin-api',
        },
      }, (res) => {
        res.setEncoding('utf8');

        let resultResponse = '';
        res.on('data', (data) => resultResponse += data);

        res.on('end', () => {
          resolve(JSON.parse(resultResponse.trim()));
        });
      }).on('error', (err) => resolve('')));
  }

  get getOrbitaPath() {
    return this.#executableFilePath;
  }

  async deleteDir(path = '') {
    if (!path) {
      return;
    }

    const directoryExists = await access(path).then(() => true).catch(() => false);
    if (!directoryExists) {
      return;
    }

    return rmdir(path, { recursive: true });
  }
}

export default BrowserChecker;
