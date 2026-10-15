export const INDEXED_DB_DIRECTORY = 'IndexedDB';

const DEFAULT_FOLDER_USELESS_FILE = [
  {
    name: 'Cache',
    subs: [],
    isDirectory: true,
  },
  {
    name: 'fonts_config',
    subs: [],
    isDirectory: false,
  },
  {
    name: 'Service Worker',
    subs: [],
    isDirectory: true,
  },
  {
    name: 'Code Cache',
    subs: [],
    isDirectory: true,
  },
  {
    name: 'Extensions',
    subs: [],
    isDirectory: true,
  },
  {
    name: INDEXED_DB_DIRECTORY,
    subs: [],
    isDirectory: true,
  },
  {
    name: 'fonts_config',
    subs: [],
    isDirectory: true,
  },
  {
    name: 'DawnCache',
    subs: [],
    isDirectory: true,
  },
  {
    name: 'GPUCache',
    subs: [],
    isDirectory: true,
  },
  {
    name: 'Shared Dictionary',
    subs: ['cache'],
    isDirectory: true,
  },
];

const getFoldersToRemove = ({ keepIndexedDb = false } = {}) => {
  if (!keepIndexedDb) {
    return DEFAULT_FOLDER_USELESS_FILE;
  }

  return DEFAULT_FOLDER_USELESS_FILE.filter((folder) => folder.name !== INDEXED_DB_DIRECTORY);
};

export const getDirectoriesToDeleteForNode = (routerSlash = '/', { keepIndexedDb = false } = {}) =>
  getFoldersToRemove({ keepIndexedDb }).reduce((res, el) => {
    const basePath = routerSlash + 'Default' + routerSlash + el.name;
    if (el.subs.length) {
      el.subs.forEach(sub => res.push(basePath + routerSlash + sub));
    } else {
      res.push(basePath);
    }

    return res;
  }, []);

export const getDirectoriesForArchiver = ({ keepIndexedDb = false } = {}) => getFoldersToRemove({ keepIndexedDb }).reduce((res, el) => {
  const { name, subs, isDirectory } = el;
  const basePath = 'Default/' + name;

  if (subs.length) {
    subs.forEach((sub) => {
      const resPath = basePath + '/' + (isDirectory ? sub + '/' : sub);
      res.push(resPath);
    });
  } else {
    res.push(basePath + (isDirectory ? '/' : ''));
  }

  return res;
}, []);
