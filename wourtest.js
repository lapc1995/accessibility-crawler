//const Wappalyzer = require('./wappalyzer/driver.cjs')
import * as Wappalyzer from './wappalyzer/driver.cjs'
import puppeteer from 'puppeteer';


(async () => {

  const browser = await puppeteer.launch({headless: 'chrome'});
  const page = await browser.newPage();

  const wappalyzer = new Wappalyzer.default({});

  const url = 'https://www.google.com'
  await wappalyzer.init()
  const site = await wappalyzer.open(url, {});







  page.setRequestInterception(true);
  page.on('request', async (request) => {
      request.continue();
      site.onRequest(request);
  }); 


  page.on("requestfinished", (request) => {
    const response = request.response();
    let status = response.status();
  });
  
  page.on('response', async (response) => {
    site.onResponse(response);
  });
  

  await page.goto(url, { waitUntil: ['networkidle0'] });


  
  try {
 
    const results = await site.analyze(page)
    console.log(JSON.stringify(results, null, 2));
    await wappalyzer.destroy()
  
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error)
    await wappalyzer.destroy()
  }
})()