
import puppeteer from 'puppeteer';

export let browser;
export let waitingForBrowser = false;

let disableBrowserAutoRestart = false;

export const setBrowserAutoRestart = (state) => {
    disableBrowserAutoRestart = state;
}

export const initBrowser = async() => {
    if(browser !== false) {
        await closeBrowser();
    }
    browser = false;
    browser = await puppeteer.launch({
        headless: process.env.HEADLESS == 1 ? 'chrome' : false,
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
            '--mute-audio',
        ]
    });

    disableBrowserAutoRestart = false;

    browser.on('disconnected', async() => {
        console.log("Browser disconnected");
        browser = false;

        if(disableBrowserAutoRestart) {
            return;
        }

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