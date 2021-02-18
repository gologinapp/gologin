const puppeteer = require('puppeteer-core');
const GoLogin = require('../gologin');

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () =>{
    const GL = new GoLogin({
        token: 'yU0token',
    });
    
    // next parameters are required for creating

    const profile_id = await GL.create({
        name: 'profile_mac',
        os: 'mac',
        navigator: {
            language: 'enUS',
            userAgent: 'MyUserAgent',
            resolution: '1024x768',
            platform: 'mac',
        }
    });

    console.log('profile id=', profile_id);

    await GL.update({
        id: profile_id,
        name: 'profile_mac2',
    });

    const profile = await GL.getProfile(profile_id);

    console.log('new profile name=', profile.name);

    //await GL.delete(profile_id);
})();
