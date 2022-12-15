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

export const isPortReachable = (port) => new Promise(resolve => {
  const checker = net.createServer()
    .once('error', () => {
      resolve(false);
    })
    .once('listening', () => checker.once('close', () => resolve(true)).close())
    .listen(port);
});

