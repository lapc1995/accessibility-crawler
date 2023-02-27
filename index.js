import puppeteer from 'puppeteer';
import {AxePuppeteer} from '@axe-core/puppeteer';
import * as path from 'path';
import jsonfile from 'jsonfile';
import {oraPromise} from 'ora';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { response } from 'express';
import csvParser from 'csv-parser';

import * as dotenv from 'dotenv'
dotenv.config()

import { getTechnologies } from './wappalyzerMiddleware.js'


import archiver from 'archiver';

import Wappalyzer from './wappalyzer/drivers/npm/driver.js'


let chunkSize = 5;

const sliceIntoChunks = (arr, chunkSize) => {
  const res = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
      const chunk = arr.slice(i, i + chunkSize);
      res.push(chunk);
  }
  return res;
}


const startGeneratingReports = async (websites) => {

const browser = await puppeteer.launch({headless: 'chrome'});
  for (const website of websites) {
    var start = new Date()
    const data = await getReportForURLParallel(website.domain, browser);
    SaveReportToJSONFile(data);
    var end = new Date() - start;
    console.info('Execution time: %dms', end);
  }
  await browser.close();
}

const GenerateReportAndSaveInFile = async(url, browser) => {
  const data = await getReportForURLParallel(url, browser);
  SaveReportToJSONFile(data);
}

const BatchGenerateReport = async(websites) => {
  const report = []
  const browser = await puppeteer.launch({headless: 'chrome'});
  for (const website of websites) {
    report.push(GenerateReportAndSaveInFile(website.Domain, browser));
  }
  await Promise.all(report);
  await browser.close();
}

const readWebsiteCSV = async(filename) => {
  const readCSV = new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filename)
    .pipe(csvParser())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      resolve(results);
    });
  });

  var result = await readCSV;
  return result;
} 

const getAccessibilityReport = async(page) => {
  console.log("getAccessibilityReport");
  let results = await new AxePuppeteer(page).analyze();
  delete results.inapplicable;

  results = cleanAccessaibilityReport(results);

  return results;
}

const getExternalJavacript = async(page) => {
  const externalJavascript = [];
  let scripts = await page.$$('script');
  for (const script of scripts) {
    var src = await script.evaluate( node => node.getAttribute("src"));
    if(src != null)  {
      externalJavascript.push(src);
    }
  }
  return externalJavascript;
}

const getExternalCSS = async(page) => {
  const externalCSS = []
  let links = await page.$$('link');
  for (const link of links) {
    var rel = await link.evaluate( node => node.getAttribute("rel"));
    if(rel != null && rel == "stylesheet")  {
      var href = await link.evaluate( node => node.getAttribute("href"));
      if(href != null) {
        externalCSS.push(href);
      }
    }
  }
  return externalCSS;
}

const getHTML = async(page) => {
  const html = await page.evaluate(
    () =>  document.querySelector('*').outerHTML
  );
  return html;
}

const getImages = async(page) => {
  const images = []
  let imagesElements = await page.$$('img');
  for (const image of imagesElements) {
    var alt = await image.evaluate( node => node.getAttribute("alt"));
    var src = await image.evaluate( node => node.getAttribute("src"));
    if(alt != null || src != null) {
      images.push({alt,src});
    }
  }
  return images;
}

const SaveReportToJSONFile = async(report, dir = './data') => {
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }

  jsonfile.writeFileSync(`${dir}/${report.filename}.jsonld`, report);
}

const DownloadImages = async(report) => {

  const dir = `./images/${report.filename}`;
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }

  for (const image of report.images) {
    try {
      let splitted = image.src.split('/');
      const filename = splitted[splitted.length - 1];
      let response = await fetch(image.src)
      response.body.pipe(fs.createWriteStream(`${dir}/${filename}`));
    } catch(e) {
      continue;
    }
  }  
}

const getALinks = async(page) => {
  const alinks = []
  let as = await page.$$('a');
  for (const a of as) {
    var href = await a.evaluate( node => node.getAttribute("href"));
    if(href == "#" || href == null || href == "javascript: void(0)" || href == "N/A") {
      continue;
    }

    var textContent = await a.evaluate( node => node.textContent);

    if(textContent != null) {
      textContent = textContent.replaceAll("\n", "");
      textContent = textContent.trim();
    }
    
    alinks.push({
      "href" : href,
      "textContent" : textContent,
    });
  }
  return alinks;
}

