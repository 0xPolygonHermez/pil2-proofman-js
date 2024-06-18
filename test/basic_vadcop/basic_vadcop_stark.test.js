const { executeFullProveTest, checkConstraintsTest, generateSetupTest } = require("../test_utils.js");

const publicInputs = [];

function getSettings() {
    return {
        name: "Basic_vadcop-" + Date.now(),
        airout: {
            airoutFilename: `./test/basic_vadcop/basic_vadcop.pilout`,
        },
        witnessCalculators: [
        ],
        prover: {
            filename: "./src/lib/provers/stark_fri_prover.js",
            settings: {
                default: { starkStruct: `./test/basic_vadcop/basic_vadcop_stark_struct_2_16.json` },
                Rom: {starkStruct: `./test/basic_vadcop/basic_vadcop_stark_struct_2_10.json` },
            },   
        },
        verifier: { filename: "./src/lib/provers/stark_fri_verifier.js", settings: {} },
    };

}

describe("Basic Vadcop", async function () {
    this.timeout(10000000);

    const options = {
        parallelExec: true,
        useThreads: true,
        vadcop: true,
    };

    const optionsVerifyConstraints = {...options, onlyCheck: true};

    let setup;

    let config;

    before(async () => {
        config = getSettings();
        setup = await generateSetupTest(config);
    });

    it("Verify a Basic Vadcop constraints", async () => {
        await checkConstraintsTest(setup, publicInputs, optionsVerifyConstraints);
    });

    it.only("Generate a Basic Vadcop proof", async () => {
        await executeFullProveTest(setup, publicInputs, options, config.aggregation?.genProof);
    });
});