var GoLogin = require('../gologin');
var webdriver = require("selenium-webdriver");
var chrome = require("selenium-webdriver/chrome");
chrome.setDefaultService(new chrome.ServiceBuilder('./chromedriver').build());
 

(async () =>{
    const GL = new GoLogin({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ZTFjOWIwZTc5MmEyMDQ5MjhhZDU3ZDAiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI1ZTkwZDViYTZiNmE5YTRjZGI2ODc1YTgifQ.jbQ-iuojv6Vijt82i7LrOBy46b4Kpxir5-E9sXntrqY',
        profile_id: '5eef762508f527445e8f0f5f',
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
