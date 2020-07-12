var GoLogin = require('../gologin');
var webdriver = require("selenium-webdriver");
var chrome = require("selenium-webdriver/chrome");
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
    var chromeOptions = new chrome.Options();
    arguments.forEach((e) => {
      console.log('e=', e);
      chromeOptions.addArguments(e)
    });

    chromeOptions.setChromeBinaryPath('/home/mixolap/.gologin/browser/orbita-browser/chrome');

    driver = new webdriver.Builder()
                 .forBrowser("chrome")
                 .setChromeOptions(chromeOptions)
                 .build();

    await driver.get('https://myip.gologin.app/mini')
})();
