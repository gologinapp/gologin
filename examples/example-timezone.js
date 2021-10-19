const puppeteer = require('puppeteer-core');
const GoLogin = require('../gologin');

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () =>{
    const GL = new GoLogin({
        token: 'yU0token',
        profile_id: 'yU0Pr0f1leiD',
        timezone: {
            ip:'1.1.1.1',
            timezone:'Europe/Amsterdam',
            accuracy:100,
            ll: ['52.3759','4.8975'],
            country: 'NL',
            city: 'Amsterdam',
            stateProv:'',
        }
    });

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

    await page.goto('https://myip.link');   

    await delay(60000)
    await browser.close();
    await GL.stop();
})();
