
import { analyseECommerceSite } from "./ecommerce.js";
import * as fs from 'fs';
import { saveHtmlToFile, saveReportToJSONFile, removeDuplicateLinks, fixLink, forbiddenFilenameCharacters, delay } from './../utils.js';


import * as readline from 'readline';

/*
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
*/

const analyseECommerceSiteManually = async (dirname, url, browser, t, cookies, company) => {
    const primarySite = await analyseECommerceSite(url, browser, t, cookies, company) ;
    if(primarySite.error) {
        saveReportToJSONFile(primarySite, "./error");
        return;
    }
  
    saveHtmlToFile(dirname, primarySite.data.filename, primarySite.data.html);
    delete primarySite.data.html;
    saveReportToJSONFile(primarySite.data, dirname);

    return primarySite.page;
}


let urlM = null;
let dirnameM = null;
let browserM = null;
let companyM = null;
let cookiesM = null;
let pageM = null;
let finished = false;

process.stdin.on('keypress', async (str, key) => {
    console.log(key)
    if(key.name == 'a') {
        console.log("a")
        cookiesM = await pageM.cookies();
        let url = pageM.url();
        try {
            let page2 = await analyseECommerceSiteManually(dirnameM, url, browserM, true, cookiesM, companyM);
            await page2.close();
        } catch(e) {
            
        }
    } else if(key.name == 'n') {
        await pageM.close();
        finished = true;
    }
});

export const analyseECommerceDomainManually = async (url, browser, options) => {
  
    browserM = browser;

    if(!url.includes('http')) {
        url = `https://${url}`;
    }
  
    let dirname = url.replaceAll('https://','');
    dirname = dirname.replaceAll('http://','');
    if(dirname.slice(-1) == '/') {
        dirname = dirname.slice(0, -1);
    }
  
    forbiddenFilenameCharacters.forEach((character) => {
        dirname = dirname.replaceAll(character, "{");
    });
  
    dirname = `./data/${dirname}`;
  
    if(!fs.existsSync("./data")) {
      fs.mkdirSync("./data");
    }
  
    if(!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname);
    } else {
      //console.log("Directory already exists => " + dirname);
      //return;
    }

    dirnameM = dirname;
    companyM = options?.company ? options.company : null;

    pageM = await browser.newPage();
    urlM = url;
 

    await pageM.goto(url, {waitUntil: 'networkidle0'});


    /*
    while(true) {

        await page.waitForSelector('body');
        var t = await page.keyboard.down('A');
        let url = page.url();
        page = await analyseECommerceSiteManually(dirname, url, browser, true, null, company);
        await page.close();
    }

    

    let page = await analyseECommerceSiteManually(dirname, url, browser, true, null, company);

    await page.waitForNavigation();
    let newUrl = page.url();
    await page.close();

    page = await analyseECommerceSiteManually(dirname,newUrl, browser, true, null, company);
    await page.waitForNavigation();
    newUrl = page.url();
    await page.close();
    page = await analyseECommerceSiteManually(dirname, newUrl, browser, true, null, company);
    await page.close();
    */

    //await new Promise(resolve => {});
    while(!finished) {
        await delay(100);
    }
    finished = false;
}