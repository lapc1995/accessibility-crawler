import puppeteer from 'puppeteer';

export const run = async(contextFunction) => {
    const browser = await puppeteer.launch({
        headless: false,//'chrome',
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
    
    const url = process.env.URL;
    if(url == null) {
        console.log("No URL provided");
        return;
    }
    
    var start = new Date()
    await contextFunction(url, browser);
    var end = new Date() - start;
    console.log('Execution time: %dms', end) 
    browser.close();
}