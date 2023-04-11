import * as fs from 'fs';
import jsonfile from 'jsonfile';
import csvParser from 'csv-parser';
import archiver from 'archiver';

export const forbiddenFilenameCharacters = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

export const saveHtmlToFile = async(dir, filename, htmlContent) => {
    try {
        fs.writeFileSync(`${dir}/${filename}.html`, htmlContent);
        // file written successfully
    } catch (err) {
        console.error(err);
    }
}

export const saveReportToJSONFile = async(report, dir = './data') => {
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
    jsonfile.writeFileSync(`${dir}/${report.filename}.jsonld`, report);
}

export const removeDuplicateLinks = (alinks) => {
    const links = [];
    for(let link of alinks) {
        let filtred = links.filter(l => l.href == link.href);
        if(filtred.length == 0) {
            links.push(link);
        }
    }
    return links;
}

export const fixLink = (link, url) => {
    link = link.trim();
    url = url.trim();
    if(link.includes('http')) {
        return link;
    } else {
        if(url.slice(-1) == '/') {
            url = url.slice(0, -1);
        }
        if(link.charAt(0) != '/') {
            url += '/';
        }
        url += link;
        return url;
    }
}

export const generateFilename = (url, date) => {
    let filename = url.replaceAll('https://','');
    filename = filename.replaceAll('http://','');
  
    if(filename.slice(-1) == "/") {
        filename = filename.slice(0, -1);
    }
  
    forbiddenFilenameCharacters.forEach((character) => {
        filename = filename.replaceAll(character, "{");
    });
  
    //filename += "-" + date;

    filename = filename.replaceAll(' ', '');
    filename = filename.replaceAll('\n', '');
    filename = filename.replaceAll('\t', '');

    filename = reduceFilenameSize(filename);

    return filename;
}

export const readWebsiteCSV = async(filename) => {
    const readCSV = new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filename)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            resolve(results);
        });
    });
  
    var result = await readCSV;
    return result;
} 

export const delay = (delayInms) => {
    return new Promise(resolve => setTimeout(resolve, delayInms));
}

export const reduceFilenameSize = (filename) => {
    if(filename.length > 200) {
        filename = filename.substring(0, 200);
    }
    return filename;
}

export const zipDomainFolder = async(dir) => {
    console.log("Zipping folder", dir);
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(`./${dir}.zip`);
  
    return new Promise((resolve, reject) => {
      archive
        .directory(dir, false)
        .on('error', err => reject(err))
        .pipe(stream)
      ;
  
      stream.on('close', () => resolve());
      archive.finalize();
    });
}
  