
const { default: GoLogin } = await import("./gologin.js");
const { connect } = await import("puppeteer");


export function getDefaultParams() {
  return {
    token: process.env.GL_API_TOKEN,
    profile_id: process.env.GL_PROFILE_ID,
    executablePath: process.env.GL_EXECUTABLE_PATH,
  }
}

const createLegacyGologin = (params) => {
  const defaults = getDefaultParams()
  new GoLogin({
    ...defaults,
    ...params,
  });
}

export const delay = (ms = 250) => new Promise(res => setTimeout(res, ms));

function GologinApi(params) {
  let browsers = [];
  let legacyGls = [];

  return {
    async launch() {
      const legacyGologin = createLegacyGologin(params)
      const started = await legacyGologin.startLocal()
      console.debug({ started })
      const browser = await connect({
        browserWSEndpoint: started.wsUrl,
        ignoreHTTPSErrors: true,
      });
      browsers.push(browser)
      return browser;
    },

    async page(url, params) {
      let browser = await this.launch()
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'networkidle2' })
      return { page, browser, session }
    },

    async downloadProfile(params) {
      if (!params.id) {
        throw new Error("Missing profile id")
      }
      throw new Error("Not implemented yet")
    },

    async createProfile(params) {
      if (params.proxy) {
        if (typeof params.proxy === 'string') {

        }
      }
      return params
    },

    async exit(status = 0) {
      Promise.allSettled(browsers.map(browser => browser.close()))
      Promise.allSettled(legacyGls.map(gl => gl.stopLocal({ posting: false })))
      process.exit(status)
    },

    delay
  }
}

export default GologinApi