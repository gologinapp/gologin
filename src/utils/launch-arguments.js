// Profile launch arguments (profile.launchArguments) are free text set by the user and
// appended to Orbita's command line. In GoLogin's cloud browser that command line runs
// on our servers, so some switches must not come from the user:
//  - switches that make Chrome run another program in place of its own processes
//    (with --no-sandbox that is arbitrary command execution inside the pod),
//  - remote debugging / DevTools access, which the cloud sets up itself,
//  - proxy and DNS overrides, which would bypass the profile's proxy,
//  - filesystem paths (profile dir, cache, logs, extensions loaded from a path).
// Chrome uses the last value of a repeated switch, so a user switch would also override
// the SDK's own. Only applied when the SDK runs with isCloudBrowser: true.

const BLOCKED_SWITCHES = new Set([
  'browser-subprocess-path',
  'type',
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address',
  'remote-debugging-io-pipes',
  'remote-debugging-targets',
  'remote-allow-origins',
  'proxy-server',
  'proxy-pac-url',
  'no-proxy-server',
  'proxy-bypass-list',
  'proxy-auto-detect',
  'host-resolver-rules',
  'host-rules',
  'user-data-dir',
  'disk-cache-dir',
  'crash-dumps-dir',
  'log-file',
  'load-extension',
]);

// Any switch that wraps or replaces a child process launch:
// --renderer-cmd-prefix, --utility-cmd-prefix, --gpu-launcher, --ppapi-plugin-launcher, ...
const BLOCKED_SWITCH_PATTERNS = [/-cmd-prefix$/, /-launcher$/, /^nacl-gdb/];

// Chrome on Linux accepts both "--name" and "-name"; switch names are case-sensitive
// there, but lowercase them so no spelling slips through.
export const launchSwitchName = (arg) => {
  const match = /^--?([^=]+)/.exec(arg);

  return match ? match[1].trim().toLowerCase() : null;
};

const isBlockedSwitch = (name) =>
  BLOCKED_SWITCHES.has(name) || BLOCKED_SWITCH_PATTERNS.some((pattern) => pattern.test(name));

// Returns the arguments that may be passed to Chrome and the ones that were removed.
// A bare "--" is removed too: Chrome would treat every argument after it, including the
// SDK's own switches, as a URL.
export const filterCloudLaunchArguments = (args) => {
  const allowed = [];
  const blocked = [];
  for (const arg of args) {
    if (arg === '--') {
      blocked.push(arg);
      continue;
    }

    const name = launchSwitchName(arg);
    if (name !== null && isBlockedSwitch(name)) {
      blocked.push(arg);
      continue;
    }

    allowed.push(arg);
  }

  return { allowed, blocked };
};

// For logs: keep what was tried (e.g. which program a *-cmd-prefix pointed at), but not
// proxy credentials.
export const describeBlockedArgument = (arg) => {
  const name = launchSwitchName(arg);
  if (name && /proxy|host-rules|host-resolver-rules/.test(name) && arg.includes('=')) {
    return `${arg.slice(0, arg.indexOf('='))}=<redacted>`;
  }

  return arg;
};
