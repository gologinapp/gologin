const GoLogin = require('../gologin');
const webdriver = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
chrome.setDefaultService(new chrome.ServiceBuilder('./chromedriver').build());
 

(async () =>{
    const GL = new GoLogin({
        token: 'yU0token',
        profile_id: 'yU0Pr0f1leiD',
        executablePath: '/usr/bin/orbita-browser/chrome',
    });
    console.log('creating startup')
    await GL.createStartup();
    console.log('spawn arguments')
    const arguments = await GL.spawnArguments();
    console.log('set options')
    const chromeOptions = new chrome.Options();
    arguments.forEach((e) => {
      console.log('e=', e);
      chromeOptions.addArguments(e)
    });

    chromeOptions.setChromeBinaryPath('/usr/bin/orbita-browser/chrome');

    driver = new webdriver.Builder()
                 .forBrowser("chrome")
                 .setChromeOptions(chromeOptions)
                 .build();

    await driver.get('https://myip.link')
})();
