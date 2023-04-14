import Wappalyzer from './wappalyzer/drivers/npm/driver.js'
import puppeteer from 'puppeteer';
import { generateFilename } from './utils.js';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { delay, withTimeout, hasInvalidExtension } from './utils.js';


export const analysePrimarySite = async (url, browser) => {
    return await getReportForURLParallel(url, browser, {technologyReport: true}) 
}
  
export const analyseSecondarySite = async (url, browser) => {
    return await getReportForURLParallel(url, browser);
}
  
export const analysePhoneSite = async (url, browser) => {
    return await getReportForURLParallel(url, browser, {phone: true}) 
}

export const getReportForURLParallel = async(url, browser, options = {}) => {

    try {

        const startTime = Date.now();
  
        const wappalyzerOptions = {
            debug: true,
            delay: 500,
            headers: {},
            maxDepth: 3,
            maxUrls: 1,
            maxWait: 30000,
            recursive: true,
            probe: true,
            proxy: false,
            userAgent: 'Wappalyzer',
            htmlMaxCols: 2000,
            htmlMaxRows: 2000,
            noScripts: false,
            noRedirect: false,
        };
  
        const wappalyzer = new Wappalyzer(wappalyzerOptions);
  
        let data = {
            originalUrl: null,
            url: null,
            accessibility: null,
            html: null, 
            externalJavascript: null,
            externalCSS: null,
            images: null,
            date: null,
            filename: null,
            alinks: null,
            cookies: null,
            totalTimeMillis: null,
        }
  
        if(options.technologyReport) {
            data["technologies"] = null;
        }
  
        var status = null;
  
        if(!url.includes("https://") && !url.includes("http://")) {
            url = "https://" + url;
        }
  
        const page = await browser.newPage();
  
        if(options.cookies) {
            await page.setCookie(...options.cookies);
        }   
  
        if(options.phone) {
            const pixel5 = puppeteer.devices['Pixel 5'];
            await page.emulate(pixel5);
        } else {
            await page.setViewport({ width: 1280, height: 720 });
        }
  
        let site = null;
        page.setRequestInterception(true);

        page.on('request', async (request) => {
            if ((request.resourceType() == 'document' && request.url().toLowerCase().includes('pdf')) ||  hasInvalidExtension(request.url().toLowerCase()) || request.resourceType() == 'image') {
                request.abort('blockedbyclient')
                return;
            }

            if(request.resourceType() == "script") {
                if(request.url().includes("pixlee")) {
                    request.abort('blockedbyclient');
                    return;
                }
            }

            await site.OnRequest(request, page);
        }); 
        
        page.on('response', async (response) => {
            const headers = response.headers();
            if(headers['content-type'] == "application/pdf") {
                return;
            }
            await site.OnResponse(response, page);
        });
  
        site = await wappalyzer.open(url, {}, page);
  
        // Optionally capture and output errors
        site.on('error', console.error);
  
        await startCoverage(page);
  
        let gotoResponse = null;
        try {
            gotoResponse = await page.goto(url, { waitUntil: ['networkidle0']});
            /*
            if (gotoResponse === null) {
                console.log("Got null, trying wait.");
                gotoResponse = await page.waitForResponse(() => true);
            }*/
            console.log(gotoResponse)
            status = `${gotoResponse.status()}`;
            if(status.charAt(0) == "4" || status.charAt(0) == "5") {
                await page.close();
                return {url, error: status, filename: generateFilename(url, Date.now()) };
            }
        } catch(e) {
            console.log(e)
            if(e.name == "TimeoutError") {

                try {
                    gotoResponse = await page.goto(url, { waitUntil: ['networkidle2']});
                    status = `${gotoResponse.status()}`;
                    if(status.charAt(0) == "4" || status.charAt(0) == "5") {
                        await page.close();
                        return {url, error: status, filename: generateFilename(url, Date.now()) };
                    }
                } catch(e) {
                    try {
                        if(e.message != "Navigation failed because browser has disconnected!") {
                            //if closing happens to fast the program will forever hang???
                            await delay(5000);
                            await page.close();
                        }
                    } catch(e) {
                        console.log(e);
                    }
                    return {url, error: e.message, filename: generateFilename(url, Date.now()) }
                }
            } else {
                try {
                    if(e.message != "Navigation failed because browser has disconnected!") {
                        //if closing happens to fast the program will forever hang???
                        await delay(5000);
                        await page.close();
                    }
                } catch(e) {
                    console.log(e);
                }
      
                return {url, error: e.message, filename: generateFilename(url, Date.now()) };
            } 
        }

        if(options.analysedUrls) {
            let currentUrl = page.url()
            if(options.analysedUrls.includes(currentUrl)){
                await page.close();
                return {url, error: "Already analysed", filename: generateFilename(url, Date.now()) };
            }
        }

  
        if(status == "404") {
            return {url, error: "404", filename: generateFilename(url, Date.now()) };
        }
  
        const body = await page.$('body');
        var numberOfElements = (await body.$$('*')).length;
        if(numberOfElements == 1) {
            var preCount = (await body.$$("pre")).length;
            if(preCount == 1) {
                return {url, error: "Not a HTML page", filename: generateFilename(url, Date.now()) };
            }
        }
  
        var html = await getHTML(page);
  
        data.date = Date.now();

        const maxTimeout = 30000;

        const tasks = [withTimeout(getAccessibilityReport(page), maxTimeout), withTimeout(getExternalJavacript(page), maxTimeout), withTimeout(getExternalCSS(page), maxTimeout), withTimeout(getImages(page), maxTimeout), withTimeout(getALinks(page), maxTimeout), withTimeout(stopCoverage(page), maxTimeout), withTimeout(getCookies(page), maxTimeout)];

        if(options.technologyReport) {
            tasks.push(site.analyze(page));
        }
  
        var result = await Promise.allSettled(tasks);

        data["@context"] = "http://luiscarvalho.dev/contexts/",
        data["@type"] = "pageReport"
        data.originalUrl = url;
        data.url = page.url(),
        data.accessibility = result[0].status == "fulfilled" ? result[0].value : result[0].reason;
        data.externalJavascript = result[1].status == "fulfilled" ? result[1].value : result[1].reason;
        data.externalCSS = result[2].status == "fulfilled" ? result[2].value : result[2].reason;
        data.html = html;
        data.images = result[3].status == "fulfilled" ? result[3].value : result[3].reason;
        data.alinks = result[4].status == "fulfilled" ? result[4].value : result[4].reason;
        data.filename = generateFilename(url, data.date)
        data.jsCoverage = result[5].status == "fulfilled" ? result[5].value.jsCoverage : result[5].reason;
        data.cssCoverage = result[5].status == "fulfilled" ? result[5].value.cssCoverage : result[5].reason;
        data.cookies = result[6].status == "fulfilled" ? result[6].value : result[6].reason;
        data.totalTimeMillis = Date.now() - startTime;

        if(options.company) {
            data.company = options.company;
        }
  
        if(options.technologyReport && result[7] != null) {
            data.technologies = result[7].status == "fulfilled" ? cleanTechnologyReport(result[7].value.technologies) : result[7].reason;
        }
  
        if(options.phone) {
            data.filename += "phone";
        }
  
        if(!options.dontClosePage) {
            try {
                await withTimeout(page.close(), maxTimeout);
            } catch (e) {
                console.log(e)
            }
        } 
   
        if(options.dontClosePage){
            return {data, page};
        }
  
        return data;

    } catch(e) {
        console.log(e);
        return {url, error: e.message, filename: generateFilename(url, Date.now()) };    
    }  
}


