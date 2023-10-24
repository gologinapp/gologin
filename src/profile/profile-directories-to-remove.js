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
    name: 'IndexedDB',
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
];

export const getDirectoriesToDeleteForNode = (routerSlash = '/') =>
  DEFAULT_FOLDER_USELESS_FILE.reduce((res, el) => {
    const basePath = routerSlash + 'Default' + routerSlash + el.name;
    if (el.subs.length) {
      el.subs.forEach(sub => res.push(basePath + routerSlash + sub));
    } else {
      res.push(basePath);
    }

    return res;
  }, []);

export const getDirectoriesForArchiver = () => DEFAULT_FOLDER_USELESS_FILE.reduce((res, el) => {
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
