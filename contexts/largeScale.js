import * as fs from 'fs';
import robotsParser from 'robots-txt-parser';
import { saveHtmlToFile, saveReportToJSONFile, removeDuplicateLinks, fixLink, generateFilename, forbiddenFilenameCharacters, hasInvalidExtension, removeHashFromUrl, delay, removeNonHTTPSLinks, shuffleArray, cleanLinkList, isSameDomain, saveMhtmlToFile} from './../utils.js';
import { analysePrimarySite, analyseSecondarySite, getReportForURLParallel } from '../analyser.js';
import { waitForBrowser, browser as browserFromHandler } from '../browserHandler.js';
import * as db from '../localDatabase.js';
import * as largeWebsitesDB from '../largeWebsitesDatabase.js';

const robots = robotsParser(
{
    userAgent: 'Googlebot', // The default user agent to use when looking for allow/disallow rules, if this agent isn't listed in the active robots.txt, we use *.
    allowOnNeutral: false // The value to use when the robots.txt rule's for allow and disallow are balanced on whether a link can be crawled.
});


export const analyseLargeScaleDomain = async (url, browser) => {

    await waitForBrowser();

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

        const canCrawlMain = await robots.canCrawl(url)
        if(!canCrawlMain) {
            console.log("Can't crawl main page");
            await db.setCurrentWebsite(url, [], 0);
            await db.addPageToBeAnalysed(url);
            await db.setPagetoFailedAnalysedPage(url, "Can't crawl main page");
            await db.setCurrentWebsiteToAnalysed();
            return;
        }
    } catch(e) {
        console.log(e);
    }

    //check that is home page
    await waitForBrowser();

    let testHomePage = await browserFromHandler.newPage();
    let testHomePageResult = await testHomePage.goto(url, {waitUntil: 'networkidle2', timeout: 30000});
    if(testHomePageResult == null) {
        console.log("Got null, trying wait.");
        testHomePageResult = await testHomePage.waitForResponse(() => true);
    }
    
    let testHomePageStatus = `${testHomePageResult.status()}`;

    if(testHomePageStatus != null && (testHomePageStatus.charAt(0) == "4" || testHomePageStatus.charAt(0) == "5")) {
        await testHomePage.close();
        return {url, error: testHomePageStatus, filename: generateFilename(url, Date.now()) };
    }

    let homeURL = testHomePageResult.url();
    await testHomePage.close();
    homeURL = new URL(homeURL);

    console.log(url,homeURL.host)
   
    const primarySite = await analysePrimarySite(homeURL.host, browserFromHandler, {technologyReport: true, dontClosePage: false});
    if(primarySite.error) {

        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(primarySite.url);
        await db.setPagetoFailedAnalysedPage(primarySite.url, primarySite.error);
        await db.setCurrentWebsiteToAnalysed();
        
        if(primarySite.error == "Protocol error (Target.createTarget): Target closed." || 
            primarySite.error == "Navigation failed because browser has disconnected!") {
            await waitForBrowser(browserFromHandler);
        }
        saveReportToJSONFile(primarySite, errorFolder);
        return;
    }

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
    const retryAmount = Math.round(filtredLinks.length * 0.23);
    let retryCounter = 0;
    let successfullLinksCounter = 0;

    console.log("Required number of links: " + requiredNumberOfLinks);
    filtredLinks = shuffleArray(filtredLinks);
    
    //filtredLinks = filtredLinks.slice(0, requiredNumberOfLinks);
    //const justUrls = filtredLinks.map((link) => link.href);

    const isWebsiteCurrent = await db.isWebsiteCurrent(url);
    if(!isWebsiteCurrent) {
        await db.setCurrentWebsite(url, [], filtredLinks.length);
        await db.addPageToBeAnalysed(primarySite.url);
        await db.setPageToAnalysed(primarySite.url);
    } else {
        let currentWebsite = await db.getCurrentWebsite();
        retryCounter = currentWebsite.failedAnalysedPages.length;
        successfullLinksCounter = currentWebsite.analysedPages.length;
        analysedUrls.push(...currentWebsite.analysedPages);
        filtredLinks = filtredLinks.filter((link) => !analysedUrls.includes(link.href));

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
    const phoneHomePage = await getReportForURLParallel(url, browserFromHandler, {technologyReport: false, dontClosePage: false, phone: true});
    if(phoneHomePage.error) {
        await db.addPageToBeAnalysed(phoneHomePage.url + "phone");
        await db.setPagetoFailedAnalysedPage(phoneHomePage.url + "phone", phoneHomePage.error);
        if(primarySite.error == "Protocol error (Target.createTarget): Target closed." ||
           primarySite.error == "Navigation failed because browser has disconnected!") {
            await waitForBrowser(browserFromHandler);
        }
        saveReportToJSONFile(phoneHomePage, errorFolder);
        return;
    }
    saveMhtmlToFile(dataFolder, phoneHomePage.filename, phoneHomePage.mhtml);
    delete phoneHomePage.html;
    delete phoneHomePage.mhtml;
    saveReportToJSONFile(phoneHomePage, dataFolder);
    await db.addPageToBeAnalysed(phoneHomePage.url + "(phone)");
    await db.setPageToAnalysed(phoneHomePage.url + "(phone)");

    //check if contact page exists
    try {
        const contactUrl = new URL("contact", primarySite.url);
        let contactPage = await browserFromHandler.newPage();
        let contactReponse = await contactPage.goto(contactUrl.href, {waitUntil: 'networkidle2', timeout: 30000});
        let contactStatus = `${contactReponse.status()}`;
        if(contactStatus.charAt(0) == "4" || contactStatus.charAt(0) == "5") {
            await contactPage.close();
        } else {
            filtredLinks = [contactUrl, ...filtredLinks];
            requiredNumberOfLinks++;
            await contactPage.close();
        }
    } catch(e) {
        if(e.message == "Protocol error (Target.createTarget): Target closed." ||
            e.message == "Navigation failed because browser has disconnected!") {
            await waitForBrowser(browserFromHandler);
        }
    }

    for(let i = 0; i < filtredLinks.length && successfullLinksCounter < requiredNumberOfLinks && retryCounter < retryAmount; i++) {

        const link = filtredLinks[i];

        await db.addPageToBeAnalysed(link.href);
        
        const fixedLink = fixLink(link.href, primarySite.url);
  
        let filename = dataFolder + "/" + generateFilename(fixedLink) + ".jsonld";
        if(fs.existsSync(filename)) {
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

        try {
            const resultSecondarySite = await getReportForURLParallel(fixedLink, browserFromHandler, {technologyReport: false, dontClosePage: false, analysedUrls: analysedUrls, homepageLink: parsedUrl});
            if(resultSecondarySite.error) {
                if(resultSecondarySite.error == "Protocol error (Target.createTarget): Target closed.") {
                    await waitForBrowser(browserFromHandler);
                } 

                saveReportToJSONFile(resultSecondarySite, errorFolder);
                db.setPagetoFailedAnalysedPage(link.href, resultSecondarySite.error);
                   
                if(resultSecondarySite.error != "Already analysed") {
                    retryCounter++;
                }

            } else {
                analysedUrls.push(resultSecondarySite.url);
                if(isSameDomain(resultSecondarySite.url, parsedUrl)) {
                    successfullLinksCounter++;
                    await db.setPageToAnalysed(link.href);
                    //saveHtmlToFile(dirname, resultSecondarySite.filename, resultSecondarySite.html);
                    saveMhtmlToFile(dataFolder, resultSecondarySite.filename, resultSecondarySite.mhtml);
                    delete resultSecondarySite.html;
                    delete resultSecondarySite.mhtml;
                    saveReportToJSONFile(resultSecondarySite, dataFolder);
                }
            }

            const delayTime = Math.floor(Math.random() * (3000 - 1000 + 1) + 1000);
            await delay(delayTime);
        } catch (error) {
            console.log(error);
            error.link = fixedLink;
            saveReportToJSONFile(error, "./error");
        }
        //await resultSecondarySite.page.close();
    }
    await db.setCurrentWebsiteToAnalysed();


    //await primarySite.page.close();
}