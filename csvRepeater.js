
import * as fs from 'fs';
import * as dotenv from 'dotenv'
dotenv.config()

import { run as runCSVMode } from './modes/csv.js';
import { analyseECommerceDomain } from './contexts/ecommerce.js';
import { zipDomainFolder,  zipDataAndErrorFolder, removeFolders} from './utils.js';

const path = '/Users/luiscarvalho/accessibility-crawler/ecommercecsvs/';

let files = fs.readdirSync(path);
for(let i = 0; i < files.length; i++) {
    process.env.CSVFILEPATH = `${path}${files[i]}`;
    await runCSVMode(analyseECommerceDomain);
    await zipDataAndErrorFolder(files[i]);
    removeFolders('./data', './error');
}



