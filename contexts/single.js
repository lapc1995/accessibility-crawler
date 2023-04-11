import * as fs from 'fs';
import { saveHtmlToFile, saveReportToJSONFile, forbiddenFilenameCharacters} from './../utils.js';
import { analysePrimarySite } from '../analyser.js'

export const analyseSingleDomain = async (url, browser) => {

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
  
    await primarySite.page.close();
}