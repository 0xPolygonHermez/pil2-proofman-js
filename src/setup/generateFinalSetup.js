const util = require('util');
const exec = util.promisify(require('child_process').exec);
const JSONbig = require('json-bigint')({ useNativeBigInt: true, alwaysParseAsBig: true });
const fs = require('fs');
const { compile } = require('pilcom');

const { compressorSetup } = require('stark-recurser/src/circom2pil/compressor_setup.js');
const { genCircom } = require('stark-recurser/src/gencircom.js');
const { generateStarkStruct } = require("./utils");
const path = require("path");
const { runWitnessLibraryGeneration, witnessLibraryGenerationAwait } = require("./generateWitness");

const F3g = require("../pil2-stark/utils/f3g.js");
const {starkSetup} = require("../pil2-stark/stark_setup");
const { writeExpressionsBinFile, writeVerifierExpressionsBinFile } = require("../pil2-stark/chelpers/binFile.js");
const { AirOut } = require('../airout.js');

module.exports.genFinalSetup = async function genFinalSetup(buildDir, setupOptions, finalSettings, globalInfo, globalConstraints, compressorCols) {
    const F = new F3g();

    const starkInfos = [];
    const verifierInfos = [];
    const aggregatedKeysRecursive2 = [];
    const basicKeysRecursive1 = [];
    const verifierNames = [];

    const nameFilename = "vadcop_final";
    const finalFilename = `${buildDir}/circom/${nameFilename}.circom`;

    for(let i = 0; i < globalInfo.aggTypes.length; i++) {
        const starkInfo = JSON.parse(await fs.promises.readFile(`${buildDir}/provingKey/${globalInfo.name}/${globalInfo.air_groups[i]}/recursive2/recursive2.starkinfo.json`, "utf8"));
        const verifierInfo = JSON.parse(await fs.promises.readFile(`${buildDir}/provingKey/${globalInfo.name}/${globalInfo.air_groups[i]}/recursive2/recursive2.verifierinfo.json`, "utf8"));
        const verificationKeys = JSONbig.parse(await fs.promises.readFile(`${buildDir}/provingKey/${globalInfo.name}/${globalInfo.air_groups[i]}/recursive2/recursive2.vks.json`, "utf8"));

        starkInfos.push(starkInfo);
        verifierInfos.push(verifierInfo);
        aggregatedKeysRecursive2.push(verificationKeys.rootCRecursive2);
        basicKeysRecursive1.push(verificationKeys.rootCRecursives1);
        verifierNames.push( `${globalInfo.air_groups[i]}_recursive2.verifier.circom`);
    }
        
    const filesDir = `${buildDir}/provingKey/${globalInfo.name}/${nameFilename}`;
    await fs.promises.mkdir(filesDir, { recursive: true });

    let templateFilename = path.resolve(__dirname, "../..", `node_modules/stark-recurser/src/vadcop/templates/final.circom.ejs`);

    // Generate final circom
    const finalVerifier = await genCircom(templateFilename, starkInfos, {...globalInfo, globalConstraints: globalConstraints.constraints }, verifierNames, basicKeysRecursive1, aggregatedKeysRecursive2);
    await fs.promises.writeFile(finalFilename, finalVerifier, "utf8");


    const circuitsGLPath = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/pil2circom/circuits.gl');
    const starkRecurserCircuits = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/vadcop/helpers/circuits');

    // Compile circom
    console.log("Compiling " + finalFilename + "...");
    const circomExecFile = path.resolve(__dirname, 'circom/circom');
    const compileFinalCommand = `${circomExecFile} --O1 --r1cs --prime goldilocks --c --verbose -l ${starkRecurserCircuits} -l ${circuitsGLPath} ${finalFilename} -o ${buildDir}/build`;
    const execCompile = await exec(compileFinalCommand);
    console.log(execCompile.stdout);
    
    console.log("Copying circom files...");
    fs.copyFile(`${buildDir}/build/${nameFilename}_cpp/${nameFilename}.dat`, `${buildDir}/provingKey/${globalInfo.name}/${nameFilename}/${nameFilename}.dat`, (err) => { if(err) throw err; });
    
    runWitnessLibraryGeneration(buildDir, filesDir, nameFilename, nameFilename);

    if(!setupOptions.powersOfTauFile) {
        await witnessLibraryGenerationAwait();
    }

    // Generate setup
    const finalR1csFile = `${buildDir}/build/${nameFilename}.r1cs`;
    const {exec: execBuff, pilStr, constPols, pilout, nBits } = await compressorSetup(F, finalR1csFile, compressorCols, true);

    const fd =await fs.promises.open(`${filesDir}/${nameFilename}.exec`, "w+");
    await fd.write(execBuff);
    await fd.close();

    const pilFilename = `${buildDir}/pil/${nameFilename}.pil`
    await fs.promises.writeFile(pilFilename, pilStr, "utf8");

    if(finalSettings.starkStruct && finalSettings.starkStruct.nBits !== nBits) {
        throw new Error("Final starkStruct nBits does not match with vadcop final circuit size");
    };

    let starkStructFinal = finalSettings.starkStruct || generateStarkStruct(finalSettings, nBits);
    
    // Build stark info
    const airout = new AirOut(pilout, false);
    let air = airout.airGroups[0].airs[0];
    const setup = await starkSetup(air, starkStructFinal, {...setupOptions, F, pil2: true, airgroupId: 0, airId: 0});

    await constPols.saveToFile(`${filesDir}/${nameFilename}.const`);


    await fs.promises.writeFile(`${filesDir}/${nameFilename}.starkinfo.json`, JSON.stringify(setup.starkInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/${nameFilename}.expressionsinfo.json`, JSON.stringify(setup.expressionsInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/${nameFilename}.verifierinfo.json`, JSON.stringify(setup.verifierInfo, null, 1), "utf8");
    
    console.log("Computing Constant Tree...");
    const {stdout} = await exec(`${setupOptions.constTree} -c ${filesDir}/${nameFilename}.const -s ${filesDir}/${nameFilename}.starkinfo.json -v ${filesDir}/${nameFilename}.verkey.json`);
    setup.constRoot = JSONbig.parse(await fs.promises.readFile(`${filesDir}/${nameFilename}.verkey.json`, "utf8"));
    
    await writeExpressionsBinFile(`${filesDir}/${nameFilename}.bin`, setup.starkInfo, setup.expressionsInfo);

    await writeVerifierExpressionsBinFile(`${filesDir}/${nameFilename}.verifier.bin`, setup.starkInfo, setup.verifierInfo);

    return {starkInfoFinal: setup.starkInfo, verifierInfoFinal: setup.verifierInfo, constRootFinal: setup.constRoot, nBitsFinal: nBits};
}