const generateFilename = (url, date) => {
  let filename = url.replaceAll('https://','');
  filename = filename.replaceAll('http://','');

  if(filename.slice(-1) == "/") {
    filename = filename.slice(0, -1);
  }

  forbiddenFilenameCharacters.forEach((character) => {
    filename = filename.replaceAll(character, "{");
  });

  filename += "-" + date;
  return filename;
}

const getReportForURLParallel = async(url, browser, options = {}) => {

  const wappalyzerOptions = {
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

  const wappalyzer = new Wappalyzer(wappalyzerOptions);

  let data = {
    originalUrl: null,
    url: null,
    accessibility: null,
    html: null, 
    externalJavascript: null,
    externalCSS: null,
    images: null,
    date: null,
    filename: null,
    alinks: null,
    cookies: null,
  }

  if(options.technologyReport) {
    data["technologies"] = null;
  }

  var status = null;

  if(!url.includes("https://")) {
    url = "https://" + url;
  }

  const page = await browser.newPage();

  if(options.cookies) {
    await page.setCookie(...options.cookies);
  }

  if(options.phone) {
    const pixel5 = puppeteer.devices['Pixel 5'];
    await page.emulate(pixel5);
  } else {
    await page.setViewport({ width: 1280, height: 720 });
  }

  let site = null;
  page.setRequestInterception(true);
  page.on('request', async (request) => {
    await site.OnRequest(request, page);
  }); 
  page.on('response', async (response) => {
    await site.OnResponse(response, page);
  });

  site = await wappalyzer.open(url, {}, page);

  // Optionally capture and output errors
  site.on('error', console.error);


  await startCoverage(page);

  let gotoResponse = null;
  try {
    gotoResponse = await page.goto(url, { waitUntil: ['networkidle0'] });
  } catch(e) {
    return {url, error: e.message, filename: generateFilename(url, Date.now()) };
  }

  if(status == "404") {
    return {url, error: "404", filename: generateFilename(url, Date.now()) };
  }

  const body = await page.$('body');
  var numberOfElements = (await body.$$('*')).length;
  if(numberOfElements == 1) {
    var preCount = (await body.$$("pre")).length;
    if(preCount == 1) {
      return {url, error: "Not a HTML page", filename: generateFilename(url, Date.now()) };
    }
  }

  var html = await getHTML(page);

  data.date = Date.now();

  const tasks = [getAccessibilityReport(page), getExternalJavacript(page), getExternalCSS(page), getImages(page), getALinks(page), generateFilename(url, data.date), stopCoverage(page), getCookies(page)];

  if(options.technologyReport) {
    tasks.push(site.analyze(page));
  }

  var result = await Promise.all(tasks);

  data["@context"] = "http://luiscarvalho.dev/contexts/",
  data["@type"] = "pageReport"
  data.originalUrl = url;
  data.url = page.url(),
  data.accessibility = result[0];
  data.externalJavascript = result[1];
  data.externalCSS = result[2];
  data.html = html;
  data.images = result[3];
  data.alinks = result[4];
  data.filename = result[5];
  data.jsCoverage = result[6].jsCoverage;
  data.cssCoverage = result[6].cssCoverage;
  data.cookies = result[7];

  if(options.technologyReport && result[8] != null) {
    data.technologies = cleanTechnologyReport(result[8].technologies);
  }

  if(options.phone) {
    data.filename += "phone";
  }

  if(!options.dontClosePage) {
    await page.close();
  } 
 
  if(options.dontClosePage){
    return {data, page};
  }

  return data;
}

const cleanTechnologyReport = (technologyReport) => {
  technologyReport.forEach(technology => cleanTechnology(technology));
  return technologyReport;
}

const cleanTechnology = (technology) => {
  delete technology.description;
  delete technology.icon;
}

const cleanAccessaibilityReport = (accessibilityReport) => {
  cleanAccessibilityBarrier(accessibilityReport.passes);
  cleanAccessibilityBarrier(accessibilityReport.incomplete);
  cleanAccessibilityBarrier(accessibilityReport.violations);
  return accessibilityReport;
}

const cleanAccessibilityBarrier = (list) => {

  list.forEach(violation => {
    delete violation.description;
    delete violation.helpUrl;
    delete violation.help;

    violation.nodes.forEach(node => {

      if(node.impact == null) {
        delete node.impact;
      }

      if(node.any.length == 0) {
        delete node.any;
      } else {
        node.any.forEach(any => {
          delete any.message;

          if(any.data == null) {
            delete any.data;
          }
          if(any.relatedNodes.length == 0) {
            delete any.relatedNodes;
          }
        });
      }

      if(node.all.length == 0) {
        delete node.all;
      } else {
        node.all.forEach(all => {
          delete all.message;

          if(all.data == null) {
            delete all.data;
          }
          if(all.relatedNodes.length == 0) {
            delete all.relatedNodes;
          }
        });
      }

      if(node.none.length == 0) {
        delete node.none;
      } else {
        node.none.forEach(none => {
          delete none.message;

          if(none.data == null) {
            delete none.data;
          }
          if(none.relatedNodes.length == 0) {
            delete none.relatedNodes;
          }
        });
      }
    }); 
  });
}

const getCookies = async(page) => {
  const cookies = await page.cookies();
  return cookies;
} 

const startCoverage = async(page) => {
    await Promise.all([page.coverage.startJSCoverage(), page.coverage.startCSSCoverage()]);
}

const stopCoverage = async (page) => {
  
  // Stops the coverage gathering
  const [jsCoverage, cssCoverage] = await Promise.all([
    page.coverage.stopJSCoverage(),
    page.coverage.stopCSSCoverage(),
  ]);

  // Calculates # bytes being used based on the coverage
  const calculateUsedBytes = (type, coverage) => 
    coverage.map(({url, ranges, text}) => {
      let usedBytes = 0;

      ranges.forEach((range) => (usedBytes += range.end - range.start - 1));

      return {
        url,
        type,
        usedBytes,
        totalBytes: text.length,
        percentUsed: `${(usedBytes / text.length * 100).toFixed(2)}%`
      };
    });

  const jsCoverageByURL = calculateUsedBytes('js', jsCoverage);
  const cssCoverageByURL = calculateUsedBytes('css', cssCoverage);

  const jsCoverageByURLNotRepeats = [];
  jsCoverageByURL.forEach((item) => {

    if(jsCoverageByURLNotRepeats.filter(i => i.url == item.url).length == 0) {
    
      const results = jsCoverageByURL.filter(elem => elem.url == item.url);

      let usedBytes = 0;
      let totalBytes = 0;
      results.forEach((result) => {
        usedBytes += result.usedBytes;
        totalBytes += result.totalBytes;
      });

      jsCoverageByURLNotRepeats.push({
        url: item.url,
        type: item.type,
        usedBytes,
        totalBytes,
        percentUsed: `${(usedBytes / totalBytes * 100).toFixed(2)}%`
      });
    }
  });

  const cssCoverageByURLNotRepeats = [];
  cssCoverageByURL.forEach((item) => {

    if(cssCoverageByURLNotRepeats.filter(i => i.url == item.url).length == 0) {
    
      const results = cssCoverageByURL.filter(elem => elem.url == item.url);

      let usedBytes = 0;
      let totalBytes = 0;
      results.forEach((result) => {
        usedBytes += result.usedBytes;
        totalBytes += result.totalBytes;
      });

      cssCoverageByURLNotRepeats.push({
        url: item.url,
        type: item.type,
        usedBytes,
        totalBytes,
        percentUsed: `${(usedBytes / totalBytes * 100).toFixed(2)}%`
      });
    }
  });
  



  return {
    'jsCoverage': jsCoverageByURLNotRepeats,
    'cssCoverage': cssCoverageByURLNotRepeats,
  };
}



const getReportForURL = async(url, browser) => {

  console.log(`Generating Report - ${url}`)
  
  let data = {
    url: null,
    accessibility: null,
    technologies: null,
    html: null, 
    externalJavascript: null,
    externalCSS: null,
    images: null,
    date: null,
    filename: null,
  }
  
  data.url = url;
  data.date = Date.now();
  
  data.technologies = await oraPromise(getTechnologies(url), "Getting technologies");

  const page = await browser.newPage();
  await page.goto(url);

  data.accessibility = await oraPromise(getAccessibilityReport(page), "Getting accessibility report");
  data.externalJavascript = await oraPromise(getExternalJavacript(page), "Getting external javascript");
  data.externalCSS = await oraPromise(getExternalCSS(page), "Getting external CSS");
  data.html = await oraPromise(getHTML(page), "Getting HTML");
  data.images = await oraPromise(getImages(page), "Getting images")

  let filename = data.url.replaceAll('https','');
  filename = filename.replaceAll('http','');
  filename = filename.replaceAll(':','');
  filename = filename.replaceAll('/','');
  filename += "-" + Date.now() + ".json";

  data.filename = filename;

  await page.close();
  return data;
}

const forbiddenFilenameCharacters = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];


