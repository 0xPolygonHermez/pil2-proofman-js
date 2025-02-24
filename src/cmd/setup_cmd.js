const fs = require('fs');
const crypto = require('crypto');
const util = require('util');
const childProcess = require('child_process'); // Split into two lines for clarity
const path = require("path");
const exec = util.promisify(childProcess.exec);
const JSONbig = require('json-bigint')({ useNativeBigInt: true, alwaysParseAsBig: true });
const log = require("../../logger.js");
const { AirOut } = require("../airout.js");

const F3g = require('../pil2-stark/utils/f3g.js');
const { writeExpressionsBinFile, writeVerifierExpressionsBinFile } = require("../pil2-stark/chelpers/binFile.js");
const { writeGlobalConstraintsBinFile } = require("../pil2-stark/chelpers/globalConstraintsBinFile.js");
const { starkSetup } = require('../pil2-stark/stark_setup.js');
const { getFixedPolsPil2 } = require("../pil2-stark/pil_info/helpers/pil2/piloutInfo.js");
const { generateFixedCols } = require('../pil2-stark/witness_computation/witness_calculator.js');

const { genFinalSetup } = require("../setup/generateFinalSetup.js");
const { genRecursiveSetup } = require("../setup/generateRecursiveSetup.js");
const { isCompressorNeeded } = require('../setup/is_compressor_needed.js');
const { generateStarkStruct, setAiroutInfo, log2 } = require("../setup/utils.js");
const { genFinalSnarkSetup } = require('../setup/generateFinalSnarkSetup.js');
const { readFixedPolsBin } = require('../pil2-stark/witness_computation/fixed_cols.js');


