import puppeteer from 'puppeteer';
import {AxePuppeteer} from '@axe-core/puppeteer';
import * as path from 'path';
import jsonfile from 'jsonfile';
import {oraPromise} from 'ora';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { response } from 'express';
import csvParser from 'csv-parser';

import Parse from 'parse/node.js';

import os from 'os';

import * as dotenv from 'dotenv'
dotenv.config()

import { getTechnologies } from './wappalyzerMiddleware.js'


import archiver from 'archiver';

import Wappalyzer from './wappalyzer/drivers/npm/driver.js'

import { JsonDB, Config } from 'node-json-db';

import * as winston from 'winston';

import YourCustomTransport from './serverTransports.js';

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
        const tempPage = await browser.newPage();
        await tempPage.goto(url + link.href);
        //await tempPage.waitForNavigation();
        const isProductPage = await checkIfPageIsIsProduct(tempPage);
        tempPage.close();
        if(isProductPage) {
          productPageUrl += link.href;
          foundPageLink = true;
          break;
        }
      }
  }

  if(!foundPageLink) {
    for(let link of primarySite.data.alinks) {
      if(link.href.includes('/collection') || link.href.includes('/collections')) {
        const pageLink = link.href;
        await primarySite.page.goto(url + link.href);
        //await primarySite.page.waitForNavigation();

        let isProductPage = await checkIfPageIsIsProduct(primarySite.page);
        console.log(isProductPage)
        if(isProductPage) {
          productPageUrl += link.href;
          foundPageLink = true;
          break;
        } else {
          const alinks = await getALinks(primarySite.page);
          for(let link of alinks) {
            var re = new RegExp(`${pageLink}\/.+`);
            if(re.test(link.href)) {
              const tempPage = await browser.newPage();
              await tempPage.setViewport({
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1,
              });
              await tempPage.goto(url + link.href);
              //await tempPage.waitForNavigation();
              const isProductPage = await checkIfPageIsIsProduct(tempPage);
              tempPage.close();
              if(isProductPage) {
                productPageUrl = url + link.href;
                foundPageLink = true;
                break;
              }
            }
          }
        }
      }
      if(foundPageLink) {
        break;
      }
    }
  }

  //look at shop
  if(!foundPageLink) {
    let shopLinks = primarySite.data.alinks.filter((link) => link.href.includes('/shop/') );
    shopLinks = removeDuplicateLinks(shopLinks);
    for(let shopLink of shopLinks) {
      var re = new RegExp(`\/shop\/.+`);
      if(!re.test(shopLink.href)) {
        continue;
      }
      const tempPage = await browser.newPage();
      await tempPage.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });

      let pageLink = shopLink.href.includes('http') ? shopLink.href : url + shopLink.href;
      await tempPage.goto(pageLink);
      //await tempPage.waitForNavigation();
      const isProductPage = await checkIfPageIsIsProduct(tempPage);
      tempPage.close();
      if(isProductPage) {
        productPageUrl = pageLink;
        foundPageLink = true;
        break;
      }
    }
  }


  //go to collects page




  //primarySite.page.close(); ???????

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
  cartUrl = cartUrl + '/cart';
  const cartResult = await analyseECommerceSite(cartUrl, browser, true, cookies);
  saveHtmlToFile(dirname, cartResult.data.filename, cartResult.data.html);
  delete cartResult.data.html;
  SaveReportToJSONFile(cartResult.data, dirname);

  await cartResult.page.screenshot({
    path: 'screenshot2.jpg'
  });
  
  //go to checkout
  let foundCheckoutButton = false;
  let checkoutUrl = null;
  const cartButtons = await cartResult.page.$$('button');
  let checkOutButtons = [];
  for(let button of cartButtons) {
    let text = await cartResult.page.evaluate(el => el.textContent, button);
    text = text.replaceAll('\n', '');
    text = text.replaceAll(' ', '');
    if(text.toLowerCase().includes('checkout')) {
      checkOutButtons.push(button);
    }
  }

 
  for(let i = 0; i < checkOutButtons.length; i++) {
    let tempPage = await browser.newPage();
    await tempPage.goto(cartUrl);
    const cartTextButtons = await tempPage.$$('button');
    let checkOutButtons = [];
    for(let button of cartTextButtons) {
      let text = await tempPage.evaluate(el => el.textContent, button);
      text = text.replaceAll('\n', '');
      text = text.replaceAll(' ', '');
      if(text.toLowerCase().includes('checkout')) {
        checkOutButtons.push(button);
      }
    }



    let text = await tempPage.evaluate(el => el.textContent, checkOutButtons[i]);
    if(text.toLowerCase().includes('checkout')) {
      await checkOutButtons[i].evaluate(button => button.click());

      await tempPage.waitForNavigation();
      const checkoutUrlTemp = tempPage.url();

      await tempPage.close();

      if(checkoutUrlTemp != cartUrl) {
        checkoutUrl = checkoutUrlTemp;
        foundCheckoutButton = true;
        break;
      }
    
    }else {
      await tempPage.close();
    }


  }
  
