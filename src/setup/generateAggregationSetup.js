const util = require('util');
const exec = util.promisify(require('child_process').exec);
const JSONbig = require('json-bigint')({ useNativeBigInt: true, alwaysParseAsBig: true });
const fs = require('fs');
const ffjavascript = require("ffjavascript");

const { plonk2pil } = require('stark-recurser/src/circom2pil/plonk2pil.js');
const { genCircom } = require('stark-recurser/src/gencircom.js');
const pil2circom = require('stark-recurser/src/pil2circom/pil2circom.js');
const path = require("path");
const {starkSetup} = require("../pil2-stark/stark_setup.js");
const { generateStarkStruct } = require('./utils.js');
const { witnessLibraryGenerationAwait, runWitnessLibraryGeneration } = require('./generateWitness.js');
const { AirOut } = require('../airout.js');
const compilePil2 = require("pil2-compiler/src/compiler.js");
const { generateFixedCols } = require('../pil2-stark/witness_computation/witness_calculator.js');
const { writeFixedPolsBin, readFixedPolsBin } = require('../pil2-stark/witness_computation/fixed_cols.js');


module.exports.getAggregationSetup = async function getAggregationSetup(buildDir, setupOptions, constRoot, starkInfo, verifierInfo, publicsInfo) {
    let template = "aggregation";
    let verifierName = "vadcop_final.verifier.circom";
    let templateFilename = path.resolve(__dirname,"../../", `node_modules/stark-recurser/src/recursion/templates/aggregator.circom.ejs`);
    let filesDir = `${buildDir}/aggregator`;
    
    await fs.promises.mkdir(filesDir, { recursive: true });
    await fs.promises.mkdir(`${buildDir}/circom`, { recursive: true });
    await fs.promises.mkdir(`${buildDir}/build`, { recursive: true });
    await fs.promises.mkdir(`${buildDir}/pil`, { recursive: true });

    const options = { skipMain: true, verkeyInput: true };
        
    //Generate circom
    const verifierCircomTemplate = await pil2circom(constRoot, starkInfo, verifierInfo, options);
    await fs.promises.writeFile(`${buildDir}/circom/${verifierName}`, verifierCircomTemplate, "utf8");

    const recursiveVerifier = await genCircom(templateFilename, [starkInfo], undefined, [verifierName], [constRoot], [], [publicsInfo], options);
    await fs.promises.writeFile(`${buildDir}/circom/${template}.circom`, recursiveVerifier, "utf8");
 
    const circuitsGLPath = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/pil2circom/circuits.gl');
    const starkRecurserCircuits = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/recursion/helpers/circuits');
 
    // Compile circom
    console.log("Compiling " + template + "...");
    const circomExecutable = process.platform === 'darwin' ? 'circom/circom_mac' : 'circom/circom';
    const circomExecFile = path.resolve(__dirname, circomExecutable);
    const compileRecursiveCommand = `${circomExecFile} --O1 --r1cs --prime goldilocks --c --verbose -l ${starkRecurserCircuits} -l ${circuitsGLPath} ${buildDir}/circom/${template}.circom -o ${buildDir}/build`;
    await exec(compileRecursiveCommand);
 
    console.log("Copying circom files...");
    fs.copyFile(`${buildDir}/build/${template}_cpp/${template}.dat`, `${filesDir}/${template}.dat`, (err) => { if(err) throw err; });
     
    // Generate witness library
    runWitnessLibraryGeneration(buildDir, filesDir, template, template);
 
    // Generate setup
    const {exec: execBuff, pilStr, nBits, fixedPols, airgroupName, airName } = await plonk2pil(`${buildDir}/build/${template}.r1cs`, "final_vadcop");
    
    await writeFixedPolsBin(`${buildDir}/build/${template}.fixed.bin`, airgroupName, airName, 1 << nBits, fixedPols);

    const pilFilename = `${buildDir}/pil/${template}.pil`;
    await fs.promises.writeFile(pilFilename, pilStr, "utf8");
    
    let pilFile = `${buildDir}/build/${template}.pilout`;
    let pilConfig = { outputFile: pilFile, includePaths: [setupOptions.stdPath, path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/circom2pil/pil')] };
    const F = new ffjavascript.F1Field((1n<<64n)-(1n<<32n)+1n );
    compilePil2(F, pilFilename, null, pilConfig);

    const fd =await fs.promises.open(`${filesDir}/${template}.exec`, "w+");
    await fd.write(execBuff);
    await fd.close();

    const starkStructSettings = { name: "aggregator", blowupFactor: 5, foldingFactor: 4, powBits: 22, lastLevelVerification: 2 };;
    const starkStructVadcopFinalCompressed = generateStarkStruct(starkStructSettings, nBits);

    const airout = new AirOut(pilFile);
    let air = airout.airGroups[0].airs[0];

    let fixedInfo = {};
    await readFixedPolsBin(fixedInfo, `${buildDir}/build/${template}.fixed.bin`);
    const fixedCols = generateFixedCols(air.symbols.filter(s => s.airGroupId == 0), air.numRows);

    await fixedCols.saveToFile(`${filesDir}/${template}.const`);
    
    const setupAggregator = await starkSetup(air, starkStructVadcopFinalCompressed, {...setupOptions, airgroupId: 0, airId: 0});

    await fs.promises.writeFile(`${filesDir}/${template}.starkinfo.json`, JSON.stringify(setupAggregator.starkInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/${template}.verifierinfo.json`, JSON.stringify(setupAggregator.verifierInfo, null, 1), "utf8");
    await fs.promises.writeFile(`${filesDir}/${template}.expressionsinfo.json`, JSON.stringify(setupAggregator.expressionsInfo, null, 1), "utf8");

    console.log("Computing Constant Tree...");
    await exec(`${setupOptions.constTree} -c ${filesDir}/${template}.const -s ${filesDir}/${template}.starkinfo.json -v ${filesDir}/${template}.verkey.json`);
    setupAggregator.constRoot = JSONbig.parse(await fs.promises.readFile(`${filesDir}/${template}.verkey.json`, "utf8"));
    
    const constRootBuffer = Buffer.alloc(32);
    for (let i = 0; i < 4; i++) {
        constRootBuffer.writeBigUInt64LE(setupAggregator.constRoot[i], i * 8);
    }
    await fs.promises.writeFile(`${filesDir}/${template}.verkey.bin`, constRootBuffer);

    const { stdout: stdout2 } = await exec(`${setupOptions.binFile} -s ${filesDir}/${template}.starkinfo.json -e ${filesDir}/${template}.expressionsinfo.json -b ${filesDir}/${template}.bin`);
    console.log(stdout2);

    const { stdout: stdout3 } = await exec(`${setupOptions.binFile} -s ${filesDir}/${template}.starkinfo.json -e ${filesDir}/${template}.verifierinfo.json -b ${filesDir}/${template}.verifier.bin --verifier`);
    console.log(stdout3);

    await witnessLibraryGenerationAwait();

    return;
}