// NOTE: by the moment this is a STARK setup process, it should be a generic setup process?
module.exports = async function setupCmd(proofManagerConfig, buildDir = "tmp") {
    const airout = new AirOut(proofManagerConfig.airout.airoutFilename);

    const setupOptions = {
        F: new F3g("0xFFFFFFFF00000001"),
        pil2: true,
        optImPols: (proofManagerConfig.setup && proofManagerConfig.setup.optImPols) || false,
        constTree: path.resolve(__dirname, '../setup/build/bctree'),
        publicsInfo: proofManagerConfig.setup && proofManagerConfig.setup.publicsInfo,
        powersOfTauFile: proofManagerConfig.setup && proofManagerConfig.setup.powersOfTauFile,
        fflonkSetup: path.resolve(__dirname, '../setup/build/fflonkSetup'),
        binFiles: proofManagerConfig.setup && proofManagerConfig.setup.binFiles,
    };
    
    let setup = [];

    let starkStructs = [];

    let fixedInfo = {};

    for(let i = 0; i < setupOptions.binFiles.length; ++i) {
        await readFixedPolsBin(fixedInfo, setupOptions.binFiles[i], setupOptions.F);
    }

    let minFinalDegree = 5;
    for(const airgroup of airout.airGroups) {
        for(const air of airgroup.airs) {
            let settings = {};
            if(proofManagerConfig.setup && proofManagerConfig.setup.settings) {
                settings = proofManagerConfig.setup && proofManagerConfig.setup.settings[air.name + "_" + air.airId] || proofManagerConfig.setup.settings.default || {};
            }
            if(settings.starkStruct) {
                minFinalDegree = Math.min(minFinalDegree, settings.starkStruct.steps[settings.starkStruct.steps.length - 1].nBits);
            } else {
                minFinalDegree = Math.min(minFinalDegree, log2(air.numRows) + 1);
            }
        }
    }

    await Promise.all(airout.airGroups.map(async (airgroup) => {
        setup[airgroup.airgroupId] = [];

        await Promise.all(airgroup.airs.map(async (air) => {
            log.info("[Setup Cmd]", `··· Computing setup for air '${air.name}'`);

            let settings = {};
            if (proofManagerConfig.setup && proofManagerConfig.setup.settings) {
                settings = proofManagerConfig.setup.settings[`${air.name}`]
                    || proofManagerConfig.setup.settings.default
                    || { finalDegree: minFinalDegree };
            }

            if (!settings) {
                log.error(`[${this.name}]`, `No settings for air '${air.name}'${air.numRows ? ` with N=${air.numRows}` : ''}`);
                throw new Error(`[${this.name}] No settings for air '${air.name}'${air.numRows ? ` with N=${air.numRows}` : ''}`);
            }

            const filesDir = path.join(buildDir, "provingKey", airout.name, airgroup.name, "airs", `${air.name}`, "air");
            await fs.promises.mkdir(filesDir, { recursive: true });

            let starkStruct = settings.starkStruct || generateStarkStruct(settings, log2(air.numRows));
            starkStructs.push(starkStruct);

            const fixedPols = generateFixedCols(air.symbols.filter(s => s.airGroupId == airgroup.airgroupId), air.numRows);
            await getFixedPolsPil2(airgroup.name, air, fixedPols, fixedInfo);
            await fixedPols.saveToFile(path.join(filesDir, `${air.name}.const`));

            setup[airgroup.airgroupId][air.airId] = await starkSetup(air, starkStruct, setupOptions);
            await fs.promises.writeFile(path.join(filesDir, `${air.name}.starkinfo.json`), JSON.stringify(setup[airgroup.airgroupId][air.airId].starkInfo, null, 1), "utf8");
            await fs.promises.writeFile(path.join(filesDir, `${air.name}.verifierinfo.json`), JSON.stringify(setup[airgroup.airgroupId][air.airId].verifierInfo, null, 1), "utf8");
            await fs.promises.writeFile(path.join(filesDir, `${air.name}.expressionsinfo.json`), JSON.stringify(setup[airgroup.airgroupId][air.airId].expressionsInfo, null, 1), "utf8");

            console.log("Computing Constant Tree...");
            const { stdout } = await exec(`${setupOptions.constTree} -c ${path.join(filesDir, `${air.name}.const`)} -s ${path.join(filesDir, `${air.name}.starkinfo.json`)} -v ${path.join(filesDir, `${air.name}.verkey.json`)}`);
            console.log(stdout);
            setup[airgroup.airgroupId][air.airId].constRoot = JSONbig.parse(await fs.promises.readFile(path.join(filesDir, `${air.name}.verkey.json`), "utf8"));

            await writeExpressionsBinFile(path.join(filesDir, `${air.name}.bin`), setup[airgroup.airgroupId][air.airId].starkInfo, setup[airgroup.airgroupId][air.airId].expressionsInfo);

            await writeVerifierExpressionsBinFile(path.join(filesDir, `${air.name}.verifier.bin`), setup[airgroup.airgroupId][air.airId].starkInfo, setup[airgroup.airgroupId][air.airId].verifierInfo);
        }));
    }));

    setupOptions.optImPols = false;
    
    let globalInfo;
    let globalConstraints;
    
    if(proofManagerConfig.setup && proofManagerConfig.setup.genAggregationSetup) {
        const airoutInfo = await setAiroutInfo(airout, starkStructs);
        globalConstraints = airoutInfo.globalConstraints;
        globalInfo = airoutInfo.vadcopInfo;
                
        let recursiveSettings =  { blowupFactor: 3 };
        if(proofManagerConfig.setup && proofManagerConfig.setup.settings && proofManagerConfig.setup.settings.recursive) {
        recursiveSettings = proofManagerConfig.setup.settings.recursive;
        }

        let starkStructRecursive = recursiveSettings.starkStruct || generateStarkStruct(recursiveSettings, 17);

        const constRootsRecursives1 = [];
        const starkInfoRecursives1 = [];
        const verifierInfoRecursives1 = [];
        const pilRecursives1 = [];

        for(const airgroup of airout.airGroups) {
        constRootsRecursives1[airgroup.airgroupId] = [];
        starkInfoRecursives1[airgroup.airgroupId] = [];
        verifierInfoRecursives1[airgroup.airgroupId] = [];
        pilRecursives1[airgroup.airgroupId] = [];
    
        for(const air of airgroup.airs) {
        log.info("[Setup Cmd]", `······ Checking if air '${air.name}' needs a compressor`);
                
        const filesDir = path.join(buildDir, "provingKey", airout.name, airgroup.name, "airs", `${air.name}`, "air");

        const compressorNeeded = await isCompressorNeeded(
        setup[airgroup.airgroupId][air.airId].constRoot,
        setup[airgroup.airgroupId][air.airId].starkInfo,
        setup[airgroup.airgroupId][air.airId].verifierInfo,
        path.join(filesDir, `${air.name}.starkinfo.json`),
        );
    
        let constRoot, starkInfo, verifierInfo;
        const starkStructRecursive1 = { ...starkStructRecursive };
    
        if (compressorNeeded.hasCompressor) {
        setup[airgroup.airgroupId][air.airId].hasCompressor = true;
        globalInfo.airs[airgroup.airgroupId][air.airId].hasCompressor = true;
    
        const starkStructSettings = { blowupFactor: 2 };
        const starkStructCompressor = generateStarkStruct(starkStructSettings, compressorNeeded.nBits);
    
        const recursiveSetup = await genRecursiveSetup(
        buildDir, setupOptions, "compressor", airgroup.name, airgroup.airgroupId, air.airId, globalInfo,
        setup[airgroup.airgroupId][air.airId].constRoot, [], setup[airgroup.airgroupId][air.airId].starkInfo,
        setup[airgroup.airgroupId][air.airId].verifierInfo, starkStructCompressor, 18
        );
    
        ({ constRoot, starkInfo, verifierInfo } = recursiveSetup);
        } else {
        constRoot = setup[airgroup.airgroupId][air.airId].constRoot;
        starkInfo = setup[airgroup.airgroupId][air.airId].starkInfo;
        verifierInfo = setup[airgroup.airgroupId][air.airId].verifierInfo;
        starkStructRecursive1.hashCommits = true;
        }
    
        const {
        starkInfo: starkInfoRecursive1,
        constRoot: constRootRecursive1,
        verifierInfo: verifierInfoRecursive1,
        pil: pilRecursive1
        } = await genRecursiveSetup(
        buildDir, setupOptions, "recursive1", airgroup.name, airgroup.airgroupId, air.airId, globalInfo,
        constRoot, [], starkInfo, verifierInfo, starkStructRecursive, 18,
        setup[airgroup.airgroupId][air.airId].hasCompressor
        );
    
        constRootsRecursives1[airgroup.airgroupId][air.airId] = constRootRecursive1;
        starkInfoRecursives1[airgroup.airgroupId][air.airId] = starkInfoRecursive1;
        verifierInfoRecursives1[airgroup.airgroupId][air.airId] = verifierInfoRecursive1;
        pilRecursives1[airgroup.airgroupId][air.airId] = pilRecursive1;
        };
        };

        for(const airgroup of airout.airGroups) {
        const hashPilRecursive1 = crypto.createHash("sha256")
        .update(JSON.stringify(pilRecursives1[airgroup.airgroupId][0]))
        .digest("hex");
    
        for (let i = 1; i < airgroup.airs.length; i++) {
        const hash = crypto.createHash("sha256")
        .update(JSON.stringify(pilRecursives1[airgroup.airgroupId][i]))
        .digest("hex");
    
        if (hashPilRecursive1 !== hash) {
        throw new Error("All recursive1 pil must be the same");
        }
            }
    
        const { pil: pilRecursive2 } = await genRecursiveSetup(
        buildDir, setupOptions, "recursive2", airgroup.name, airgroup.airgroupId,
        undefined, globalInfo, [], constRootsRecursives1[airgroup.airgroupId],
        starkInfoRecursives1[airgroup.airgroupId][0], verifierInfoRecursives1[airgroup.airgroupId][0],
        starkStructRecursive, 18
        );
    
        const hashPilRecursive2 = crypto.createHash("sha256")
        .update(JSON.stringify(pilRecursive2))
        .digest("hex");
    
        if (hashPilRecursive1 !== hashPilRecursive2) {
        throw new Error("Recursive1 and recursive2 pil must be the same");
        }
        };
  
        let finalSettings = { blowupFactor: 3};
        if(proofManagerConfig.setup && proofManagerConfig.setup.settings && proofManagerConfig.setup.settings.final) {
            finalSettings = proofManagerConfig.setup.settings.final;
        }

        const {starkInfoFinal,
            constRootFinal,
            verifierInfoFinal,
        } = await genFinalSetup(buildDir, setupOptions, finalSettings, globalInfo, globalConstraints, 18);
        
        if(proofManagerConfig.setup.genFinalSnarkSetup) {
            await genFinalSnarkSetup(
                buildDir, setupOptions, globalInfo, constRootFinal, [],
                starkInfoFinal, verifierInfoFinal,
                12,
            );
        }
        
    } else {
        const airoutInfo = await setAiroutInfo(airout, starkStructs);
        globalInfo = airoutInfo.vadcopInfo;
        globalConstraints = airoutInfo.globalConstraints;
    }

    await fs.promises.writeFile(`${buildDir}/provingKey/pilout.globalInfo.json`, JSON.stringify(globalInfo, null, 1), "utf8");
    await fs.promises.writeFile(`${buildDir}/provingKey/pilout.globalConstraints.json`, JSON.stringify(globalConstraints, null, 1), "utf8");
    await writeGlobalConstraintsBinFile(globalInfo, globalConstraints, `${buildDir}/provingKey/pilout.globalConstraints.bin`);

    return { setup, airoutInfo: {...globalInfo, globalConstraints}, config: proofManagerConfig };
}