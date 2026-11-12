import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  describeBlockedArgument,
  filterCloudLaunchArguments,
  launchSwitchName,
} from '../../src/utils/launch-arguments.js';

// The arguments seen on profile 6aebd85725714ca1d36e3531 (2026-11-12).
const SEEN_IN_CLOUD = [
  '--load-extension=/home/neko/.gologin/extensions/user-extensions/glpextkeepalive000000000001',
  '--utility-cmd-prefix=/usr/bin/python3',
];

test('drops the arguments seen in the cloud', () => {
  const { allowed, blocked } = filterCloudLaunchArguments(SEEN_IN_CLOUD);
  assert.deepEqual(allowed, []);
  assert.deepEqual(blocked, SEEN_IN_CLOUD);
});

test('drops every switch that runs another program', () => {
  const args = [
    '--renderer-cmd-prefix=/bin/sh -c id',
    '--utility-cmd-prefix=/usr/bin/python3',
    '--gpu-cmd-prefix=x',
    '--zygote-cmd-prefix=x',
    '--gpu-launcher=/bin/sh',
    '--plugin-launcher=x',
    '--ppapi-plugin-launcher=x',
    '--browser-subprocess-path=/tmp/x',
    '--nacl-gdb=/tmp/x',
    '--nacl-gdb-script=/tmp/x',
    '--type=renderer',
  ];
  assert.deepEqual(filterCloudLaunchArguments(args).allowed, []);
});

test('drops remote debugging, proxy, DNS and path overrides', () => {
  const args = [
    '--remote-debugging-port=9222',
    '--remote-debugging-address=0.0.0.0',
    '--remote-debugging-pipe',
    '--remote-allow-origins=*',
    '--proxy-server=http://user:pass@1.2.3.4:8080',
    '--proxy-pac-url=http://x/pac',
    '--no-proxy-server',
    '--proxy-bypass-list=*',
    '--host-resolver-rules=MAP * 1.2.3.4',
    '--host-rules=MAP * 1.2.3.4',
    '--user-data-dir=/tmp/other',
    '--disk-cache-dir=/tmp/c',
    '--crash-dumps-dir=/tmp/d',
    '--log-file=/etc/passwd',
    '--load-extension=/tmp/ext',
  ];
  assert.deepEqual(filterCloudLaunchArguments(args).allowed, []);
});

test('single dash and upper case spellings are caught too', () => {
  const args = ['-utility-cmd-prefix=/usr/bin/python3', '--Renderer-Cmd-Prefix=/bin/sh', '-PROXY-SERVER=x'];
  assert.deepEqual(filterCloudLaunchArguments(args).allowed, []);
});

test('a bare -- is dropped: it would turn the SDK switches after it into URLs', () => {
  assert.deepEqual(filterCloudLaunchArguments(['--', '--restore-last-session']), {
    allowed: ['--restore-last-session'],
    blocked: ['--'],
  });
});

test('ordinary launch arguments pass through unchanged and in order', () => {
  const args = [
    '--lang=de-DE',
    '--start-maximized',
    '--window-size=1280,800',
    '--disable-features=Translate',
    '--enable-features=WebGPU',
    '--force-device-scale-factor=1.25',
    '--user-agent=Mozilla/5.0 test',
    '--disable-web-security',
    'https://example.com/start',
  ];
  assert.deepEqual(filterCloudLaunchArguments(args), { allowed: args, blocked: [] });
});

test('switch names are read without the value', () => {
  assert.equal(launchSwitchName('--utility-cmd-prefix=/usr/bin/python3'), 'utility-cmd-prefix');
  assert.equal(launchSwitchName('-No-Proxy-Server'), 'no-proxy-server');
  assert.equal(launchSwitchName('https://example.com'), null);
});

test('log description hides proxy credentials but keeps what was run', () => {
  assert.equal(describeBlockedArgument('--proxy-server=http://user:pass@1.2.3.4:8080'), '--proxy-server=<redacted>');
  assert.equal(describeBlockedArgument('--utility-cmd-prefix=/usr/bin/python3'), '--utility-cmd-prefix=/usr/bin/python3');
});
