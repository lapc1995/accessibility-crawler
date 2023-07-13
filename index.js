import puppeteer from 'puppeteer';
import {AxePuppeteer} from '@axe-core/puppeteer';
import * as path from 'path';
import jsonfile from 'jsonfile';
import {oraPromise} from 'ora';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { response } from 'express';
import csvParser from 'csv-parser';

import Parse from 'parse/node.js';

import os from 'os';

import * as dotenv from 'dotenv'
dotenv.config()

import { getTechnologies } from './wappalyzerMiddleware.js'

import archiver from 'archiver';

import Wappalyzer from './wappalyzer/drivers/npm/driver.js'

import { JsonDB, Config } from 'node-json-db';

import * as winston from 'winston';

import YourCustomTransport from './serverTransports.js';

import seedrandom from 'seedrandom';

import { run as runUrlMode } from './modes/url.js';
import { run as runCSVMode } from './modes/csv.js';
import { run as runRandomSampleCSVMode } from './modes/randomsamplecsv.js';
import { run as runServerMode } from './modes/server.js';

//import { run as runTestMode } from './contexts/test.js';

import { analyseECommerceDomain } from './contexts/ecommerce.js';
import { analyseHomePlusDomain } from './contexts/homeplus.js';
import { analyseECommerceDomainManually } from './contexts/manual.js';
import { analyseSingleDomain } from './contexts/single.js';
import { analyseLargeScaleDomain } from './contexts/largeScale.js';
import * as utils from './utils.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

utils.eraseFoldersAndDatabase();

(async () => {

  let context = null;
  if(process.env.CONTEXT == "ecommerce") {
    context = analyseECommerceDomain;
  } else if(process.env.CONTEXT == "homeplus") {
    context = analyseHomePlusDomain;
  } else if (process.env.CONTEXT == "single") {
    context = analyseSingleDomain;
  } else if(process.env.CONTEXT == "manual") {
    context = analyseECommerceDomainManually;
  } else if(process.env.CONTEXT == "largescale") {
    context = analyseLargeScaleDomain;
  }

  if(context == null) {
    console.log("No context provided");
    return;
  }

  if(process.env.MODE == "url") {
    await runUrlMode(context);
  } else if(process.env.MODE == "csv") {
    await runCSVMode(context);
  } else if(process.env.MODE == "server") {
    await runServerMode(context);
  } else if(process.env.MODE == "randomsamplecsv") {
    await runRandomSampleCSVMode(context);
  }

})();

