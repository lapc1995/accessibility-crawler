import os from 'os';
import dns from 'dns'
import Parse from 'parse/node.js';
import * as winston from 'winston';
import YourCustomTransport from '../serverTransports.js';
import { JsonDB, Config } from 'node-json-db';
import { delay } from '../utils.js';

let logger;
let hasInternetConnection = false;

export const run = async (contextFunction) => {

    Parse.initialize(process.env.APP_ID, "", process.env.MASTER_KEY);
    Parse.masterKey = process.env.MASTER_KEY;
    Parse.serverURL = process.env.SERVER_URL;
  
    logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        defaultMeta: { service: 'user-service' },
        transports: [
            new winston.transports.File({ filename: 'error.log', level: 'error' }),
            new winston.transports.File({ filename: 'combined.log' }),
            new winston.transports.Console({format: winston.format.simple()}),
            new YourCustomTransport(),
        ],
    });
  
    logger.log({level: 'info',message: 'Hello distributed log files!', website: "test", machine: "test"});
  
    var db = new JsonDB(new Config("crawldb", true, true, '/'));
  
    let toBeAnalysed;
    try {
        toBeAnalysed = await db.getData('/toBeAnalysed');
    } catch (error) {
        toBeAnalysed = [];
    }


    while(!hasInternetConnection) {
        hasInternetConnection = await checkInternetConnection();
        if(!hasInternetConnection) {
            await delay(5000);
        }
    }
    
    if(toBeAnalysed.length == 0) {
        const ip = getMachineIp();
        const batch = await Parse.Cloud.run("getWebsiteBatch", {ip});
        await saveBatchInLocalDatabase(batch, db);
    }
    
    toBeAnalysed = await db.getData('/toBeAnalysed');
    for(let website of toBeAnalysed) {
        await analyseDomain(website, contextFunction, db);
    }
}

const getMachineIp = () => {
    const nets = os.networkInterfaces();
    const results = {};
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
            const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
            if (net.family === familyV4Value && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }
  
    if(results["eth0"] != null && results["eth0"].length > 0) {
        return results["eth0"][0];
    } else if(results["en0"] != null && results["en0"].length > 0) {
        return results["en0"][0];
    }
  
    return null;
}


const getProcessingOrder = async (id) => {
    try {
        const ProcessingOrder = Parse.Object.extend("ProcessingOrder");
        const query = new Parse.Query(ProcessingOrder);
        const processingOrder = await query.get(id);
        return processingOrder;
    } catch (error) {
        
        console.log("error");
        console.log(error);
        return null;
    }
}

const saveBatchInLocalDatabase = async(batch, db) => {
    for(let website of batch) {
        await db.push("/toBeAnalysed[]", website);
        const processingOrder = await getProcessingOrder(website.processingOrderId);
        processingOrder.set("status", "saved on client");
        await processingOrder.save(null, { useMasterKey: true });
    }
}

const analyseDomain = async (website, contextFunction, db) => {

    //check if internet connection is available
    //...


    const processing = await getProcessingOrder(website.processingOrderId);
    processing.set("status", "processing");
    await processing.save(null, { useMasterKey: true });
  
    //chech if error returned relates to lack of internet connection
    //await contextFunction(website.Domain, browser);
    await delay(10000);

    //check if internet connection is available
    //...


    processing.set("status", "processed");
    await processing.save(null, { useMasterKey: true });

    const index = await db.getIndex("/toBeAnalysed", website.objectId, "objectId");
    await db.delete("/toBeAnalysed[" + index + "]");
    await db.push("/analysed[]", website);
}

const checkInternetConnection = async () => {
    try {
        const result = await dns.promises.resolve('www.google.com');
        return result.length > 0;
    } catch(e) {
        logger.log({level: 'info',message: 'No internet', website: "test", machine: "test"});
        return false;
    }
}
