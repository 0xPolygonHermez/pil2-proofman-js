
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const JSONbig = require('json-bigint')({ useNativeBigInt: true, alwaysParseAsBig: true });
const fs = require('fs');
const pil2circom = require('stark-recurser/src/pil2circom/pil2circom.js');
const {compressorSetup} = require('stark-recurser/src/circom2pil/compressor_setup');
const {genCircom} = require('stark-recurser/src/gencircom.js');
const ffjavascript = require("ffjavascript");

const path = require('path');
const { runWitnessLibraryGeneration, witnessLibraryGenerationAwait } = require('./generateWitness');
const { writeExpressionsBinFile, writeVerifierExpressionsBinFile } = require("../pil2-stark/chelpers/binFile.js");
const { starkSetup } = require('../pil2-stark/stark_setup');
const { AirOut } = require('../airout.js');
const { writeGlobalConstraintsBinFile } = require('../pil2-stark/chelpers/globalConstraintsBinFile.js');
const { setAiroutInfo } = require('./utils.js');
const compilePil2 = require("pil2-compiler/src/compiler.js");
const { generateFixedCols } = require('../pil2-stark/witness_computation/witness_calculator.js');
const { getFixedPolsPil2 } = require('../pil2-stark/pil_info/piloutInfo.js');
const { writeFixedPolsBin, readFixedPolsBin } = require('../pil2-stark/witness_computation/fixed_cols.js');

