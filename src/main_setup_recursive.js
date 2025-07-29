const fs = require("fs");
const version = require("../package").version;
const path = require("path");

const { generateStarkStruct } = require("./setup/utils");
const { genRecursiveSetupTest } = require("./setup/generateRecursiveSetup");

const argv = require("yargs")
    .version(version)
    .usage("node main_setup_recursive.js -b <buildDir> -c <circomPath> -n <circomName>")
    .alias("b", "builddir")
    .alias("c", "circomPath")
    .alias("n", "circomName")
    .alias("t", "stdPath")
        .argv;

async function run() {

    const buildDir = argv.builddir || "tmp";
     // if circompath not defined, error
    if (!argv.circomPath || !argv.circomName) {
        throw new Error("Circom path and name must be provided");
    }

    const circomPath = argv.circomPath;
    const circomName = argv.circomName;

    await fs.promises.mkdir(buildDir, { recursive: true });

    let starkStructRecursive = generateStarkStruct({ blowupFactor: 3}, 17);

    if (!argv.stdPath) {
        throw new Error("Std path and name must be provided");
    }

    const setupOptions = {
        constTree: path.resolve(__dirname, 'setup/build/bctree'),
        binFile: path.resolve(__dirname, 'setup/build/binfile'),
        stdPath: argv.stdPath,
    };

    await genRecursiveSetupTest(buildDir, setupOptions, starkStructRecursive, circomPath, circomName, 36);

    console.log("files Generated Correctly");
}

run().then(()=> {
    process.exit(0);
}, (err) => {
    console.log(err.message);
    console.log(err.stack);
    process.exit(1);
});

