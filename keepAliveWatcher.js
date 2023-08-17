import util from 'util';
import { exec as execCallback } from 'child_process';
const exec = util.promisify(execCallback);

//import { exec } from "child_process";

import * as chokidar from 'chokidar';

let timeoutId;

async function restartCrawler() {

    const command = 'pm2 stop ./csvRepeater.js'; 
    let { stdout, stderr } = await exec(command);
    if(stderr) {
        console.log(stderr);
        return;
    }
    console.log(stdout);

    const command2 = 'pm2 start ./csvRepeater.js';
    let{ stdout: stdout2, stderr: stderr2 } = await exec(command2);
    if(stderr2) {
        console.log(stderr2);
        return;
    }
    console.log(stdout2);

    timeoutId = setTimeout(restartCrawler, timeout);
}


const timeout = 1000 * 60 * 30;

const watcher = chokidar.watch('./largeScaleDB.json', {
    persistent: true
  });

const log = console.log.bind(console);

const onFileChange = () => {
    resetTimer();
}

watcher
//.on('add', path => log(`File ${path} has been added`))
.on('change', path => {
    onFileChange();
})

timeoutId = setTimeout(restartCrawler, timeout);

function resetTimer() {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(restartCrawler, timeout);
}

