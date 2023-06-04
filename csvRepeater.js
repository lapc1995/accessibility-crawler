
import * as fs from 'fs';
import * as dotenv from 'dotenv'
dotenv.config()

import { run as runCSVMode } from './modes/csv.js';
import { analyseLargeScaleDomain } from './contexts/largeScale.js';
import { zipDomainFolder,  zipDataAndErrorFolder, removeFolders} from './utils.js';

const path = './ecommercecsvs/';

let files = fs.readdirSync(path);
for(let i = 0; i < files.length; i++) {
    process.env.CSVFILEPATH = `${path}${files[i]}`;
    await runCSVMode(analyseLargeScaleDomain);
    await zipDataAndErrorFolder(files[i]);
    removeFolders('./data', './error');
}



