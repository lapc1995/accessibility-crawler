import * as fs from 'fs';
import { JsonDB, Config } from 'node-json-db';
import seedrandom from 'seedrandom';
import puppeteer from 'puppeteer';

import { saveHtmlToFile, saveReportToJSONFile, removeDuplicateLinks, fixLink, generateFilename, readWebsiteCSV, forbiddenFilenameCharacters} from '../utils.js';
import { analysePrimarySite, analyseSecondarySite } from '../analyser.js'

export const run = async() => {
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
    const csvPath = "./majestic_million.csv";
    if(csvPath == null) {
        console.log("No CSV file path provided");
        return;
    }
    
    if(!fs.existsSync("./error")) {
        fs.mkdirSync("./error");
    }
    
    const db = new JsonDB(new Config("testdb", true, true, '/'));
    let analysed;
    try {
        analysed = await db.getData('/analysed');
    } catch (error) {
        analysed = [];
    }
    
    const websites = await readWebsiteCSV(csvPath);
    
    //select 100 random websites
    let randomWebsites = [];
    let rng = seedrandom('134tb3q44');
    for(let i = 0; i < 100; i++) {
        //generate random number between 0 and 1000000
        let randomIndex = Math.floor(rng() * websites.length);
        randomWebsites.push(websites[randomIndex]);
    }
    
    for(let website of randomWebsites) {
        var start = new Date()
        try {  
            if(analysed.includes(website.Domain)) {
                console.log("Already analysed", website.Domain);
                continue;
            }
            await analyseTestDomain(website.Domain, browser);
        } catch(e) {
            console.log("Error", e);
            var filename = website.Domain.replaceAll('https://','');
            e.filename = filename;
            saveReportToJSONFile(e, "./error/");
        }
        await db.push('/analysed[]', website.Domain, true);
        var end = new Date() - start;
        console.info('Execution time: %dms', end) 
    }
    browser.close();
}


const analyseTestDomain = async (url, browser) => {

    console.log(url);
  
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
    
    console.log("Analysing " + url + " ...")
    const primarySite = await analysePrimarySite(url, browser, {technologyReport: true, dontClosePage: false});
    if(primarySite.error) {
      saveReportToJSONFile(primarySite, "./error");
      return;
    }
    saveHtmlToFile(dirname, primarySite.filename, primarySite.html);
    delete primarySite.html;
    saveReportToJSONFile(primarySite, dirname);
  
    let filtredLinks = removeDuplicateLinks(primarySite.alinks);
    console.log(filtredLinks);
    filtredLinks = filtredLinks.filter((link) => link.href.charAt(0) == '/' || link.href.includes(url));
    console.log(filtredLinks);
  
  
    for(let link of filtredLinks) {
      const fixedLink = fixLink(link.href, url);
  
      let filename = dirname + "/" + generateFilename(fixedLink) + ".jsonld";
      if(fs.existsSync(filename)) {
        continue;
      }
  
      console.log("Analysing " + fixedLink + " ...")
      try {
        const resultSecondarySite = await analyseSecondarySite(fixedLink, browser, {technologyReport: false, dontClosePage: false});
        if(resultSecondarySite.error) {
          saveReportToJSONFile(resultSecondarySite, "./error");
        } else {
          saveHtmlToFile(dirname, resultSecondarySite.filename, resultSecondarySite.html);
          delete resultSecondarySite.html;
          saveReportToJSONFile(resultSecondarySite, dirname);
        }
      } catch (error) {
        console.log(error);
        error.link = fixedLink;
        saveReportToJSONFile(error, "./error");
      }
  
  
      //await resultSecondarySite.page.close();
    }
  
    //await primarySite.page.close();
  }