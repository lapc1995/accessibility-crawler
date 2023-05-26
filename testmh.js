import puppeteer from 'puppeteer';
import * as fs from 'fs';
import { AxePuppeteer } from '@axe-core/puppeteer';

(async function main() {


  try {
    const browser = await puppeteer.launch(
      {
        headless: false, 
        args: ['--allow-file-access-from-files', '--no-sandbox'],
      }
    );
    const page = await browser.newPage();
    page.setJavaScriptEnabled(true);
    await page.setBypassCSP(true);
    await page.goto('file:///Users/luiscarvalho/accessibility-crawler/page.mhtml');
    //var contentHtml = fs.readFileSync('/Users/luiscarvalho/accessibility-crawler/page.mhtml', 'utf8');
    //await page.setContent(contentHtml);

    console.log('Page loaded');
    let results = await new AxePuppeteer(page).analyze();
    console.log('Page analyzed')
    console.log(results.violations);
    console.log(results.violations.length);

    await page.close();

    let newPage = await browser.newPage();
    await newPage.goto('https://en.wikipedia.org/wiki/MHTML', {waitUntil: ['networkidle0']});
    let results2 = await new AxePuppeteer(newPage).analyze();
    console.log(results2.violations);
    console.log(results2.violations.length);
  
    await browser.close();


    /*
    await page.goto('https://en.wikipedia.org/wiki/MHTML');
    const cdp = await page.target().createCDPSession();
    const { data } = await cdp.send('Page.captureSnapshot', { format: 'mhtml' });
    fs.writeFileSync('page.mhtml', data);

    await browser.close();
    */
  } catch (err) {
    console.error(err);
  }
})();


