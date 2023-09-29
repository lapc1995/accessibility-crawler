let visitedWebsites = [];

export function setVisitedWebsites(websites) {
    visitedWebsites = websites;
    console.log(visitedWebsites);
}

export function hasWebsiteBeenVisited(domain) {
    return visitedWebsites.includes(domain);
}

export function addVisitedWebsite(domain) {
    visitedWebsites.push(domain);
}