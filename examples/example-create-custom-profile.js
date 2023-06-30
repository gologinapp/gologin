import GoLogin from '../src/gologin.js';

(async () => {
  const GL = new GoLogin({
    token: 'yU0token',
  });

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
      proxy: {
        mode: 'http',
        host: '123.12.123.12',
        port: 1234,
        username: 'user',
        password: 'password',
      },
    },
  });

  console.log('profile id=', profileId);
})();