module.exports.genRecursiveSetup = async function genRecursiveSetup(buildDir, setupOptions, template, airGroupName, airgroupId, airId, globalInfo, constRoot, verificationKeys = [], starkInfo, verifierInfo, starkStruct, compressorCols, hasCompressor) {

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
        filesDir = `${buildDir}/provingKey/${globalInfo.name}/${airGroupName}/airs/${airName}/${template}`;
    } else if(template === "recursive1") {
        let airName = globalInfo.airs[airgroupId][airId].name;
        verifierName = `${airName}_compressor.verifier.circom`;
        nameFilename = `${airName}_${template}`;
        templateFilename = path.resolve(__dirname,"../../", `node_modules/stark-recurser/src/vadcop/templates/recursive1.circom.ejs`);
        filesDir = `${buildDir}/provingKey/${globalInfo.name}/${airGroupName}/airs/${airName}/recursive1/`;
    } else if (template === "recursive2") {
        verifierName = `${airGroupName}_recursive2.verifier.circom`;
        nameFilename = `${airGroupName}_${template}`;
        templateFilename =  path.resolve(__dirname,"../../", `node_modules/stark-recurser/src/vadcop/templates/recursive2.circom.ejs`);
        filesDir = `${buildDir}/provingKey/${globalInfo.name}/${airGroupName}/${template}`;
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

    let recurserOptions = {};
    if (template === "compressor") {
        recurserOptions.maxConstraintDegree = 5;
    }

    // Generate setup
    const {exec: execBuff, pilStr, fixedPols, airgroupName, airName, nBits } = await compressorSetup(`${buildDir}/build/${nameFilename}.r1cs`, compressorCols, recurserOptions);

    await writeFixedPolsBin(`${buildDir}/build/${nameFilename}.fixed.bin`, airgroupName, airName, 1 << nBits, fixedPols);

    await fs.promises.writeFile(`${buildDir}/pil/${nameFilename}.pil`, pilStr, "utf8");

    let pilFile = `${buildDir}/build/${nameFilename}.pilout`;
    let pilConfig = { outputFile: pilFile, includePaths: [setupOptions.stdPath] };
    const F = new ffjavascript.F1Field((1n<<64n)-(1n<<32n)+1n );
    compilePil2(F, `${buildDir}/pil/${nameFilename}.pil`, null, pilConfig);

    const fd =await fs.promises.open(`${filesDir}/${template}.exec`, "w+");
    await fd.write(execBuff);
    await fd.close();


    const airout = new AirOut(pilFile);
    let air = airout.airGroups[0].airs[0];

    let fixedInfo = {};
    await readFixedPolsBin(fixedInfo, `${buildDir}/build/${nameFilename}.fixed.bin`);
    const fixedCols = generateFixedCols(air.symbols.filter(s => s.airGroupId == 0), air.numRows);
    await getFixedPolsPil2(airout.airGroups[0].name, air, fixedCols, fixedInfo);

    await fixedCols.saveToFile(`${filesDir}/${template}.const`);

    const setup = await starkSetup(air, starkStruct, {...setupOptions, airgroupId, airId});

    await fs.promises.writeFile(`${filesDir}/${template}.starkinfo.json`, JSON.stringify(setup.starkInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/${template}.verifierinfo.json`, JSON.stringify(setup.verifierInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/${template}.expressionsinfo.json`, JSON.stringify(setup.expressionsInfo, null, 1), "utf8");

    console.log("Computing Constant Tree...");
    await exec(`${setupOptions.constTree} -c ${filesDir}/${template}.const -s ${filesDir}/${template}.starkinfo.json -v ${filesDir}/${template}.verkey.json`);
    setup.constRoot = JSONbig.parse(await fs.promises.readFile(`${filesDir}/${template}.verkey.json`, "utf8"));
   
    // await writeExpressionsBinFile(`${filesDir}/${template}.bin`, setup.starkInfo, setup.expressionsInfo);
    const { stdout: stdout2 } = await exec(`${setupOptions.binFile} -s ${filesDir}/${template}.starkinfo.json -e ${filesDir}/${template}.expressionsinfo.json -b ${filesDir}/${template}.bin`);
    console.log(stdout2);

    // await writeVerifierExpressionsBinFile(`${filesDir}/${template}.verifier.bin`, setup.starkInfo, setup.verifierInfo);
    const { stdout: stdout3 } = await exec(`${setupOptions.binFile} -s ${filesDir}/${template}.starkinfo.json -e ${filesDir}/${template}.verifierinfo.json -b ${filesDir}/${template}.verifier.bin --verifier`);
    console.log(stdout3);
    

    if(template === "recursive2") {
        const vks = {
            rootCRecursives1: verificationKeys,
            rootCRecursive2: setup.constRoot,
        }
        await fs.promises.writeFile(`${filesDir}/${template}.vks.json`, JSONbig.stringify(vks, 0, 1), "utf8");
    }

    return { constRoot: setup.constRoot, starkInfo: setup.starkInfo, verifierInfo: setup.verifierInfo, pil: pilStr }

}

module.exports.genRecursiveSetupTest = async function genRecursiveSetupTest(buildDir, setupOptions, starkStruct, circomPath, circomName, compressorCols) {

    const filesDir = path.join(buildDir, "provingKey", "build", "RecursiveC36", "airs", `RecursiveC36`, "air");

    await fs.promises.mkdir(`${buildDir}/circom/`, { recursive: true });
    await fs.promises.mkdir(`${buildDir}/build/`, { recursive: true });
    await fs.promises.mkdir(`${buildDir}/pil/`, { recursive: true });
    await fs.promises.mkdir(filesDir, { recursive: true });

    const circuitsGLPath = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/pil2circom/circuits.gl');
    const starkRecurserCircuits = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/vadcop/helpers/circuits');

    // Compile circom
    console.log("Compiling " + circomName + "...");
    const circomExecFile = path.resolve(__dirname, 'circom/circom');
    const compileRecursiveCommand = `${circomExecFile} --O1 --r1cs --prime goldilocks --c --verbose -l ${starkRecurserCircuits} -l ${circuitsGLPath} ${circomPath} -o ${buildDir}/build`;
    await exec(compileRecursiveCommand);

    console.log("Copying circom files...");
    fs.copyFile(`${buildDir}/build/${circomName}_cpp/${circomName}.dat`, `${filesDir}/RecursiveC36.dat`, (err) => { if(err) throw err; });
    
    // Generate witness library
    runWitnessLibraryGeneration(buildDir, filesDir, circomName, "RecursiveC36");

    // Generate setup
    let recurserOptions = { };
    const {exec: execBuff, pilStr, fixedPols, airgroupName, airName, nBits } = await compressorSetup(`${buildDir}/build/${circomName}.r1cs`, compressorCols, recurserOptions);

    await writeFixedPolsBin(`${buildDir}/build/RecursiveC36.bin`, airgroupName, airName, 1 << nBits, fixedPols);

    await fs.promises.writeFile(`${buildDir}/pil/RecursiveC36.pil`, pilStr, "utf8");
    
    let pilFile = `${buildDir}/build/RecursiveC36.pilout`;
    let pilConfig = { outputFile: pilFile, includePaths: [setupOptions.stdPath] };
    const F = new ffjavascript.F1Field((1n<<64n)-(1n<<32n)+1n );
    compilePil2(F, `${buildDir}/pil/RecursiveC36.pil`, null, pilConfig);

    const fd =await fs.promises.open(`${filesDir}/RecursiveC36.exec`, "w+");
    await fd.write(execBuff);
    await fd.close();


    const airout = new AirOut(pilFile);
    let air = airout.airGroups[0].airs[0];

    let fixedInfo = {};
    await readFixedPolsBin(fixedInfo, `${buildDir}/build/RecursiveC36.bin`);
    const fixedCols = generateFixedCols(air.symbols.filter(s => s.airGroupId == 0), air.numRows);
    await getFixedPolsPil2(airout.airGroups[0].name, air, fixedCols, fixedInfo);

    airout.name = "build";
    airout.airGroups[0].name = "RecursiveC36";
    air.name = "RecursiveC36";

    await fixedCols.saveToFile(`${filesDir}/RecursiveC36.const`);

    const setup = await starkSetup(air, starkStruct, {...setupOptions, airgroupId:0, airId:0});

    await fs.promises.writeFile(`${filesDir}/RecursiveC36.starkinfo.json`, JSON.stringify(setup.starkInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/RecursiveC36.verifierinfo.json`, JSON.stringify(setup.verifierInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/RecursiveC36.expressionsinfo.json`, JSON.stringify(setup.expressionsInfo, null, 1), "utf8");

    console.log("Computing Constant Tree...");
    await exec(`${setupOptions.constTree} -c ${filesDir}/RecursiveC36.const -s ${filesDir}/RecursiveC36.starkinfo.json -v ${filesDir}/RecursiveC36.verkey.json`);
    setup.constRoot = JSONbig.parse(await fs.promises.readFile(`${filesDir}/RecursiveC36.verkey.json`, "utf8"));

    await writeExpressionsBinFile(`${filesDir}/RecursiveC36.bin`, setup.starkInfo, setup.expressionsInfo);
    await writeVerifierExpressionsBinFile(`${filesDir}/RecursiveC36.verifier.bin`, setup.starkInfo, setup.verifierInfo);

    let globalInfo;
    let globalConstraints;

    const airoutInfo = await setAiroutInfo(airout);
    globalInfo = airoutInfo.vadcopInfo;
    globalConstraints = airoutInfo.globalConstraints;

    await fs.promises.writeFile(`${buildDir}/provingKey/pilout.globalInfo.json`, JSON.stringify(globalInfo, null, 1), "utf8");
    await fs.promises.writeFile(`${buildDir}/provingKey/pilout.globalConstraints.json`, JSON.stringify(globalConstraints, null, 1), "utf8");
    await writeGlobalConstraintsBinFile(globalInfo, globalConstraints, `${buildDir}/provingKey/pilout.globalConstraints.bin`);

    await witnessLibraryGenerationAwait();
}