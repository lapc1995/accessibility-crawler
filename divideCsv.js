import csvParser from 'csv-parser';
import { Parser } from '@json2csv/plainjs';
import { createReadStream } from 'fs';
import * as fs from 'fs';

const shuffle = (array) => {
    let currentIndex = array.length,  randomIndex;
  
    // While there remain elements to shuffle.
    while (currentIndex != 0) {
  
      // Pick a remaining element.
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
  
      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
  
    return array;
}


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




(async () => {

    const top1Million  = [];
    const csvContent = await getCSVFileContent("top10milliondomains.csv");
    let slicedArray = csvContent.slice(0, 1000000);
    console.log(slicedArray.length);
    console.log(slicedArray[0].Rank);
    console.log(slicedArray[999999].Rank);

    slicedArray = shuffleWebsites(slicedArray);

    const parser = new Parser({});
    //const csv = parser.parse(slicedArray);
    //fs.writeFileSync(`top1MillionDomCop11-04-23.csv`, csv);

    const sliceSize = 300;
    let sliceStartIndex = 0;
    let numberOfSlices = 5;

    for(let i = 0; i < numberOfSlices; i++) {
        let smallSlice = slicedArray.slice(sliceStartIndex, sliceStartIndex + sliceSize);
        const csv = parser.parse(smallSlice);
        fs.writeFileSync(`top1MillionDomCopSlice${i}.csv`, csv);
        sliceStartIndex += sliceSize;
    }


    //console.log(shuffledWebsites);
    //await saveWebsitesOnServer(shuffledWebsites, 100);


    //await saveWebsite("https://www.amazon.co.uk");


})();