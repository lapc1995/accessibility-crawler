import * as fs from 'fs';
import { readWebsiteCSV, saveReportToJSONFile, withTimeoutAndParameters, forbiddenFilenameCharacters } from './../utils.js';
import {browser, initBrowser, waitForBrowser} from '../browserHandler.js'
import * as db from '../localDatabase.js';

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
  
    let websites = await readWebsiteCSV(csvPath);

    //remove websites that are already analysed
    const analysedWebsites = await db.getAnalysedWebsites();
    for(let analysedWebsite of analysedWebsites) {
        let domain = analysedWebsite.domain.replaceAll("https://", "");
        domain = domain.replaceAll("http://", "");
        const index = websites.findIndex((website) => website.Domain == domain);
        if(index != -1) {
            websites.splice(index, 1);
        }
    }

    let currentWebsite = await db.getCurrentWebsite();
    if(currentWebsite != null) {
        let domain = currentWebsite.domain.replaceAll("https://", "");
        domain = domain.replaceAll("http://", "");
        const index = websites.findIndex((website) => website.Domain == domain);
        if(index != -1) {
            let websiteElement = websites[index];
            websites.splice(index, 1);
            websites = [websiteElement, ...websites];
        }
    }

    for(let website of websites) {

        try {
            await waitForBrowser();
            await withTimeoutAndParameters(analyseDomain, {website, contextFunction}, 1000 * 60 * 5);

        } catch(e) {
            await waitForBrowser();
            const pages = await browser.pages();
            // Loop through each page and close it
            for (let i = 0; i < pages.length; i++) {
              const currentPage = pages[i];
              await currentPage.close();
            }

            await db.setCurrentWebsiteToAnalysed();

            website = website.Domain;

            let dirname = website.replaceAll('https://','');
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
            } 
        
            const errorFolder = `${dirname}/error`;

            if(!fs.existsSync(errorFolder)) {
                fs.mkdirSync(errorFolder);
            }
            
            let error = {
                filename: website,
                error: e
            }
            saveReportToJSONFile(error, errorFolder);
      
        }
    }
    browser.close();
}

const analyseDomain = async (parameters) => {

    if(!parameters.website) {
        throw new Error("No website provided");
    }

    if(!parameters.contextFunction) {
        throw new Error("No context function provided");
    }

    let website = parameters.website;
    let contextFunction = parameters.contextFunction;

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
        dirname = `./data/${dirname}`;
        if(!fs.existsSync("./data")) {
            fs.mkdirSync("./data");
        }
        if(!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname);
        }
        const errorFolder = `${dirname}/error`;
        if(!fs.existsSync(errorFolder)) {
            fs.mkdirSync(errorFolder);
        }

        let error = {
            filename: website,
            error: e
        }
        saveReportToJSONFile(error, errorFolder);
    }
    var end = new Date() - start;
    console.log('Execution time: %dms', end) 
}