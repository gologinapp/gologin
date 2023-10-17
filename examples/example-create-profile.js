// Usage example: in the terminal enter
// node example-create-profile.js yU0token

// your token api (located in the settings, api)
// https://github.com/gologinapp/gologin#usage

import GoLogin from 'gologin';

const [_execPath, _filePath, GOLOGIN_API_TOKEN] = process.argv;

(async () => {
  const GL = new GoLogin({ token: GOLOGIN_API_TOKEN });

  // the following parameters are required for profile creation
  const profile_id = await GL.create({
    name: 'profile_mac',
    os: 'mac', // 'win', 'lin', 'android'
    // isM1: true, // for Mac M1
    navigator: {
      language: 'en-US,en;q=0.9',
      userAgent: 'random', // get random user agent for selected os
      resolution: '1024x768',
    },
    proxyEnabled: false,
    proxy: {
      mode: 'none',
    },
  });

  console.log('profile id=', profile_id);
  await GL.update({
    id: profile_id,
    name: 'profile_mac2',
  });

  const profile = await GL.getProfile(profile_id);
  console.log('new profile name=', profile.name);

  // await GL.delete(profile_id);
})();
