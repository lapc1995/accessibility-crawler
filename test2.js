

import { readFileSync } from 'fs';

function readJsonFile(filePath) {
  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    return jsonData;
  } catch (error) {
    console.error(`Error reading JSON file: ${error}`);
    return null;
  }
}

// Example usage:
const filePath = './package-lock.json';
const jsonData = readJsonFile(filePath);
if (jsonData) {
  console.log(jsonData.packages['node_modules/wappalyzer']["version"]);
  console.log(jsonData.packages['node_modules/wappalyzer-core']["version"]);
  console.log(jsonData.packages['node_modules/puppeteer']["version"]);
}