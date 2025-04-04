const fs = require("fs");
const version = require("../package").version;

const path = require("path");
const log = require("../logger.js");

const verifyCmd = require("./cmd/verify_cmd");
const { assert } = require("chai");
const JSONbig = require('json-bigint')({ useNativeBigInt: true, alwaysParseAsBig: true });

const argv = require("yargs")
    .version(version)
    .usage("node main_verify.js -a airout -k proving_key -p <proofsDir> ")
    .alias("k", "provingkey")
    .alias("p", "proofsdir")
    .alias("t", "template")
        .argv;

async function run() {
    
    if(!argv.provingkey) throw new Error("Proving key path must be provided");

    if(!argv.proofsdir) throw new Error("Proofs directory must be provided");

    const globalInfo = JSON.parse(await fs.promises.readFile(path.join(argv.provingkey, "pilout.globalInfo.json")));

    const publics = str2bigInt(JSONbig.parse(await fs.promises.readFile(path.join(argv.proofsdir, "publics.json"))));
    const proofValues = str2bigInt(JSONbig.parse(await fs.promises.readFile(path.join(argv.proofsdir, "proof_values.json"))));
    const challenges = str2bigInt(JSONbig.parse(await fs.promises.readFile(path.join(argv.proofsdir, "challenges.json"))));

    const proofsFiles = await fs.promises.readdir(path.join(argv.proofsdir, "proofs"));

    const proofs = [];

    const template = argv.template;

    for(let i = 0; i < proofsFiles.length; ++i) {
        if((template && !proofsFiles[i].includes(template)) || (!template && !proofsFiles[i].startsWith("proof_"))) continue;
        const proof = JSONbig.parse(await fs.promises.readFile(path.join(argv.proofsdir, "proofs", proofsFiles[i])));
        proofs.push(str2bigInt(proof));
    }

    if(!proofs.length) throw new Error("No proof was found with name " + template);

    let airoutInfo = {...globalInfo};
    
    const setups = [];
    
    if(!template) {
        const globalConstraints = JSON.parse(await fs.promises.readFile(path.join(argv.provingkey, "pilout.globalConstraints.json")));
        airoutInfo.globalConstraints = globalConstraints;

        for(let i = 0; i < globalInfo.airs.length; ++i) {
            const setupsAir = [];
            for(let j = 0; j < globalInfo.airs[i].length; ++j) {
                const airName = globalInfo.airs[i][j].name;
                const pathAir = path.join(argv.provingkey, globalInfo.name, globalInfo.air_groups[i], "airs", globalInfo.airs[i][j].name, "air");
                
                const starkInfo = JSON.parse(await fs.promises.readFile(path.join(pathAir, `${airName}.starkinfo.json`), "utf8"));
            
                const verifierInfo = JSON.parse(await fs.promises.readFile(path.join(pathAir, `${airName}.verifierinfo.json`), "utf8"));
            
                const constRoot = JSONbig.parse(await fs.promises.readFile(path.join(pathAir, `${airName}.verkey.json`), "utf8"));
                
                setupsAir.push({
                    starkInfo,
                    verifierInfo, 
                    constRoot,
                })
            }
            setups.push(setupsAir);
        }
    } else {
        airoutInfo.globalConstraints = [];
        setups.push([{
            starkInfo: JSON.parse(await fs.promises.readFile(path.join(argv.provingkey, globalInfo.name, template, `${template}.starkinfo.json`), "utf8")),
            verifierInfo: JSON.parse(await fs.promises.readFile(path.join(argv.provingkey, globalInfo.name, template, `${template}.verifierinfo.json`), "utf8")),
            constRoot: JSONbig.parse(await fs.promises.readFile(path.join(argv.provingkey, globalInfo.name, template, `${template}.verkey.json`), "utf8")),
        }]);
    }
    
    const config = {
        name: globalInfo.name + "-" + Date.now(),
        verifier: { filename:  path.join(__dirname, "/verify/stark_fri_verifier.js") }
    }

    const setup = {
        config,
        airoutInfo,
        setup: setups,
    }

    const options = {
        vadcop: true,
        logger: log,
        template,
    }

    const isValid = await verifyCmd(setup, proofs, challenges, publics, proofValues, options);

    assert(isValid == true, "PROOF NOT VALID");

    console.log("PROOF VALID");

}

run().then(()=> {
    process.exit(0);
}, (err) => {
    console.log(err.message);
    console.log(err.stack);
    process.exit(1);
});

function str2bigInt(obj) {
    if (typeof obj === "object") {
        for (k in obj) {
            obj[k] = str2bigInt(obj[k]);
        }
        return obj;
    } else if (Array.isArray(obj)) {
        for (let i=0; i<obj.length; i++) {
            obj[i] = str2bigInt(obj[i]);
        }
        return obj;
    } else if (typeof obj == "string") {
        return BigInt(obj);
    } else {
        return obj;
    }
}
