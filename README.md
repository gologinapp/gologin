# GoLogin Node.js SDK
 This package provides functionality to run and stop GoLogin profiles with node.js and then connect the profiles to automation tools like Selenium, Puppetteer, Playwright etc.

# How does it work?
 1. You give SDK your dev token and profile id that you want to run
 2. SDK takes care of downloading, preparing your profile and starts the browser
 3. SDK gives you websocket url for automation tools
 4. You take this websocker url and connect it to the automation tool on your choice: Puppetteer, Selenium, Playwright etc
 5. Automation tool connects to browser and you can manage it through code

## Getting Started

Where is token? API token is <a href="https://app.gologin.com/#/personalArea/TokenApi" target="_blank">here</a>.

![Token API in Settings](https://user-images.githubusercontent.com/12957968/146891933-c3b60b4d-c850-47a5-8adf-bc8c37372664.gif)


### Installation

`npm i gologin`

### Example

```js
import { GologinApi } from './src/gologin-api.js';

const GL = GologinApi({
  token: 'your token',
});

const profile = await GL.createProfileRandomFingerprint('some name');
const profileId = profile.id;

await GL.addGologinProxyToProfile(profileId, 'us');
const browser = await GL.launch({ profileId });
const page = await browser.newPage();
await page.goto('https://linkedin.com');
await new Promise((resolve) => setTimeout(resolve, 5000));
await browser.close();
await GL.stop();
```

###
### Methods
#### constructor

Required options:
- `token` <[string]> **Required** - your API <a href="https://gologin.com/#/personalArea/TokenApi" target="_blank">token</a>

Optional options:
- `profile_id` <[string]> - profile ID (NOT PROFILE NAME) will be generated if not specified
- `executablePath` <[string]> path to executable Orbita file. Orbita will be downloaded automatically if not specified
- `extra_params` arrayof <[string]> additional flags for browser start. For example: '--headles', '--load-extentions=path/to/extension'
- `uploadCookiesToServer` <[boolean]> upload cookies to server after profile stopping (default false). It allows you to export cookies from api later.
- `writeCookesFromServer` <[boolean]> if you have predefined cookies and you want browser to import it (default true).
- `tmpdir` <[string]> absolute path to the directtory where you want to store user-data-dir. Default path in tmp folder will be picked if no specified
- `vncPort` <[integer]> port of VNC server if you using it

```js
const GL = new GoLogin({
    token: 'your token',
    profile_id: 'profile id',
    extra_params: ["--headless", "--load-extentions=path/to/extension"]
});
```

#### createProfileRandomFingerprint - you pass os ('lin', 'win', 'mac') and profile name and we give you brand new shiny profile
```js
const GL = new GoLogin({
    token: 'your token',
    profile_id: 'profile id',
    extra_params: ["--headless", "--load-extentions=path/to/extension"]
});
const profile = await gl.createProfileRandomFingerprint("some name")
const profileId = profile.id
```


#### createProfileWithCustomParams - This method creates a profile and you can pass any particular params to it. Full list of params you can find here - https://api.gologin.com/docs
```js
const GL = GoLogin({
	"token": "your token",
	})
const profile = await gl.createProfileWithCustomParams({
    "os": "lin",
    "name": "some name",
    "navigator": {
        "userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "resolution": "1920x1080",
        "language": "en-US",
        "platform": "Linux x86_64",
        "hardwareConcurrency": 8,
        "deviceMemory": 8,
        "maxTouchPoints": 0
    }
})
const profileId = profile.id
```

#### updateUserAgentToLatestBrowser - user agent is one of the most important thing in your fingerprint. It decides which browser version to run. This method help you to keep useragent up to date.
```js
const GL = GoLogin({
	"token": "your token",
	})
await GL.updateUserAgentToLatestBrowser(["profineId1", "profileId2"], "workspceId(optional)")
```

#### addGologinProxyToProfile - Gologin provides high quality proxies with free traffic for paid users. Here you can add gologin proxy to profile, just pass country code
```js
const GL = GoLogin({
	"token": "your token",
	})
await GL.addGologinProxyToProfile("profileId", "us")
```

#### addCookiesToProfile - You can pass cookies to the profile and browser will import it before starting
```js
const GL = GoLogin({
	"token": "your token",
	})

await GL.addCookiesToProfile("profileId", [
    {
        "name": "session_id",
        "value": "abc123",
        "domain": "example.com",
        "path": "/",
        "expirationDate": 1719161018.307793,
        "httpOnly": True,
        "secure": True
    },
    {
        "name": "user_preferences",
        "value": "dark_mode",
        "domain": "example.com",
        "path": "/settings",
        "sameSite": "lax"
    }
])
```

#### refreshProfilesFingerprint - Replaces your profile fingerprint with a new one
```js
const GL = GoLogin({
	"token": "your token",
	})

await GL.refreshProfilesFingerprint(["profileId1", "profileId2"])
```

#### changeProfileProxy - allows you to set a proxy to a profile
```js
const GL = GoLogin({
	"token": "your token",
	})
await GL.changeProfileProxy("profileId", { "mode": "http", "host": "somehost.com", "port": 109, "username": "someusername", "password": "somepassword"})
```

#### launch() - starts browser with profile id, returning WebSocket url for puppeteer
```js
const GL = GoLogin({
	"token": "your token",
	})
await GL.launch({ profileId: 'some profileId' })
```


#### exit() stops browser and uploads it to the storage
```js
const GL = GoLogin({
	"token": "your token",
	})
await GL.launch({ profileId: 'some profileId' })
await GL.exit()
```


### DEBUG

For debugging use `DEBUG=* node example.js` command

### Selenium

To use GoLogin with Selenium see  `selenium/example.js`

## Full GoLogin API
<a href="https://gologin.com/docs/api-reference/profile/get-all-profiles" target="_blank">Gologin Api Documentation</a>

## Python support

<a href="https://github.com/pyppeteer/pyppeteer" target="_blank">pyppeteer</a> (recommend) and <a href="https://www.selenium.dev" target="_blank">Selenium</a> supported (see file gologin.py)

for Selenium may need download <a href="https://chromedriver.chromium.org/downloads" target="_blank">webdriver</a>
