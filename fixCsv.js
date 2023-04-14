import csvParser from 'csv-parser';
import { Parser } from '@json2csv/plainjs';
import { createReadStream } from 'fs';
import * as fs from 'fs';


const getCSVFileContent = async (filePath) => {

    const readCSV = new Promise((resolve, reject) => {
        const results = [];
        createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          resolve(results);
        });
      });
    
    var result = await readCSV;
    return result;
}


const shuffleWebsites = (websites) => {

    const websitesShuffled = shuffle(websites);
    for(let i = 0; i < websitesShuffled.length; i++) {
        websitesShuffled[i].Order = i;
    }
    return websitesShuffled;
}



const path = '/Users/luiscarvalho/Downloads/OneDrive_1_12-04-2023';
let files = fs.readdirSync(path);
for(let i = 0; i < files.length; i++) {
    const filePath= `${path}/${files[i]}`;
    console.log(filePath)
    let data = fs.readFileSync(filePath, 'utf8');
    let newData = data.split('\n').slice(1);
    console.log(newData);
    newData[0] = newData[0].replace('Domain', 'DomainOld');
    newData[0] = newData[0].replace('Location on Site', 'Domain');
    newData = newData.join('\n');
    fs.writeFileSync(filePath, newData);
}
