const cache = {};

const resolveDefault = (module) => module?.default ?? module;

const resolveSocksProxyAgent = (module) => {
  const resolved = resolveDefault(module);

  return resolved.SocksProxyAgent ?? resolved;
};

const resolveHttpsProxyAgent = (module) => {
  const resolved = resolveDefault(module);

  return resolved.HttpsProxyAgent ?? resolved;
};

const importAndAssign = (key, importPromise) => importPromise.then((value) => {
  cache[key] = value;

  return value;
});

export const loadRimraf = () => {
  if (cache.rimraf !== undefined) {
    return Promise.resolve(cache.rimraf);
  }

  cache.rimrafPromise ||= import('rimraf').then(resolveDefault).then((value) => {
    cache.rimraf = value;

    return value;
  });

  return cache.rimrafPromise;
};

export const loadDecompress = () => {
  if (cache.decompressReady) {
    return Promise.resolve(cache.decompressReady);
  }

  cache.decompressPromise ||= Promise.all([
    import('decompress').then(resolveDefault),
    import('decompress-unzip').then(resolveDefault),
  ]).then(([decompress, decompressUnzip]) => {
    cache.decompressReady = { decompress, decompressUnzip };

    return cache.decompressReady;
  });

  return cache.decompressPromise;
};

export const loadSocksProxyAgent = () => {
  if (cache.socksProxyAgent !== undefined) {
    return Promise.resolve(cache.socksProxyAgent);
  }

  cache.socksProxyAgentPromise ||= import('socks-proxy-agent').then(resolveSocksProxyAgent).then((value) => {
    cache.socksProxyAgent = value;

    return value;
  });

  return cache.socksProxyAgentPromise;
};

export const loadHttpsProxyAgent = () => {
  if (cache.httpsProxyAgent !== undefined) {
    return Promise.resolve(cache.httpsProxyAgent);
  }

  cache.httpsProxyAgentPromise ||= import('https-proxy-agent').then(resolveHttpsProxyAgent).then((value) => {
    cache.httpsProxyAgent = value;

    return value;
  });

  return cache.httpsProxyAgentPromise;
};

export const loadSentry = () => {
  return Promise.resolve(null);

  // cache.sentry ||= import('@sentry/node');
  //
  // return cache.sentry;
};

export const loadCookiesManager = () => {
  if (cache.cookiesManager) {
    return Promise.resolve(cache.cookiesManager);
  }

  cache.cookiesManagerPromise ||= import('../cookies/cookies-manager.js').then((value) => {
    cache.cookiesManager = value;

    return value;
  });

  return cache.cookiesManagerPromise;
};

export const loadProfileArchiver = () => {
  cache.profileArchiver ||= import('../profile/profile-archiver.js');

  return cache.profileArchiver;
};

export const loadExtensionsManager = () => {
  if (cache.extensionsManagerClass !== undefined) {
    return Promise.resolve(cache.extensionsManagerClass);
  }

  cache.extensionsManagerPromise ||= import('../extensions/extensions-manager.js').then(resolveDefault).then((value) => {
    cache.extensionsManagerClass = value;

    return value;
  });

  return cache.extensionsManagerPromise;
};

export const loadBrowserChecker = () => {
  if (cache.browserCheckerClass !== undefined) {
    return Promise.resolve(cache.browserCheckerClass);
  }

  cache.browserCheckerPromise ||= import('../browser/browser-checker.js').then(resolveDefault).then((value) => {
    cache.browserCheckerClass = value;

    return value;
  });

  return cache.browserCheckerPromise;
};

export const preloadStartupDeps = () => {
  if (cache.startupPreload) {
    return cache.startupPreload;
  }

  cache.startupPreload = Promise.all([
    importAndAssign('rimraf', import('rimraf').then(resolveDefault)),
    importAndAssign('decompressLib', import('decompress').then(resolveDefault)),
    importAndAssign('decompressUnzipLib', import('decompress-unzip').then(resolveDefault)),
    importAndAssign('socksProxyAgent', import('socks-proxy-agent').then(resolveSocksProxyAgent)),
    importAndAssign('cookiesManager', import('../cookies/cookies-manager.js')),
    importAndAssign('extensionsManagerClass', import('../extensions/extensions-manager.js').then(resolveDefault)),
  ]).then(() => {
    cache.decompressReady = {
      decompress: cache.decompressLib,
      decompressUnzip: cache.decompressUnzipLib,
    };
  });

  return cache.startupPreload;
};

export const ensureSentryInitialized = async (_options = {}) => {
  return null;

  // if (process.env.DISABLE_TELEMETRY === 'true') {
  //   return null;
  // }
  //
  // if (cache.sentryInitialized) {
  //   return cache.sentryModule;
  // }
  //
  // const Sentry = await loadSentry();
  // Sentry.init({
  //   dsn: 'https://a13d5939a60ae4f6583e228597f1f2a0@sentry-new.amzn.pro/24',
  //   tracesSampleRate: 1.0,
  //   defaultIntegrations: false,
  //   release: release || '2.1.34',
  // });
  // cache.sentryInitialized = true;
  // cache.sentryModule = Sentry;
  //
  // return Sentry;
};

export const removePath = async (targetPath, options) => {
  const rimrafFn = await loadRimraf();

  return new Promise((resolve, reject) => {
    const onComplete = (error) => {
      if (error) {
        reject(error);

        return;
      }

      resolve();
    };

    if (options && typeof options === 'object') {
      rimrafFn(targetPath, options, onComplete);

      return;
    }

    rimrafFn(targetPath, onComplete);
  });
};
