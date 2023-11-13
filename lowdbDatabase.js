// Remember to set type: module in package.json or use .mjs extension
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

import { Mutex } from 'async-mutex';


// db.json file path
const __dirname = dirname(fileURLToPath(import.meta.url))
const file = join(__dirname, 'largeScaleDB.json')

// Configure lowdb to write data to JSON file
const adapter = new JSONFile(file)
const defaultData = {
    tempCurrentWebsite: null,
    currentWebsite: null,
    analysedWebsites: [],
}
const db = new Low(adapter, defaultData)

const mutex = new Mutex();

// Read data from JSON file, this will set db.data content
// If JSON file doesn't exist, defaultData is used instead
await mutex.runExclusive(async () => {
    await db.read()
});

export const getTempCurrentWebsite = async () => {
    return await mutex.runExclusive(async () => {
        await db.read()
        return db.data.tempCurrentWebsite;
    });
}

export const setTempCurrentWebsite = async (url) => {
    await mutex.runExclusive(async () => {
        db.data.tempCurrentWebsite = url;
        await db.write()
    });
}

export const getAnalysedWebsites = async () => {
    return await mutex.runExclusive(async () => {
        await db.read()
        return db.data.analysedWebsites;
    });
}

export const getCurrentWebsite = async () => {
    return await mutex.runExclusive(async () => {
        await db.read()
        return db.data.currentWebsite;
    });
}

export const getCurrentWebsiteToBeAnalysedPages = async () => {
    let currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return [];
    }
    return currentWebsite.toBeAnalysed;
}

export const setCurrentWebsite = async (domain, pages, totalNumberOfPages) => {
    await mutex.runExclusive(async () => {
        db.data.currentWebsite = {
            domain: domain,
            toBeAnalysed: pages,
            analysedPages: [],
            failedAnalysedPages: [],
            totalNumberOfPages
        };
        await db.write();
    });
}

export const getCurrentWebsiteTotalNumberOfPages = async () => {
    const currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return;
    }
    return await mutex.runExclusive(async () => {
        return db.data.currentWebsite.totalNumberOfPages;
    });
}

export const setCurrentWebsiteTotalNumberOfPages = async (totalNumberOfPages) => {
    const currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return;
    }
    await mutex.runExclusive(async () => {
        db.data.currentWebsite.totalNumberOfPages = totalNumberOfPages;
        await db.write();
    });
}

export const setPageToAnalysed = async (page) => {
    const currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return;
    }

    await mutex.runExclusive(async () => {
        const pageIndex = db.data.currentWebsite.toBeAnalysed.findIndex((element) => element == page);
        if(pageIndex == -1) {
            return;
        }
        db.data.currentWebsite.toBeAnalysed.splice(pageIndex, 1);
        db.data.currentWebsite.analysedPages.push(page);
        await db.write();
    });
}

export const setCurrentWebsiteToAnalysed = async () => {
    let currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return false;
    }

    return await mutex.runExclusive(async () => {
        db.data.analysedWebsites.push(currentWebsite);
        db.data.currentWebsite = null;
        await db.write();
        return true;
    });
}

export const isWebsiteAnalysed = async (domain) => {
    return await mutex.runExclusive(async () => {
        await db.read();
        if(!(domain.startsWith("http") || domain.startsWith("https"))) {
            domain = "https://" + domain;
        }

        const index = db.data.analysedWebsites.findIndex((element) => element.domain == domain);
        return index != -1;
    });
}

export const isPageAnalysed = async (page) => {
    return await mutex.runExclusive(async () => {
        await db.read();

        if(db.data.currentWebsite == null ||  db.data.currentWebsite.analysedPages == null) {
            return false;
        }
        
        let onAnalysedPages = false;
        const index = db.data.currentWebsite.analysedPages.findIndex((element) => element == page);
        onAnalysedPages = index != -1;

        if(onAnalysedPages) {
            return true;
        }

        if(db.data.currentWebsite.failedAnalysedPages == null) {
            return false;
        }

        const index2 = db.data.currentWebsite.failedAnalysedPages.findIndex((element) => element.url == page);
        return index2 != -1;
    });
}

export const addPageToBeAnalysed = async (page) => {
    const currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return;
    }

    await mutex.runExclusive(async () => {
        if(db.data.currentWebsite.toBeAnalysed == null) {
            db.data.currentWebsite.toBeAnalysed = [];
        }

        db.data.currentWebsite.toBeAnalysed.push(page);
        await db.write();
    });
}

export const setPagetoFailedAnalysedPage = async (page, error) => {
    const currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return;
    }

    await mutex.runExclusive(async () => {
        const pageIndex = db.data.currentWebsite.toBeAnalysed.findIndex((element) => element == page);
        if(pageIndex == -1) {
            return;
        }
        db.data.currentWebsite.toBeAnalysed.splice(pageIndex, 1);
        db.data.currentWebsite.failedAnalysedPages.push({url: page, error: error});
        await db.write();
    });
}

export const isWebsiteCurrent = async (website) => {
    const currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return false;
    }
    return currentWebsite.domain == website;
}

export const removePageToBeAnalysed = async (page) => {
    const currentWebsite = await getCurrentWebsite();
    if(currentWebsite == null) {
        return;
    }

    await mutex.runExclusive(async () => {
        const pageIndex = db.data.currentWebsite.toBeAnalysed.findIndex((element) => element == page);
        if(pageIndex == -1) {
            return;
        }
        db.data.currentWebsite.toBeAnalysed.splice(pageIndex, 1);
        await db.write();
    });
}
