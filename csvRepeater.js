
import * as fs from 'fs';
import * as dotenv from 'dotenv'
dotenv.config()

import { run as runCSVMode } from './modes/csv.js';
import { analyseLargeScaleDomain } from './contexts/largeScale.js';
import { removeFolders, zipDomainAndDatabases, renameFolder} from './utils.js';
import { StartPm2Task, StopPm2Task } from './pm2Controller.js';
import { addFile, getFilesDone } from './csvFileDb.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const path = './ecommercecsvs/';

let files = fs.readdirSync(path);
let fileDone = await getFilesDone();
files = files.filter((filename) => !fileDone.includes(filename));

for(let i = 0; i < files.length; i++) {
    process.env.CSVFILEPATH = `${path}${files[i]}`;
    await StartPm2Task('./keepAliveWatcher.js', null);
    await runCSVMode(analyseLargeScaleDomain);
    await StopPm2Task('./keepAliveWatcher.js');
    await zipDomainAndDatabases(files[i]);
    renameFolder('./data', `./data_old_${files[i]}`);
    removeFolders('./data', './error');
    await addFile(files[i]);
}

await StopPm2Task('./csvRepeater.js');
await StopPm2Task('./keepAliveWatcher.js');

