import { workerData, parentPort } from "worker_threads";
import puppeteer from 'puppeteer';
import {AxePuppeteer} from '@axe-core/puppeteer';
import Wappalyzer from 'wappalyzer';
import jsonfile from 'jsonfile';
import {oraPromise} from 'ora';
import * as fs from 'fs';
import fetch from 'node-fetch';


const getTechnologies = async(url) => {

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
    
    const wappalyzer = new Wappalyzer(options);
  
    let technologies = null;
    try {
      await wappalyzer.init()
      const site = await wappalyzer.open(url, {})
      const results = await site.analyze()
      await wappalyzer.destroy()
  
      technologies =  results;
  
    } catch (error) {
      console.error(error)
    } finally {
      await wappalyzer.destroy()
    }
  
    return technologies;
  }
  
  const getAccessibilityReport = async(page) => {
    const results = await new AxePuppeteer(page).analyze();
    delete results.inapplicable;
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
  
  const SaveReportToJSONFile = async(report) => {
    const dir = './data';
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
  
  const getReportForURLParallel = async(url, browser) => {
    
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
  
    const page = await browser.newPage();
    await page.goto(url);
  
    var result = await oraPromise(Promise.all([getAccessibilityReport(page), getTechnologies(url), getExternalJavacript(page), getExternalCSS(page), getHTML(page), getImages(page)]), "Generating report");
    //console.log(result);
  
    data.url = url,
    data.accessibility = result[0];
    data.technologies = result[1];
    data.externalJavascript = result[2];
    data.externalCSS = result[3];
    data.html = result[4];
    data.images = result[5];
    data.date = Date.now();
  
    let filename = data.url.replaceAll('https','');
    filename = filename.replaceAll('http','');
    filename = filename.replaceAll(':','');
    filename = filename.replaceAll('/','');
    filename += "-" + Date.now() + ".json";
  
    data.filename = filename;
  
    await page.close();
  
    return data;
  }
  
  const getReportForURL = async(url, browser) => {
  
    console.log(`Generating Report - ${url}`)
    
    let data = {
      originalUrl: null,
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
    
    data.originalUrl = url;
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
  
  const url = 'https://www.amazon.co.uk/';

  const browser = await puppeteer.launch({headless: 'chrome'});

  const data = await getReportForURLParallel(url, browser);

  await browser.close();
  parentPort.postMessage({ data});


// You can do any heavy stuff here, in a synchronous way
// without blocking the "main thread"
/*
const sleep = () => {
  return new Promise(resolve => setTimeout(() => resolve, 500));
};
let cnt = 0;
for (let i = 0; i < 10e8; i += 1) {
  cnt += 1;
}
parentPort.postMessage({ data: cnt });
*/