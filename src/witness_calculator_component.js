const log = require('../logger.js');

const WITNESS_ROUND_NOTHING_TO_DO = 1;
const WITNESS_ROUND_NOTHING_DONE = 2;
const WITNESS_ROUND_PARTIAL_DONE = 3;
const WITNESS_ROUND_FULLY_DONE = 4;

// Abstract base class for all WitnessCalculator components
class WitnessCalculatorComponent {
    constructor(name, proofmanagerAPI) {
        this.name = name;
        this.proofmanagerAPI = proofmanagerAPI;

        this.initialized = false;
        this.settings = null;
    }

    initialize(settings) {
        log.info(`[${this.name}]`, "Initializing.");

        this.settings = settings;
        this.initialized = true;
    }

    checkInitialized() {
        if (!this.initialized) {
            log.info(`[${this.name}]`, "Not initialized.");
            throw new Error(`[${this.name}] Not initialized.`);
        }
    }

    async witnessComputationStage1(subproofId, airId, proofCtx, subproofCtx) {
        return WITNESS_ROUND_NOTHING_TO_DO;
    }

    async witnessComputation(stageId, subproofId, airId, proofCtx, subproofCtx) {
        return WITNESS_ROUND_NOTHING_TO_DO;
    }
}

module.exports = {
    WitnessCalculatorComponent,
    WITNESS_ROUND_NOTHING_TO_DO,
    WITNESS_ROUND_NOTHING_DONE,
    WITNESS_ROUND_PARTIAL_DONE,
    WITNESS_ROUND_FULLY_DONE,
};