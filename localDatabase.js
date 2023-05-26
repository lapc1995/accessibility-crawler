import { JsonDB, Config } from 'node-json-db'; 

/*
    DB strucure
    currentWebsite: {
        domain: "https://www.example.com",
        toBeAnalysed: [
            "https://www.example.com",
        ]
        analysedPages: [
            "https://www.example.com",
        ]
    }
    analysedWebsites: [
        {
            domain: "https://www.example.com",
            analysedPages: [
                {
                    "https://www.example.com",
                }
            ]
        }
    ]
*/

export const db = new JsonDB(new Config("largeScaleDB", true, true, '/'));

export const getCurrentWebsite = async () => {
    let currentWebsite;
    try {
        currentWebsite = await db.getData('/currentWebsite');
    } catch (error) {
        currentWebsite = null;
    }
    return currentWebsite;
}

export const getCurrentWebsiteToBeAnalysedPages = async () => {
    let currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return [];
    }
    return currentWebsite.toBeAnalysed;
}

export const setCurrentWebsite = async (domain, pages) => {
    let currentWebsite = {
        domain: domain,
        toBeAnalysed: pages,
        analysedPages: [],
    }
    await db.push("/currentWebsite", currentWebsite);
}

export const setPageToAnalysed = async (page) => {
    if(getCurrentWebsite() == null) {
        return;
    }
    const pageIndex = await db.getIndex("/currentWebsite/toBeAnalysed", page);
    await db.delete(`/currentWebsite/toBeAnalysed[${pageIndex}]`);
    await db.push("/currentWebsite/analysedPages[]", page);
}

export const setCurrentWebsiteToAnalysed = async () => {
    let currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return;
    }
    await db.push("/analysedWebsites[]", currentWebsite);
    await db.delete("/currentWebsite");
}

export const isWebsiteAnalysed = async (domain) => {
    try {
        const index = await db.getIndex("/analysedWebsites", domain, "domain");
        return true;
    } catch (error) {
        return false;
    }


    /*
    let analysedWebsites;
    try {
        analysedWebsites = await db.getData('/analysedWebsites');
    } catch (error) {
        analysedWebsites = [];
    }
    for(let website of analysedWebsites) {
        if(website.domain == domain) {
            return true;
        }
    }
    return false;
    */
}

export const isPageAnalysed = async (page) => {
    try {
        const index = await db.getIndex("/currentWebsite/analysedPages", page);
        return true;
    } catch (error) {
        return false;
    }
}








