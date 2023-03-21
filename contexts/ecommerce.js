import * as fs from 'fs';
import { saveHtmlToFile, saveReportToJSONFile, removeDuplicateLinks, fixLink, forbiddenFilenameCharacters, delay } from './../utils.js';
import { getReportForURLParallel, getALinks } from '../analyser.js'

export const analyseECommerceSite = async (url, browser, dontClosePage, cookies = null, company = null) => {
    return await getReportForURLParallel(url, browser, {technologyReport: true, dontClosePage, cookies, company}) 
}

export const analyseECommerceDomain = async (url, browser, options) => {

    let report = {
        main: null,
        terms: null,
        product: null,
        cart: null,
        checkout: null,
        filename: null,
    };
  
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
  
    report.filename = `${dirname}Report`;
  
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

    let company = options?.company ? options.company : null;
    
    const primarySite = await analyseECommerceSite(url, browser, true, null, company) ;
    if(primarySite.error) {
        saveReportToJSONFile(primarySite, "./error");
        report.main = {
            error: primarySite.error,
            url
        }
        return;
    }
  
    saveHtmlToFile(dirname, primarySite.data.filename, primarySite.data.html);
    delete primarySite.data.html;
    saveReportToJSONFile(primarySite.data, dirname);
    report.main = {
        url: primarySite.data.url,
        filename: primarySite.data.filename
    }
  
    //get terms and condictions page
    let termsOfServicePageUrl;
    let foundTermsOfServicePageLink = false;
    for(let link of primarySite.data.alinks) {
        if(link.href.includes('terms-and-conditions') || link.href.includes('terms-conditions') || link.href.includes('termsandconditions') || link.href.includes('termsconditions') || link.href.includes('terms') || link.href.includes('conditions')) {
            foundTermsOfServicePageLink = true;
            termsOfServicePageUrl = fixLink(link.href, url);
            break;
        }
    }
    if(foundTermsOfServicePageLink) {
        const resultTerms = await analyseECommerceSite(termsOfServicePageUrl, browser, true, null, company);
        saveHtmlToFile(dirname, resultTerms.data.filename, resultTerms.data.html);
        delete resultTerms.data.html;
        saveReportToJSONFile(resultTerms.data, dirname);
        await resultTerms.page.close();
        report.terms = {
            url: resultTerms.data.url,
            filename: resultTerms.data.filename
        }
    }
  
    // get product page
    let productPageUrl = url;
    if(productPageUrl.slice(-1) == '/') {
        productPageUrl = productPageUrl.slice(0, -1);
    }
  
    let foundPageLink = false;
    for(let link of primarySite.data.alinks) {
        if((link.href.includes('/product/') || link.href.includes('/products/')) && !link.href.includes('gift')) {
            const tempPage = await browser.newPage();
            const tempLink = fixLink(link.href, url);
            await tempPage.goto(tempLink);
            //await tempPage.waitForNavigation();
            const isProductPage = await checkIfPageIsIsProduct(tempPage);
            tempPage.close();
            if(isProductPage) {
                productPageUrl = tempLink;
                foundPageLink = true;
                break;
            }
        }
    }
  
    if(!foundPageLink) {
        for(let link of primarySite.data.alinks) {
            if((link.href.includes('/collection') || link.href.includes('/collections'))  && !link.href.includes('gift')) {
                const pageLink = link.href;
                const tempLink = fixLink(link.href, url);
                await primarySite.page.goto(tempLink);
                //await primarySite.page.waitForNavigation();
  
                let isProductPage = await checkIfPageIsIsProduct(primarySite.page);
                console.log(isProductPage)
                if(isProductPage) {
                    productPageUrl = tempLink;
                    foundPageLink = true;
                    break;
                } else {
                    const alinks = await getALinks(primarySite.page);
                    for(let link of alinks) {
                        var re = new RegExp(`${pageLink}\/.+`);
                        if(re.test(link.href)) {
                            const tempPage = await browser.newPage();
                            await tempPage.setViewport({
                                width: 1920,
                                height: 1080,
                                deviceScaleFactor: 1,
                            });
                            const tempLink2 = fixLink(link.href, url);
                            await tempPage.goto(tempLink2);
                            //await tempPage.waitForNavigation();
                            const isProductPage = await checkIfPageIsIsProduct(tempPage);
                            tempPage.close();
                            if(isProductPage) {
                                productPageUrl = tempLink2;
                                foundPageLink = true;
                                break;
                            }
                        }
                    }
                }
            }
            if(foundPageLink) {
                break;
            }
        }
    }
  
    //look at shop
    if(!foundPageLink) {
        let shopLinks = primarySite.data.alinks.filter((link) => link.href.includes('/shop/') );
        shopLinks = removeDuplicateLinks(shopLinks);
        for(let shopLink of shopLinks) {
            var re = new RegExp(`\/shop\/.+`);
            if(!re.test(shopLink.href)) {
                continue;
            }
            const tempPage = await browser.newPage();
            await tempPage.setViewport({
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1,
            });
  
            let pageLink = fixLink(shopLink.href, url);
            await tempPage.goto(pageLink);
            //await tempPage.waitForNavigation();
            const isProductPage = await checkIfPageIsIsProduct(tempPage);
            tempPage.close();
            if(isProductPage) {
                productPageUrl = pageLink;
                foundPageLink = true;
                break;
            }
        }
    }
  
    console.log("didn't find product page link, testing all links")
    if(!foundPageLink) {
        let noRepeatLinks = removeDuplicateLinks(primarySite.data.alinks);
        noRepeatLinks = noRepeatLinks.sort((a, b) => (a.href.length > b.href.length) ? -1 : 1);
        noRepeatLinks = noRepeatLinks.filter((link) => {
            const tempLink = fixLink(link.href, url);
            const count = (tempLink.match(/\//g) || []).length;
            return (!tempLink.includes('gift') && tempLink.includes(url) /*&& count == 3*/) 
        });
        let counter = 0
        let maxCounter = 15;
        for(let link of noRepeatLinks) {
            const tempLink = fixLink(link.href, url);
            const count = (tempLink.match(/\//g) || []).length;
            if(!tempLink.includes('gift') && tempLink.includes(url) /*&& count == 3*/) {
                const tempPage = await browser.newPage();
                await tempPage.goto(tempLink);
                const isProductPage = await checkIfPageIsIsProduct(tempPage);
                tempPage.close();
                if(isProductPage) {
                    productPageUrl = tempLink;
                    foundPageLink = true;
                    break;
                } else {
                    await delay(1000);
                }
            }
            counter++;
            if(counter > maxCounter) {
                break;
            }
        }
    }
  
    //go to collects page
    //primarySite.page.close(); ???????
    //TODO check other pages for product links
  
    let cookies;
    if(foundPageLink) {
        const result = await analyseECommerceSite(productPageUrl, browser, true, null, company);
        if(result.error) {
            saveReportToJSONFile(result, './error');
            report.product = {
                url: productPageUrl,
                error: result.error
            }
        } else {
            saveHtmlToFile(dirname, result.data.filename, result.data.html);
            delete result.data.html;
            saveReportToJSONFile(result.data, dirname);
            report.product = {
                url: result.data.url,
                filename: result.data.filename
            }
        }
    
        //Get product into cart
  
        //Set to one time purchase
        const labels = await result.page.$$('label');
        console.log("labels", labels.length);
        for(let label of labels) {
            let text = await result.page.evaluate(el => el.textContent, label);
            text = text.replace(" ", '');
            text = text.replace("-", '');
            if(text.toLowerCase().includes('onetime')) {
                const inputId = await result.page.evaluate(el => el.getAttribute("for"), label);
                //const input = await result.page.$(`#${inputId}`);
                await result.page.evaluate((inputId) => {
                    document.querySelector(`#${inputId}`).click();
                }, inputId);
                break;
            }
        }
  
        //Select size
        const divs2 = await result.page.$$('span');
        for(let div of divs2) {
            const text = await result.page.evaluate(el => el.textContent, div);
            if(/^\d+$/.test(text.trim()) && text.trim() != '0') {
                console.log(text);
                await div.evaluate( div => div.click());
                console.log('clicked');
                break;
            }
        }
  
        let foundAddToCart = false;
        const buttons = await result.page.$$('button');//destroyed?
        for(let button of buttons) {
            const text = await result.page.evaluate(el => el.textContent, button);
            if(checkAddToCartText(text)) {
                foundAddToCart = true;
                await button.evaluate( button => button.click());
                break;
            }
        }
  
        if(!foundAddToCart) {
            const divs = await result.page.$$('div');
            for(let div of divs) {
                const text = await result.page.evaluate(el => el.textContent, div);
                if(checkAddToCartText(text) &&  text.length < 20) {
                    foundAddToCart = true;
                    console.log(text);
                    await div.evaluate( div => div.click());
                    console.log('clicked');
                    break;
                }
            }
        }
  
        if(!foundAddToCart) {
            const spans = await result.page.$$('span');
            for(let span of spans) {
                let text = await result.page.evaluate(el => el.textContent, span);
                if((checkAddToCartText(text)) &  text.length < 20) {
                    foundAddToCart = true;
                    await span.evaluate( span => span.click());
                    console.log('clicked');
                    break
                }
            }
        }
  
        await delay(5000);
    
        await result.page.screenshot({
            path: 'screenshot1.jpg'
        });
  
    
        cookies = await result.page.cookies();
        await result.page.close();
    }
   
    //go to cart
    let cartUrl = url;
    if(cartUrl.slice(-1) == '/') {
        cartUrl = cartUrl.slice(0, -1);
    }
    cartUrl = cartUrl + '/cart';
    let cartResult = await analyseECommerceSite(cartUrl, browser, true, cookies, company);
    if(cartResult.error){
        if(cartResult.error == "404") {
            var cartLinks = primarySite.data.alinks.filter((link) => (link.href.includes('/cart')));
            if(cartLinks.length > 0) {
                cartUrl = fixLink(cartLinks[0].href, url);
                cartResult = await analyseECommerceSite(cartUrl, browser, true, cookies, company);
                if(cartResult.error) {
                    saveReportToJSONFile(cartResult, "./error/");
                    report.cart = {
                        url: cartUrl ,
                        error: cartResult.error
                    }
                } else {
                    saveHtmlToFile(dirname, cartResult.data.filename, cartResult.data.html);
                    delete cartResult.data.html;
                    saveReportToJSONFile(cartResult.data, dirname);
                    report.cart = {
                        url: cartResult.data.url,
                        filename: cartResult.data.filename
                    }
                }
            } else {
                saveReportToJSONFile(cartResult, "./error/");
                report.cart = {
                    url: cartUrl ,
                    error: cartResult.error
                }
            }
        } else {
            saveReportToJSONFile(cartResult, "./error/");
            report.cart = {
                url: cartUrl ,
                error: cartResult.error
            }
        }
    } else {
        saveHtmlToFile(dirname, cartResult.data.filename, cartResult.data.html);
        delete cartResult.data.html;
        saveReportToJSONFile(cartResult.data, dirname);
        report.cart = {
            url: cartResult.data.url,
            filename: cartResult.data.filename
        }
  
        await cartResult.page.screenshot({
            path: 'screenshot2.jpg'
        });
    }
    
    //go to checkout
    if(cartResult.page) {
        let foundCheckoutButton = false;
        let checkoutUrl = null;
        const cartButtons = await cartResult.page.$$('button');
        let checkOutButtons = [];
        for(let button of cartButtons) {
            let text = await cartResult.page.evaluate(el => el.textContent, button);
            text = text.replaceAll('\n', '');
            text = text.replaceAll(' ', '');
            if(text.toLowerCase().includes('checkout')) {
                checkOutButtons.push(button);
            }
        }
  
   
        for(let i = 0; i < checkOutButtons.length; i++) {
            let tempPage = await browser.newPage();
            await tempPage.setViewport({
                width: 1920,
                height:1080,
                deviceScaleFactor: 1,
            });
  
            await tempPage.goto(cartUrl);
  
            await delay(5000);
  
            const cartTextButtons = await tempPage.$$('button');
            let checkOutButtons = [];
            for(let button of cartTextButtons) {
                let text = await tempPage.evaluate(el => el.textContent, button);
                text = text.replaceAll('\n', '');
                text = text.replaceAll(' ', '');
                if(text.toLowerCase().includes('checkout')) {
                    checkOutButtons.push(button);
                }
            }
  
            let text = await tempPage.evaluate(el => el.textContent, checkOutButtons[i]);
            text = text.replaceAll('\n', '');
            text = text.replaceAll(' ', '');
            if(text.toLowerCase().includes('checkout')) {
  
                //check if type is submit
                //const type = await tempPage.evaluate(el => el.getAttribute('type'), checkOutButtons[i]);
                await tempPage.evaluate((button) => {button.click();}, checkOutButtons[i]);
       
                //await checkOutButtons[i].evaluate(button => button.click());
  
                try {
                    await tempPage.waitForNavigation();
                } catch (error) {
                    console.log(error);
                }
       
                const checkoutUrlTemp = tempPage.url();
  
                await tempPage.close();
  
                if(checkoutUrlTemp != cartUrl) {
                    checkoutUrl = checkoutUrlTemp;
                    foundCheckoutButton = true;
                    break;
                }
      
            } else {
                await tempPage.close();
            }
        }
  
        if(!foundCheckoutButton) {
            const cartInputs = await cartResult.page.$$('input');
            for(let input of cartInputs) {
                let text = await cartResult.page.evaluate(el => el.value, input);
                text = text.replaceAll('\n', '');
                text = text.replaceAll(' ', '');
                if(text.toLowerCase().includes('checkout')) {
                    await input.evaluate(input => input.click() );
                    try {
                        await cartResult.page.waitForNavigation();
                    } catch (error) {
                        console.log('No checkout button found');
                        saveReportToJSONFile(report, dirname);
                        return;
                    }
                    const checkoutUrlTemp = cartResult.page.url();
  
                    if(checkoutUrlTemp != cartUrl) {
                        checkoutUrl = checkoutUrlTemp;
                        foundCheckoutButton = true;
                        break;
                    }
                }
            }
        }
  
        if(!foundCheckoutButton) {
            const cartAs = await cartResult.page.$$('a');
            for(let a of cartAs) {
                let text = await cartResult.page.evaluate(el => el.textContent, a);
                text = text.replaceAll('\n', '');
                text = text.replaceAll(' ', '');
                let href = await cartResult.page.evaluate(el => el.href, a);
                if(href == cartUrl || !text.toLowerCase().includes('checkout')) {
                    continue;
                }
                await a.evaluate( a => a.click() );
        
                try {
                    await cartResult.page.waitForNavigation();
                } catch (error) {
                    console.log('No checkout button found');
                    saveReportToJSONFile(report, dirname);
                    return;
                }
                const checkoutUrlTemp = cartResult.page.url();
                if(checkoutUrlTemp != cartUrl) {
                    checkoutUrl = checkoutUrlTemp;
                    foundCheckoutButton = true;
                    break;
                }
            }
        }
  
        if(!foundCheckoutButton) {
            const cartDivs = await cartResult.page.$$('div');
            for(let div of cartDivs) {
                let text = await cartResult.page.evaluate(el => el.textContent, div);
                text = text.replaceAll('\n', '');
                text = text.replaceAll(' ', '');
                if(text.toLowerCase().includes('checkout')) {
                    await div.evaluate( div => div.click() );
                    try {
                        await cartResult.page.waitForNavigation();
                    } catch (error) {
                        console.log('No checkout button found');
                        saveReportToJSONFile(report, dirname);
                        return;
                    }
                    const checkoutUrlTemp = cartResult.page.url();
  
                    if(!checkoutUrlTemp == cartUrl) {
                        checkoutUrl = checkoutUrlTemp;
                        foundCheckoutButton = true;
                        break;
                    }
                }
            }
        }
  
  
  
        if(!foundCheckoutButton) {
            console.log('No checkout button found');
            saveReportToJSONFile(report, dirname);
            return;
        }
  
        //await cartResult.page.waitForNavigation();
        //const checkoutUrl = cartResult.page.url();
        await cartResult.page.close();
  
        //analyse checkout page
        const checkoutResult = await analyseECommerceSite(checkoutUrl, browser, true, cookies, company);
        if(checkoutResult.error) {
            saveReportToJSONFile(checkoutResult, './error');
            report.checkout = {
                url: checkoutUrl,
                error: checkoutResult.error
            }
        } else {
            saveHtmlToFile(dirname, checkoutResult.data.filename, checkoutResult.data.html);
            delete checkoutResult.data.html;
            saveReportToJSONFile(checkoutResult.data, dirname);
            report.checkout = {
                url: checkoutResult.data.url,
            filename: checkoutResult.data.filename
            }
        }
  
        await checkoutResult.page.screenshot({
            path: 'screenshot3.jpg'
        });
  
        await checkoutResult.page.close();
    }
  
    saveReportToJSONFile(report, dirname);
}

const checkIfPageIsIsProduct = async (page) => {
    //Set to one time purchase
    const labels = await page.$$('label');
    console.log("labels", labels.length);
    for(let label of labels) {
        let text = await page.evaluate(el => el.textContent, label);
        text = text.replace(" ", '');
        text = text.replace("-", '');
        if(text.toLowerCase().includes('onetime')) {
            const inputId = await page.evaluate(el => el.getAttribute("for"), label);
            await page.evaluate((inputId) => {
                document.querySelector(`#${inputId}`).click();
            }, inputId);
            break;
        }
    }
  
    const buttons = await page.$$('button');
    for(let button of buttons) {
        const element_is_visible = await page.evaluate((button) => {
            const style = window.getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            //return {visibility: style.getPropertyValue('visibility'), display: style.getPropertyValue('display'), opacity: style.getPropertyValue('opacity'), height: style.getPropertyValue('height'), width: style.getPropertyValue('width'), bottomr: rect.bottom, topr: rect.top, heightr: rect.height, widthr: rect.width};
            return style.getPropertyValue('visibility') != 'hidden' && style.getPropertyValue('display') != 'none' && style.getPropertyValue('opacity') != '0' && style.getPropertyValue('height') != '0px' && style.getPropertyValue('width') != '0px' && rect.bottom != 0 && rect.top != 0 && rect.height != 0 && rect.width != 0;
        }, button);
     
        if(!element_is_visible) {
            continue;
        }
 
        const text = await page.evaluate(el => el.textContent, button);
        if(checkAddToCartText(text)) {
            return true;
        }
    }
  
 
    const divs = await page.$$('div');
    for(let div of divs) {
        const element_is_visible = await page.evaluate((div) => {
            const style = window.getComputedStyle(div);
            //const rect = div.getBoundingClientRect();
            return style.getPropertyValue('visibility') != 'hidden' && style.getPropertyValue('display') != 'none' && style.getPropertyValue('opacity') != '0' && style.getPropertyValue('height') != '0px' && style.getPropertyValue('width') != '0px' /*&& !!(rect.bottom || rect.top || rect.height || rect.width)*/;
        }, div);
       
        if(!element_is_visible) {
            continue;
        }
 
        const text = await page.evaluate(el => el.textContent, div);
        if((checkAddToCartText(text)) & text.length < 20) {
            return true;
        }
    }
 
    const spans = await page.$$('span');
    for(let span of spans) {
        const element_is_visible = await page.evaluate((span) => {
            const style = window.getComputedStyle(span);
            //const rect = div.getBoundingClientRect();
            return style.getPropertyValue('visibility') != 'hidden' && style.getPropertyValue('display') != 'none' && style.getPropertyValue('opacity') != '0' && style.getPropertyValue('height') != '0px' && style.getPropertyValue('width') != '0px' /*&& !!(rect.bottom || rect.top || rect.height || rect.width)*/;
        }, span);
       
        if(!element_is_visible) {
            continue;
        }
 
        let text = await page.evaluate(el => el.textContent, span);
        if((checkAddToCartText(text)) & text.length < 20) {
            return true;
        }
    }
    
    return false;
}

const checkAddToCartText = (text) => {
    text = text.replaceAll(" ", '');
    text = text.replaceAll("-", '');
    text = text.replaceAll(":", '');
    text = text.replaceAll("\n", '');
    text = text.toLowerCase();
    if(text == '') {
        return false;
    }
    if(text.includes('addtocart') || text.includes('addtobag') || text.includes('addtobasket')) {
        return true;
    }
    return false;
}
  