const delay = (delayInms) => {
  return new Promise(resolve => setTimeout(resolve, delayInms));
}

const analyseECommerceDomain = async (url, browser) => {

  console.log(url);

  let dirname = url.replaceAll('https://','');
  dirname = dirname.replaceAll('http://','');
  if(dirname.slice(-1) == '/') {
    dirname = dirname.slice(0, -1);
  }

  forbiddenFilenameCharacters.forEach((character) => {
    dirname = dirname.replaceAll(character, "{");
  });

  dirname = `./data/${dirname}`;

  if(!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname);
  }
  
  const primarySite = await analyseECommerceSite(url, browser, true) ;

  if(primarySite.error) {
    console.log(primarySite.error);
    return;
  }

  saveHtmlToFile(dirname, primarySite.data.filename, primarySite.data.html);
  delete primarySite.data.html;
  SaveReportToJSONFile(primarySite.data, dirname);

  // get product page
  let productPageUrl = url;
  if(productPageUrl.slice(-1) == '/') {
    productPageUrl = productPageUrl.slice(0, -1);
  }

  let foundPageLink = false;
  for(let link of primarySite.data.alinks) {
      if(link.href.includes('/product/') || link.href.includes('/products/')) {
        productPageUrl += link.href;
        foundPageLink = true;
        break;
      }
  }

  if(!foundPageLink) {
    for(let link of primarySite.data.alinks) {
      if(link.href.includes('/collection') || link.href.includes('/collections')) {
        const pageLink = link.href;
        await primarySite.page.goto(url + link.href);
        //await primarySite.page.waitForNavigation();
        const alinks = await getALinks(primarySite.page);
        for(let link of alinks) {
          var re = new RegExp(`${pageLink}\/.+`);
          if(re.test(link.href)) {
            productPageUrl = url + link.href;
            foundPageLink = true;
            break;
          }
        }
        break
      }
    }
  }

  //TODO check other pages for product links

  const result = await analyseECommerceSite(productPageUrl, browser, true);
  saveHtmlToFile(dirname, result.data.filename, result.data.html);
  delete result.data.html;
  SaveReportToJSONFile(result.data, dirname);

  //Get product into cart

  //Set to one time purchase
  const labels = await result.page.$$('label');
  console.log("labels", labels.length);
  for(let label of labels) {
    let text = await result.page.evaluate(el => el.textContent, label);
    text = text.replace(" ", '');
    text = text.replace("-", '');
    if(text.toLowerCase().includes('onetime')) {
      const inputId = await result.page.evaluate(el => el.getAttribute("for"), label);
      //const input = await result.page.$(`#${inputId}`);
      await result.page.evaluate((inputId) => {
        document.querySelector(`#${inputId}`).click();
    }, inputId);
      break;
    }
  }


  let foundAddToCart = false;
  const buttons = await result.page.$$('button');
  for(let button of buttons) {
    const text = await result.page.evaluate(el => el.textContent, button);
    if(text.toLowerCase().includes('add to cart')) {
      foundAddToCart = true;
      await button.evaluate( button => button.click());
      break;
    }
  }

  if(!foundAddToCart) {
    const divs = await result.page.$$('div');
    for(let div of divs) {
      const text = await result.page.evaluate(el => el.textContent, div);
      if(text.toLowerCase().includes('add to cart') &  text.length < 20) {
        foundAddToCart = true;
        console.log(text);
        await div.evaluate( div => div.click());
        console.log('clicked');
        break;
      }
    }
  }

  await delay(2000);
  

  await result.page.screenshot({
    path: 'screenshot1.jpg'
  });

  const cookies = await result.page.cookies();
  await result.page.close();

  //go to cart
  let cartUrl = url;
  if(cartUrl.slice(-1) == '/') {
    cartUrl = cartUrl.slice(0, -1);
  }
  cartUrl = url + 'cart';
  const cartResult = await analyseECommerceSite(cartUrl, browser, true, cookies);
  saveHtmlToFile(dirname, cartResult.data.filename, cartResult.data.html);
  delete cartResult.data.html;
  SaveReportToJSONFile(cartResult.data, dirname);

  await cartResult.page.screenshot({
    path: 'screenshot2.jpg'
  });
  
  //go to checkout
  const cartButtons = await cartResult.page.$$('button');
  console.log(cartButtons);
  for(let button of cartButtons) {
    let text = await cartResult.page.evaluate(el => el.textContent, button);
    text = text.replaceAll('\n', '');
    text = text.replaceAll(' ', '');
    if(text.toLowerCase().includes('checkout')) {
      await button.evaluate( button => button.click() );
      break;
    }
    
  }
  await cartResult.page.waitForNavigation();
  const checkoutUrl = cartResult.page.url();
  cartResult.page.close();

  //analyse checkout page
  const checkoutResult = await analyseECommerceSite(checkoutUrl, browser, true, cookies);
  saveHtmlToFile(dirname, checkoutResult.data.filename, checkoutResult.data.html);
  delete checkoutResult.data.html;
  SaveReportToJSONFile(checkoutResult.data, dirname);


  await checkoutResult.page.screenshot({
    path: 'screenshot3.jpg'
  });

  checkoutResult.page.close();












}



