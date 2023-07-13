import {isSameDomain} from './utils.js';

const result1 =  isSameDomain('https://www.google.com', new URL('https://www.google.com'))
console.log(result1);


const result2 =  isSameDomain('https://www.softwaretestinghelp.com/jest-testing-tutorial/', new URL('https://www.google.com'))
console.log(result2);

const result3 =  isSameDomain('https://www.npmjs.com/package/psl', new URL('https://docs.npmjs.com/'))
console.log(result3);