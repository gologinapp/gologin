import GoLogin from '../gologin.js';

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () => {
  const GL = new GoLogin({
    token: 'yU0token',
  });

  // next parameters are required for creating

  const profile_id = await GL.create({
    name: 'profile_mac',
    os: 'mac',
    navigator: {
      language: 'enUS',
      userAgent: 'random', // get random user agent for selected os
      resolution: '1024x768',
      platform: 'mac',
    },
    proxyEnabled: false,
    proxy: {
      mode: 'none',
    }
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
