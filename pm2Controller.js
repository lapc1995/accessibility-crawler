
import util from 'util';
import { exec as execCallback } from 'child_process';
const exec = util.promisify(execCallback);

export async function StartPm2Task(filePath, logfile) {
    let command = `pm2 start ${filePath} --time`; 
    if(logfile) {
        command += ` --log ${logfile}`;
    }

    try {
        let { stdout, stderr } = await exec(command);
        if(stderr) {
            console.log(stderr);
            return;
        }
        console.log(stdout);
    } catch(error) {
        console.log(error);
    }
}

export async function StopPm2Task(filePath) {
    const command = `pm2 stop ${filePath}`; 
    let { stdout, stderr } = await exec(command);
    if(stderr) {
        console.log(stderr);
        return;
    }
    console.log(stdout);
}