import GoLogin from '../src/gologin.js';

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () => {
  const GL = new GoLogin({
    token: 'yU0token',
  });

  // next parameters are required for creating

  const profile_id = await GL.create({
    name: 'profile_mac',
    os: 'mac', // 'win', 'lin', 'android'
    // isM1: true, // for Mac M1
    navigator: {
      language: 'en-US',
      userAgent: 'random', // get random user agent for selected os
      resolution: '1024x768',
      platform: 'MacIntel', // 'Win32' for Windows, 'Linux x86_64' for Linux, 'Linux armv81' - for Android
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
