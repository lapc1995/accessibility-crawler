import * as fs from 'fs';
import { JsonDB, Config } from 'node-json-db';
import seedrandom from 'seedrandom';
import puppeteer from 'puppeteer';

import { saveReportToJSONFile, readWebsiteCSV } from './../utils.js';

export const run = async(contextFunction) => {
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
            await contextFunction(website.Domain, browser);
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
