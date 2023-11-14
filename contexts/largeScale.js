import * as fs from 'fs';
import robotsParser from 'robots-txt-parser';
import { saveHtmlToFile, saveReportToJSONFile, removeDuplicateLinks, fixLink, generateFilename, forbiddenFilenameCharacters, hasInvalidExtension, removeHashFromUrl, delay, removeNonHTTPSLinks, shuffleArray, cleanLinkList, isSameDomain, saveMhtmlToFile, withTimeout} from './../utils.js';
import { analysePrimarySite, analyseSecondarySite, getReportForURLParallel } from '../analyser.js';
import { waitForBrowser, browser } from '../browserHandler.js';
import * as db from '../lowdbDatabase.js'//'../localDatabase.js';
import * as largeWebsitesDB from '../largeWebsitesDatabase.js';

import * as vm from 'vm';

import * as websitesCache from '../websitesCache.js';


import { isMalicious } from '../maliciousDomainDetector.js';

import pLimit from 'p-limit';

const robots = robotsParser(
{
    userAgent: 'Googlebot', // The default user agent to use when looking for allow/disallow rules, if this agent isn't listed in the active robots.txt, we use *.
    allowOnNeutral: false // The value to use when the robots.txt rule's for allow and disallow are balanced on whether a link can be crawled.
});


async function analyizePage(domain, dataFolder, errorFolder, analysedUrls, parsedUrl, link, totalNumberOfLinks) {
    await waitForBrowser(browser);

    const result = {
        report: null,
        error: null,
        domain: domain,
        url: null,
        filename: null,
        totalNumberOfPages: -1,
        requiredNumberOfLinks: -1,
        retryAmount: -1,
        retryIncrement: 0,
        timestamp: Date.now(),
    };

    const fixedLink = fixLink(link.href, domain);
    result.url = fixedLink;

    await db.addPageToBeAnalysed(fixedLink);

    let filename = dataFolder + "/" + generateFilename(fixedLink) + ".jsonld";
    result.filename = filename;
    if(fs.existsSync(filename)) {

        const newLinksLength = totalNumberOfLinks - 1;
        result.totalNumberOfPages = newLinksLength;

        //await db.removePageToBeAnalysed(fixedLink);
        //await db.setCurrentWebsiteTotalNumberOfPages(newLinksLength);

        /*
        if(totalNumberOfLinks < 11) {
            result.requiredNumberOfLinks = newLinksLength;
            result.retryAmount = newLinksLength;
        } else {
            result.requiredNumberOfLinks = Math.round(newLinksLength * 0.20);
            result.retryAmount = Math.round(newLinksLength * 0.23);
        }*/
    
        console.log('link already analysed', fixedLink);
        result.error = "Already analysed and on file";

        return result;
    }

    console.log("Analysing " + fixedLink + " ...")

    try {
        const canCrawl = await robots.canCrawl(fixedLink)
        if(!canCrawl) {
            console.log("Can't crawl page", fixedLink);
            result.error = "Can't crawl page";

            //await db.setPagetoFailedAnalysedPage(fixedLink, "Can't crawl page");
            return result;
        }
    } catch(e) {
        console.log(e);
    }


    if(isMalicious(fixedLink)) {
        console.log("Malicious Page");           
        //await db.setPagetoFailedAnalysedPage(fixedLink, "Malicious Page");
        result.error = "Malicious Page";
        return result;
    }

    try {
        const resultSecondarySite = await getReportForURLParallel(fixedLink, {technologyReport: false, dontClosePage: false, analysedUrls: analysedUrls, homepageLink: parsedUrl});
        if(resultSecondarySite.error) {
            if(resultSecondarySite.error == "Protocol error (Target.createTarget): Target closed." ||
               resultSecondarySite.error == "Navigation failed because browser has disconnected!" ||
               resultSecondarySite.error == "browser.userAgent is not a function") {
                await waitForBrowser(browser);
            } 

            //saveReportToJSONFile(resultSecondarySite, errorFolder);
            //await db.setPagetoFailedAnalysedPage(fixedLink, resultSecondarySite.error);
              
            result.error = resultSecondarySite.error;
            result.report = resultSecondarySite;

            if(resultSecondarySite.error != "Already analysed" &&
               resultSecondarySite.error != "Not the same domain" &&
               resultSecondarySite.error != "XML Page" &&
               resultSecondarySite.error != "browser.userAgent is not a function") {
                result.retryIncrement++;
            }
            console.log(resultSecondarySite.url);
            return result;
        } else {

            if(isMalicious(resultSecondarySite.url)) {
                resultSecondarySite.error = "Malicious Page";
                result.error = resultSecondarySite.error;
                result.report = resultSecondarySite;

                console.log(resultSecondarySite.url);

                return result;
            }

            //analysedUrls.push(resultSecondarySite.url);
            if(isSameDomain(resultSecondarySite.url, parsedUrl)) {
                
                //await db.setPageToAnalysed(fixedLink);
                //saveHtmlToFile(dirname, resultSecondarySite.filename, resultSecondarySite.html);
                //saveMhtmlToFile(dataFolder, resultSecondarySite.filename, resultSecondarySite.mhtml);
                //delete resultSecondarySite.html;
                //delete resultSecondarySite.mhtml;
                //saveReportToJSONFile(resultSecondarySite, dataFolder);

                result.report = resultSecondarySite;

                console.log(resultSecondarySite.url);

                return result;
            } else {
                console.log("Not the same domain", resultSecondarySite.url);
                result.error = "Not the same domain";
                console.log(resultSecondarySite.url);
                return result;
            }
        }

    } catch (error) {

        console.log(error);
        error.error = error.message;
        error.link = fixedLink;
        error.filename = generateFilename(fixedLink);
 
        result.error = error.error;
        result.report = error;

        console.log(fixedLink);
        return result;
    }
}

