// Usage example: in the terminal enter
// node example-stopremote.js yU0token yU0Pr0f1leiD

// your token api (located in the settings, api)
// https://github.com/gologinapp/gologin#usage
import GoLogin from '../gologin.js';

const GOLOGIN_API_TOKEN = process.argv[2];
// your profile id
const GOLOGIN_PROFILE_ID = process.argv[3];

(async () => {
  const GL = new GoLogin({
    token: GOLOGIN_API_TOKEN,
    profile_id: GOLOGIN_PROFILE_ID,
  });

  // stop profile
  await GL.stopRemote();
})();
