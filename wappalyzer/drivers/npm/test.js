const Wappalyzer = require('./driver');
const puppeteer = require('puppeteer')

//const StealthPlugin = require('puppeteer-extra-plugin-stealth')
//puppeteer.use(StealthPlugin())

exports.execute = async (url) => {

    const options = {
      debug: true,
      delay: 500,
      headers: {},
      maxDepth: 3,
      maxUrls: 1,
      maxWait: 30000,
      recursive: true,
      probe: true,
      proxy: false,
      userAgent: 'Wappalyzer',
      htmlMaxCols: 2000,
      htmlMaxRows: 2000,
      noScripts: false,
      noRedirect: false,
    };

    let page = null;

    const wappalyzer = new Wappalyzer(options)
    let results;
    let browser;
    
      try {
        let site = null;
        browser = await puppeteer.launch({
            headless: 'chrome',
            ignoreHTTPSErrors: true,
            acceptInsecureCerts: true,
            
            args: [
                '--single-process',
                '--no-sandbox',
                '--no-zygote',
                '--disable-gpu',
                '--ignore-certificate-errors',
                '--allow-running-insecure-content',
                '--disable-web-security',
                '--user-data-dir=/tmp/chromium'
            ]
        });

        page = await browser.newPage();
       
        page.setRequestInterception(true);

        
        page.on('request', async (request) => {
            //console.log("request");
            await site.OnRequest(request, page);
        }); 
        
        page.on('response', async (response) => {
            //console.log("response");
            await site.OnResponse(response, page);
        });
        
        await page.setViewport({ width: 1280, height: 720 });

        site = await wappalyzer.open(url, {}, page);
    
        // Optionally capture and output errors
        site.on('error', console.error);

        let gotoResponse = null;
        try {
            gotoResponse = await page.goto(url, { waitUntil: ['networkidle0']});
            //await page.screenshot({path: `file${Date.now()}M.jpg`, fullPage: false});
        } catch(e) {
            console.log(e);
            return null;
        }
        
        results = await site.analyze(page);
    
      } catch (error) {
        console.error("tttt")
        console.error(error)
      }
    
      await wappalyzer.destroy();

      await browser.close();

      console.log("results", results);

      return results.technologies;
    
}
