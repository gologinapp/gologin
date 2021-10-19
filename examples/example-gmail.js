const puppeteer = require('puppeteer-core');
const GoLogin = require('../gologin');

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () =>{
    const GL = new GoLogin({
        token: 'yU0token',
    });

    const profile_id = await GL.create({
        name: 'profile_gmail',
        os: 'lin',
        navigator: {
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36',
            resolution: '1280x720',
            language: 'en-GB,en-US;q=0.9,en;q=0.8',
            platform: 'Linux x86_64',
            hardwareConcurrency: 8,
            deviceMemory: 8,
            maxTouchPoints: 5,
        },
        proxy: {
            mode: 'http',
            host: 'proxy_host',
            port: 'proxy_port',
            username: 'proxy_username',
            password: 'proxy_password',
        }
    });

    console.log('profile id=', profile_id);
    GL.setProfileId(profile_id);

    const {status, wsUrl} = await GL.start(); 
    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl.toString(), 
        ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    const viewPort = GL.getViewPort();
    await page.setViewport({ width: Math.round(viewPort.width * 0.994), height: Math.round(viewPort.height * 0.92) });
    const session = await page.target().createCDPSession();
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', { windowId, bounds: viewPort });
    await session.detach();
    
    await page.goto('https://gmail.com');   
    await delay(1000);
    await page.goto('https://accounts.google.com/signup/v2?service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2F&flowName=GlifWebSignIn&flowEntry=SignUp');
    await delay(3000);
    await page.type('#firstName', 'first_name', { delay: 100 });
    await page.type('#lastName', 'last_name', { delay: 100 });
    await page.type('#username', 'username', { delay: 100 });
    await page.type('[name=Passwd]', 'pa$$w0rd', { delay: 100 });
    await page.type('[name=ConfirmPasswd]', 'pa$$w0rd', { delay: 100 });
    await page.click('#accountDetailsNext > div > button');

    await delay(60000)
    await browser.close();
    await GL.stop();
})();
