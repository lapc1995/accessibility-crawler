import * as fs from 'fs';
import { saveMhtmlToFile, saveReportToJSONFile, forbiddenFilenameCharacters} from './../utils.js';
import { getReportForURLParallel } from '../analyser.js'

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
    const primarySite = await getReportForURLParallel(url, browser, {technologyReport: true, dontClosePage: false});
    if(primarySite.error) {
        saveReportToJSONFile(primarySite, "./error");
        return;
    }

    saveMhtmlToFile(dirname, primarySite.filename, primarySite.mhtml);
    delete primarySite.html;
    delete primarySite.mhtml;

    saveReportToJSONFile(primarySite, dirname);
}