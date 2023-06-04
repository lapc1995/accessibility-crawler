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


(async () => {

    if(!fs.existsSync("./sliced1Million")) {
        fs.mkdirSync("./sliced1Million");
    }
  
    const csvContent = await getCSVFileContent("top1MillionDomCop11-04-23.csv");
  
    const chunkSize = 10000;
    let slicesCounter = 0;
    const parser = new Parser({});
    for (let i = 0; i < csvContent.length; i += chunkSize) {
      const chunk = csvContent.slice(i, i + chunkSize);
      const csv = parser.parse(chunk);
      fs.writeFileSync(`./sliced1Million/top1MillionSlice${slicesCounter}.csv`, csv);
      slicesCounter++;
    }

})();