// You need to create profile add proxy, use it with puppetter and then delete it
import { GologinApi } from '../../src/gologin-api.js';

const token = process.env.GL_API_TOKEN || 'your dev token here';
const gologin = GologinApi({
  token,
});

async function main() {
  const profile = await gologin.createProfileRandomFingerprint();
  const profileId = profile.id;
  await gologin.addGologinProxyToProfile(profileId, 'US');

  const { browser } = await gologin.launch({ profileId });
  const page = await browser.newPage();

  await page.goto('https://iphey.com/', { waitUntil: 'networkidle2' });
  const status = await page.$eval('.trustworthy:not(.hide)',
    (elt) => elt?.innerText?.trim(),
  );

  await new Promise((resolve) => setTimeout(resolve, 10000));
  console.log('status', status);

  await gologin.deleteProfile(profileId);

  return status;
}

main().catch(console.error)
  .finally(gologin.exit);
