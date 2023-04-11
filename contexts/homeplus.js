import * as fs from 'fs';
import { saveHtmlToFile, saveReportToJSONFile, removeDuplicateLinks, fixLink, generateFilename, forbiddenFilenameCharacters} from './../utils.js';
import { analysePrimarySite, analyseSecondarySite } from '../analyser.js'

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
    
    filtredLinks = filtredLinks.filter((link) => link.href.charAt(0) == '/' || link.href.includes(parsedUrl));
    console.log(filtredLinks.length + " links found");
  
  
    for(let link of filtredLinks) {
        const fixedLink = fixLink(link.href, parsedUrl);
  
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
                if(resultSecondarySite.url.includes(parsedUrl)) {
                    saveHtmlToFile(dirname, resultSecondarySite.filename, resultSecondarySite.html);
                    delete resultSecondarySite.html;
                    saveReportToJSONFile(resultSecondarySite, dirname);
                }
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