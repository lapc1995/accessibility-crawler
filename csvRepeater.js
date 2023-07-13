
import * as fs from 'fs';
import * as dotenv from 'dotenv'
dotenv.config()

import { run as runCSVMode } from './modes/csv.js';
import { analyseLargeScaleDomain } from './contexts/largeScale.js';
import { zipDomainFolder,  zipDataAndErrorFolder, removeFolders, zipDomainAndDatabases} from './utils.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const path = './ecommercecsvs/';

let files = fs.readdirSync(path);
for(let i = 0; i < files.length; i++) {
    process.env.CSVFILEPATH = `${path}${files[i]}`;
    await runCSVMode(analyseLargeScaleDomain);
    //await zipDataAndErrorFolder(files[i]);
    await zipDomainAndDatabases(files[i]);
    removeFolders('./data', './error');
}