const analyseDomain = async (url, browser) => {

  console.log(url);

  let dirname = url.replaceAll('https://','');
  dirname = dirname.replaceAll('http://','');
  if(dirname.slice(-1) == '/') {
    dirname = dirname.slice(0, -1);
  }

  forbiddenFilenameCharacters.forEach((character) => {
    dirname = dirname.replaceAll(character, "{");
  });

  dirname = `./data/${dirname}`;

  if(!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname);
  }
  
  const primarySite = await analysePrimarySite(url, browser);
  saveHtmlToFile(dirname, primarySite.filename, primarySite.html);
  delete primarySite.html;  
  SaveReportToJSONFile(primarySite, dirname);


  const phoneSite = await analysePhoneSite(url, browser);
  saveHtmlToFile(dirname, phoneSite.filename, phoneSite.html);
  delete phoneSite.html;  
  SaveReportToJSONFile(phoneSite, dirname);


  const secondarySite = await analyseSecondarySite(url + '/contact', browser);
  saveHtmlToFile(dirname, secondarySite.filename, secondarySite.html);
  delete secondarySite.html;  
  SaveReportToJSONFile(secondarySite, dirname);

  const result = await zipDomainFolder(dirname);


  //fs.rmSync(dirname, { recursive: true, force: true });

}


