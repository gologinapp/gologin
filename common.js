const path = require('path');

const ExtensionsExtractor = require('./extensions-extractor');
const os = require('os');

const HOMEDIR = os.homedir();
const CHROME_EXT_DIR_NAME = 'chrome-extensions';
const EXTENSIONS_PATH = path.join(HOMEDIR, '.gologin', 'extensions');
const CHROME_EXTENSIONS_PATH = path.join(EXTENSIONS_PATH, CHROME_EXT_DIR_NAME);
const USER_EXTENSIONS_PATH = path.join(HOMEDIR, '.gologin', 'extensions', 'user-extensions');

const composeExtractionPromises = (filteredArchives, destPath = CHROME_EXTENSIONS_PATH) => (
  filteredArchives.map((extArchivePath) => {
    const [archiveName = ''] = extArchivePath.split(path.sep).reverse();
    const [destFolder] = archiveName.split('.');
    return ExtensionsExtractor.extractExtension(extArchivePath, path.join(destPath, destFolder))
      .then(() => ExtensionsExtractor.deleteExtensionArchive(extArchivePath))
  })
);

module.exports.composeExtractionPromises = composeExtractionPromises;
module.exports.USER_EXTENSIONS_PATH = USER_EXTENSIONS_PATH;
module.exports.CHROME_EXTENSIONS_PATH = CHROME_EXTENSIONS_PATH;
