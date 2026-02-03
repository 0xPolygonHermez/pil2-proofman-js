const fs = require("fs");
const version = require("../package").version;

const setupAggregationCmd = require("./cmd/setup_aggregation_cmd");

const argv = require("yargs")
    .version(version)
    .usage("node main_setup_aggregation.js -t <stdPath> -b <buildDir>")
    .alias("k", "provingkey")
    .alias("b", "builddir")
    .alias("t", "stdPath")
    .alias("p", "publicsinfo")
    .demandOption(["stdPath", "builddir", "provingkey", "publicsinfo"])
    .describe("b", "Build directory for output files")
    .describe("t", "Path to PIL2 std library")
    .argv;

async function run() {
    if (!argv.stdPath) {
        throw new Error("Std path must be provided");
    }

    if (!argv.builddir) {
        throw new Error("Build directory must be provided");
    }

    if (!argv.provingkey) {
        throw new Error("Proving key path must be provided");
    }

    if (!argv.publicsinfo) {
        throw new Error("Publics info file must be provided in order to generate aggregation setup");
    }

    let publicsInfo = JSON.parse(await fs.promises.readFile(argv.publicsinfo, "utf8"));

    const buildDir = argv.builddir;

    const config = {
        publicsInfo,
        stdPath: argv.stdPath,
        provingKeyPath: argv.provingkey,
    };

    await setupAggregationCmd(config, buildDir);

    console.log("Vadcop Final compressed setup files generated correctly");
}

run().then(() => {
    process.exit(0);
}, (err) => {
    console.log(err.message);
    console.log(err.stack);
    process.exit(1);
});
