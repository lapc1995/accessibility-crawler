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


const promiseTimeout = async (
  promise,
  fallback,
  errorMessage = 'Operation took too long to complete',
  maxWait = Math.min(100000, 10000)
) => {
  let timeout = null

  if (!(promise instanceof Promise)) {
    return Promise.resolve(promise)
  }

  return Promise.race([
    new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        clearTimeout(timeout)

        const error = new Error(errorMessage)

        error.code = 'PROMISE_TIMEOUT_ERROR'

        if (fallback !== undefined) {
          console.log(error)

          resolve(fallback)
        } else {
          reject(error)
        }
      }, maxWait)
    }),
    promise.then((value) => {
      clearTimeout(timeout)

      return value
    }),
  ])
}


function getDom(page, technologies = Wappalyzer.technologies) {
  return page.evaluate((technologies) => {
    return technologies
      .filter(({ dom }) => dom && dom.constructor === Object)
      .reduce((technologies, { name, dom }) => {
        const toScalar = (value) =>
          typeof value === 'string' || typeof value === 'number'
            ? value
            : !!value

        Object.keys(dom).forEach((selector) => {
          let nodes = []

          try {
            nodes = document.querySelectorAll(selector)
          } catch (error) {
            // Continue
          }

          if (!nodes.length) {
            return
          }

          dom[selector].forEach(({ exists, text, properties, attributes }) => {
            nodes.forEach((node) => {
              if (
                technologies.filter(({ name: _name }) => _name === name)
                  .length >= 50
              ) {
                return
              }

              if (
                exists &&
                technologies.findIndex(
                  ({ name: _name, selector: _selector, exists }) =>
                    name === _name && selector === _selector && exists === ''
                ) === -1
              ) {
                technologies.push({
                  name,
                  selector,
                  exists: '',
                })
              }

              if (text) {
                // eslint-disable-next-line unicorn/prefer-text-content
                const value = (
                  node.textContent ? node.textContent.trim() : ''
                ).slice(0, 1000000)

                if (
                  value &&
                  technologies.findIndex(
                    ({ name: _name, selector: _selector, text }) =>
                      name === _name && selector === _selector && text === value
                  ) === -1
                ) {
                  technologies.push({
                    name,
                    selector,
                    text: value,
                  })
                }
              }

              if (properties) {
                Object.keys(properties).forEach((property) => {
                  if (
                    Object.prototype.hasOwnProperty.call(node, property) &&
                    technologies.findIndex(
                      ({
                        name: _name,
                        selector: _selector,
                        property: _property,
                        value,
                      }) =>
                        name === _name &&
                        selector === _selector &&
                        property === _property &&
                        value === toScalar(value)
                    ) === -1
                  ) {
                    const value = node[property]

                    if (typeof value !== 'undefined') {
                      technologies.push({
                        name,
                        selector,
                        property,
                        value: toScalar(value),
                      })
                    }
                  }
                })
              }

              if (attributes) {
                Object.keys(attributes).forEach((attribute) => {
                  if (
                    node.hasAttribute(attribute) &&
                    technologies.findIndex(
                      ({
                        name: _name,
                        selector: _selector,
                        attribute: _atrribute,
                        value,
                      }) =>
                        name === _name &&
                        selector === _selector &&
                        attribute === _atrribute &&
                        value === toScalar(value)
                    ) === -1
                  ) {
                    const value = node.getAttribute(attribute)

                    technologies.push({
                      name,
                      selector,
                      attribute,
                      value: toScalar(value),
                    })
                  }
                })
              }
            })
          })
        })

        return technologies
      }, [])
  }, technologies)
}


function getJs(page, technologies = Wappalyzer.technologies) {
  return page.evaluate((technologies) => {
    return technologies
      .filter(({ js }) => Object.keys(js).length)
      .map(({ name, js }) => ({ name, chains: Object.keys(js) }))
      .reduce((technologies, { name, chains }) => {
        chains.forEach((chain) => {
          chain = chain.replace(/\[([^\]]+)\]/g, '.$1')

          const value = chain
            .split('.')
            .reduce(
              (value, method) =>
                value &&
                value instanceof Object &&
                Object.prototype.hasOwnProperty.call(value, method)
                  ? value[method]
                  : '__UNDEFINED__',
              window
            )

          if (value !== '__UNDEFINED__') {
            technologies.push({
              name,
              chain,
              value:
                typeof value === 'string' || typeof value === 'number'
                  ? value
                  : !!value,
            })
          }
        })

        return technologies
      }, [])
  }, technologies)
}


