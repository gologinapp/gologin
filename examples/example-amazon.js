const puppeteer = require('puppeteer-core');
const GoLogin = require('../gologin');

(async () =>{
    const GL = new GoLogin({
        token: 'yU0token',
        profile_id: 'yU0Pr0f1leiD',
        executablePath: '/usr/bin/orbita-browser/chrome',
    });
    const wsUrl = await GL.start(); 
    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl.toString(), 
        ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.goto('https://www.amazon.com/-/dp/B07GRM747Y');   
    const content = await page.content();
    const matchData = content.match(/'initial': (.*)}/);
    if(matchData == null || matchData.length==0){
        console.log('no images found');
    } else {
        const data = JSON.parse(matchData[1]);
        const images = data.map( e => e.hiRes);
        console.log('images=', images);
    }
    await browser.close();
    await GL.stop();
})();
