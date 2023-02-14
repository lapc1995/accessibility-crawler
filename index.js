import puppeteer from 'puppeteer';
import {AxePuppeteer} from '@axe-core/puppeteer';
//import Wappalyzer from 'wappalyzer';
import * as path from 'path';
import Wappalyzer from 'wappalyzer-core';
import jsonfile from 'jsonfile';
import {oraPromise} from 'ora';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { response } from 'express';
import csvParser from 'csv-parser';

import { getTechnologies } from './wappalyzerMiddleware.js'


import archiver from 'archiver';


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


/*
const getTechnologies = async(url) => {

  console.log("getTechnologies", url);

  const options = {
    debug: true,
    delay: 500,
    headers: {},
    maxDepth: 3,
    maxUrls: 1,
    maxWait: 10000,
    recursive: true,
    probe: true,
    proxy: false,
    userAgent: 'Wappalyzer',
    htmlMaxCols: 2000,
    htmlMaxRows: 2000,
    noScripts: false,
    noRedirect: false,
  };
  
  const wappalyzer = new Wappalyzer(options);

  let technologies = null;
  try {
    await wappalyzer.init()
    const site = await wappalyzer.open(url, {})
    console.log("a", url)
    const results = await site.analyze()
    console.log("b", url)
    await wappalyzer.destroy()
    console.log("c", url)
    technologies =  results;
    console.log("d", url)
  } catch (error) {
    console.error(error)
  } 

  console.log("f", url);
  return technologies;
}*/






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

  jsonfile.writeFileSync(`${dir}/${report.filename}`, report);
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

  filename += "-" + date + ".json";
  return filename;
}

let headers = {};
let certIssuer;


const getReportForURLParallel = async(url, browser, options = {}) => {

  console.log(url);

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
  }

  if(options.technologyReport) {
    data["technologies"] = null;
  }

  var status = null;

  if(!url.includes("https://")) {
    url = "https://" + url;
  }

  const page = await browser.newPage();

  if(options.phone) {
    const pixel5 = puppeteer.devices['Pixel 5'];
    await page.emulate(pixel5);
  }


  page.setRequestInterception(true);
  page.on('request', (request) => {
    request.continue();
  }); 
  page.on("requestfinished", (request) => {
    const response = request.response();
    status = response.status();
  });

  page.on('response', async (response) => {

    

  });

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

  const tasks = [getAccessibilityReport(page), getExternalJavacript(page), getExternalCSS(page), getImages(page), getALinks(page), generateFilename(url, data.date), stopCoverage(page)];

  if(options.technologyReport) {
    tasks.push(getTechnologies(page, html));
  }
 

  var result = await Promise.all(tasks);
  //console.log(result, result.length);
  
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

  if(options.technologyReport) {
    data.technologies = result[7];
  }

  await page.close();

  return data;
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
  const cookies = await page.cookies()
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

  const jsCoverageByURL =  calculateUsedBytes('js', jsCoverage);
  const cssCoverageByURL = calculateUsedBytes('css', cssCoverage);

  const jsCoverageByURLNotRepeats = [];
  jsCoverageByURL.forEach((item) => {

    if(jsCoverageByURLNotRepeats.filter(i => i.url == item.url).length == 0) {
    
      const results = jsCoverageByURL.filter(elem => elem.url == item.ur);

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
    
      const results = cssCoverageByURL.filter(elem => elem.url == item.ur);

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
    'jsCoverage': calculateUsedBytes('js', jsCoverageByURLNotRepeats),
    'cssCoverage': calculateUsedBytes('css', cssCoverageByURLNotRepeats),
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
  SaveReportToJSONFile(primarySite, dirname);
  const phoneSite = await analysePhoneSite(url, browser);
  SaveReportToJSONFile(phoneSite, dirname);
  const secondarySite = await analyseSecondarySite(url + '/contact', browser);
  SaveReportToJSONFile(secondarySite, dirname);

  const result = await zipDomainFolder(dirname);
  console.log(result);

  //fs.rmSync(dirname, { recursive: true, force: true });

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



const url = /*'http://www.dksfbgsfdgkjfksddk.com';*/ /*"https://moodle.ciencias.ulisboa.pt/dasdd";*/ 'https://www.amazon.co.uk/';

(async () => {

  
  /*
  var websites = await readWebsiteCSV('websitee.csv');

  const browser = await puppeteer.launch({headless: 'chrome'});

  var start = new Date()
  var hrstart = process.hrtime()

  const data = await getReportForURLParallel(url, browser);
  console.log(data.filename);
  SaveReportToJSONFile(data);

  var end = new Date() - start;
  var hrend = process.hrtime(hrstart);

  console.info('Execution time: %dms', end) 
  console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
  
  await browser.close();*/

  const browser = await puppeteer.launch({headless: 'chrome'});
    
  var websites = await readWebsiteCSV('website.csv');
  var splittedWebsites = sliceIntoChunks(websites, chunkSize);

  for(let websitesL of splittedWebsites) {
    var start = new Date()
    //await BatchGenerateReport(websitesL);
    await analyseDomain(websitesL[0].Domain, browser);
    

    var end = new Date() - start;
    console.info('Execution time: %dms', end) 
  
  }

  browser.close();
  
  
  //await startGeneratingReports(websites);
  //var start = new Date()
  //await BatchGenerateReport(websites);
  //var end = new Date() - start;
  //console.info('Execution time: %dms', end)

})();


