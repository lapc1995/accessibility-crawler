import pLimit from 'p-limit';

import { initBrowser, setBrowserAutoRestart } from './browserHandler.js';
import { delay } from './utils.js';
import * as db from './lowdbDatabase.js'
import {Mutex, Semaphore, withTimeout} from 'async-mutex';

setBrowserAutoRestart(true);

const mutex = new Mutex();

const limit = pLimit(100);

async function test(url) {
    await db.setCurrentWebsite(url, [], 0);
    await db.addPageToBeAnalysed(url);
    await db.setPagetoFailedAnalysedPage(url, "Page caused restart");
    await db.setCurrentWebsiteToAnalysed();
}

const input = []
for(let i = 0; i < 100; i++) {
    input.push(limit(async () => { await test(i); }));
}

// Only one promise is run at once
const result = await Promise.all(input);
console.log(result);
