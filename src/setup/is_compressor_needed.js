const { readR1cs } = require("r1csfile");
const fs = require("fs");
const path = require('path');
const pil2circom = require("stark-recurser/src/pil2circom/pil2circom.js");
const { getCompressorConstraints } = require("stark-recurser/src/circom2pil/compressor_constraints.js");
const F3g = require("stark-recurser/src/utils/f3g.js");

const util = require('util');
const { exec } = require('child_process');
const { log2 } = require("./utils");
const execPromise = util.promisify(exec);
const tmp = require('os').tmpdir();


module.exports.isCompressorNeeded = async function isCompressorNeeded(constRoot, starkInfo, verifierInfo, starkInfoFile) {

    const tempDir = await fs.promises.mkdtemp(path.join(tmp, 'compressor-'));

    let verifierCircomTemplate = await pil2circom(
        constRoot,
        starkInfo,
        verifierInfo,
        { skipMain: true }
    );

    verifierCircomTemplate +=
        `\n\ncomponent main = StarkVerifier${starkInfo.airgroupId}();\n\n`;
    
    const tmpCircomFilename = path.join(tempDir, "verifier.circom");
    const tmpR1csFilename = path.join(tempDir, "verifier.r1cs");

    await fs.promises.writeFile(
        tmpCircomFilename,
        verifierCircomTemplate,
        "utf8"
    );
    
    const circuitsGLPath = path.resolve(__dirname, '../../', 'node_modules/stark-recurser/src/pil2circom/circuits.gl');
    const circomExecutable = process.platform === 'darwin' ? 'circom/circom_mac' : 'circom/circom';
    const circomExecFile = path.resolve(__dirname, circomExecutable);
    const compileRecursiveCommand = `${circomExecFile} --O1 --r1cs --prime goldilocks -l ${circuitsGLPath} ${tmpCircomFilename} -o ${tempDir}`;
    console.log(compileRecursiveCommand);
    await execPromise(compileRecursiveCommand, { cwd: tempDir });
    
    const F = new F3g();
    const r1cs = await readR1cs(tmpR1csFilename);

    const { NUsed: NUsedC18 } = getCompressorConstraints(F, r1cs, 24);
    
    console.log("Number of rows used", NUsedC18);

    let nBitsC18 = log2(NUsedC18 - 1) + 1;

    await fs.promises.rm(tempDir, { recursive: true, force: true });
    
    if(nBitsC18 > 17) {
        return { hasCompressor: true, nBits: nBitsC18 };
    } else if(nBitsC18 === 17) {
        return { hasCompressor: false, nCols: 24 };
    } else {
        const nRowsPerFri = NUsedC18 / starkInfo.starkStruct.nQueries;
        const minimumQueriesRequired = Math.ceil((2**16 + 2**12) / nRowsPerFri);
        
        starkInfo.starkStruct.nQueries = minimumQueriesRequired;
        await fs.promises.writeFile(starkInfoFile, JSON.stringify(starkInfo, null, 1), "utf8");

        return { hasCompressor: false, nCols: 24 };
    }
    
}