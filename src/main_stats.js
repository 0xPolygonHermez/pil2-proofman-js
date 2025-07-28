const fs = require("fs");
const version = require("../package").version;

const { AirOut } = require("./airout");
const log = require("../logger.js");
const { generateStarkStruct, log2 } = require("./setup/utils.js");
const path = require("path");
const {starkSetup} = require("./pil2-stark/stark_setup.js");
const F3g = require("./pil2-stark/utils/f3g.js");

const argv = require("yargs")
    .version(version)
    .usage("node src/main_stats.js -a <airout.ptb>")
    .alias("a", "airout")
    .alias("o", "output")
    .alias("g", "airgroups").array("g")
    .alias("i", "airs").array("i")
    .alias("m", "impols")
    .alias("b", "builddir")
        .argv;

async function run() {
    
    const buildDir = argv.builddir || "tmp";
    
    // Check if buildDir exists as a file and remove it, or create directory
    try {
        const stat = await fs.promises.stat(buildDir);
        if (stat.isFile()) {
            await fs.promises.unlink(buildDir);
            await fs.promises.mkdir(buildDir, { recursive: true });
        }
    } catch (err) {
        if (err.code === 'ENOENT') {
            // Path doesn't exist, create directory
            await fs.promises.mkdir(buildDir, { recursive: true });
        } else {
            throw err;
        }
    }

    const statsFile = argv.output || "tmp/stats.txt";

    await fs.promises.mkdir( path.dirname(statsFile), { recursive: true });

    const setupOptions = {
        F: new F3g("0xFFFFFFFF00000001"),
        pil2: true,
        optImPols: argv.impols || false,
    };

    const airout = new AirOut(argv.airout);

    const airgroups = argv.airgroups || [];
    const airs = argv.airs || [];

    const stats = {};
    let statsFileInfo = [];
    let summary = [];
    for(const airgroup of airout.airGroups) {
        if(airgroups.length > 0 && !airgroups.includes(airgroup.name)) {
            log.info("[Stats Cmd]", `··· Skipping airgroup '${airgroup.name}'`);
            continue;
        }
        stats[airgroup.name] = [];
        for(const air of airgroup.airs) {
            if(airs.length > 0 && !airs.includes(air.name)) {
                log.info("[Stats Cmd]", `··· Skipping air '${air.name}'`);
                continue;
            }
            let starkStruct = generateStarkStruct({}, log2(air.numRows));
            log.info("[Stats  Cmd]", `··· Computing stats for air '${air.name}'`);
            setupOptions.filesDir = buildDir;
            setupOptions.airName = air.name;
            const setup = await starkSetup(air, starkStruct, setupOptions);
            statsFileInfo.push(`Airgroup: ${airgroup.name} Air: ${air.name}`);
            statsFileInfo.push(`Summary: ${setup.stats.summary}`);
            setup.stats.summary = `${airgroup.name} | ${air.name} | ${setup.stats.summary}`;
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

