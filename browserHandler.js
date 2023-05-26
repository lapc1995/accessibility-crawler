
import puppeteer from 'puppeteer';

export let browser;
export let waitingForBrowser = false;

export const initBrowser = async() => {
    browser = false;
    browser = await puppeteer.launch({
        headless: /*'chrome'*/ false,
        ignoreHTTPSErrors: true,
        acceptInsecureCerts: true,
        args: [
            '--single-process',
            '--no-sandbox',
            '--no-zygote',
            '--disable-gpu',
            '--ignore-certificate-errors',
            '--allow-running-insecure-content',
            '--disable-web-security',
        ]
    });
    browser.on('disconnected', async() => {
        console.log("Browser disconnected");
        await initBrowser();
    });
    return browser;
}

export const closeBrowser = async() => {
    if(browser == null) {
        return;
    }
    await browser.close();
}

export const waitForBrowser = async() => {
    return new Promise((resolve, reject) => {
        const browserCheck = setInterval(() => {
            if(browser !== false) {
                clearInterval(browserCheck);
                resolve(true);
            }
        }, 100);
    });
}