/*

  for(let button of cartButtons) {
    let text = await cartResult.page.evaluate(el => el.textContent, button);
    text = text.replaceAll('\n', '');
    text = text.replaceAll(' ', '');
    if(text.toLowerCase().includes('checkout')) {
      await button.evaluate(button => button.click() );

      await cartResult.page.waitForNavigation();
      const checkoutUrlTemp = cartResult.page.url();

      if(!checkoutUrlTemp == cartUrl) {
        await cartResult.page.goBack();
        checkoutUrl = checkoutUrlTemp;
        foundCheckoutButton = true;
        break;
      }
    }
  }*/

  if(!foundCheckoutButton) {
    const cartInputs = await cartResult.page.$$('input');
    for(let input of cartInputs) {
      let text = await cartResult.page.evaluate(el => el.value, input);
      text = text.replaceAll('\n', '');
      text = text.replaceAll(' ', '');
      if(text.toLowerCase().includes('checkout')) {
        await input.evaluate(input => input.click() );

        await cartResult.page.waitForNavigation();
        const checkoutUrlTemp = cartResult.page.url();

        if(checkoutUrlTemp != cartUrl) {
          checkoutUrl = checkoutUrlTemp;
          foundCheckoutButton = true;
          break;
        }
      }
    }
  }

  if(!foundCheckoutButton) {
    const cartAs = await cartResult.page.$$('a');
    for(let a of cartAs) {
      let text = await cartResult.page.evaluate(el => el.textContent, a);
      text = text.replaceAll('\n', '');
      text = text.replaceAll(' ', '');
      let href = await cartResult.page.evaluate(el => el.href, a);
      if(href == cartUrl || !text.toLowerCase().includes('checkout')) {
        continue;
      }
      await a.evaluate( a => a.click() );

      await cartResult.page.waitForNavigation();
      const checkoutUrlTemp = cartResult.page.url();

      if(checkoutUrlTemp != cartUrl) {
        checkoutUrl = checkoutUrlTemp;
        foundCheckoutButton = true;
        break;
      }
    }
  }

  if(!foundCheckoutButton) {
    const cartDivs = await cartResult.page.$$('div');
    for(let div of cartDivs) {
      let text = await cartResult.page.evaluate(el => el.textContent, div);
      text = text.replaceAll('\n', '');
      text = text.replaceAll(' ', '');
      if(text.toLowerCase().includes('checkout')) {
        await div.evaluate( div => div.click() );
        await cartResult.page.waitForNavigation();
        const checkoutUrlTemp = cartResult.page.url();

        if(!checkoutUrlTemp == cartUrl) {
          checkoutUrl = checkoutUrlTemp;
          foundCheckoutButton = true;
          break;
        }
      }
    }
  }



  if(!foundCheckoutButton) {
    console.log('No checkout button found');
    return;
  }

  //await cartResult.page.waitForNavigation();
  //const checkoutUrl = cartResult.page.url();
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
  
  //await analyseECommerceDomain(url, browser);
  await analyseDomain(url, browser);

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

  Parse.initialize(process.env.APP_ID, "", process.env.MASTER_KEY);
  Parse.masterKey = process.env.MASTER_KEY;
  Parse.serverURL = process.env.SERVER_URL;

  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: 'user-service' },
    transports: [
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' }),
      new winston.transports.Console({format: winston.format.simple(),}),
      new YourCustomTransport(),
    ],
  });

  logger.log({level: 'info',message: 'Hello distributed log files!', website: "test", machine: "test"});

  var db = new JsonDB(new Config("crawldb", true, true, '/'));

  let toBeAnalysed;
  try {
    toBeAnalysed = await db.getData('/toBeAnalysed');
  } catch (error) {
    toBeAnalysed = [];
  }

  if(toBeAnalysed.length == 0) {
    const ip = getMachineIp();
    const batch = await Parse.Cloud.run("getWebsiteBatch", {ip});
    for(let website of batch) {
      await db.push("/toBeAnalysed[]", website);
      const processingOrder = await getProcessingOrder(website.processingOrderId);
      processingOrder.set("status", "saved on client");
      await processingOrder.save(null, { useMasterKey: true });
    }
  }
  
  toBeAnalysed = await db.getData('/toBeAnalysed');
  for(let website of toBeAnalysed) {
    const processing = await getProcessingOrder(website.processingOrderId);
    processing.set("status", "processing");
    await processing.save(null, { useMasterKey: true });
    
    //await analyseDomain(website.Domain, browser);
    await delay(10000);

    processing.set("status", "processed");
    await processing.save(null, { useMasterKey: true });

    const index = await db.getIndex("/toBeAnalysed", website.objectId, "objectId");
    console.log("index", index);
    await db.delete("/toBeAnalysed[" + index + "]");
    await db.push("/analysed[]", website);

    //check time

    //add if it is weekday or weekend
    if(new Date().getHours() > 8 && new Date().getHours() < 21) {
      break;
    }
  }
}

