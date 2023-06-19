import * as fs from 'fs';
import robotsParser from 'robots-txt-parser';
import { saveHtmlToFile, saveReportToJSONFile, removeDuplicateLinks, fixLink, generateFilename, forbiddenFilenameCharacters, hasInvalidExtension, removeHashFromUrl, delay, removeNonHTTPSLinks, shuffleArray, cleanLinkList, isSameDomain, saveMhtmlToFile} from './../utils.js';
import { analysePrimarySite, analyseSecondarySite, getReportForURLParallel } from '../analyser.js';
import { waitForBrowser, browser as browserFromHandler } from '../browserHandler.js';
import * as db from '../localDatabase.js';

const robots = robotsParser(
{
    userAgent: 'Googlebot', // The default user agent to use when looking for allow/disallow rules, if this agent isn't listed in the active robots.txt, we use *.
    allowOnNeutral: false // The value to use when the robots.txt rule's for allow and disallow are balanced on whether a link can be crawled.
});


export const analyseLargeScaleDomain = async (url, browser) => {

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
   
    const primarySite = await analysePrimarySite(url, browserFromHandler, {technologyReport: true, dontClosePage: false});
    if(primarySite.error) {

        await db.setCurrentWebsite(url, [], 0);
        await db.addPageToBeAnalysed(primarySite.url);
        await db.setPagetoFailedAnalysedPage(primarySite.url, primarySite.error);
        await db.setCurrentWebsiteToAnalysed();
        
        if(primarySite.error == "Protocol error (Target.createTarget): Target closed." || 
            primarySite.error == "Navigation failed because browser has disconnected!") {
            await waitForBrowser(browserFromHandler);
        }
        saveReportToJSONFile(primarySite, "./error");
        return;
    }

    //saveHtmlToFile(dirname, primarySite.filename, primarySite.html);
    saveMhtmlToFile(dirname, primarySite.filename, primarySite.mhtml);
    delete primarySite.html;
    delete primarySite.mhtml;
    saveReportToJSONFile(primarySite, dirname);

    if(typeof primarySite.alinks === 'string') {
        console.log("Error: " + primarySite.alinks);
        return;
    }

    let filtredLinks = cleanLinkList(primarySite.url, primarySite.alinks);
    let parsedUrl = new URL(primarySite.url);

    console.log(filtredLinks.length + " links found");
    const analysedUrls = [];
    analysedUrls.push(primarySite.url);

    //analyse 30% of links
    let requiredNumberOfLinks = Math.round(filtredLinks.length * 0.30);
    const retryAmount = Math.round(filtredLinks.length * 0.30);
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

    //phone page
    const phoneHomePage = await getReportForURLParallel(url, browserFromHandler, {technologyReport: false, dontClosePage: false, phone: true});
    if(phoneHomePage.error) {
        await db.addPageToBeAnalysed(phoneHomePage.url + "phone");
        await db.setPagetoFailedAnalysedPage(phoneHomePage.url + "phone", phoneHomePage.error);
        if(primarySite.error == "Protocol error (Target.createTarget): Target closed." ||
           primarySite.error == "Navigation failed because browser has disconnected!") {
            await waitForBrowser(browserFromHandler);
        }
        saveReportToJSONFile(phoneHomePage, "./error");
        return;
    }
    saveMhtmlToFile(dirname, phoneHomePage.filename, phoneHomePage.mhtml);
    delete phoneHomePage.html;
    delete phoneHomePage.mhtml;
    saveReportToJSONFile(phoneHomePage, dirname);
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
  
        let filename = dirname + "/" + generateFilename(fixedLink) + ".jsonld";
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
                //if (resultSecondarySite.error != "Already analysed") {
                    saveReportToJSONFile(resultSecondarySite, "./error");
                    db.setPagetoFailedAnalysedPage(link.href, resultSecondarySite.error);
                    retryCounter++;
                //}
            } else {
                analysedUrls.push(resultSecondarySite.url);
                if(isSameDomain(resultSecondarySite.url, parsedUrl)) {
                    successfullLinksCounter++;
                    await db.setPageToAnalysed(link.href);
                    //saveHtmlToFile(dirname, resultSecondarySite.filename, resultSecondarySite.html);
                    saveMhtmlToFile(dirname, resultSecondarySite.filename, resultSecondarySite.mhtml);
                    delete resultSecondarySite.html;
                    delete resultSecondarySite.mhtml;
                    saveReportToJSONFile(resultSecondarySite, dirname);
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