const analysePhoneHomePage = async (domain, url) => {

    const result = {
        report: null,
        error: null,
        domain: domain,
        url: null,
        filename: null,
        totalNumberOfPages: -1,
        requiredNumberOfLinks: -1,
        retryAmount: -1,
        retryIncrement: 0,
        timestamp: Date.now(),
    };

    await db.addPageToBeAnalysed(url + "(phone)");

    try {
        const phoneHomePage = await getReportForURLParallel(url, {technologyReport: false, dontClosePage: false, phone: true});
        phoneHomePage.url += "(phone)";
    
        if(phoneHomePage.error) {
            result.error = phoneHomePage.error;
            result.filename = phoneHomePage.filename;
            result.url = phoneHomePage.url;
            result.report = phoneHomePage;
          
            
            //await db.addPageToBeAnalysed(phoneHomePage.url + "(phone)");
            //await db.setPagetoFailedAnalysedPage(phoneHomePage.url + "(phone)", phoneHomePage.error);
            if(phoneHomePage.error == "Protocol error (Target.createTarget): Target closed." ||
               phoneHomePage.error == "Navigation failed because browser has disconnected!") {
                await waitForBrowser(browser);
            }
            
            return result;
        } else {
            result.filename = phoneHomePage.filename;
            result.url = phoneHomePage.url;
            result.report = phoneHomePage;
    
            
            return result;
            /*
            saveMhtmlToFile(dataFolder, phoneHomePage.filename, phoneHomePage.mhtml);
            delete phoneHomePage.html;
            delete phoneHomePage.mhtml;
            saveReportToJSONFile(phoneHomePage, dataFolder);
            await db.addPageToBeAnalysed(phoneHomePage.url + "(phone)");
            await db.setPageToAnalysed(phoneHomePage.url + "(phone)");
            */
        }

    } catch(error) {
        result.filename = phoneHomePage.filename;
        result.url = phoneHomePage.url;
        result.error = error.message;
        return result;
    }
}

