const util = require('util');
const exec = util.promisify(require('child_process').exec);
const JSONbig = require('json-bigint')({ useNativeBigInt: true, alwaysParseAsBig: true });
const fs = require('fs');
const { compile } = require('pilcom');

const { compressorSetup } = require('stark-recurser/src/circom2pil/compressor_setup.js');
const { genCircom } = require('stark-recurser/src/gencircom.js');
const pil2circom = require('stark-recurser/src/pil2circom/pil2circom.js');
const path = require("path");
const snarkjs = require("snarkjs");

const F3g = require("../pil2-stark/utils/f3g.js");
const {starkSetup} = require("../pil2-stark/stark_setup.js");
const { writeExpressionsBinFile, writeVerifierExpressionsBinFile } = require("../pil2-stark/chelpers/binFile.js");
const { generateStarkStruct } = require('./utils.js');
const { runFinalSnarkWitnessLibraryGenerationAwait, witnessLibraryGenerationAwait, runWitnessLibraryGeneration } = require('./generateWitness.js');

module.exports.genFinalSnarkSetup = async function genFinalSnarkSetup(buildDir, setupOptions, globalInfo, constRoot, verificationKeys = [], starkInfo, verifierInfo, compressorCols) {
    const F = new F3g();

    let template = "recursivef";
    let verifierName = "vadcop_final.verifier.circom";
    let templateFilename = path.resolve(__dirname,"../../", `node_modules/stark-recurser/src/recursion/templates/recursivef.circom.ejs`);
    let filesDir = `${buildDir}/provingKey/${globalInfo.name}/${template}`;
    
    await fs.promises.mkdir(filesDir, { recursive: true });

    const options = { skipMain: true, verkeyInput: false, enableInput: false, hasRecursion: false }
        
    //Generate circom
    const verifierCircomTemplate = await pil2circom(constRoot, starkInfo, verifierInfo, options);
    await fs.promises.writeFile(`${buildDir}/circom/${verifierName}`, verifierCircomTemplate, "utf8");

    const recursiveVerifier = await genCircom(templateFilename, [starkInfo], globalInfo, [verifierName], verificationKeys, [], [], options);
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
    await runWitnessLibraryGeneration(buildDir, filesDir, template, template);
 
    // Generate setup
    const {exec: execBuff, pilStr, constPols, nBits} = await compressorSetup(F, `${buildDir}/build/${template}.r1cs`, compressorCols);
 
    await constPols.saveToFile(`${filesDir}/${template}.const`);

    const fd =await fs.promises.open(`${filesDir}/${template}.exec`, "w+");
    await fd.write(execBuff);
    await fd.close();

    await fs.promises.writeFile(`${buildDir}/pil/${template}.pil`, pilStr, "utf8");

    // Build stark info
    const pilRecursive = await compile(F, `${buildDir}/pil/${template}.pil`);

    const starkStructSettings = { blowupFactor: 4, verificationHashType: "BN128", merkleTreeArity: 4, merkleTreeCustom: false };
    const starkStructRecursiveF = generateStarkStruct(starkStructSettings, nBits);

    const setupRecursiveF = await starkSetup(pilRecursive, starkStructRecursiveF, {...setupOptions, F, pil2: false, recursion: true});

    await fs.promises.writeFile(`${filesDir}/${template}.starkinfo.json`, JSON.stringify(setupRecursiveF.starkInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/${template}.verifierinfo.json`, JSON.stringify(setupRecursiveF.verifierInfo, null, 1), "utf8");

    await fs.promises.writeFile(`${filesDir}/${template}.expressionsinfo.json`, JSON.stringify(setupRecursiveF.expressionsInfo, null, 1), "utf8");

    console.log("Computing Constant Tree...");
    await exec(`${setupOptions.constTree} -c ${filesDir}/${template}.const -s ${filesDir}/${template}.starkinfo.json -v ${filesDir}/${template}.verkey.json`);
    setupRecursiveF.constRoot = JSONbig.parse(await fs.promises.readFile(`${filesDir}/${template}.verkey.json`, "utf8"));
    
    await writeExpressionsBinFile(`${filesDir}/${template}.bin`, setupRecursiveF.starkInfo, setupRecursiveF.expressionsInfo);
    await writeVerifierExpressionsBinFile(`${filesDir}/${template}.verifier.bin`, setupRecursiveF.starkInfo, setupRecursiveF.verifierInfo);

    template = "final";
    verifierName = "recursivef.verifier.circom";
    templateFilename = path.resolve(__dirname,"../../", `node_modules/stark-recurser/src/recursion/templates/final.circom.ejs`);
    filesDir = `${buildDir}/provingKey/${globalInfo.name}/${template}`;
    
    await fs.promises.mkdir(filesDir, { recursive: true });

    const optionsFinal = { skipMain: true, verkeyInput: false, enableInput: false, addAggregatorAddr: false }
        
    //Generate circom
    const verifierFinalCircomTemplate = await pil2circom(setupRecursiveF.constRoot, setupRecursiveF.starkInfo, setupRecursiveF.verifierInfo, options);
    await fs.promises.writeFile(`${buildDir}/circom/${verifierName}`, verifierFinalCircomTemplate, "utf8");

    const recursiveFinalVerifier = await genCircom(templateFilename, [setupRecursiveF.starkInfo], globalInfo, [verifierName], [], [], [setupOptions.publicsInfo], optionsFinal);
    await fs.promises.writeFile(`${buildDir}/circom/${template}.circom`, recursiveFinalVerifier, "utf8");
  
    const circuitsBN128Path = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/pil2circom/circuits.bn128');

    const circuitsCircomLib = path.resolve(__dirname, '../../', 'node_modules/circomlib/circuits');

    // Compile circom
    console.log("Compiling " + template + "...");
    const compileFinalRecursiveCommand = `circom --O1 --r1cs --inspect --wasm --c --verbose -l ${starkRecurserCircuits} -l ${circuitsBN128Path} -l ${circuitsCircomLib} ${buildDir}/circom/${template}.circom -o ${buildDir}/build`;
    const stdoutCircom = await exec(compileFinalRecursiveCommand);
    console.log(stdoutCircom.stdout);

    console.log("Copying circom files...");
    fs.copyFile(`${buildDir}/build/${template}_cpp/${template}.dat`, `${filesDir}/${template}.dat`, (err) => { if(err) throw err; });

    await runFinalSnarkWitnessLibraryGenerationAwait(buildDir, filesDir, template, template);

    console.log("Computing Fflonk setup...");
    const stdoutFflonkSetup = await exec(`${setupOptions.fflonkSetup} ${buildDir}/build/${template}.r1cs ${setupOptions.powersOfTauFile} ${filesDir}/${template}.zkey`);
    console.log(stdoutFflonkSetup.stdout);

    console.log("Writing fflonk verification key...");
    const verkey = await snarkjs.zKey.exportVerificationKey(`${filesDir}/${template}.zkey`);
    await fs.promises.writeFile(`${filesDir}/${template}.verkey.json`, JSON.stringify(verkey), "utf8");

    console.log("Writing solidity fflonk verifier...");
    const solidityVerifier = await snarkjs.zKey.exportSolidityVerifier(`${filesDir}/${template}.zkey`, {fflonk: fs.readFileSync(path.join(__dirname, "../../node_modules/snarkjs/templates/verifier_fflonk.sol.ejs"), "utf8") });
    await fs.promises.writeFile(`${filesDir}/${template}.sol`, solidityVerifier, "utf8");
    
    await witnessLibraryGenerationAwait();

    console.log("All files were generated correctly");

    return;
}