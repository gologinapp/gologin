// Orbita was spawned but never opened its DevTools port, so there is no wsUrl.
// Without this the caller only sees the last poll's "fetch failed".
export const BROWSER_NOT_STARTED_CODE = 'BROWSER_NOT_STARTED';
export const BROWSER_NOT_STARTED_PREFIX = "Browser didn't start";

const describeExit = ({ exitCode, signal }, port) => {
  if (typeof exitCode === 'number') {
    return `process exited with code ${exitCode}`;
  }

  if (signal) {
    return `process was killed by ${signal}`;
  }

  return `DevTools port ${port} did not open`;
};

export const browserNotStartedError = ({ exit, port, cause }) => {
  const error = new Error(`${BROWSER_NOT_STARTED_PREFIX}: ${describeExit(exit, port)}`, { cause });
  error.code = BROWSER_NOT_STARTED_CODE;
  error.exitCode = exit.exitCode ?? null;
  error.signal = exit.signal ?? null;

  return error;
};

export const createOutputTail = (maxChars = 4000) => {
  let tail = '';

  return {
    push: (chunk) => {
      tail = (tail + String(chunk)).slice(-maxChars);
    },
    text: () => tail,
  };
};

// Listen from spawn on: the exit code and stderr say why the port never opened.
export const watchBrowserProcess = (child) => {
  const watched = { exit: { exitCode: null, signal: null }, stderr: createOutputTail() };
  if (!child) {
    return watched;
  }

  child.on('exit', (exitCode, signal) => {
    watched.exit = { exitCode, signal };
  });
  child.stderr?.on('data', (chunk) => watched.stderr.push(chunk));

  return watched;
};
