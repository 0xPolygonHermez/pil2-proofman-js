const fs =require("fs");
const { getGlobalConstraintsInfo } = require("../pil2-stark/pil_info/getGlobalConstraintsInfo");
const { formatSymbols } = require("../pil2-stark/pil_info/helpers/pil2/utils");
const { mapSymbols } = require("../pil2-stark/pil_info/map");

async function fileExists(path) {
    return fs.promises.access(path, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
}


function generateStarkStruct(settings, nBits) {
    let starkStruct = {
        nBits,
    };

    if(settings.verificationHashType && !["GL", "BN128"].includes(settings.verificationHashType)) {
        throw new Error("Invalid verificationHashType " + settings.verificationHashType);
    }
    let verificationHashType = settings.verificationHashType || "GL";
    
    let hashCommits = settings.hashCommits || true;
    let blowupFactor = settings.blowupFactor || 1;
    let nQueries = Math.ceil(128 / blowupFactor);
    if(settings.nQueries > nQueries) nQueries = settings.nQueries;
    let foldingFactor = settings.foldingFactor || 4;
    let finalDegree = settings.finalDegree || 5;
    
    if(verificationHashType === "BN128") {
        starkStruct.merkleTreeArity = settings.merkleTreeArity || 16;
        starkStruct.merkleTreeCustom = settings.merkleTreeCustom || false;
        hashCommits = false;
    } else {
        starkStruct.merkleTreeArity = 3;
        starkStruct.merkleTreeCustom = true;
    }
    
    starkStruct.hashCommits = hashCommits;
    starkStruct.nBitsExt = starkStruct.nBits + blowupFactor;
    starkStruct.nQueries = nQueries;
    starkStruct.verificationHashType = verificationHashType;
    
    starkStruct.steps = [{nBits: starkStruct.nBitsExt}];
    let friStepBits = starkStruct.nBitsExt;
    while (friStepBits > finalDegree) {
        friStepBits = Math.max(friStepBits - foldingFactor, finalDegree);
        starkStruct.steps.push({
            nBits: friStepBits,
        });
    }

    return starkStruct;
}


async function setAiroutInfo(airout, starkStructs, curve = "EcGFp5") {
    let vadcopInfo = {};

    vadcopInfo.name = airout.name;

    vadcopInfo.airs = [];
    vadcopInfo.air_groups = [];
    
    vadcopInfo.aggTypes = [];
    for(let i = 0; i < airout.airGroups.length; ++i) {
        const airgroup = airout.airGroups[i];
        const airgroupId = airgroup.airgroupId;
        vadcopInfo.aggTypes[airgroupId] = airgroup.airGroupValues || [];
        vadcopInfo.air_groups.push(airgroup.name);
        vadcopInfo.airs[i] = [];
        for(let j = 0; j < airgroup.airs.length; ++j) {
            vadcopInfo.airs[airgroupId][j] = {name: `${airgroup.airs[j].name}`, num_rows: airgroup.airs[j].numRows};
        }
    }
  
    vadcopInfo.curve = curve;
    if (curve === "EcGFp5") {
        vadcopInfo.curveConstants = {
            A: ["6148914689804861439", "263", "0", "0", "0"],
            B: ["15713893096167979237", "6148914689804861265", "0", "0", "0"],
            Z: ["18446744069414584317", "18446744069414584320", "0", "0", "0"],
            C1: ["6585749426319121644", "16990361517133133838", "3264760655763595284", "16784740989273302855", "13434657726302040770"],
            C2: ["4795794222525505369", "3412737461722269738", "8370187669276724726", "7130825117388110979", "12052351772713910496"],
        }
    } else if (curve === "EcMasFp5") {
        vadcopInfo.curveConstants = {
            A: ["3", "0", "0", "0", "0"],
            B: ["0", "0", "0", "0", "8"],
            Z: ["9", "1", "0", "0", "0"],
            C1: ["0", "0", "0", "0", "12297829379609722878"],
            C2: ["17696091661387705534", "83405823114097643", "16387838525800286325", "16625873122103441396", "8400871913885497801"],
        }
    }

    let finalStep = starkStructs[0].steps[starkStructs[0].steps.length - 1].nBits;

    let stepsFRI = new Set([]);
    for(let i = 0; i < starkStructs.length; i++) {
        const starkStruct = starkStructs[i];
        starkStruct.steps.map(step => step.nBits).forEach(e => stepsFRI.add(e));
        if(starkStruct.steps[starkStruct.steps.length - 1].nBits !== finalStep) throw new Error("All FRI steps for different airgroups needs to end at the same nBits");
    }

    vadcopInfo.stepsFRI = Array.from(stepsFRI).sort((a, b) => b - a).map(s => { return { nBits: s }});
    vadcopInfo.nPublics = airout.numPublicValues;
    vadcopInfo.numChallenges = airout.numChallenges || [0];

    vadcopInfo.numProofValues = airout.numProofValues;

    let symbols = formatSymbols(airout, true);
    
    const res = {
        publicsMap: [],
        proofValuesMap: [],
        airgroupValuesMap: [],
        challengesMap: [],
    };
    mapSymbols(res, symbols);

    vadcopInfo.proofValuesMap = res.proofValuesMap;
    vadcopInfo.publicsMap = res.publicsMap;

    let globalConstraints = {
        constraints: [],
        hints: [],
    };
    if(airout.constraints !== undefined) {
        globalConstraints = getGlobalConstraintsInfo(res, airout, true);
    }

    return { vadcopInfo, globalConstraints };
}

module.exports = {
    fileExists,
    generateStarkStruct,
    setAiroutInfo,
}

module.exports.log2 = function log2( V )
{
    return( ( ( V & 0xFFFF0000 ) !== 0 ? ( V &= 0xFFFF0000, 16 ) : 0 ) | ( ( V & 0xFF00FF00 ) !== 0 ? ( V &= 0xFF00FF00, 8 ) : 0 ) | ( ( V & 0xF0F0F0F0 ) !== 0 ? ( V &= 0xF0F0F0F0, 4 ) : 0 ) | ( ( V & 0xCCCCCCCC ) !== 0 ? ( V &= 0xCCCCCCCC, 2 ) : 0 ) | ( ( V & 0xAAAAAAAA ) !== 0 ) );
}