import { GologinApi } from '../../src/gologin-api.js';

const token = process.env.GL_API_TOKEN;
const profileId = process.env.GOLOGIN_PROFILE_ID;

if (!token) {
  console.error('GL_API_TOKEN environment variable is required');
  process.exit(1);
}

const gologin = GologinApi({ token });

async function runTest(testName, testFunction) {
  console.log(`\n🧪 Running test: ${testName}`);
  const startTime = Date.now();

  try {
    const result = await testFunction();
    const duration = Date.now() - startTime;
    console.log(`✅ ${testName} passed (${duration}ms)`);

    return { name: testName, status: 'passed', duration, result };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ ${testName} failed (${duration}ms):`, error.message);

    return { name: testName, status: 'failed', duration, error: error.message };
  }
}

async function testIpCheck() {
  const { browser } = await gologin.launch({
    profileId,
    extra_params: ['--headless', '--no-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('https://iphey.com/', { waitUntil: 'networkidle2' });

  // Wait for the page to load completely
  await page.waitForSelector('.trustworthy:not(.hide)', { timeout: 30000 });

  const status = await page.$eval('.trustworthy:not(.hide)',
    (elt) => elt?.innerText?.trim(),
  );

  await browser.close();

  if (!status) {
    throw new Error('Could not get IP check status');
  }

  return `IP check status: ${status}`;
}

async function main() {
  console.log('🚀 Starting E2E tests...');

  const tests = [
    ['IP Check Test', testIpCheck],
  ];

  const results = [];

  for (const [name, testFn] of tests) {
    const result = await runTest(name, testFn);
    results.push(result);
  }
}

main()
  .catch(console.error)
  .finally(() => gologin.exit());
