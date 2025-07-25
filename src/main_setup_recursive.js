const fs = require("fs");
const version = require("../package").version;
const path = require("path");

const { generateStarkStruct } = require("./setup/utils");
const F3g = require("./pil2-stark/utils/f3g");
const { genRecursiveSetupTest } = require("./setup/generateRecursiveSetup");

const argv = require("yargs")
    .version(version)
    .usage("node main_setup_recursive.js -b <buildDir> -c <circomPath> -n <circomName>")
    .alias("b", "builddir")
    .alias("c", "circomPath")
    .alias("n", "circomName")
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

    const setupOptions = {
        F: new F3g("0xFFFFFFFF00000001"),
        pil2: true,
        constTree: path.resolve(__dirname, 'setup/build/bctree'),
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

