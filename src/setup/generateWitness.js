
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const mkdir = util.promisify(fs.mkdir);
const rm = util.promisify(fs.rm);

const pendingTasks = [];

async function generateWitnessLibrary(buildDir,filesDir, nameFilename, template) {

    const randomString = crypto.randomBytes(16).toString('hex');
    const tmpDir = path.join(path.join(__dirname, "../../tmp"), `circom_temp_${randomString}`);

    try {
        pendingTasks.push(randomString);
        mkdir(tmpDir, { recursive: true });

        await exec(`cp -r ${path.join(__dirname, "circom/*")} ${tmpDir}`);
        await exec(`cp ${buildDir}/build/${nameFilename}_cpp/${nameFilename}.cpp ${path.join(tmpDir, "verifier.cpp")}`);
        
        console.log(`Generating witness library for ${nameFilename}...`);
        const fileExtension = process.platform === 'darwin' ? 'dylib' : 'so';
        const execCommand = `make -C ${tmpDir} -j witness WITNESS_DIR=${path.resolve(filesDir)} WITNESS_FILE=${template}.${fileExtension} FINAL_VADCOP=true`;
        await exec(execCommand);
    } catch (err) {
        console.error("Error during the witness library generation process:", err);
    } finally {
        try {
            rm(tmpDir, { recursive: true });
            pendingTasks.splice(pendingTasks.indexOf(randomString), 1);
        } catch (err) {
            console.error('Error removing temporary directory:', err);
        }
    }
}

async function generateWitnessFinalSnarkLibrary(buildDir, filesDir, template, nameFilename) {
    try {
        const randomString = crypto.randomBytes(16).toString('hex');
        const tmpDir = path.join(path.join(__dirname, "../../tmp"), `circom_temp_${randomString}`);
        pendingTasks.push(randomString);
        try {
            mkdir(tmpDir, { recursive: true });

            await exec(`cp -r ${path.join(__dirname, "final_snark_circom/*")} ${tmpDir}`);
            await exec(`cp ${buildDir}/build/${nameFilename}_cpp/${nameFilename}.cpp ${path.join(tmpDir, "verifier.cpp")}`);
            
            console.log(`Generating witness library for ${nameFilename}...`);
            const fileExtension = process.platform === 'darwin' ? 'dylib' : 'so';
            await exec(`make -C ${tmpDir} -j witness WITNESS_DIR=${path.resolve(filesDir)} WITNESS_FILE=${template}.${fileExtension}`);
        } catch (err) {
            console.error("Error during the witness library generation process:", err);
        } finally {
            try {
                pendingTasks.splice(pendingTasks.indexOf(randomString), 1);
                rm(tmpDir, { recursive: true });
            } catch (err) {
                console.error('Error removing temporary directory:', err);
            }
        }
        console.log('Final Snark Witness library generation completed.');

    } catch (err) {
        console.error('Error running witness library generation:', err);
    }
}

module.exports.runWitnessLibraryGeneration = function runWitnessLibraryGeneration(buildDir, filesDir, template, nameFilename) {
    generateWitnessLibrary(buildDir, filesDir, template, nameFilename)
        .then(() => console.log(`Witness library for ${nameFilename} generated.`))
        .catch((err) => console.error('Error running witness library generation:', err));
}

module.exports.witnessLibraryGenerationAwait = async function witnessLibraryGenerationAwait() {
    try {
        console.log('Waiting for all library generation to be completed.');

        while (pendingTasks.length > 0) {
            console.log(`Waiting for ${pendingTasks.length} witness libraries to be calculated...`);
            await new Promise(resolve => setTimeout(resolve, 10000)); // Adjust the delay as needed
        }
    } catch (err) {
        console.error('Error running witness library generation:', err);
    }
}


module.exports.runFinalSnarkWitnessLibraryGenerationAwait = async function runFinalSnarkWitnessLibraryGenerationAwait(buildDir, filesDir, template, nameFilename) {
    try {
        await generateWitnessFinalSnarkLibrary(buildDir, filesDir, template, nameFilename);
        console.log('Witness library generation completed.');

        while (pendingTasks.length > 0) {
            console.log(`Waiting for ${pendingTasks.length} witness libraries to be calculated...`);
            await new Promise(resolve => setTimeout(resolve, 10000)); // Adjust the delay as needed
        }
    } catch (err) {
        console.error('Error running witness library generation:', err);
    }
}

module.exports.runFinalSnarkWitnessLibraryGeneration = async function runFinalSnarkWitnessLibraryGeneration(buildDir, filesDir, template, nameFilename) {
    generateWitnessFinalSnarkLibrary(buildDir, filesDir, template, nameFilename)
        .then(() => console.log(`Witness library for ${nameFilename} generated.`))
        .catch((err) => console.error('Error running witness library generation:', err));
}
