import { promises } from 'fs';

import { loadDecompress } from '../utils/lazy-deps.js';

const { access, unlink } = promises;

export const extractExtension = async (source, dest) => {
  if (!(source && dest)) {
    throw new Error('Missing parameter');
  }

  const { decompress, decompressUnzip } = await loadDecompress();

  return access(source)
    .then(() =>
      withRetry({
        fn() {
          return decompress(source, dest, {
            plugins: [decompressUnzip()],
            filter: file => !file.path.endsWith('/'),
          });
        },
      }),
    );
};

export const deleteExtensionArchive = (dest) => {
  if (!dest) {
    throw new Error('Missing parameter');
  }

  return unlink(dest).catch((error) => {
    if (error?.code === 'ENOENT') {
      return;
    }

    throw error;
  });
};

const withRetry = optionsOrUndefined => {
  const opts = optionsOrUndefined || {};
  const callCounter = opts.callCounter || 1;
  const fnToProducePromise = opts.fn;
  const callLimit = opts.limit || 5;
  delete opts.callCounter;

  return fnToProducePromise(opts).catch(err => {
    console.error(err);
    if (callCounter >= callLimit) {
      return Promise.reject(err);
    }

    opts.callCounter = callCounter + 1;

    return new Promise(resolve => process.nextTick(resolve)).then(() =>
      withRetry(opts),
    );
  });
};
