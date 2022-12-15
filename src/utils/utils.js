import net from 'node:net';

export const get = (value, path, defaultValue) =>
  String(path).split('.').reduce((acc, v) => {
    try {
      acc = acc[v] ? acc[v] : defaultValue;
    } catch (e) {
      return defaultValue;
    }

    return acc;
  }, value);

export const isPortReachable = async(port, { host, timeout = 1000 } = {}) => {
  if (typeof host !== 'string') {
    throw new TypeError('Specify a `host`');
  }

  const promise = new Promise(((resolve, reject) => {
    const socket = new net.Socket();

    const onError = () => {
      socket.destroy();
      reject();
    };

    socket.setTimeout(timeout);
    socket.once('error', onError);
    socket.once('timeout', onError);

    socket.connect(port, host, () => {
      socket.end();
      resolve();
    });
  }));

  try {
    await promise;

    return true;
  } catch {
    return false;
  }
};
