import { JWT } from 'google-auth-library';
import fs from 'fs/promises';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as dotenv from 'dotenv'
dotenv.config()

const data = await fs.readFile(`./keys/${process.env.SHEET_AUTH_FILE}`, 'utf8');
const creds = JSON.parse(data);
const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets'
];
const jwt = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
});


console.log("Connecting to Google Sheets");
const doc = new GoogleSpreadsheet(process.env.SHEET_FILE_ID, jwt);
console.log("Connected to Google Sheets");

async function updateWebsites() {
    console.log("Reading largeScaleDB.json");
    const dbRaw = await fs.readFile(`./largeScaleDB.json`, 'utf8');
    console.log("Parsing largeScaleDB.json");
    const db = JSON.parse(dbRaw);
    const analysedWebsites = db['analysedWebsites'].length;
    console.log("Analysed websites", analysedWebsites);
    await doc.loadInfo();
    let sheet = doc.sheetsByIndex[process.env.SHEET_NUMBER];
    const rows = await sheet.getRows();
    //rows[0].assign({ 'Websites Finished': analysedWebsites, 'Last Updated': new Date() }); // set multiple values
    await sheet.addRow({ 'Websites Finished': analysedWebsites, 'Last Updated': new Date() }); // add a row
    //await rows[0].save(); // save updates on a row
    console.log(sheet.cellStats)
    console.log(rows.length)
}

(async () => {
    try {
        await updateWebsites();
    }
    catch (e) {
        console.log("Error", e);
    }
})()

var requestLoop = setInterval(async () => {
    try {
        await updateWebsites();
    } catch(e) {    
        console.log("Error", e);
    }
  },  process.env.UPDATE_INTERVAL * 60000);
  