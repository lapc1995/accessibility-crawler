const { Worker } = require("worker_threads");

var count = 0;
const threadCount = 50;

console.log("Start Program");

const runService = () => {
  return new Promise((resolve, reject) => {
    const worker = new Worker("./reportGeneratorService", {});
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", code => {
      if (code != 0) {
        reject(new Error("Worker has stopped"));
      }
    });
  });
};

var services = [];

for (let i = 0; i < threadCount; i++) {
  services.push(runService());
  //run().catch(error => console.log(error));
}

(async () => {
  var result = await Promise.all(services);
  console.log(result);
  
  setTimeout(() => console.log("End Program"), 2000);
})();
