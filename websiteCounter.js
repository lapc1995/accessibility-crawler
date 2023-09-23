import { JWT } from 'google-auth-library';
import fs from 'fs/promises';
import { GoogleSpreadsheet } from 'google-spreadsheet';

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


async function updateWebsites() {
    const dbRaw = await fs.readFile(`./largeScaleDB.json`, 'utf8');
    const db = JSON.parse(dbRaw);
    const analysedWebsites =  db['analysedWebsites'].length;
    const doc = new GoogleSpreadsheet(process.env.SHEET_FILE_ID, jwt);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[process.env.SHEET_NUMBER];
    const rows = await sheet.getRows();
    rows[0].assign({ 'Websites Finished': analysedWebsites, 'Last Updated': new Date() }); // set multiple values
    await rows[0].save(); // save updates on a row
}

(async () => {
    await updateWebsites();
});

var requestLoop = setInterval(async () => {
    try {
        await updateWebsites();
    } catch(e) {    
        console.log("Error", e);
    }
  },  5 * 60000);
  