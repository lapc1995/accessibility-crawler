import Transport from 'winston-transport';
import util from 'util';
import Parse from 'parse/node.js';

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
export default class YourCustomTransport extends Transport {
  constructor(opts) {
    super(opts);
    //
    // Consume any custom options here. e.g.:
    // - Connection information for databases
    // - Authentication information for APIs (e.g. loggly, papertrail,
    //   logentries, etc.).
    //
  }

  async log(info, callback) {
    const Log = Parse.Object.extend("Log");
    const logObject = new Log();
    logObject.set('level', info.level);
    logObject.set('message', info.message);
    logObject.set('timestamp', new Date(info.timestamp));

    if(info.machine ) {
        logObject.set('machine', info.machine);
    }
    if(info.website) {
        logObject.set('website', info.website);
    }

    const logObjectACL = new Parse.ACL();
    logObjectACL.setPublicReadAccess(true);
    logObject.setACL(logObjectACL);

    await logObject.save({}, {useMasterKey: true});
  }
};