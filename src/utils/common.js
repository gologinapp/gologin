import { homedir } from 'os';
import { join, sep } from 'path';

import { deleteExtensionArchive, extractExtension } from '../extensions/extensions-extractor.js';

export const API_URL = 'https://api.gologin.com';

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

const _composeExtractionPromises = composeExtractionPromises;
export { _composeExtractionPromises as composeExtractionPromises };
const _USER_EXTENSIONS_PATH = USER_EXTENSIONS_PATH;
export { _USER_EXTENSIONS_PATH as USER_EXTENSIONS_PATH };
const _CHROME_EXTENSIONS_PATH = CHROME_EXTENSIONS_PATH;
export { _CHROME_EXTENSIONS_PATH as CHROME_EXTENSIONS_PATH };
