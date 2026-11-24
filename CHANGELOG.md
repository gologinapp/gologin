# Changelog

Combined changelog for GoLogin node.js SDK

## [3.0.11] 2026-11-24

### Features

* The `Browser didn't start: ...` error now has a `stderrTail` property with the browser's last 4 KB of stderr, so callers can log why the browser exited. It is not part of the error message. Empty when the browser printed nothing

## [3.0.10] 2026-11-24

### Fixes

* A language set by the user (language not filled from IP) is now written to the browser's language settings (`intl` in `orbita.config`). Before, `"en-US"` was written there as a plain string, so the browser ignored the user's language and used the language stored in the profile, usually English. The profile's `navigator.language` is no longer overwritten with `en-US` during start
* When language is filled from IP but the IP check returns no languages, the browser now gets English language settings in the correct format instead of the plain string `"en-US"`
* On Linux, the browser's interface and `Intl` locale now follow the profile language: the SDK sets `LANGUAGE` for the browser process, because Linux Chromium ignores `--lang` and reads the locale from the environment

## [3.0.9] 2026-11-23

### Features

* Storage gateway URLs for profile download and upload are now taken from the API (`storageInfo.storageLink` and `storageGateway.url`) instead of being hardcoded; the default fallback is now `https://files-gateway.gologin.com`

### Fixes

* `stop()` no longer crashes when `uploadCookiesToServer` is on and the `update_after_close` request fails
* When the browser is launched but never opens its DevTools port, `start()` now fails with `Browser didn't start: ...` instead of `fetch failed`. The message says whether the process exited (with its exit code), was killed (with the signal), or kept running without opening the port. The error has `code: 'BROWSER_NOT_STARTED'`, `exitCode` and `signal`, and keeps the original error as `cause`. The browser's last 4 KB of stderr is logged to the console when this happens

## [3.0.8] 2026-11-12

### Features

* Added `isCloudBrowser` option for GoLogin cloud browser. When enabled, profile `launchArguments` that run other programs (`*-cmd-prefix`, `*-launcher`, `--browser-subprocess-path`), open remote debugging, override the proxy or DNS, or point at paths (`--user-data-dir`, `--load-extension`, ...) are dropped and logged with proxy values redacted. Off by default; local launches are unchanged

## [3.0.7] 2026-10-15

### Fixes

* Keep IndexedDB in the profile when `storage.indexedDb` is enabled

## [3.0.6] 2026-10-06

### Fixes

* Pass user-defined timezone and language to browser start when they are not filled from IP
* Removed the macOS override that forced the browser language to en-US

## [3.0.4] 2026-09-04

### Fixes

* Fixed proxy request timeout not aborting hung TCP connects during timezone checks
* Reduced default proxy check timeout to 10s and attempts to 2

## [3.0.3] 2026-08-03

### Fixes

* Fixed Chrome extensions download race when the same extension IDs are listed in both `chromeExtensions` and `userChromeExtensions`
* Made extension archive deletion ignore missing files (`ENOENT`) during parallel extract cleanup

### Features

* Added profile start step timings via `debug` (`DEBUG=gologin`)

## [3.0.2] 2026-07-29

### Features

* Added `customChromeFrame` option to control writing `browser.custom_chrome_frame: false` into profile Preferences

## [3.0.1] 2026-07-28

### Fixes

* Fixed crash when profile user agent is malformed and `executablePath` is set

## [3.0.0] 2026-06-24

### Features

* Impoved package initialization speed and profile start speed
* Replaced request npm package with native fetch


## [2.2.9] 2026-06-08

### Fixes

* Disabled fonts downloading which was throwing errors
* Type fixes
* Added Proxy Error message to socks5 proxies check fails
* Added (Gologin) prefix where gologin proxies failed
* Profile start timing optimization

## [2.2.7] 2026-02-06

### Fixes

* Fix error on attempt to add proxy using `addGologinProxyToProfile`
* Bookmarks fixes

## [2.2.6] 2026-02-05


### Fixes

* Bookmarks writing on lower versions of orbita

## [2.2.5] 2026-02-05


### Fixes

* Bookmarks reading on lower versions of orbita

## [2.2.4] 2026-02-05


### Fixes

* Improved bookmarks and extensions syncronization with db

## [2.2.3] 2026-02-02


### Fixes

* Assert syntax fix for higher node.js versions

### New

* Secured Orbita launch

## [2.2.1] 2026-01-20


Combined changelog for GoLogin node.js SDK

## [2.1.34] 2025-09-11


### Fixes

* Errors grouping for internal uses

## [2.1.33] 2025-09-11


### Fixes

* Orbita download doesnt interupts while opening two profiles in parallel
* Error gathering changes

## [2.1.32] 2025-09-11


### Fixes

* Custom extension downloading now works correctly

## [2.1.31] 2025-09-01


### Fixes

* Orbita downloading doesnt break the flow if major version is skipped
* Languages passing now works correctly

## [2.1.29] 2025-07-11


### Fixes

* Free proxy support on orbita 135+

## [2.1.28] 2025-07-10


### Fixes

* Added removing Sync Data folder to prevent crashes

## [2.1.27] 2025-07-10


### New

* Added possibility to change proxy check timeout

## [2.1.26] 2025-07-02


### Fixes

* Socks 5 proxy passing

## [2.1.24] 2025-06-16


### Fixes

* Error running profile with proxies
* Proxy passing in orbita 135 

## [2.1.23] 2025-06-09


### Fixes

* Viewport of puppeteer complies with profile resolution

### New

* Added fallback url for blocked countries

### Miscellaneous Chores

* Added sentry to have information about errors that users face


## [2.1.21] 2025-04-23


### Miscellaneous Chores

* Deleted old exmaples and added new one that up to date
* Added changelog to track changes
