import { exec } from 'child_process';
import { promises as fsPromises } from 'fs';
import { homedir } from 'os';
import { dirname, join, sep } from 'path';
import { promisify } from 'util';

import { deleteExtensionArchive, extractExtension } from '../extensions/extensions-extractor.js';

export const API_URL = 'https://api.gologin.com';
export const FALLBACK_API_URL = 'https://api.gologin.co';

const HOMEDIR = homedir();
const CHROME_EXT_DIR_NAME = 'chrome-extensions';
const EXTENSIONS_PATH = join(HOMEDIR, '.gologin', 'extensions');
const CHROME_EXTENSIONS_PATH = join(EXTENSIONS_PATH, CHROME_EXT_DIR_NAME);
const USER_EXTENSIONS_PATH = join(HOMEDIR, '.gologin', 'extensions', 'user-extensions');

const composeExtractionPromises = (filteredArchives, destPath = CHROME_EXTENSIONS_PATH) => (
  filteredArchives.map((extArchivePath) => {
    const [archiveName = ''] = extArchivePath.split(sep).reverse();
    const [destFolder] = archiveName.split('.');

    return extractExtension(extArchivePath, join(destPath, destFolder))
      .then(() => deleteExtensionArchive(extArchivePath));
  })
);

const getMacArmSpec = async () => {
  const doExec = promisify(exec);

  const { stdout } = await doExec('sysctl machdep.cpu');
  const regExp = /Apple M\d/;
  const [match] = stdout.match(regExp);
  const [_, armVersion] = match.split(' ');

  return armVersion;
};

export const ensureDirectoryExists = async (filePath) => {
  try {
    const directory = dirname(filePath);
    if (directory && directory !== '.') {
      await fsPromises.mkdir(directory, { recursive: true, force: true });
    }
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error('Error creating directory:', error.message);
    }
  }
};

const getOsAdvanced = async () => {
  const os = getOS();
  if (!['mac', 'macM1'].includes(os)) {
    return { os, osSpec: '' };
  }

  const osSpec = await getMacArmSpec();

  return {
    os: 'mac',
    osSpec,
  };
};

const getOS = () => {
  if (process.platform === 'win32') {
    return 'win';
  }

  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'macM1' : 'mac';
  }

  return 'lin';
};

const _composeExtractionPromises = composeExtractionPromises;
export { _composeExtractionPromises as composeExtractionPromises };

const _getOS = getOS;
export { _getOS as getOS };

const _getOsAdvanced = getOsAdvanced;
export { _getOsAdvanced as getOsAdvanced };

const _USER_EXTENSIONS_PATH = USER_EXTENSIONS_PATH;
export { _USER_EXTENSIONS_PATH as USER_EXTENSIONS_PATH };

const _CHROME_EXTENSIONS_PATH = CHROME_EXTENSIONS_PATH;
export { _CHROME_EXTENSIONS_PATH as CHROME_EXTENSIONS_PATH };
