const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('@axe-core/puppeteer');
const Wappalyzer = require('wappalyzer');
const jsonfile = require('jsonfile')


const url = 'https://www.amazon.co.uk/';

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

(async () => {

  let data = {
    url: null,
    accessibility: null,
    technologies: null,
    html: null, 
  }


  try {
    await wappalyzer.init()

    // Optionally set additional request headers
    const headers = {}

    const site = await wappalyzer.open(url, headers)

    // Optionally capture and output errors
    //site.on('error', console.error)

    const results = await site.analyze()

    console.log(results);

    data.technologies = results;

  } catch (error) {
    console.error(error)
  }

  await wappalyzer.destroy()

  const browser = await puppeteer.launch({headless: 'chrome'});
  const page = await browser.newPage();
  await page.goto(url);

  const results = await new AxePuppeteer(page).analyze();
  console.log(results.violations.length);
  for (const violation of results.violations) {
    console.log(violation);
  }

  delete results.inapplicable;

  data.accessibility = results;


  let links = await page.$$('script');
  console.log(links);
  for (const link of links) {
    var innerHTML = await link.evaluate( node => node.innerHTML);
    var src = await link.evaluate( node => node.getAttribute("src"));
  
    if(innerHTML != null)  {
      console.log(innerHTML)
    } else {
      console.log(src)
    }

  }

  const file = 'data.json'
  jsonfile.writeFile(file, data, function (err) {
    if (err) console.error(err)
  })

  await page.close();
  await browser.close();


})();