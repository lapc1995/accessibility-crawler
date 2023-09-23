import fs from 'fs/promises';
import { fixLink } from './utils.js';
import {browser, initBrowser, setBrowserAutoRestart} from './browserHandler.js';

const reportUrlFilePath = 'C:/Users/lapc1/phd-code/data/kenwheeler.github.io{slick/kenwheeler.github.io{slick.jsonld';
const reportUrlFile = await fs.readFile(reportUrlFilePath, 'utf8');
const reportUrl = JSON.parse(reportUrlFile);
console.log(reportUrl.url)


await initBrowser();
setBrowserAutoRestart(true);


let scriptsContent = await getScriptsContent(reportUrl.externalJavascript, browser);

let targets = getBarriersFromHtml(reportUrl)//getBarrierElements(reportUrl);
console.log(targets)


let results = {};

for (const target in targets) {
   for(const script in scriptsContent) {

        let scriptContent = scriptsContent[script];

        let regexObj = new RegExp(target, 'g');
        let match;
        while ((match = regexObj.exec(scriptContent)) != null) {
            if(match.index - 1 >= 0 && /[a-zA-Z-_]/.test(scriptContent.charAt(match.index - 1))) {
                continue;
            }

            if(match.index + target.length < scriptContent.length && /[a-zA-Z\-_]/.test(scriptContent.charAt(match.index + target.length))) {
                continue;
            }

            if(!(target in results)) {
                results[target] = [script];
            } else if(!results[target].includes(script)) {
                results[target].push(script);
            }
              
        }
        
        /*
        
        if(scriptContent.includes(target)) {

            

            if(!(target in results)) {
                results[target] = [script];
            } else {
                results[target].push(script);
            }
        }*/

        /*
        let scriptContent = scriptsContent[script];

        let regex = new RegExp(target, 'g');
        let matches = scriptContent.match(regex);

        if(matches != null) {
            if(!(target in results)) {
                results[target] = {};
            }
            if(!(script in results[target])) {
                results[target][script] = [];
            }
            results[target][script] = targets[target];
        }
            */

   }
}

console.log(results);


await browser.close();

async function getScriptsContent(scripts, browser) {

    let scriptsContent = {};

    for(let script of reportUrl.externalJavascript){
        let url = fixLink(script, reportUrl.url);
        console.log('Going to ' + url);
        let page = await browser.newPage();
        let gotoResponse = await page.goto(url, {waitUntil: ['networkidle0']});
    
        if(gotoResponse == null) {
            console.log("Got null, trying wait.");
            gotoResponse = await page.waitForResponse(() => true);
        }
    
        let status = `${gotoResponse.status()}`;
    
        if(status != null && (status.charAt(0) == "4" || status.charAt(0) == "5")) {
            await page.close();
            continue;
        }
    
        let pageContent = await page.content();

        scriptsContent[script] = pageContent;

        await page.close();
    }

    return scriptsContent;
}


function getBarrierElements(report) {
    let targets = {};
    for(let violation of report.accessibility.violations) {
        for(let node of violation.nodes) {
            if(node.target == null) {
                continue;
            }
            for(let targetList of node.target) {
                let targetsTemp = cleanTarget(targetList);
                for(let target of targetsTemp) {
                    if(!(target in targets)) {
                        targets[target] = [violation.id];
                    }
                    if(!(targets[target].includes(violation.id))) {
                        targets[target].push(violation.id);
                    }
                }
            }
        }
    }
    return targets;
}


function cleanTarget(target) {
    let cleaned = target.replaceAll('#', "");
    cleaned = cleaned.replace(/\d+/g, "");
    cleaned = cleaned.replaceAll('.', "");
    cleaned = cleaned.replaceAll('nth-child', "");
    cleaned = cleaned.replaceAll(' ', "");
    cleaned = cleaned.replaceAll('(', "");
    cleaned = cleaned.replaceAll(')', "");
    cleaned = cleaned.replaceAll(':', "");
    cleaned = cleaned.replace(/\[[^\]]*\]/g, '');

    if(cleaned.includes('>')) { 
        return cleaned.split('>');
    }


    return [cleaned];
}

function getBarriersFromHtml(report) {
    let classesAndIds = {};
    for(let violation of report.accessibility.violations) {
        for(let node of violation.nodes) {
            if(node.html == null) {
                continue;
            }
            let classesAndIdsTemp = getClassesAndId(node.html);
            if(classesAndIdsTemp.length == 0) {
                continue;
            }
            console.log(classesAndIdsTemp)
            for(const reference of classesAndIdsTemp) {
                if(!(reference in classesAndIds)) {
                    classesAndIds[reference] = [violation.id];
                }
                if(!(classesAndIds[reference].includes(violation.id))) {
                    classesAndIds[reference].push(violation.id);
                }
            }
        }
    }

    return classesAndIds;
}

function getClassesAndId(html) {
    let classes = [];
    let id = null;
    let regex = /class="([^"]*)"/g;
    let match;
    while ((match = regex.exec(html)) != null) {
        classes = classes.concat(match[1].split(' '));
    }

    regex = /id="([^"]*)"/g;
    match = regex.exec(html);
    if(match != null) {
        id = cleanTarget(match[1]);
        classes.push(id);
    }

    classes = classes.filter((value) => value != "");

    return classes;
}