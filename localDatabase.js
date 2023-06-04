import { JsonDB, Config } from 'node-json-db'; 

/*
    DB strucure
    currentWebsite: {
        domain: "https://www.example.com",
        totalNumberOfPages: 100,
        toBeAnalysed: [
            "https://www.example.com",
        ],
        analysedPages: [
            "https://www.example.com",
        ],
        failedAnalysedPages: [
            {
                url: "https://www.example.com",
                error: "Protocol error (Target.createTarget): Target closed."
            }
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

export const getAnalysedWebsites = async () => {
    let analysedWebsites;
    try {
        analysedWebsites = await db.getData('/analysedWebsites');
    } catch (error) {
        analysedWebsites = [];
    }
    return analysedWebsites;
}

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

export const setCurrentWebsite = async (domain, pages, totalNumberOfPages) => {
    let currentWebsite = {
        domain: domain,
        toBeAnalysed: pages,
        analysedPages: [],
        failedAnalysedPages: [],
        totalNumberOfPages
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
    if(!(domain.startsWith("http") || domain.startsWith("https"))) {
        domain = "https://" + domain;
    }
    
    try {
        const index = await db.getIndex("/analysedWebsites", domain, "domain");
        return index != -1;
    } catch (error) {
        console.log(error);
        return false;
    }
}

export const isPageAnalysed = async (page) => {
    let onAnalysedPages = false;
    try {
        const index = await db.getIndex("/currentWebsite/analysedPages", page);
        onAnalysedPages = index != -1;
    } catch (error) {
        onAnalysedPages = false;
    }

    if(onAnalysedPages) {
        return true;
    }

    try {
        const index = await db.getIndex("/currentWebsite/failedAnalysedPages", page, 'url');
        return index != -1;
    } catch (error) {
        return false;
    }
}

export const addPageToBeAnalysed = async (page) => {
    if(getCurrentWebsite() == null) {
        return;
    }
    await db.push("/currentWebsite/toBeAnalysed[]", page);
}

export const setPagetoFailedAnalysedPage = async (page, error) => {
    if(getCurrentWebsite() == null) {
        return;
    }

    const pageIndex = await db.getIndex("/currentWebsite/toBeAnalysed", page);
    await db.delete(`/currentWebsite/toBeAnalysed[${pageIndex}]`);
    await db.push("/currentWebsite/failedAnalysedPages[]", {url: page, error: error});
}

export const isWebsiteCurrent = async (website) => {
    try {
        const domain = await db.getData('/currentWebsite/domain');
        return website == domain;
    } catch (error) {
        return false;
    }
}










