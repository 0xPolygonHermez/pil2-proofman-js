// main.js
const { Worker } = require("worker_threads");
const TargetLock = require("../../../src/concurrency/target_lock");
const Mutex = require("../../../src/concurrency/mutex");

const log = require("../../../logger.js");

module.exports = class WCManager {
    constructor() {
        this.name = "wcManager"

        this.modules = [];
        this.wcDeferredLock;
        this.mutex = new Mutex();

        this.pendingJobs = [];
    }

    async run(modules) {
        let numListeners = 0;
        for(const module of modules) {
            const newWorker = new Worker(module.filename);
            const state = module.settings.type === "listener" ? "listening" : "initialized";
            if(state === "listening") numListeners++;
            this.modules.push({ name: module.name, worker: newWorker, state });
            newWorker.on("message", async (msg) => { await this.dispatchMessage(msg); });
        }

        this.wcDeferredLock = new TargetLock(modules.length - numListeners, 0);

        for(const module of this.modules) module.worker.postMessage({ command: "run" });

        await this.witnessComputation(0);

        for(const module of this.modules) module.worker.terminate();
    }

    checkModuleExist(moduleName) {
        const index = this.modules.findIndex(module => module.name === moduleName);
        if(index === -1) {
            log.error(`[${this.name}]`, "Module not found '" + moduleName + "'");
            throw new Error("Module not found '" + moduleName + "'");
        }

        return this.modules[index];
    }

    witnessComputation(stageId) {
        return new Promise(async (resolve, reject) => {
            try {
                while(true) {
                    log.info(`[${this.name}]`, "Locking...")

                    await this.wcDeferredLock.lock();

                    log.info(`[${this.name}]`, "Unlocking...")
                    
                    if(this.pendingJobs.length === 0) break;

                    await this.mutex.lock();
                    this.unlockModules();
                    this.mutex.unlock();
                }
                
                resolve();
            } catch (err) {
                log.error(`[${this.name}]`, `Witness computation failed.`, err);
                reject(err);
            }
        });
    }

    unlockModules() {        
        // Deferred commands are the commands that are not executed immediately
        // but are executed when the witness computation is finished.
        // For example, the command "div_batch" is executed when the witness computation
        // is finished.
        // So, we must call the module once each time with all the deferred jobs
        const deferredModules = [
            { name: "div_batch", type: "deferred", jobs: [] },
            { name: "resolve", jobs: [] }
        ];

        log.info(`[${this.name}]`, "Trying to unblock witness calculators.")

        // Execute deferred commands that must be executed once all together...
        const deferredOnceModules = deferredModules.filter(module => module.type === "deferred");
        const deferredOnceCommands = deferredOnceModules.map(module => module.name);

        for(let i=0;i<this.pendingJobs.length;i++) {
            const job = this.pendingJobs[i];
            if(!deferredOnceCommands.includes(job.job.command)) continue;

            const module = deferredOnceModules.find(module => module.name === job.job.command);
            module.jobs.push(job);
            job.solved = true;
        }

        deferredOnceModules.forEach(module => {
            if (module.jobs.length > 0) {
                // log.info(`[${this.name}]`, `!!! Executing deferred '${module.jobs[0].job.command}' jobs once`);
    
                module.jobs.forEach(job => {
                    const moduleDest = job.src;
                    const module = this.checkModuleExist(moduleDest);
                    module.worker.postMessage({ command: "unlock", src: job.job.src });
                    this.acquireLock(`Worker ${module.name}(with ${job.job.src}) unlocked`);
                });
            }
        });

        this.pendingJobs = this.pendingJobs.filter(job => !job.solved);

        for(let job; job=this.pendingJobs.shift(); job!==undefined) {                            

            // log.info(`[${this.name}]`, `!!! Executing deferred '${job.job.command}' job`);

            const moduleDest = job.src;
            const module = this.checkModuleExist(moduleDest);
            module.worker.postMessage({ command: "unlock", src: job.job.src });
            this.acquireLock(`Worker ${module.name}(with ${job.job.src}) unlocked`);
        }
    }

    // COMMANDS DISPATCHER
    async dispatchMessage(msg) {
        const command = msg.command;

        switch(command) {
            case "open_session":
                await this.openSessionCmd(msg);
                break;
            case "close_session":
                await this.closeSessionCmd(msg);
                break;
            case "change_state":
                await this.changeStateCmd(msg);
                break;
            case "pending_job":
                await this.pendingJobCmd(msg);
                break;
            default:
                log.error(`[${this.name}]`, "Unknown command: " + command);
        }
    }

    async openSessionCmd(msg) {
        log.info(`[${this.name}]`, `${msg.command} : ${msg.params.src} --> ${msg.params.dest} `);
        const dest = msg.params.dest;
        const module =this.checkModuleExist(dest);

        await this.changeStateCmd({ command: "change_state", params: { src: dest, state: "session" } });

        module.worker.postMessage({ command: "open_session", params: msg.params }, [msg.params.port]);
    }

    async closeSessionCmd(msg) {
        log.info(`[${this.name}]`, `${msg.command} : ${msg.params.src} <-x ${msg.params.dest} `);

        await this.mutex.lock();
        this.releaseLock("Releasing because of closing session");
        this.mutex.unlock();        
    }

    async changeStateCmd(msg) {
        await this.mutex.lock();

        const module =this.checkModuleExist(msg.params.src);
        const newState = msg.params.state;

        module.state = newState;

        if(["listening", "finished"].includes(newState))
            this.releaseLock(`Releasing because of ${msg.params.src}(${newState})`);
        else if(["session"].includes(newState))
            this.acquireLock(`Acquiring because of ${msg.params.src}(${newState})`);

        this.mutex.unlock();
    }

    async pendingJobCmd(msg) {
        await this.mutex.lock();
        log.info(`[${this.name}]`, `${msg.command} : ${msg.params.src} command '${msg.params.job.command}'`);
        this.pendingJobs.push( msg.params );

        if(msg.params.lock === true) this.releaseLock("Releasing because of pending_job");

        this.mutex.unlock();
    }

    releaseLock(message) {
        this.wcDeferredLock.release();
        // log.info(`[${this.name}]`, "---", message, `(${this.wcDeferredLock.locked})`);
    }

    acquireLock(message) {
        this.wcDeferredLock.acquire();
        // log.info(`[${this.name}]`, "+++", message, `(${this.wcDeferredLock.locked})`);
    }
};
