// Gologin provides a cloud browser that can be used to run puppeteer aytomation.
// It will handle the browser start and close management - you just need to control the browser with pupputter
import { GologinApi } from 'gologin';

const token = process.env.GL_API_TOKEN || 'your dev token here';
const gologin = GologinApi({
  token,
});

async function main() {
  const { browser } = await gologin.launch({
    cloud: true,
    // pass profileId parameter if you want to run particular profile
    // profileId: 'your profileId here',
  });

  const page = await browser.newPage();

  await page.goto('https://iphey.com/', { waitUntil: 'networkidle2' });
  const status = await page.$eval('.trustworthy:not(.hide)',
    (elt) => elt?.innerText?.trim(),
  );

  console.log('status', status);

  return status;
}

main().catch(console.error)
  .finally(gologin.exit);
