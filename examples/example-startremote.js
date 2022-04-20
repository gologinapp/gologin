// Usage example: in the terminal enter
// node example-startremote.js yU0token yU0Pr0f1leiD

// your token api (located in the settings, api) 
// https://github.com/gologinapp/gologin#usage
const GOLOGIN_API_TOKEN = process.argv[2];
// your profile id
const GOLOGIN_PROFILE_ID = process.argv[3];

const GoLogin = require('../gologin');

(async () =>{
    const GL = new GoLogin({  
        token: GOLOGIN_API_TOKEN,
        profile_id: GOLOGIN_PROFILE_ID,
    });
    // connection of the remote work method
    const {status, wsUrl} = await GL.startRemote();


    GOLOGIN_PROFILE_CLOUD_URL = wsUrl.split('/')[2]
    console.log('Done! Launch web browser and navigate to URL:', GOLOGIN_PROFILE_CLOUD_URL);
})();

// after running the script, the url will appear on the terminal