const getTechnologies = async(page) => {

  const categories = JSON.parse(
    fs.readFileSync(path.resolve(`./categories.json`))
  )
  
  let technologies = {}
  
  for (const index of Array(27).keys()) {
    const character = index ? String.fromCharCode(index + 96) : '_'
  
    technologies = {
      ...technologies,
      ...JSON.parse(
        fs.readFileSync(
          path.resolve(`./technologies/${character}.json`)
        )
      ),
    }
  }
  
  Wappalyzer.setTechnologies(technologies)
  Wappalyzer.setCategories(categories)


  let cookies = []
  try {
    cookies = (await page.cookies()).reduce(
      (cookies, { name, value }) => ({
        ...cookies,
        [name.toLowerCase()]: [value],
      }),
      {}
    )

    // Change Google Analytics 4 cookie from _ga_XXXXXXXXXX to _ga_*
    Object.keys(cookies).forEach((name) => {
      if (/_ga_[A-Z0-9]+/.test(name)) {
        cookies['_ga_*'] = cookies[name]

        delete cookies[name]
      }
    })
  } catch (error) {
    error.message += ` (${url})`

    console.log(error);
    throw error;
  }


  let [scriptSrc, scripts] = await promiseTimeout(
    (
      await promiseTimeout(
        page.evaluateHandle(() => {
          const nodes = Array.from(
            document.getElementsByTagName('script')
          )

          return [
            nodes
              .filter(
                ({ src }) =>
                  src && !src.startsWith('data:text/javascript;')
              )
              .map(({ src }) => src),
            nodes
              .map((node) => node.textContent)
              .filter((script) => script),
          ]
        }),
        { jsonValue: () => [] },
        'Timeout (scripts)'
      )
    ).jsonValue(),
    [],
    'Timeout (scripts)'
  )

  let meta = await promiseTimeout(
    (
      await promiseTimeout(
        page.evaluateHandle(() =>
          Array.from(document.querySelectorAll('meta')).reduce(
            (metas, meta) => {
              const key =
                meta.getAttribute('name') || meta.getAttribute('property')

              if (key) {
                metas[key.toLowerCase()] = metas[key.toLowerCase()] || []

                metas[key.toLowerCase()].push(
                  meta.getAttribute('content')
                )
              }

              return metas
            },
            {}
          )
        ),
        { jsonValue: () => [] },
        'Timeout (meta)'
      )
    ).jsonValue(),
    [],
    'Timeout (meta)'
  )

  let links = await promiseTimeout(
              (
                await promiseTimeout(
                  page.evaluateHandle(() =>
                    Array.from(document.getElementsByTagName('a')).map(
                      ({ hash, hostname, href, pathname, protocol, rel }) => ({
                        hash,
                        hostname,
                        href,
                        pathname,
                        protocol,
                        rel,
                      })
                    )
                  ),
                  { jsonValue: () => [] },
                  'Timeout (links)'
                )
              ).jsonValue(),
              [],
              'Timeout (links)'
            );


  let text = await promiseTimeout(
    (
      await promiseTimeout(
        page.evaluateHandle(
          () =>
            // eslint-disable-next-line unicorn/prefer-text-content
            document.body && document.body.innerText
        ),
        { jsonValue: () => '' },
        'Timeout (text)'
      )
    ).jsonValue(),
    '',
    'Timeout (text)'
  )

  let css = await promiseTimeout(
    (
      await promiseTimeout(
        page.evaluateHandle((maxRows) => {
          const css = []

          try {
            if (!document.styleSheets.length) {
              return ''
            }

            for (const sheet of Array.from(document.styleSheets)) {
              for (const rules of Array.from(sheet.cssRules)) {
                css.push(rules.cssText)

                if (css.length >= maxRows) {
                  break
                }
              }
            }
          } catch (error) {
            return ''
          }

          return css.join('\n')
        }, 9999),
        { jsonValue: () => '' },
        'Timeout (css)'
      )
    ).jsonValue(),
    '',
    'Timeout (css)'
  )
  
  //js
  let js = await promiseTimeout(getJs(page), [], 'Timeout (js)')
  //console.log(js, js.length);
  const resultJs = await analyzeJs(js);
  console.log("analyzeJs", resultJs.length);

  // DOM
  let dom = await promiseTimeout(getDom(page), [], 'Timeout (dom)')
  //console.log(dom, dom.length);
  const resultDom = await analyzeDom(dom);
  console.log("analyzeDom", resultDom.length);


  
  console.log(certIssuer);
  //console.log(headers);

  var detections = await Wappalyzer.analyze({
    url: await page.url(),
    meta, //{ generator: ['WordPress'] },
    headers,
    scripts,
    scriptSrc: scriptSrc,//['jquery-3.0.0.js'],
    cookies, //{ awselb: [''] },
    html: await getHTML(page),
    links,
    text,
    css,
    certIssuer,
  });
  const results = Wappalyzer.resolve(detections)

  let detections2 = [detections, resultDom, resultJs].flat();

  detections2 = detections2.filter(
    (
      { technology: { name }, pattern: { regex }, version },
      index,
      detections2
    ) =>
      detections2.findIndex(
        ({
          technology: { name: _name },
          pattern: { regex: _regex },
          version: _version,
        }) =>
          name === _name &&
          version === _version &&
          (!regex || regex.toString() === _regex.toString())
      ) === index
  )


  const r = detections2;
  const rr =  Wappalyzer.resolve(detections2);

  console.log(r.length)
  console.log(rr.length)

  return rr;
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


const analyzeDom = async (dom, technologies = Wappalyzer.technologies) => {
  return dom
    .map(({ name, selector, exists, text, property, attribute, value }) => {
      const technology = technologies.find(({ name: _name }) => name === _name)

      if (typeof exists !== 'undefined') {
        return Wappalyzer.analyzeManyToMany(technology, 'dom.exists', {
          [selector]: [''],
        })
      }

      if (typeof text !== 'undefined') {
        return Wappalyzer.analyzeManyToMany(technology, 'dom.text', {
          [selector]: [text],
        })
      }

      if (typeof property !== 'undefined') {
        return Wappalyzer.analyzeManyToMany(technology, `dom.properties.${property}`, {
          [selector]: [value],
        })
      }

      if (typeof attribute !== 'undefined') {
        return Wappalyzer.analyzeManyToMany(technology, `dom.attributes.${attribute}`, {
          [selector]: [value],
        })
      }
    })
    .flat()
}

const analyzeJs = (js, technologies = Wappalyzer.technologies) => {
  return js
    .map(({ name, chain, value }) => {
      return Wappalyzer.analyzeManyToMany(
        technologies.find(({ name: _name }) => name === _name),
        'js',
        { [chain]: [value] }
      )
    })
    .flat()
}

const getAccessibilityReport = async(page) => {
  console.log("getAccessibilityReport");
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
  let filename = url.replaceAll('https','');
  filename = filename.replaceAll('http','');
  filename = filename.replaceAll(':','');
  filename = filename.replaceAll('/','');
  filename += "-" + date + ".json";
  return filename;
}

let headers = {};
let certIssuer;


const getReportForURLParallel = async(url, browser) => {

  console.log(url);
  
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
    alinks: null,
  }



  var status = null;

  if(!url.includes("https://")) {
    url = "https://" + url;
  }

  const page = await browser.newPage();
  page.setRequestInterception(true);
  page.on('request', (request) => {
    request.continue();
  }); 
  page.on("requestfinished", (request) => {
    const response = request.response();
    status = response.status();
  });

  page.on('response', async (response) => {

    let tempHeaders = {};

    const rawHeaders = response.headers()
    Object.keys(rawHeaders).forEach((key) => {
      tempHeaders[key] = [
        ...(tempHeaders[key] || []),
        ...(Array.isArray(rawHeaders[key])
          ? rawHeaders[key]
          : [rawHeaders[key]]),
      ]
    })

    
    // Prevent cross-domain redirects
    if (response.status() >= 300 && response.status() < 400) {
      if (tempHeaders.location) {
        const _url = new URL(tempHeaders.location.slice(-1), url)
        const originalUrl = new URL(url);

        if (
          _url.hostname.replace(/^www\./, '') ===
            originalUrl.hostname.replace(/^www\./, '')
        ) {
          //url = _url

          return
        }
      }
    }

   certIssuer = response.securityDetails()
      ? response.securityDetails().issuer()
      : ''

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

  const body = await page.$('body');
  var numberOfElements = (await body.$$('*')).length;
  if(numberOfElements == 1) {
    var preCount = (await body.$$("pre")).length;
    if(preCount == 1) {
      return {url, error: "Not a HTML page", filename: generateFilename(url, Date.now()) };
    }
  }

  data.date = Date.now();
  var result = await /*oraPromise(*/Promise.all([getAccessibilityReport(page), /*getTechnologies(url)*/ getTechnologies(page), getExternalJavacript(page), getExternalCSS(page), getHTML(page), getImages(page), getALinks(page),  generateFilename(url, data.date)])/*, `Generating report - ${url}`)*/;
  //console.log(result, result.length);
  
  data.url = url,
  data.accessibility = result[0];
  data.technologies = result[1];
  data.externalJavascript = result[2];
  data.externalCSS = result[3];
  data.html = result[4];
  data.images = result[5];
  data.alinks = result[6];
  data.filename = result[7];

  await page.close();

  return data;
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
    
  var websites = await readWebsiteCSV('website.csv');
  var splittedWebsites = sliceIntoChunks(websites, chunkSize);

  for(let websitesL of splittedWebsites) {
    console.log(websitesL)
    var start = new Date()
    await BatchGenerateReport(websitesL);
    var end = new Date() - start;
    console.info('Execution time: %dms', end) 
  
  }
  
  
  //await startGeneratingReports(websites);
  //var start = new Date()
  //await BatchGenerateReport(websites);
  //var end = new Date() - start;
  //console.info('Execution time: %dms', end) 

})();


