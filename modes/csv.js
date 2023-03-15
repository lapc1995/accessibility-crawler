import * as fs from 'fs';
import puppeteer from 'puppeteer';
import { readWebsiteCSV, saveReportToJSONFile } from './../utils.js';

export const run = async (contextFunction) => {
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
  
    if(!fs.existsSync("./error")) {
        fs.mkdirSync("./error");
    }
  
    const websites = await readWebsiteCSV(csvPath);
    for(let website of websites) {
        var start = new Date()

        let urlSplit = website.Domain.split(";");
        let selectedUrl = urlSplit[0];
        if(process.env.CONTEXT == "ecommerce") {
            let selectedUrls = urlSplit.filter((url) => url.startsWith("shop") || url.startsWith("store"));
            if(selectedUrls.length > 0) {
                selectedUrl = selectedUrls[0];
            }
        }
        selectedUrl = selectedUrl.replaceAll("*", "");
  
        try {
            await contextFunction(selectedUrl, browser);
        }catch(e) {
            console.log("Error", e);
            var filename = selectedUrl.replaceAll('https://','');
            e.filename = filename;
            saveReportToJSONFile(e, "./error/");
        }
        var end = new Date() - start;
        console.log('Execution time: %dms', end) 
    }
    browser.close();
}