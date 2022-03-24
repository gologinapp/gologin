const { access, unlink } = require('fs').promises;
const decompress = require('decompress');
const decompressUnzip = require('decompress-unzip');

class ExtensionsExtractor {
  static extractExtension(source, dest) {
    if (!(source && dest)) {
      throw new Error('Missing parameter');
    }

    return access(source)
      .then(() =>
        withRetry({
          fn() {
            return decompress(source, dest, {
              plugins: [decompressUnzip()],
              filter: file => !file.path.endsWith('/')
            })
          }
        })
      );
  }

  static deleteExtensionArchive(dest) {
    if (!dest) {
      throw new Error('Missing parameter');
    }

    return access(dest)
      .then(
        () => unlink(dest),
        () => Promise.resolve()
      )
  }
}

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
      withRetry(opts)
    );
  });
};

module.exports = ExtensionsExtractor;
