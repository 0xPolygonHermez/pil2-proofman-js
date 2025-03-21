
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const JSONbig = require('json-bigint')({ useNativeBigInt: true, alwaysParseAsBig: true });
const fs = require('fs');
const { compile } = require('pilcom');
const pil2circom = require('stark-recurser/src/pil2circom/pil2circom.js');
const {compressorSetup} = require('stark-recurser/src/circom2pil/compressor_setup');
const {genCircom} = require('stark-recurser/src/gencircom.js');
const { genNullProof } = require('stark-recurser/src/pil2circom/proof2zkin');

const path = require('path');
const { runWitnessLibraryGeneration } = require('./generateWitness');
const F3g = require('../pil2-stark/utils/f3g.js');
const { writeExpressionsBinFile, writeVerifierExpressionsBinFile } = require("../pil2-stark/chelpers/binFile.js");
const { starkSetup } = require('../pil2-stark/stark_setup');

module.exports.genRecursiveSetup = async function genRecursiveSetup(buildDir, setupOptions, template, airgroupName, airgroupId, airId, globalInfo, constRoot, verificationKeys = [], starkInfo, verifierInfo, starkStruct, compressorCols, hasCompressor) {

    const F = new F3g();

    let inputChallenges = false;
    let verkeyInput = false;
    let enableInput = false;
    let verifierName;
    let templateFilename;
    let nameFilename;
    let filesDir;
    let constRootCircuit = constRoot || [];
    if((template === "recursive1" && !hasCompressor) || template === "compressor") {
        let airName = globalInfo.airs[airgroupId][airId].name;
        inputChallenges = true;
        verifierName = `${airName}.verifier.circom`;
        nameFilename = `${airName}_${template}`;    
        templateFilename = path.resolve(__dirname,"../../", `node_modules/stark-recurser/src/vadcop/templates/${template}.circom.ejs`);
        filesDir = `${buildDir}/provingKey/${globalInfo.name}/${airgroupName}/airs/${airName}/${template}`;
    } else if(template === "recursive1") {
        let airName = globalInfo.airs[airgroupId][airId].name;
        verifierName = `${airName}_compressor.verifier.circom`;
        nameFilename = `${airName}_${template}`;
        templateFilename = path.resolve(__dirname,"../../", `node_modules/stark-recurser/src/vadcop/templates/recursive1.circom.ejs`);
        filesDir = `${buildDir}/provingKey/${globalInfo.name}/${airgroupName}/airs/${airName}/recursive1/`;
    } else if (template === "recursive2") {
        verifierName = `${airgroupName}_recursive2.verifier.circom`;
        nameFilename = `${airgroupName}_${template}`;
        templateFilename =  path.resolve(__dirname,"../../", `node_modules/stark-recurser/src/vadcop/templates/recursive2.circom.ejs`);
        filesDir = `${buildDir}/provingKey/${globalInfo.name}/${airgroupName}/${template}`;
        enableInput = (globalInfo.air_groups.length > 1 || globalInfo.airs[0].length > 1)  ? true : false;
        verkeyInput = true;
    } else {
        throw new Error("Unknown template" + template);
    }

    const options = { skipMain: true, verkeyInput, enableInput, inputChallenges, airgroupId, hasCompressor }
        
    await fs.promises.mkdir(`${buildDir}/circom/`, { recursive: true });
    await fs.promises.mkdir(`${buildDir}/build/`, { recursive: true });
    await fs.promises.mkdir(`${buildDir}/pil/`, { recursive: true });
    await fs.promises.mkdir(filesDir, { recursive: true });

    //Generate circom
    const verifierCircomTemplate = await pil2circom(constRootCircuit, starkInfo, verifierInfo, options);
    await fs.promises.writeFile(`${buildDir}/circom/${verifierName}`, verifierCircomTemplate, "utf8");

    const recursiveVerifier = await genCircom(templateFilename, [starkInfo], globalInfo, [verifierName], verificationKeys, [], [], options);
    await fs.promises.writeFile(`${buildDir}/circom/${nameFilename}.circom`, recursiveVerifier, "utf8");

    const circuitsGLPath = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/pil2circom/circuits.gl');
    const starkRecurserCircuits = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/vadcop/helpers/circuits');

    // Compile circom
    console.log("Compiling " + nameFilename + "...");
    const circomExecFile = path.resolve(__dirname, 'circom/circom');
    const compileRecursiveCommand = `${circomExecFile} --O1 --r1cs --prime goldilocks --c --verbose -l ${starkRecurserCircuits} -l ${circuitsGLPath} ${buildDir}/circom/${nameFilename}.circom -o ${buildDir}/build`;
    await exec(compileRecursiveCommand);

    console.log("Copying circom files...");
    fs.copyFile(`${buildDir}/build/${nameFilename}_cpp/${nameFilename}.dat`, `${filesDir}/${template}.dat`, (err) => { if(err) throw err; });
    
    // Generate witness library
    runWitnessLibraryGeneration(buildDir, filesDir, nameFilename, template);

    // Generate setup
    const {exec: execBuff, pilStr, constPols} = await compressorSetup(F, `${buildDir}/build/${nameFilename}.r1cs`, compressorCols);

    await constPols.saveToFile(`${filesDir}/${template}.const`);

    const fd =await fs.promises.open(`${filesDir}/${template}.exec`, "w+");
    await fd.write(execBuff);
    await fd.close();

    await fs.promises.writeFile(`${buildDir}/pil/${nameFilename}.pil`, pilStr, "utf8");

    // Build stark info
    const pilRecursive = await compile(F, `${buildDir}/pil/${nameFilename}.pil`);

    const setup = await starkSetup(pilRecursive, starkStruct, {...setupOptions, F, pil2: false, airgroupId, airId, recursion: true});

    await fs.promises.writeFile(`${filesDir}/${template}.starkinfo.json`, JSON.stringify(setup.starkInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/${template}.verifierinfo.json`, JSON.stringify(setup.verifierInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/${template}.expressionsinfo.json`, JSON.stringify(setup.expressionsInfo, null, 1), "utf8");

    console.log("Computing Constant Tree...");
    // await exec(`${setupOptions.constTree} -c ${filesDir}/${template}.const -s ${filesDir}/${template}.starkinfo.json -t ${filesDir}/${template}.consttree -v ${filesDir}/${template}.verkey.json`);
    await exec(`${setupOptions.constTree} -c ${filesDir}/${template}.const -s ${filesDir}/${template}.starkinfo.json -v ${filesDir}/${template}.verkey.json`);
    setup.constRoot = JSONbig.parse(await fs.promises.readFile(`${filesDir}/${template}.verkey.json`, "utf8"));
   
    await writeExpressionsBinFile(`${filesDir}/${template}.bin`, setup.starkInfo, setup.expressionsInfo);
    await writeVerifierExpressionsBinFile(`${filesDir}/${template}.verifier.bin`, setup.starkInfo, setup.verifierInfo);
    

    if(template === "recursive2") {
        const vks = {
            rootCRecursives1: verificationKeys,
            rootCRecursive2: setup.constRoot,
        }
        await fs.promises.writeFile(`${filesDir}/${template}.vks.json`, JSONbig.stringify(vks, 0, 1), "utf8");
    }

    return { constRoot: setup.constRoot, starkInfo: setup.starkInfo, verifierInfo: setup.verifierInfo, pil: pilStr }

}