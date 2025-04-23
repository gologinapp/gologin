import { readdirSync, statSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';

export const get = (value, path, defaultValue) =>
  String(path).split('.').reduce((acc, val) => {
    try {
      acc = acc[val] ? acc[val] : defaultValue;
    } catch (e) {
      return defaultValue;
    }

    return acc;
  }, value);

export const isPortReachable = (port) => new Promise(resolve => {
  const checker = net.createServer()
    .once('error', () => {
      resolve(false);
    })
    .once('listening', () => checker.once('close', () => resolve(true)).close())
    .listen(port);
});

export const findLatestBrowserVersionDirectory = (browserPath) => {
  const folderContents = readdirSync(browserPath);
  const directories = folderContents.filter(file => statSync(join(browserPath, file)).isDirectory());

  const { folderName, version } = directories.reduce((newest, currentFolderName) => {
    const match = currentFolderName.match(/\d+/);

    if (match) {
      const findedVersion = parseInt(match[0], 10);

      if (findedVersion > newest.version) {
        return { folderName: currentFolderName, version: findedVersion };
      }
    }

    return newest;
  }, { folderName: '', version: 0 });

  if (!version) {
    return 'error';
  }

  return folderName;
};

export const delay = (ms = 250) => new Promise((res) => setTimeout(res, ms));
