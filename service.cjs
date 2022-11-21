const { workerData, parentPort } = require("worker_threads");

// You can do any heavy stuff here, in a synchronous way
// without blocking the "main thread"
const sleep = () => {
  return new Promise(resolve => setTimeout(() => resolve, 500));
};
let cnt = 0;
for (let i = 0; i < 10e8; i += 1) {
  cnt += 1;
}
parentPort.postMessage({ data: cnt });