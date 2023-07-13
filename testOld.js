import Wappalyzer from 'wappalyzer';
import { getTechnologies, analyzeHeader, analyseRequest } from './wappalyzerMiddleware.js'
import puppeteer from 'puppeteer';

const url = "https://developer.mozilla.org/en-US/docs/Web/API/URL/URL";//'https://www.amazon.com';


const runOriginal = async (url) => { 

    const wappalyzer = new Wappalyzer();

    const options = {
        debug: false,
        delay: 500,
        headers: {},
        maxDepth: 3,
        maxUrls: 10,
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

    let technologiesCount = 0;
    let names;

    try {
        await wappalyzer.init()

        // Optionally set additional request headers
        const headers = {}

        const site = await wappalyzer.open(url, headers)

        // Optionally capture and output errors
        site.on('error', console.error)

        const results = await site.analyze()

        technologiesCount = results.technologies.length;

        names = results.technologies.map(x => x.name);



        //console.log(JSON.stringify(results, null, 2))
    } catch (error) {
        console.error(error)
    }

    await wappalyzer.destroy();

    return names;
}

const runOurs = async (url) => {

    const browser = await puppeteer.launch({headless: 'chrome'});


    const page = await browser.newPage();

    let status;

    page.setRequestInterception(true);
    page.on('request', async (request) => {
        await analyseRequest(request, url);
        request.continue();
    }); 
    page.on("requestfinished", (request) => {
    const response = request.response();
    status = response.status();
    });
    
    page.on('response', async (response) => {
        await analyzeHeader(response, url);
    });
    
  
    await page.goto(url, { waitUntil: ['networkidle0'] });


    var html = await page.evaluate(
        () =>  document.querySelector('*').outerHTML
    );
    var technologies = await getTechnologies(page, html);

    var names = technologies.map(x => x.name);

    await browser.close();

    return names;
}

const compareTechnologies = (originalNames, oursNames) => {

    const found = originalNames.filter(x => oursNames.includes(x));
    const missing = originalNames.filter(x => !oursNames.includes(x));
    const extra = oursNames.filter(x => !originalNames.includes(x));

    console.log("Found:", found);
    console.log("Original extras:", missing);
    console.log("Ours extras:", extra);
}


(async function() {
    const originalResult = await runOriginal(url);
    const oursResult = await runOurs(url);
    compareTechnologies(originalResult, oursResult);
})();



