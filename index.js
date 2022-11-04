import puppeteer from 'puppeteer';
import {AxePuppeteer} from '@axe-core/puppeteer';
import Wappalyzer from 'wappalyzer';
import jsonfile from 'jsonfile';
import {oraPromise} from 'ora';

const getTechnologies = async(url) => {

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
}

const getHTML = async(page) => {
  const html = await page.evaluate(
    () =>  document.querySelector('*').outerHTML
  );
  return html;
}

const SaveReportToJSONFile = async(report) => {

  let filename = report.url.replaceAll('https','');
  filename = filename.replaceAll('http','');
  filename = filename.replaceAll(':','');
  filename = filename.replaceAll('/','');

  filename += "-" + Date.now() + ".json";

  jsonfile.writeFileSync(filename, report);
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
    date: null,
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
  await page.close();
  return data;
}

const url = 'https://www.amazon.co.uk/';

(async () => {

  const browser = await puppeteer.launch({headless: 'chrome'});

  const data = await getReportForURL(url, browser);
  SaveReportToJSONFile(data);
  
  await browser.close();

})();


