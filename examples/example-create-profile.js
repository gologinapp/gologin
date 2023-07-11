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
