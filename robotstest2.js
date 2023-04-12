import robotsParser from 'robots-parser';
import fetch from 'node-fetch';

const response = await fetch('https://facebook.com/robots.txt');
const body = await response.text();

console.log(body);


var robots = robotsParser('https://facebook.com/robots.txt',body);

console.log(robots.isAllowed('https://facebook.com/sharer.php', 'Googlebot')); 