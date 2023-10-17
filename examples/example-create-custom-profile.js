// Usage example: in the terminal enter
// node example-create-custom-profile.js yU0token

// your token api (located in the settings, api)
// https://github.com/gologinapp/gologin#usage

import GoLogin from 'gologin';

const [_execPath, _filePath, GOLOGIN_API_TOKEN] = process.argv;

(async () => {
  const GL = new GoLogin({ token: GOLOGIN_API_TOKEN });

  const profileId = await GL.createCustom({
    os: 'win', // required param ('lin', 'mac', 'win', 'android'), for macM1 write (os: 'mac') and add property 'isM1'
    // isM1: true,
    name: 'testName',
    fingerprint: {
      autoLang: true,
      resolution: '800x400',
      language: 'de',
      dns: 'testDNS',
      hardwareConcurrency: 8,
      deviceMemory: 4, // 0.5, 1, 2, 4, 6, 8
      startUrl: 'https://testurl.com',
      googleServicesEnabled: true,
      lockEnabled: true,
      // proxy: {  // uncomment and check input if you need to use proxy
      //   mode: 'http', // 'socks4', 'socks5'
      //   host: '123.12.123.12',
      //   port: 1234,
      //   username: 'user',
      //   password: 'password',
      // },
    },
  });

  console.log('profile id=', profileId);
})();