const analyseECommerceSite = async (url, browser, dontClosePage, cookies = null) => {
  return await getReportForURLParallel(url, browser, {technologyReport: true, dontClosePage, cookies}) 
}

const analysePrimarySite = async (url, browser) => {
  return await getReportForURLParallel(url, browser, {technologyReport: true}) 
}

const analyseSecondarySite = async (url, browser) => {
  return await getReportForURLParallel(url, browser);
}

const analysePhoneSite = async (url, browser) => {
  return await getReportForURLParallel(url, browser, {phone: true}) 
}


const zipDomainFolder = async(dir) => {
  console.log("Zipping folder", dir);
  const archive = archiver('zip', { zlib: { level: 9 }});
  const stream = fs.createWriteStream(`./${dir}.zip`);

  return new Promise((resolve, reject) => {
    archive
      .directory(dir, false)
      .on('error', err => reject(err))
      .pipe(stream)
    ;

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

const saveHtmlToFile = async(dir, filename, htmlContent) => {
    try {
      fs.writeFileSync(`${dir}/${filename}.html`, htmlContent);
      // file written successfully
    } catch (err) {
      console.error(err);
    }
}

const runUrlMode = async () => {
  const browser = await puppeteer.launch({
    headless: false,//'chrome',
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
    ]
  });

  const url = process.env.URL;
  if(url == null) {
    console.log("No URL provided");
    return;
  }

  var start = new Date()
  //await analyseDomain(url, browser);
  
  await analyseECommerceDomain(url, browser);
  
  var end = new Date() - start;
  console.info('Execution time: %dms', end) 
  browser.close();
}

const runCsvMode = async () => {
  const browser = await puppeteer.launch({
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
    ]
  });
  const csvPath = process.env.CSVFILEPATH;
  if(csvPath == null) {
    console.log("No CSV file path provided");
    return;
  }

  const websites = await readWebsiteCSV(csvPath);
  for(let website of websites) {
    var start = new Date()
    await analyseDomain(website.Domain, browser);
    var end = new Date() - start;
    console.info('Execution time: %dms', end) 
  }
  browser.close();
}

const runServer = async () => {

}

(async () => {

  if(process.env.MODE == "url") {
    await runUrlMode();
  } else if(process.env.MODE == "csv") {
    await runCsvMode();
  } else if(process.env.MODE == "server") {
    await runServer();
  }

})();


