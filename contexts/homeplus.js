import * as fs from 'fs';
import robotsParser from 'robots-txt-parser';
import { saveHtmlToFile, saveReportToJSONFile, removeDuplicateLinks, fixLink, generateFilename, forbiddenFilenameCharacters, hasInvalidExtension, removeHashFromUrl, delay, removeNonHTTPSLinks} from './../utils.js';
import { analysePrimarySite, analyseSecondarySite, getReportForURLParallel } from '../analyser.js'


const robots = robotsParser(
{
    userAgent: 'Googlebot', // The default user agent to use when looking for allow/disallow rules, if this agent isn't listed in the active robots.txt, we use *.
    allowOnNeutral: false // The value to use when the robots.txt rule's for allow and disallow are balanced on whether a link can be crawled.
});


export const analyseHomePlusDomain = async (url, browser) => {

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
    await robots.useRobotsFor(url);
    await robots.useRobotsFor(url);

    const canCrawlMain = await robots.canCrawl(url)
    if(!canCrawlMain) {
        console.log("Can't crawl main page");
        return;
    }

    const primarySite = await analysePrimarySite(url, browser, {technologyReport: true, dontClosePage: false});
    if(primarySite.error) {
        saveReportToJSONFile(primarySite, "./error");
        return;
    }
    saveHtmlToFile(dirname, primarySite.filename, primarySite.html);
    delete primarySite.html;
    saveReportToJSONFile(primarySite, dirname);
  
    let filtredLinks = removeDuplicateLinks(primarySite.alinks);
    
    let parsedUrl = new URL(primarySite.url);

    parsedUrl.pathname = '/';
    parsedUrl.hash = '';
    parsedUrl.search = '';
    parsedUrl = parsedUrl.toString();
    parsedUrl = parsedUrl.replaceAll('https://','');

    filtredLinks = filtredLinks.filter((link) => link.href != null && link.href.length > 1);

    filtredLinks = filtredLinks.filter((link) => (link.href.charAt(0) == '/' && link.href.length > 1) || link.href.includes(parsedUrl) || (!link.href.includes('http') && !link.href.includes('https') && link.href.charAt(0) != '/' && link.href.length > 0 && link.href != ''));
    filtredLinks = removeNonHTTPSLinks(filtredLinks);
    
    filtredLinks = filtredLinks.filter((link) => !hasInvalidExtension(link.href));
    filtredLinks = filtredLinks.map((link) => {
        link.href = removeHashFromUrl(link.href);
        return link;
    });
    filtredLinks = removeDuplicateLinks(filtredLinks);


    console.log(filtredLinks.length + " links found");
    const analysedUrls = [];

    for(let link of filtredLinks) {
        const fixedLink = fixLink(link.href, primarySite.url);
  
        let filename = dirname + "/" + generateFilename(fixedLink) + ".jsonld";
        if(fs.existsSync(filename)) {
            continue;
        }
  
        console.log("Analysing " + fixedLink + " ...")

        const canCrawl = await robots.canCrawl(fixedLink)
        if(!canCrawl) {
            console.log("Can't crawl page", fixedLink);
            continue;
        }

        try {
            const resultSecondarySite = await getReportForURLParallel(fixedLink, browser, {technologyReport: false, dontClosePage: false, analysedUrls: analysedUrls});
            if(resultSecondarySite.error) {
                saveReportToJSONFile(resultSecondarySite, "./error");
            } else {
                analysedUrls.push(resultSecondarySite.url);
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
    //await primarySite.page.close();
}