const getCookies = async(page) => {
    const cookies = await page.cookies();
    return cookies;
} 

const startCoverage = async(page) => {
    await Promise.all([page.coverage.startJSCoverage(), page.coverage.startCSSCoverage()]);
}

const stopCoverage = async (page) => {
  
    // Stops the coverage gathering
    const [jsCoverage, cssCoverage] = await Promise.all([
        page.coverage.stopJSCoverage(),
        page.coverage.stopCSSCoverage(),
    ]);
  
    // Calculates # bytes being used based on the coverage
    const calculateUsedBytes = (type, coverage) => 
        coverage.map(({url, ranges, text}) => {
            let usedBytes = 0;
            ranges.forEach((range) => (usedBytes += range.end - range.start - 1));
            return {
                url,
                type,
                usedBytes,
                totalBytes: text.length,
                percentUsed: `${(usedBytes / text.length * 100).toFixed(2)}%`
            };
        });
  
    const jsCoverageByURL = calculateUsedBytes('js', jsCoverage);
    const cssCoverageByURL = calculateUsedBytes('css', cssCoverage);
  
    const jsCoverageByURLNotRepeats = [];
    jsCoverageByURL.forEach((item) => {
  
        if(jsCoverageByURLNotRepeats.filter(i => i.url == item.url).length == 0) {
      
            const results = jsCoverageByURL.filter(elem => elem.url == item.url);
            let usedBytes = 0;
            let totalBytes = 0;
            results.forEach((result) => {
                usedBytes += result.usedBytes;
                totalBytes += result.totalBytes;
            });
  
            jsCoverageByURLNotRepeats.push({
                url: item.url,
                type: item.type,
                usedBytes,
                totalBytes,
                percentUsed: `${(usedBytes / totalBytes * 100).toFixed(2)}%`
            });
        }
    });
  
    const cssCoverageByURLNotRepeats = [];
    cssCoverageByURL.forEach((item) => {
  
        if(cssCoverageByURLNotRepeats.filter(i => i.url == item.url).length == 0) {
      
            const results = cssCoverageByURL.filter(elem => elem.url == item.url);
  
            let usedBytes = 0;
            let totalBytes = 0;
            results.forEach((result) => {
                usedBytes += result.usedBytes;
                totalBytes += result.totalBytes;
            });
  
            cssCoverageByURLNotRepeats.push({
                url: item.url,
                type: item.type,
                usedBytes,
                totalBytes,
                percentUsed: `${(usedBytes / totalBytes * 100).toFixed(2)}%`
            });
        }
    });
    
    return {
        'jsCoverage': jsCoverageByURLNotRepeats,
        'cssCoverage': cssCoverageByURLNotRepeats,
    };
}