const analyseContactPage = async(domain, dataFolder, errorFolder, analysedUrls, parsedUrl, url) => {
    try {
        const contactUrl = new URL("contact", url);
        let contactPage = await browser.newPage();
        let contactReponse = await contactPage.goto(contactUrl.href, {waitUntil: 'networkidle2', timeout: 30000});
        let contactStatus = `${contactReponse.status()}`;
        if(contactStatus.charAt(0) == "4" || contactStatus.charAt(0) == "5" || !isSameDomain(contactPage.url(), parsedUrl)) {
            await contactPage.close();
            return;
        }

        await contactPage.close();
        return await analyizePage(domain, dataFolder, errorFolder, analysedUrls, parsedUrl, contactUrl)

    } catch(e) {
        if(e.message == "Protocol error (Target.createTarget): Target closed." ||
            e.message == "Navigation failed because browser has disconnected!") {
            await waitForBrowser(browser);
            return;
        }
    }
}


export const analyseLargeScaleDomain = async (url) => {

    await waitForBrowser();

    let tempWebsite = await db.getTempCurrentWebsite();
    if(tempWebsite != null) {
        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(url);
        await db.setPagetoFailedAnalysedPage(url, "Page caused restart");
        await db.setCurrentWebsiteToAnalysed();
        await db.setTempCurrentWebsite(null);
        return;
    }

    await db.setTempCurrentWebsite(url);

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

    const dataFolder = `${dirname}/data`;
    const errorFolder = `${dirname}/error`;

    if(!fs.existsSync(dataFolder)) {
        fs.mkdirSync(dataFolder);
    }

    if(!fs.existsSync(errorFolder)) {
        fs.mkdirSync(errorFolder);
    }
    
    console.log("Analysing " + url + " ...")
    try {
        await robots.useRobotsFor(url);
        await robots.useRobotsFor(url);

        
        let canCrawlMain = false;
        
        try {

            let sandbox = {
                robots: robots,
                url: url,
            }

            const vmContext = new vm.createContext(sandbox);
            const scriptCode = `
            (async () => {
                return await robots.canCrawl(url);
            })();`;
            canCrawlMain = await vm.runInContext(scriptCode, vmContext, {timeout: 2000});
        } catch(e) {
            canCrawlMain = true;
            console.log(e);
        }
    
        if(!canCrawlMain) {
            console.log("Can't crawl main page");
            await db.setCurrentWebsite(url, [], 0);
            await db.addPageToBeAnalysed(url);
            await db.setPagetoFailedAnalysedPage(url, "Can't crawl main page");
            await db.setCurrentWebsiteToAnalysed();
            await db.setTempCurrentWebsite(null);
            return;
        }
    } catch(e) {
        console.log(e);
    }

    //check if domain is malicious
    if(isMalicious(url)) {
        console.log("Malicious domain");
        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(url);
        await db.setPagetoFailedAnalysedPage(url, "Malicious domain");
        await db.setCurrentWebsiteToAnalysed();
        await db.setTempCurrentWebsite(null);
        saveReportToJSONFile({url, error: "Malicious domain", filename: generateFilename(url, Date.now()) }, errorFolder);
        return;
    }



    //check that is home page
    await waitForBrowser();

    let testHomePage = await browser.newPage();
    let testHomePageResult = null;

    try {
        testHomePageResult = await testHomePage.goto(url, {waitUntil: 'networkidle2', timeout: 30000});
    } catch(e) {
        await delay(2000);
        await testHomePage.close();
        saveReportToJSONFile({url, error: e.message, filename: generateFilename(url, Date.now()) }, errorFolder);
        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(url);
        await db.setPagetoFailedAnalysedPage(url, e.message);
        await db.setCurrentWebsiteToAnalysed();
        await db.setTempCurrentWebsite(null);
        return;
    }
    
    if(testHomePageResult == null) {
        console.log("Got null, trying wait.");
        testHomePageResult = await testHomePage.waitForResponse(() => true);
    }
    
    let testHomePageStatus = `${testHomePageResult.status()}`;

    if(testHomePageStatus != null && (testHomePageStatus.charAt(0) == "4" || testHomePageStatus.charAt(0) == "5")) {
        await testHomePage.close();
        saveReportToJSONFile({url, error: testHomePageStatus, filename: generateFilename(url, Date.now()) }, errorFolder);
   
        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(testHomePageResult.url());
        await db.setPagetoFailedAnalysedPage(testHomePageResult.url(), testHomePageStatus);
        await db.setCurrentWebsiteToAnalysed();
        await db.setTempCurrentWebsite(null);

        return;
    }

    let homeURL = testHomePageResult.url();
    await testHomePage.close();
    homeURL = new URL(homeURL);

    //console.log(url,homeURL.host)

    if(websitesCache.hasWebsiteBeenVisited(homeURL.host)) {
        console.log("Website already visited");
        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(homeURL.host);
        await db.setPagetoFailedAnalysedPage(homeURL.host, "Website already visited");
        await db.setCurrentWebsiteToAnalysed();
        await db.setTempCurrentWebsite(null);

        let error = {};
        error.error = "Website already visited";
        error.link = homeURL.host
        error.filename = generateFilename(homeURL.host);
        saveReportToJSONFile(error, errorFolder);
        return;
    }

    if(isMalicious(homeURL.host)) {
        console.log("Malicious domain");
        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(homeURL.host + "(homepage)");
        await db.setPagetoFailedAnalysedPage(homeURL.host, "Malicious domain");
        await db.setCurrentWebsiteToAnalysed();
        await db.setTempCurrentWebsite(null);

        tempFilename = generateFilename(url, Date.now());
        tempFilename += "(homepage)";

        saveReportToJSONFile({url: homeURL.host, error: "Malicious domain", filename: tempFilename }, errorFolder);
        return;
    }

    const primarySite = await analysePrimarySite(homeURL.host, {technologyReport: true, dontClosePage: false});
    if(primarySite.error) {

        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(primarySite.url + "(homepage)");
        await db.setPagetoFailedAnalysedPage(primarySite.url + "(homepage)", primarySite.error);
        await db.setCurrentWebsiteToAnalysed();
        await db.setTempCurrentWebsite(null);
        
        if(primarySite.error == "Protocol error (Target.createTarget): Target closed." || 
            primarySite.error == "Navigation failed because browser has disconnected!") {
            await waitForBrowser(browser);
        }

        primarySite.filename += "(homepage)";
        saveReportToJSONFile(primarySite, errorFolder);
        return;
    }

    if(isMalicious(primarySite.url)) { 
    
        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(primarySite.url + "(homepage)");
        await db.setPagetoFailedAnalysedPage(primarySite.url + "(homepage)", "Malicious domain");
        await db.setCurrentWebsiteToAnalysed();
        await db.setTempCurrentWebsite(null);
        
        primarySite.filename += "(homepage)";
        saveReportToJSONFile(primarySite, errorFolder);
        return;
    }

    primarySite.filename += "(homepage)";
    //saveHtmlToFile(dirname, primarySite.filename, primarySite.html);
    saveMhtmlToFile(dataFolder, primarySite.filename, primarySite.mhtml);
    delete primarySite.html;
    delete primarySite.mhtml;
    saveReportToJSONFile(primarySite, dataFolder);

    if(typeof primarySite.alinks === 'string') {
        console.log("Error: " + primarySite.alinks);
        return;
    }

    let filtredLinks = cleanLinkList(primarySite.url, primarySite.alinks);
    let parsedUrl = new URL(primarySite.url);

    console.log(filtredLinks.length + " links found");
    const analysedUrls = [];
    analysedUrls.push(primarySite.url);

    //analyse 20% of links
    let requiredNumberOfLinks = Math.round(filtredLinks.length * 0.20);
    let retryAmount = Math.round(filtredLinks.length * 0.23);
    let retryCounter = 0;
    let successfullLinksCounter = 0;

    console.log("Required number of links: " + requiredNumberOfLinks);
    filtredLinks = shuffleArray(filtredLinks);
    
    //filtredLinks = filtredLinks.slice(0, requiredNumberOfLinks);
    //const justUrls = filtredLinks.map((link) => link.href);

    await db.setTempCurrentWebsite(null);

    const isWebsiteCurrent = await db.isWebsiteCurrent(url);
    if(!isWebsiteCurrent) {
        await db.setCurrentWebsite(url, [], filtredLinks.length);
        await db.addPageToBeAnalysed(primarySite.url + "(homepage)");
        await db.setPageToAnalysed(primarySite.url + "(homepage)");
    } else {
        let currentWebsite = await db.getCurrentWebsite();
        retryCounter = currentWebsite.failedAnalysedPages.length;
        successfullLinksCounter = currentWebsite.analysedPages.length;
        analysedUrls.push(...currentWebsite.analysedPages);

        let failedPages = currentWebsite.failedAnalysedPages.map((page) => page.url);
        analysedUrls.push(...failedPages);

        filtredLinks.forEach(element => {
            element.href =  fixLink(element.href, primarySite.url);
        });

        filtredLinks = filtredLinks.filter((link) => !analysedUrls.includes(link.href));

        let toBeAnalysedTemp =  [...currentWebsite.toBeAnalysed];

        //if website on toBeAnalysed, just clean it from list and assume that it was a error
        for(let link of toBeAnalysedTemp) {
            let error = {};
            error.error = "Restart happened while analysing";
            error.link = link
            error.filename = generateFilename(link);
            await db.setPagetoFailedAnalysedPage(link, error.error);
            saveReportToJSONFile(error, errorFolder);
        }

        filtredLinks = filtredLinks.filter((link) => !toBeAnalysedTemp.includes(link));
        /*
        const toBeAnalysedElements = [];
        for(let link of currentWebsite.toBeAnalysed) {
            const index = filtredLinks.findIndex((page) => page.href == link);
            if(index != -1) {
                let pageElement = filtredLinks[index];
                filtredLinks.splice(index, 1);
                toBeAnalysedElements.push(pageElement);
            }
        }
        filtredLinks = [...toBeAnalysedElements, ...filtredLinks];
        */
    }


    if(filtredLinks.length > 100) {
        largeWebsitesDB.addLargeWebsite(url, filtredLinks.length);
        await db.setCurrentWebsiteToAnalysed();
        return;
    } else if(filtredLinks.length < 11) {
        requiredNumberOfLinks = filtredLinks.length;
        retryAmount = filtredLinks.length
    }

    
    //phone page
    /*
    const phoneHomePage = await getReportForURLParallel(url, browserFromHandler, {technologyReport: false, dontClosePage: false, phone: true});
    if(phoneHomePage.error) {
        await db.addPageToBeAnalysed(phoneHomePage.url + "(phone)");
        await db.setPagetoFailedAnalysedPage(phoneHomePage.url + "(phone)", phoneHomePage.error);
        if(primarySite.error == "Protocol error (Target.createTarget): Target closed." ||
           primarySite.error == "Navigation failed because browser has disconnected!") {
            await waitForBrowser(browserFromHandler);
        }
        phoneHomePage.filename += "(phone)";
        saveReportToJSONFile(phoneHomePage, errorFolder);
    } else {
        saveMhtmlToFile(dataFolder, phoneHomePage.filename, phoneHomePage.mhtml);
        delete phoneHomePage.html;
        delete phoneHomePage.mhtml;
        saveReportToJSONFile(phoneHomePage, dataFolder);
        await db.addPageToBeAnalysed(phoneHomePage.url + "(phone)");
        await db.setPageToAnalysed(phoneHomePage.url + "(phone)");
    }*/


    //check if contact page exists

    /*
    try {
        const contactUrl = new URL("contact", primarySite.url);
        let contactPage = await browserFromHandler.newPage();
        let contactReponse = await contactPage.goto(contactUrl.href, {waitUntil: 'networkidle2', timeout: 30000});
        let contactStatus = `${contactReponse.status()}`;
        if(contactStatus.charAt(0) == "4" || contactStatus.charAt(0) == "5" || !isSameDomain(contactPage.url(), parsedUrl)) {
            await contactPage.close();
        }  else {
            filtredLinks = [contactUrl, ...filtredLinks];
            requiredNumberOfLinks++;
            await contactPage.close();
        }

    } catch(e) {
        if(e.message == "Protocol error (Target.createTarget): Target closed." ||
            e.message == "Navigation failed because browser has disconnected!") {
            await waitForBrowser(browserFromHandler);
        }
    }*/

    const limit = pLimit(5);

    let numberOfLinks = filtredLinks.length;
    let numberOfLinksOriginal = filtredLinks.length;

    for(let i = 0; i < filtredLinks.length && successfullLinksCounter < requiredNumberOfLinks && retryCounter < retryAmount; i++) {

        const tasks = [];

        if(i == 0) {
            tasks.push(limit(async () => await analysePhoneHomePage(primarySite.url, primarySite.url)));
            tasks.push(limit(async () => { return await analyseContactPage(primarySite.url, dataFolder, errorFolder, analysedUrls, parsedUrl, primarySite.url); }));
        }

        for(let i = 0; i < requiredNumberOfLinks; i++) {
            tasks.push(limit(async () => await analyizePage(primarySite.url, dataFolder,  errorFolder, analysedUrls, parsedUrl, filtredLinks[i], numberOfLinks)));   
        }

        const result = await Promise.all(tasks);
        console.log(result);

        const linkMap = new Map();
        for(const pageReport of result) {
            if(!pageReport) {
                continue;
            }

            if(linkMap.has(pageReport.url)) {
                linkMap.get(pageReport.url).push(pageReport);
            } else {
                linkMap.set(pageReport.url, [pageReport]);
            }
        }

        const finalList = [];
        for(const [key, value] of linkMap.entries()) {
            finalList.push(value[0]);
            if(value.length > 1) {
                for(let i = 1; i < value.length; i++) {
                    await db.removePageToBeAnalysed(value[i].url);
                    numberOfLinks -= 1;
                    await db.setCurrentWebsiteTotalNumberOfPages(numberOfLinks);
                    if(filtredLinks.length < 11) {
                        requiredNumberOfLinks = numberOfLinks;
                        retryAmount = numberOfLinks;
                    } else {
                        requiredNumberOfLinks = Math.round((numberOfLinks) * 0.20);
                        retryAmount = Math.round((numberOfLinks) * 0.23);
                    }
                }
            }
        }

        for(const pageReport of finalList) {
            if(pageReport.error) {
                if(pageReport.error == "Already analysed and on file") {
                    await db.removePageToBeAnalysed(pageReport.url);
                    let diference = numberOfLinksOriginal - pageReport.totalNumberOfPages;
                    numberOfLinks = numberOfLinks - diference;
                    await db.setCurrentWebsiteTotalNumberOfPages(numberOfLinks);
                    if(numberOfLinks < 11) {
                        requiredNumberOfLinks = numberOfLinks;
                        retryAmount = numberOfLinks;
                    } else {
                        requiredNumberOfLinks = Math.round((numberOfLinks) * 0.20);
                        retryAmount = Math.round((numberOfLinks) * 0.23);
                    }

                } else {
                    await db.setPagetoFailedAnalysedPage(pageReport.url, pageReport.report.error);
                    if(pageReport.report != null) {
                        saveReportToJSONFile(pageReport.report, errorFolder);
                    }
    
                    if(pageReport.retryIncrement != 0) {
                        retryCounter += pageReport.retryIncrement;
                    }
                }
            } else {
                analysedUrls.push(pageReport.url);
                successfullLinksCounter++;
                await db.setPageToAnalysed(pageReport.url);
                saveMhtmlToFile(dataFolder, pageReport.report.filename, pageReport.report.mhtml);
                delete pageReport.report.html;
                delete pageReport.report.mhtml;
                saveReportToJSONFile(pageReport.report, dataFolder);
            }
        }
    }
    /*
    for(let i = 0; i < filtredLinks.length && successfullLinksCounter < requiredNumberOfLinks && retryCounter < retryAmount; i++) {

        await waitForBrowser(browserFromHandler);

        const link = filtredLinks[i];

        const fixedLink = fixLink(link.href, primarySite.url);

        await db.addPageToBeAnalysed(fixedLink);

        let filename = dataFolder + "/" + generateFilename(fixedLink) + ".jsonld";
        if(fs.existsSync(filename)) {
            
            await db.removePageToBeAnalysed(fixedLink);
            const newLinksLength = filtredLinks.length - 1;
            await db.setCurrentWebsiteTotalNumberOfPages(newLinksLength);

            if(filtredLinks.length < 11) {
                requiredNumberOfLinks = newLinksLength;
                retryAmount = newLinksLength;
            } else {
                requiredNumberOfLinks = Math.round(newLinksLength * 0.20);
                retryAmount = Math.round(newLinksLength * 0.23);
            }
        
            console.log('link already analysed', fixedLink);
            continue;
        }
  
        console.log("Analysing " + fixedLink + " ...")

        try {
            const canCrawl = await robots.canCrawl(fixedLink)
            if(!canCrawl) {
                console.log("Can't crawl page", fixedLink);
                await db.setPagetoFailedAnalysedPage(fixedLink, "Can't crawl page");
                continue;
            }
        } catch(e) {
            console.log(e);
        }


        if(isMalicious(fixedLink)) {
            console.log("Malicious Page");           
            await db.setPagetoFailedAnalysedPage(fixedLink, "Malicious Page");
            continue;
        }

        try {
            const resultSecondarySite = await getReportForURLParallel(fixedLink, browserFromHandler, {technologyReport: false, dontClosePage: false, analysedUrls: analysedUrls, homepageLink: parsedUrl});
            if(resultSecondarySite.error) {
                if(resultSecondarySite.error == "Protocol error (Target.createTarget): Target closed." ||
                   resultSecondarySite.error == "Navigation failed because browser has disconnected!") {
                    await waitForBrowser(browserFromHandler);
                } 

                saveReportToJSONFile(resultSecondarySite, errorFolder);
                await db.setPagetoFailedAnalysedPage(fixedLink, resultSecondarySite.error);
                   
                if(resultSecondarySite.error != "Already analysed" &&
                   resultSecondarySite.error != "Not the same domain" &&
                   resultSecondarySite.error != "XML Page") {
                    retryCounter++;
                }

            } else {

                if(isMalicious(resultSecondarySite.url)) {
                    resultSecondarySite.error = "Malicious Page";
                    saveReportToJSONFile(resultSecondarySite, errorFolder);
                    await db.setPagetoFailedAnalysedPage(fixedLink, resultSecondarySite.error);
                    continue;
                }

                analysedUrls.push(resultSecondarySite.url);
                if(isSameDomain(resultSecondarySite.url, parsedUrl)) {
                    
                    successfullLinksCounter++;
                    await db.setPageToAnalysed(fixedLink);
                    //saveHtmlToFile(dirname, resultSecondarySite.filename, resultSecondarySite.html);
                    saveMhtmlToFile(dataFolder, resultSecondarySite.filename, resultSecondarySite.mhtml);
                    delete resultSecondarySite.html;
                    delete resultSecondarySite.mhtml;
                    saveReportToJSONFile(resultSecondarySite, dataFolder);
                } else {
                    console.log("Not the same domain", resultSecondarySite.url);
                }
            }

            const delayTime = Math.floor(Math.random() * (3000 - 1000 + 1) + 1000);
            await delay(delayTime);
        } catch (error) {
            retryCounter++;
            console.log(error);
            error.error = error.message;
            error.link = fixedLink;
            error.filename = generateFilename(fixedLink);
            await db.setPagetoFailedAnalysedPage(fixedLink, error.message);
            saveReportToJSONFile(error, errorFolder);   
        }
        //await resultSecondarySite.page.close();
    }
    */
    await db.setCurrentWebsiteToAnalysed();
    websitesCache.addVisitedWebsite(homeURL.host)

    //await primarySite.page.close();
}