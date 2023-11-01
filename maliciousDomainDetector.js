import { readWebsiteCSV } from './utils.js';
import psl from 'psl';

let maliciousDomainsList = await readWebsiteCSV('./blackbook.csv');
console.log(maliciousDomainsList)

maliciousDomainsList = maliciousDomainsList.map((domain) => domain['Domain']);


export const isMalicious = (url) => {

    if(typeof url  == 'string') {
        if(!url.startsWith("http")) {
            url = "https://" + url;
        }
        url = new URL(url);
    }
    
    if(!(url instanceof URL)) {
        throw new Error("Invalid URL");
    }
    
    let parsedUrl = psl.parse(url.hostname);

    if(parsedUrl.error) {
        console.log("Error parsing URL or domain", parsedUrl);
        throw new Error("Error parsing URL or domain");
    }

    return maliciousDomainsList.includes(parsedUrl.domain);
}