const getAccessibilityReport = async(page) => {
    let results = await new AxePuppeteer(page).analyze();
    results = cleanAccessaibilityReport(results);
    return results;
}
  
const getExternalJavacript = async(page) => {
    const externalJavascript = [];
    let scripts = await page.$$('script');
    for (const script of scripts) {
        var src = await script.evaluate( node => node.getAttribute("src"));
        if(src != null)  {
            externalJavascript.push(src);
        }
    }
    return externalJavascript;
}
  
const getExternalCSS = async(page) => {
    const externalCSS = []
    let links = await page.$$('link');
    for (const link of links) {
        var rel = await link.evaluate( node => node.getAttribute("rel"));
        if(rel != null && rel == "stylesheet")  {
            var href = await link.evaluate( node => node.getAttribute("href"));
            if(href != null) {
            externalCSS.push(href);
            }
        }
    }
    return externalCSS;
}
  
const getHTML = async(page) => {
    const html = await page.evaluate(
        () =>  document.querySelector('*').outerHTML
    );
    return html;
}
  
const getImages = async(page) => {
    const images = []
    let imagesElements = await page.$$('img');
    for (const image of imagesElements) {
        var alt = await image.evaluate( node => node.getAttribute("alt"));
        var src = await image.evaluate( node => node.getAttribute("src"));
        if(alt != null || src != null) {
            images.push({alt,src});
        }
    }
    return images;
}

export const getALinks = async(page) => {
    const alinks = []
    let as = await page.$$('a');
    for (const a of as) {
        var href = await a.evaluate( node => node.getAttribute("href"));
        if(href == "#" || href == null || href == "javascript: void(0)" || href == "N/A") {
            continue;
        }
  
        var textContent = await a.evaluate( node => node.textContent);
  
        if(textContent != null) {
            textContent = textContent.replaceAll("\n", "");
            textContent = textContent.trim();
        }
      
        alinks.push({
            "href" : href,
            "textContent" : textContent,
        });
    }
    return alinks;
}

const cleanTechnologyReport = (technologyReport) => {
    technologyReport.forEach(technology => cleanTechnology(technology));
    return technologyReport;
}
  
const cleanTechnology = (technology) => {
    delete technology.description;
    delete technology.icon;
}
  
const cleanAccessaibilityReport = (accessibilityReport) => {
    cleanAccessibilityBarrier(accessibilityReport.passes);
    cleanAccessibilityBarrier(accessibilityReport.incomplete);
    cleanAccessibilityBarrier(accessibilityReport.violations);
    cleanAccessibilityBarrier(accessibilityReport.inapplicable);

    accessibilityReport.PassesCount = accessibilityReport.passes.length;
    accessibilityReport.IncompleteCount = accessibilityReport.incomplete.length;
    accessibilityReport.ViolationsCount = accessibilityReport.violations.length;
    accessibilityReport.InapplicableCount = accessibilityReport.inapplicable.length;

    return accessibilityReport;
}
  
const cleanAccessibilityBarrier = (list) => {
  
    list.forEach(violation => {
        delete violation.description;
        delete violation.helpUrl;
        delete violation.help;
  
        violation.nodes.forEach(node => {
  
            if(node.impact == null) {
                delete node.impact;
            }
  
            if(node.any.length == 0) {
                delete node.any;
            } else {
                node.any.forEach(any => {
                    delete any.message;
                    if(any.data == null) {
                        delete any.data;
                    }
                    if(any.relatedNodes.length == 0) {
                        delete any.relatedNodes;
                    }
                });
            }
  
            if(node.all.length == 0) {
                delete node.all;
            } else {
                node.all.forEach(all => {
                    delete all.message;
  
                    if(all.data == null) {
                        delete all.data;
                    }
                    if(all.relatedNodes.length == 0) {
                        delete all.relatedNodes;
                    }
                });
            }
  
            if(node.none.length == 0) {
                delete node.none;
            } else {
                node.none.forEach(none => {
                    delete none.message;
  
                    if(none.data == null) {
                        delete none.data;
                    }
                    if(none.relatedNodes.length == 0) {
                        delete none.relatedNodes;
                    }
                });
            }
        }); 
    });
}
