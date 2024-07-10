import { GologinApi, exitAll } from '../src/gologin-api.js';

const token = process.env.GL_API_TOKEN; // get token https://app.gologin.com/personalArea/TokenApi
const gologin = GologinApi({ token });

async function main() {
  const { browser } = await gologin.launch();
  const page = await browser.newPage();
  await page.goto('https://iphey.com/', { waitUntil: 'networkidle2' });
  const status = await page.$eval('.trustworthy-status:not(.hide)', (elt) =>
    elt?.innerText?.trim(),
  );

  return status; // Expecting 'Trustworthy'
}

main().catch(console.error).then(console.info).finally(exitAll);
