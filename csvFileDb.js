import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, 'csvDB.json');

// Configure lowdb to write data to JSON file
const adapter = new JSONFile(file)
const defaultData = { 
    filesDone: [],
};
const db = new Low(adapter, defaultData);

// Read data from JSON file, this will set db.data content
// If JSON file doesn't exist, defaultData is used instead
await db.read();

export const getFilesDone = async() => {
    await db.read();
    return db.data.filesDone;
}

export const addFile = async(filename) => {
    await db.read();
    db.data.filesDone.push(filename);
    await db.write();
}

