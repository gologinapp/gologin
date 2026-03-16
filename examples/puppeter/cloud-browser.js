// Gologin provides a cloud browser that can be used to run puppeteer automation.
// It will handle the browser start and close management - you just need to control the browser with puppeteer
import puppeteer from 'puppeteer-core';

const token = process.env.GL_API_TOKEN || 'your dev token here';
const profileId = 'profile ID';

const CLOUD_BROWSER_URL = `https://cloudbrowser.gologin.com/connect?token=${token}&profile=${profileId}`;
const STOP_PROFILE_URL = `https://api.gologin.com/browser/${profileId}/web`;

async function stopProfile() {
  await fetch(STOP_PROFILE_URL, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function main() {
  const response = await fetch(CLOUD_BROWSER_URL);

  if (!response.ok) {
    const errorReason = response.headers.get('X-Error-Reason');
    throw new Error(`Failed to start cloud browser: ${errorReason ?? response.statusText}`);
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: CLOUD_BROWSER_URL,
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();

  await page.goto('https://iphey.com/', { waitUntil: 'networkidle2' });
  const status = await page.$eval('.trustworthy:not(.hide)',
    (elt) => elt?.innerText?.trim(),
  );

  return status;
}

main().catch(console.error).finally(stopProfile);
