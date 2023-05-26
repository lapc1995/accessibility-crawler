import * as fs from 'fs';
import robotsParser from 'robots-txt-parser';
import { saveHtmlToFile, saveReportToJSONFile, removeDuplicateLinks, fixLink, generateFilename, forbiddenFilenameCharacters, hasInvalidExtension, removeHashFromUrl, delay, removeNonHTTPSLinks, shuffleArray, cleanLinkList} from './../utils.js';
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
            return;
        }
    } catch(e) {
        console.log(e);
    }
   
    const primarySite = await analysePrimarySite(url, browserFromHandler, {technologyReport: true, dontClosePage: false});
    if(primarySite.error) {
        
        if(primarySite.error == "Protocol error (Target.createTarget): Target closed.") {
            await waitForBrowser(browserFromHandler);
        }
        saveReportToJSONFile(primarySite, "./error");
        return;
    }

    saveHtmlToFile(dirname, primarySite.filename, primarySite.html);
    delete primarySite.html;
    saveReportToJSONFile(primarySite, dirname);
  
    let filtredLinks = cleanLinkList(primarySite.url, primarySite.alinks);
    let parsedUrl = new URL(primarySite.url);

    console.log(filtredLinks.length + " links found");
    const analysedUrls = [];

    //analyse 30% of links
    const requiredNumberOfLinks = Math.round(filtredLinks.length * 0.30);
    console.log("Required number of links: " + requiredNumberOfLinks);
    filtredLinks = shuffleArray(filtredLinks);
    filtredLinks = filtredLinks.slice(0, requiredNumberOfLinks);
    const justUrls = filtredLinks.map((link) => link.href);

    await db.setCurrentWebsite(url, justUrls);

    for(let link of filtredLinks) {
        
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
                continue;
            }
        } catch(e) {
            console.log(e);
        }

        try {
            const resultSecondarySite = await getReportForURLParallel(fixedLink, browserFromHandler, {technologyReport: false, dontClosePage: false, analysedUrls: analysedUrls});
            if(resultSecondarySite.error) {
                if(resultSecondarySite.error == "Protocol error (Target.createTarget): Target closed.") {
                    await waitForBrowser(browserFromHandler);
                }
                saveReportToJSONFile(resultSecondarySite, "./error");
            } else {
                analysedUrls.push(resultSecondarySite.url);
                await db.setPageToAnalysed(resultSecondarySite.url);
                if(resultSecondarySite.url.includes(parsedUrl)) {
                    saveHtmlToFile(dirname, resultSecondarySite.filename, resultSecondarySite.html);
                    delete resultSecondarySite.html;
                    saveReportToJSONFile(resultSecondarySite, dirname);
                }
            }
            await delay(3000);
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