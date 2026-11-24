import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BROWSER_NOT_STARTED_CODE,
  browserNotStartedError,
  createOutputTail,
  watchBrowserProcess,
} from '../../src/utils/browser-start-error.js';

test('browser still running but port never opened', () => {
  const cause = new TypeError('fetch failed');
  const error = browserNotStartedError({ exit: { exitCode: null, signal: null }, port: 3500, cause });

  assert.equal(error.message, "Browser didn't start: DevTools port 3500 did not open");
  assert.equal(error.code, BROWSER_NOT_STARTED_CODE);
  assert.equal(error.cause, cause);
  assert.equal(error.exitCode, null);
  assert.equal(error.signal, null);
  assert.equal(error.stderrTail, '');
});

test('stderr tail is attached but kept out of the message', () => {
  const error = browserNotStartedError({
    exit: { exitCode: 150, signal: null },
    port: 3500,
    cause: new Error('fetch failed'),
    stderrTail: '[ERROR:profile] cannot read Preferences\n',
  });

  assert.equal(error.message, "Browser didn't start: process exited with code 150");
  assert.equal(error.stderrTail, '[ERROR:profile] cannot read Preferences\n');
});

test('browser exited with a code', () => {
  const error = browserNotStartedError({ exit: { exitCode: 1, signal: null }, port: 3500, cause: new Error('fetch failed') });

  assert.equal(error.message, "Browser didn't start: process exited with code 1");
  assert.equal(error.exitCode, 1);
});

test('browser killed by a signal', () => {
  const error = browserNotStartedError({ exit: { exitCode: null, signal: 'SIGSEGV' }, port: 3500, cause: new Error('fetch failed') });

  assert.equal(error.message, "Browser didn't start: process was killed by SIGSEGV");
  assert.equal(error.signal, 'SIGSEGV');
});

test('output tail keeps only the last characters', () => {
  const tail = createOutputTail(10);
  tail.push('0123456789');
  tail.push(Buffer.from('abcdef'));

  assert.equal(tail.text(), '6789abcdef');
});

test('watchBrowserProcess records exit and stderr', async () => {
  const { EventEmitter } = await import('node:events');
  const child = new EventEmitter();
  child.stderr = new EventEmitter();

  const watched = watchBrowserProcess(child);
  child.stderr.emit('data', Buffer.from('[ERROR] crashed\n'));
  child.emit('exit', 139, null);

  assert.deepEqual(watched.exit, { exitCode: 139, signal: null });
  assert.equal(watched.stderr.text(), '[ERROR] crashed\n');
});

test('watchBrowserProcess without a child', () => {
  const watched = watchBrowserProcess(null);

  assert.deepEqual(watched.exit, { exitCode: null, signal: null });
  assert.equal(watched.stderr.text(), '');
});
