import puppeteer from 'puppeteer';
import * as fs from 'fs';
import { AxePuppeteer, loadPage  } from '@axe-core/puppeteer';

import mhtml2html from 'mhtml2html';
import jsdom from 'jsdom';

(async function main() {


  try {
    const browser = await puppeteer.launch(
      {
        headless: false, 
        args: ['--allow-file-access-from-files', '--no-sandbox', '--disable-setuid-sandbox'],
      }
    );

    /*
    const getPage = await browser.newPage();
    await getPage.goto('https://en.wikipedia.org/wiki/MHTML');
    const cdp = await getPage.target().createCDPSession();
    const { data } = await cdp.send('Page.captureSnapshot', { format: 'mhtml' });
    fs.writeFileSync('page.mhtml', data);
    await getPage.close();
*/

    const page = await browser.newPage();
    page.setJavaScriptEnabled(true);
    await page.setBypassCSP(true);
    
    // Read the MHTML file
    const mhtmlContent = fs.readFileSync('C:/Users/lapc1/phd-code/page.mhtml', 'utf8');
    const html = mhtml2html.convert(mhtmlContent, { parseDOM: (html) => new jsdom.JSDOM(html) });
    console.log(html);
    await page.setContent(html.serialize(), { waitUntil: 'domcontentloaded' });

    console.log('Page loaded');
    let results = await new AxePuppeteer(page).analyze();
    console.log('Page analyzed')
    console.log(results.violations);
    console.log(results.violations.length); 
    console.log(results.violations[4].nodes[0])
    await page.close();

    
    let newPage = await browser.newPage();
    await newPage.goto('https://en.wikipedia.org/wiki/MHTML', {waitUntil: ['networkidle0']});
    let results2 = await new AxePuppeteer(newPage).analyze();
    console.log(results2.violations);
    console.log(results2.violations.length);

    await browser.close();
  
  } catch (err) {
    console.error(err);
  }
})();


