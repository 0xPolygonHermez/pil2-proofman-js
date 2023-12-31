const { WitnessCalculatorComponent } = require("../../src/witness_calculator_component.js");

const log = require("../../logger.js");

class ExecutorFibonacci extends WitnessCalculatorComponent {
    constructor(wcManager, proofCtx) {
        super("FibonacciEx", wcManager, proofCtx);
    }

    async witnessComputation(stageId, subproofId, airId, instanceId, publics) {
        if(stageId !== 1) return;

        if(instanceId !== -1) {
            log.error(`[${this.name}]`, `Air instance id already existing in stageId 1.`);
            throw new Error(`[${this.name}]`, `Air instance id already existing in stageId 1.`);
        }

        // For tests purposes we only use airId === 0
        airId = 0;
        const air = this.proofCtx.airout.subproofs[subproofId].airs[airId];

        let { result, airInstance } = this.proofCtx.addAirInstance(subproofId, airId, air.numRows);

        if (result === false) {
            log.error(`[${this.name}]`, `New air instance for air '${air.name}' with N=${air.numRows} rows failed.`);
            throw new Error(`[${this.name}]`, `New air instance for air '${air.name}' with N=${air.numRows} rows failed.`);
        }

        const N = airInstance.layout.numRows;
        const F = this.proofCtx.F;

        const polA = airInstance.wtnsPols.Fibonacci.a;
        const polB = airInstance.wtnsPols.Fibonacci.b;

        polB[0] = publics.in1;
        polA[0] = publics.in2;
        for (let i = 1; i < N; i++) {
            polB[i] = polA[i-1];
            polA[i] = F.add(F.square(polB[i-1]), F.square(polA[i-1]));    
        }

        publics.out = polA[N-1];
    
        return;
    }
}

module.exports = ExecutorFibonacci;