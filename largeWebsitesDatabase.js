import { JsonDB, Config } from 'node-json-db'; 

/*
    DB strucure
    largeWebsites: [
        domain: "https://www.example.com",
        numberOfPages: 100
    ]
*/

export const db = new JsonDB(new Config("largeWebsitesDB", true, true, '/'));

export const getLargeWebsites = async () => {
    let largeWebsites;
    try {
        largeWebsites = await db.getData('/largeWebsites');
    } catch (error) {
        largeWebsites = [];
    }
    return largeWebsites;
}


export const addLargeWebsite = async (domain, numberOfPages) => {
    await db.push("/largeWebsites[]", {domain, numberOfPages});
}
