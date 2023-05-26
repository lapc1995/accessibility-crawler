import * as fs from 'fs';
import puppeteer from 'puppeteer';
import { readWebsiteCSV, saveReportToJSONFile } from './../utils.js';
import {browser, initBrowser} from '../browserHandler.js'

export const run = async (contextFunction) => {
    await initBrowser();
    const csvPath = process.env.CSVFILEPATH;
    if(csvPath == null) {
        console.log("No CSV file path provided");
        return;
    }

    if(!fs.existsSync("./data")) {
        fs.mkdirSync("./data");
    }
  
    if(!fs.existsSync("./error")) {
        fs.mkdirSync("./error");
    }
  
    const websites = await readWebsiteCSV(csvPath);
    for(let website of websites) {

        var start = new Date();
        let urlSplit = website.Domain.split(";");
        let selectedUrl = urlSplit[0];
        let company = null;
        if(process.env.CONTEXT == "ecommerce") {
            let selectedUrls = urlSplit.filter((url) => url.startsWith("shop") || url.startsWith("store"));
            if(selectedUrls.length > 0) {
                selectedUrl = selectedUrls[0];
            }
            company = website.Company;
        }
        selectedUrl = selectedUrl.replaceAll("*", "");
  
        try {
            await contextFunction(selectedUrl, browser, {company: company});
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