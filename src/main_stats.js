const fs = require("fs");
const version = require("../package").version;

const F3g = require("pil2-stark-js/src/helpers/f3g");
const { AirOut } = require("./airout");
const log = require("../logger.js");
const { starkSetup } = require("pil2-stark-js");
const { generateStarkStruct } = require("./setup/utils.js");
const { log2 } = require("stark-recurser/src/utils/utils.js");
const path = require("path");

const argv = require("yargs")
    .version(version)
    .usage("node main_stats.js -a <airout.ptb>")
    .alias("a", "airout")
    .alias("o", "output")
    .alias("g", "airgroups").array("g")
    .alias("i", "airs").array("i")
        .argv;

async function run() {
    
    const statsFile = argv.output || "tmp/stats.txt";

    await fs.promises.mkdir( path.dirname(statsFile), { recursive: true });

    const setupOptions = {
        F: new F3g("0xFFFFFFFF00000001"),
        pil2: true,
        optImPols: true,
        skipConstTree: true,
    };

    const airout = new AirOut(argv.airout);

    const airgroups = argv.airgroups || [];
    const airs = argv.airs || [];

    const stats = {};
    let statsFileInfo = [];
    let summary = [];
    for(const subproof of airout.subproofs) {
        if(airgroups.length > 0 && !airgroups.includes(subproof.name)) {
            log.info("[Stats Cmd]", `··· Skipping airgroup '${subproof.name}'`);
            continue;
        }
        stats[subproof.name] = [];
        for(const air of subproof.airs) {
            if(airs.length > 0 && !airs.includes(air.name)) {
                log.info("[Stats Cmd]", `··· Skipping air '${air.name}'`);
                continue;
            }
            let starkStruct = generateStarkStruct({}, log2(air.numRows));
            log.info("[Stats  Cmd]", `··· Computing stats for air '${air.name}'`);
            const setup = await starkSetup(null, air, starkStruct, setupOptions);
            statsFileInfo.push(`Airgroup: ${subproof.name} Air: ${air.name}`);
            statsFileInfo.push(`Summary: ${setup.stats.summary}`);
            setup.stats.summary = `${subproof.name} | ${air.name} | ${setup.stats.summary}`;
            summary.push(setup.stats.summary);
            if(setup.stats.intermediatePolynomials.baseField.length > 0) {
                statsFileInfo.push(`Intermediate polynomials baseField:`);
                for(let i = 0; i < setup.stats.intermediatePolynomials.baseField.length; ++i) {
                    statsFileInfo.push(`    ${setup.stats.intermediatePolynomials.baseField[i]}`);
                }
            }
            if(setup.stats.intermediatePolynomials.extendedField.length > 0) {
                statsFileInfo.push(`Intermediate polynomials extendedField:`);
                for(let i = 0; i < setup.stats.intermediatePolynomials.extendedField.length; ++i) {
                    statsFileInfo.push(`    ${setup.stats.intermediatePolynomials.extendedField[i]}`);
                }
            }
            statsFileInfo.push(`\n`);

        }
    }

    console.log("-------------------------- SUMMARY -------------------------")
    for(let i = 0; i < summary.length; ++i) {
        console.log(summary[i]);
    }
    console.log("------------------------------------------------------------")

    await fs.promises.writeFile(statsFile, statsFileInfo.join("\n"), "utf8");

    console.log("Stats Generated Correctly");
}

run().then(()=> {
    process.exit(0);
}, (err) => {
    console.log(err.message);
    console.log(err.stack);
    process.exit(1);
});
