const puppeteer = require('puppeteer-core');
const GoLogin = require('../gologin');

(async () =>{
    const GL = new GoLogin({
        token: 'yU0token',
        profile_id: 'yU0Pr0f1leiD',
    });
    const {status, wsUrl} = await GL.startRemote(); 
    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl, 
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
    await GL.stopRemote();
})();