(async () => {

  if(process.env.MODE == "url") {
    await runUrlMode();
  } else if(process.env.MODE == "csv") {
    await runCsvMode();
  } else if(process.env.MODE == "server") {
    runServer();
  }

})();

const getMachineIp = () => {
  const nets = os.networkInterfaces();
  const results = {};
  for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
          // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
          // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
          const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
          if (net.family === familyV4Value && !net.internal) {
              if (!results[name]) {
                  results[name] = [];
              }
              results[name].push(net.address);
          }
      }
  }

  if(results["eth0"] != null && results["eth0"].length > 0) {
    return results["eth0"][0];
  } else if(results["en0"] != null && results["en0"].length > 0) {
    return results["en0"][0];
  }

  return null;
}



const checkIfPageIsIsProduct = async (page) => {
   //Set to one time purchase
   const labels = await page.$$('label');
   console.log("labels", labels.length);
   for(let label of labels) {
     let text = await page.evaluate(el => el.textContent, label);
     text = text.replace(" ", '');
     text = text.replace("-", '');
     if(text.toLowerCase().includes('onetime')) {
       const inputId = await page.evaluate(el => el.getAttribute("for"), label);
       await page.evaluate((inputId) => {
         document.querySelector(`#${inputId}`).click();
     }, inputId);
       break;
     }
   }
 
 
   const buttons = await page.$$('button');
   for(let button of buttons) {

    const element_is_visible = await page.evaluate((button) => {
      const style = window.getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      //return {visibility: style.getPropertyValue('visibility'), display: style.getPropertyValue('display'), opacity: style.getPropertyValue('opacity'), height: style.getPropertyValue('height'), width: style.getPropertyValue('width'), bottomr: rect.bottom, topr: rect.top, heightr: rect.height, widthr: rect.width};
      return style.getPropertyValue('visibility') != 'hidden' && style.getPropertyValue('display') != 'none' && style.getPropertyValue('opacity') != '0' && style.getPropertyValue('height') != '0px' && style.getPropertyValue('width') != '0px' && rect.bottom != 0 && rect.top != 0 && rect.height != 0 && rect.width != 0;
    }, button);
    
    if(!element_is_visible) {
      continue;
    }

     const text = await page.evaluate(el => el.textContent, button);
     if(text.toLowerCase().includes('add to cart')) {
        return true;
     }
   }
 

    const divs = await page.$$('div');
    for(let div of divs) {

      const element_is_visible = await page.evaluate((div) => {
        const style = window.getComputedStyle(div);
        //const rect = div.getBoundingClientRect();
        return style.getPropertyValue('visibility') != 'hidden' && style.getPropertyValue('display') != 'none' && style.getPropertyValue('opacity') != '0' && style.getPropertyValue('height') != '0px' && style.getPropertyValue('width') != '0px' /*&& !!(rect.bottom || rect.top || rect.height || rect.width)*/;
      }, div);
      
      if(!element_is_visible) {
        continue;
      }

      const text = await page.evaluate(el => el.textContent, div);
      if(text.toLowerCase().includes('add to cart') &  text.length < 20) {
      return true;
      }
    }
   

   return false;

}

const removeDuplicateLinks = (alinks) => {

  const links = [];
  for(let link of alinks) {
    let filtred = links.filter(l => l.href == link.href);
    if(filtred.length == 0) {
      links.push(link);
    }
  }
  return links;

}

const getProcessingOrder = async (id) => {
  const ProcessingOrder = Parse.Object.extend("ProcessingOrder");
  const query = new Parse.Query(ProcessingOrder);
  const processingOrder = await query.get(id);
  return processingOrder;
}

const sendDataToAmazonBucket = async (data, website) => {
}