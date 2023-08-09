const ProofManager = require("./src/proof_manager.js");
const log = require("./logger.js");

async function run(settings) {
    const proofManager = new ProofManager();
    proofManager.initialize("zkEvmProofmanager", settings.options);

    const proof = await proofManager.prove(settings.settings, settings.options);
    log.info("Proof generated");
}

settings = {
    settings: {
        name: "zkEvmProof-" + Date.now(),
        pilout: { piloutFilename: "../pilcom/tmp/pilout.ptb", piloutProto: "../pilcom/src/pilout.proto" },
        executors: [
            { executorLib: "./src/lib/executors/executorA.js", settings: {} },
            { executorLib: "./src/lib/executors/executorB.js", settings: {} },
        ],
        prover: { proverLib: "./src/lib/provers/proverA.js", settings: {} },
        verifier: { verifierLib: "./src/lib/verifiers/verifierA.js", settings: {} },
        setup: "setup",
    },
    options: {
        debug: true,
    },
};

run(settings).then(
    () => {
        process.exit(0);
    },
    (err) => {
        console.log(err.message);
        console.log(err.stack);
        process.exit(1);
    }
);