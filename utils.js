import * as fs from 'fs';
import jsonfile from 'jsonfile';
import csvParser from 'csv-parser';
import archiver from 'archiver';

export const forbiddenFilenameCharacters = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

export const extensionsToIgnore = [".jpg", ".jpeg", ".png", ".gif", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".rar", ".tar.gz"];

export const removeNonHTTPSLinks = (links) => {
    return links.filter(link => {
      const { href } = link;
      return href && !href.match(/^(mailto|tel|sms|intent|javascript):/);
    });
  }

export const hasInvalidExtension = (url) => {
    const urlParts = url.split(".");
    const extension = "." + urlParts[urlParts.length - 1];
    return extensionsToIgnore.includes(extension);
}

export const removeHashFromUrl = (url) => {
    const hashIndex = url.indexOf("#");
    if (hashIndex !== -1) {
      url = url.substring(0, hashIndex);
    }
    return url;
}

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
    let fixedUrl = new URL(link, url).href;
    /*
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
    }*/
    return fixedUrl;
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

export const zipDataAndErrorFolder = async(name) => {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(`./${name}.zip`);

    const dataPath = './data';
    const errorPath = './error';

    return new Promise((resolve, reject) => {
        archive
          .directory(dataPath, dataPath.split('/').pop())
          .directory(errorPath, errorPath.split('/').pop())
          .on('error', err => reject(err))
          .pipe(stream)
        ;
    
        stream.on('close', () => resolve());
        archive.finalize();
      });
  
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

export const withTimeout = async (promise, millis) => {
    let timer = null;

    const timeoutPromise = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject('Timeout after ' + millis + 'ms'), millis);
    });

    const runningPromise = new Promise((resolve, reject) => {
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }).catch((error) => {
            clearTimeout(timer);
            reject(error.message);
        })
    });

    return Promise.race([
        runningPromise,
        timeoutPromise
    ]);
}
  
export const findMatchingLinks = (url, links) => {
    const domainRegex = /^((?:https?:)?\/\/)?([^:\/\n?]+)(?:\/.*)?$/im;
    const domain = url.match(domainRegex)[2];
    const subdomains = domain.split(".").map((value, index, array) =>  {
        array.slice(index).join(".")
    });
    const matchingLinks = links.filter(link => {
      const linkDomain = link.href.match(domainRegex) !== null ? link.href.match(domainRegex)[2] : "";
      const linkSubdomains = linkDomain.split(".").map((value, index, array) => array.slice(index).join("."));
      const pathRegex = /^\/|^\w/i;
      const linkPath = link.href.match(pathRegex)!==null ? link.href.match(pathRegex)[0] : "";
      return linkDomain === domain || subdomains.some(subdomain => subdomain === linkDomain) || linkSubdomains.some(subdomain => subdomains.includes(subdomain)) || linkPath === "/" || linkPath === "" || linkPath.startsWith("./") || linkPath.startsWith("../");
    });
    return matchingLinks;
}
  

export const removeFolders = (folder1Path, folder2Path) => {
    try {
        // Remove folder 1
        fs.rmdirSync(folder1Path, { recursive: true });

        // Remove folder 2
        fs.rmdirSync(folder2Path, { recursive: true });

        console.log(`Folders ${folder1Path} and ${folder2Path} removed successfully.`);
    } catch (error) {
        console.error(`Error removing folders: ${error}`);
    }
}
  
  
  