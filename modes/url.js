import {browser, initBrowser, waitForBrowser, setBrowserAutoRestart} from '../browserHandler.js'

export const run = async(contextFunction) => {
    await initBrowser();
    setBrowserAutoRestart(true);

    const url = process.env.URL;
    if(url == null) {
        console.log("No URL provided");
        return;
    }

    await waitForBrowser();

    var start = new Date()
    await contextFunction(url, browser);
    var end = new Date() - start;
    console.log('Execution time: %dms', end) ;
    await browser.close();
}