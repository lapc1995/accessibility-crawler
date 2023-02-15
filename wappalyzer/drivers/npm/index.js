const Wappalyzer = require('./driver');
const puppeteer = require('puppeteer')

const url = 'https://www.amazon.co.uk/';




const options = {
  debug: false,
  delay: 500,
  headers: {},
  maxDepth: 3,
  maxUrls: 1,
  maxWait: 5000,
  recursive: true,
  probe: true,
  proxy: false,
  userAgent: 'Wappalyzer',
  htmlMaxCols: 2000,
  htmlMaxRows: 2000,
  noScripts: false,
  noRedirect: false,
};

const wappalyzer = new Wappalyzer(options)

;(async function() {
  try {



    const report = []
    const browser = await puppeteer.launch({headless: 'chrome'});
    
    const page = await browser.newPage();
    page.setRequestInterception(true);
    page.on('request', (request) => {
      request.continue();
    }); 
    page.on("requestfinished", (request) => {
    const response = request.response();
      status = response.status();
    });
    
    let gotoResponse = null;
    try {
    gotoResponse = await page.goto(url, { waitUntil: ['networkidle0'] });
    } catch(e) {
      return {url, error: e.message, filename: generateFilename(url, Date.now()) };
    }
    
    if(status == "404") {
      return {url, error: "404", filename: generateFilename(url, Date.now()) };
    }
    


    //await wappalyzer.init()

    // Optionally set additional request headers
    const headers = {};

    const site = await wappalyzer.open(url, headers, page);

    // Optionally capture and output errors
    site.on('error', console.error);

    const results = await site.analyze(page);



    console.log(JSON.stringify(results, null, 2))

    console.log(results.technologies.length);
  } catch (error) {
    console.error(error)
  }

  await wappalyzer.destroy()

})()