const { createBinFile,
    endWriteSection,
    startWriteSection
     } = require("@iden3/binfileutils");
const { getParserArgs } = require("./getParserArgs.js");
const { getParserArgsPil1 } = require("./getParserArgsPil1.js");
const { getAllOperations } = require("./utils.js");

const CHELPERS_NSECTIONS = 4;
const CHELPERS_EXPRESSIONS_SECTION = 2;
const CHELPERS_CONSTRAINTS_DEBUG_SECTION = 3;
const CHELPERS_HINTS_SECTION = 4;

module.exports.writeStringToFile = async function writeStringToFile(fd, str) {
    let buff = new Uint8Array(str.length + 1);
    for (let i = 0; i < str.length; i++) {
        buff[i] = str.charCodeAt(i);
    }
    buff[str.length] = 0;

    await fd.write(buff);
}

module.exports.writeVerifierExpressionsBinFile = async function writeVerifierExpressionsBinFile(cHelpersFilename, starkInfo, verifierInfo) {
    console.log("> Writing the chelpers verifier file");
        
    const binFileInfo = await prepareVerifierExpressionsBin(starkInfo, verifierInfo);

    const verInfo = {};
    verInfo.expsInfo = [binFileInfo.qCode, binFileInfo.queryCode];

    const cHelpersBin = await createBinFile(cHelpersFilename, "chps", 1, 2, 1 << 22, 1 << 24);

    await writeExpressionsSection(cHelpersBin, verInfo.expsInfo, binFileInfo.numbersExps, binFileInfo.maxTmp1, binFileInfo.maxTmp3, binFileInfo.maxArgs, binFileInfo.maxOps, 2, true);

    console.log("> Writing the chelpers file finished");
    console.log("---------------------------------------------");

    await cHelpersBin.close();
}

module.exports.writeExpressionsBinFile = async function writeExpressionsBinFile(cHelpersFilename, starkInfo, expressionsInfo) {
    console.log("> Writing the chelpers file");

    const binFileInfo = await prepareExpressionsBin(starkInfo, expressionsInfo);

    const expsInfo = binFileInfo.expsInfo;
    const constraintsInfo = binFileInfo.constraintsInfo;
    const hintsInfo = binFileInfo.hintsInfo;

    const cHelpersBin = await createBinFile(cHelpersFilename, "chps", 1, CHELPERS_NSECTIONS, 1 << 22, 1 << 24);    
        
    await writeExpressionsSection(cHelpersBin, expsInfo, binFileInfo.numbersExps, binFileInfo.maxTmp1, binFileInfo.maxTmp3, binFileInfo.maxArgs, binFileInfo.maxOps, CHELPERS_EXPRESSIONS_SECTION);

    await writeConstraintsSection(cHelpersBin, constraintsInfo, binFileInfo.numbersConstraints, CHELPERS_CONSTRAINTS_DEBUG_SECTION);

    await writeHintsSection(cHelpersBin, hintsInfo, CHELPERS_HINTS_SECTION);

    console.log("> Writing the chelpers file finished");
    console.log("---------------------------------------------");

    await cHelpersBin.close();
}

async function writeExpressionsSection(cHelpersBin, expressionsInfo, numbersExps, maxTmp1, maxTmp3, maxArgs, maxOps, section) {
    console.log(`··· Writing Section ${section}. CHelpers expressions section`);

    const nCustomCommits = expressionsInfo[0].customValuesIds.length;

    await startWriteSection(cHelpersBin, section);

    const opsExpressions = [];
    const argsExpressions = [];
    const constPolsIdsExpressions = [];
    const cmPolsIdsExpressions = [];
    const challengesIdsExpressions = [];
    const publicsIdsExpressions = [];
    const airgroupValuesIdsExpressions = [];
    const airValuesIdsExpressions = [];
    const customCommitsIdsExpressions = [];


    const opsExpressionsOffset = [];
    const argsExpressionsOffset = [];
    const constPolsIdsExpressionsOffset = [];
    const cmPolsIdsExpressionsOffset = [];
    const challengesIdsExpressionsOffset = [];
    const publicsIdsExpressionsOffset = [];
    const airgroupValuesIdsExpressionsOffset = [];
    const airValuesIdsExpressionsOffset = [];
    const customCommitsIdsExpressionsOffset = [];

    for(let i = 0; i < expressionsInfo.length; i++) {
        if(i == 0) {
            opsExpressionsOffset.push(0);
            argsExpressionsOffset.push(0);
            constPolsIdsExpressionsOffset.push(0);
            cmPolsIdsExpressionsOffset.push(0);
            challengesIdsExpressionsOffset.push(0);
            publicsIdsExpressionsOffset.push(0);
            airgroupValuesIdsExpressionsOffset.push(0);
            airValuesIdsExpressionsOffset.push(0);
            customCommitsIdsExpressionsOffset[0] = [];
            for(let j = 0; j < nCustomCommits; ++j) {
                customCommitsIdsExpressionsOffset[0].push(0);
            }
        } else {
            opsExpressionsOffset.push(opsExpressionsOffset[i-1] + expressionsInfo[i-1].ops.length);
            argsExpressionsOffset.push(argsExpressionsOffset[i-1] + expressionsInfo[i-1].args.length);
            constPolsIdsExpressionsOffset.push(constPolsIdsExpressionsOffset[i-1] + expressionsInfo[i-1].constPolsIds.length);
            cmPolsIdsExpressionsOffset.push(cmPolsIdsExpressionsOffset[i-1] + expressionsInfo[i-1].cmPolsIds.length);
            challengesIdsExpressionsOffset.push(challengesIdsExpressionsOffset[i-1] + expressionsInfo[i-1].challengeIds.length);
            publicsIdsExpressionsOffset.push(publicsIdsExpressionsOffset[i-1] + expressionsInfo[i-1].publicsIds.length);
            airgroupValuesIdsExpressionsOffset.push(airgroupValuesIdsExpressionsOffset[i-1] + expressionsInfo[i-1].airgroupValuesIds.length);
            airValuesIdsExpressionsOffset.push(airValuesIdsExpressionsOffset[i-1] + expressionsInfo[i-1].airValuesIds.length);
            customCommitsIdsExpressionsOffset[i] = [];
            for(let j = 0; j < nCustomCommits; ++j) {
                customCommitsIdsExpressionsOffset[i].push(customCommitsIdsExpressionsOffset[i-1][j] + expressionsInfo[i-1].customValuesIds[j].length);
            }

        }
        for(let j = 0; j < expressionsInfo[i].ops.length; j++) {
            opsExpressions.push(expressionsInfo[i].ops[j]);
        }
        for(let j = 0; j < expressionsInfo[i].args.length; j++) {
            argsExpressions.push(expressionsInfo[i].args[j]);
        }
        for(let j = 0; j < expressionsInfo[i].constPolsIds.length; j++) {
            constPolsIdsExpressions.push(expressionsInfo[i].constPolsIds[j]);
        }
        for(let j = 0; j < expressionsInfo[i].cmPolsIds.length; j++) {
            cmPolsIdsExpressions.push(expressionsInfo[i].cmPolsIds[j]);
        }
        for(let j = 0; j < expressionsInfo[i].challengeIds.length; j++) {
            challengesIdsExpressions.push(expressionsInfo[i].challengeIds[j]);
        }
        for(let j = 0; j < expressionsInfo[i].publicsIds.length; j++) {
            publicsIdsExpressions.push(expressionsInfo[i].publicsIds[j]);
        }
        for(let j = 0; j < expressionsInfo[i].airgroupValuesIds.length; j++) {
            airgroupValuesIdsExpressions.push(expressionsInfo[i].airgroupValuesIds[j]);
        } 
        for(let j = 0; j < expressionsInfo[i].airValuesIds.length; j++) {
            airValuesIdsExpressions.push(expressionsInfo[i].airValuesIds[j]);
        }

        for(let j = 0; j < nCustomCommits; ++j) {
            for(let k = 0; k < expressionsInfo[i].customValuesIds[j].length; k++) {
                customCommitsIdsExpressions.push(expressionsInfo[i].customValuesIds[j][k]);
            }
        }
         
    }
    
    await cHelpersBin.writeULE32(maxTmp1);
    await cHelpersBin.writeULE32(maxTmp3);
    await cHelpersBin.writeULE32(maxArgs);
    await cHelpersBin.writeULE32(maxOps);
    await cHelpersBin.writeULE32(opsExpressions.length);
    await cHelpersBin.writeULE32(argsExpressions.length);
    await cHelpersBin.writeULE32(numbersExps.length);

    await cHelpersBin.writeULE32(constPolsIdsExpressions.length);
    await cHelpersBin.writeULE32(cmPolsIdsExpressions.length);
    await cHelpersBin.writeULE32(challengesIdsExpressions.length);
    await cHelpersBin.writeULE32(publicsIdsExpressions.length);
    await cHelpersBin.writeULE32(airgroupValuesIdsExpressions.length);
    await cHelpersBin.writeULE32(airValuesIdsExpressions.length);
    await cHelpersBin.writeULE32(customCommitsIdsExpressions.length);

    const nExpressions = expressionsInfo.length;

    await cHelpersBin.writeULE32(nCustomCommits);

    //Write the number of expressions
    await cHelpersBin.writeULE32(nExpressions);

    for(let i = 0; i < nExpressions; i++) {
        const expInfo = expressionsInfo[i];
        await cHelpersBin.writeULE32(expInfo.expId);
        await cHelpersBin.writeULE32(expInfo.destDim);
        await cHelpersBin.writeULE32(expInfo.destId);
        await cHelpersBin.writeULE32(expInfo.stage);
        await cHelpersBin.writeULE32(expInfo.nTemp1);
        await cHelpersBin.writeULE32(expInfo.nTemp3);

        await cHelpersBin.writeULE32(expInfo.ops.length);
        await cHelpersBin.writeULE32(opsExpressionsOffset[i]);

        await cHelpersBin.writeULE32(expInfo.args.length);
        await cHelpersBin.writeULE32(argsExpressionsOffset[i]);
        
        await cHelpersBin.writeULE32(expInfo.constPolsIds.length);
        await cHelpersBin.writeULE32(constPolsIdsExpressionsOffset[i]);

        await cHelpersBin.writeULE32(expInfo.cmPolsIds.length);
        await cHelpersBin.writeULE32(cmPolsIdsExpressionsOffset[i]);

        await cHelpersBin.writeULE32(expInfo.challengeIds.length);
        await cHelpersBin.writeULE32(challengesIdsExpressionsOffset[i]);

        await cHelpersBin.writeULE32(expInfo.publicsIds.length);
        await cHelpersBin.writeULE32(publicsIdsExpressionsOffset[i]);

        await cHelpersBin.writeULE32(expInfo.airgroupValuesIds.length);
        await cHelpersBin.writeULE32(airgroupValuesIdsExpressionsOffset[i]);

        await cHelpersBin.writeULE32(expInfo.airValuesIds.length);
        await cHelpersBin.writeULE32(airValuesIdsExpressionsOffset[i]);

        for(let j = 0; j < nCustomCommits; ++j) {
            await cHelpersBin.writeULE32(expInfo.customValuesIds[j].length);
            await cHelpersBin.writeULE32(customCommitsIdsExpressionsOffset[i][j]);
        }

        module.exports.writeStringToFile(cHelpersBin, expInfo.line);
    }

    const buffOpsExpressions = new Uint8Array(opsExpressions.length);
    const buffOpsExpressionsV = new DataView(buffOpsExpressions.buffer);
    for(let j = 0; j < opsExpressions.length; j++) {
        buffOpsExpressionsV.setUint8(j, opsExpressions[j]);
    }

    const buffArgsExpressions = new Uint8Array(2*argsExpressions.length);
    const buffArgsExpressionsV = new DataView(buffArgsExpressions.buffer);
    for(let j = 0; j < argsExpressions.length; j++) {
        buffArgsExpressionsV.setUint16(2*j, argsExpressions[j], true);
    }

    const buffNumbersExpressions = new Uint8Array(8*numbersExps.length);
    const buffNumbersExpressionsV = new DataView(buffNumbersExpressions.buffer);
    for(let j = 0; j < numbersExps.length; j++) {
        buffNumbersExpressionsV.setBigUint64(8*j, BigInt(numbersExps[j]), true);
    }

    const buffConstPolsIdsExpressions = new Uint8Array(2*constPolsIdsExpressions.length);
    const buffConstPolsIdsExpressionsV = new DataView(buffConstPolsIdsExpressions.buffer);
    for(let j = 0; j < constPolsIdsExpressions.length; j++) {
        buffConstPolsIdsExpressionsV.setUint16(2*j, constPolsIdsExpressions[j], true);
    }

    const buffCmPolsIdsExpressions = new Uint8Array(2*cmPolsIdsExpressions.length);
    const buffCmPolsIdsExpressionsV = new DataView(buffCmPolsIdsExpressions.buffer);
    for(let j = 0; j < cmPolsIdsExpressions.length; j++) {
        buffCmPolsIdsExpressionsV.setUint16(2*j, cmPolsIdsExpressions[j], true);
    }

    const buffChallengesIdsExpressions = new Uint8Array(2*challengesIdsExpressions.length);
    const buffChallengesIdsExpressionsV = new DataView(buffChallengesIdsExpressions.buffer);
    for(let j = 0; j < challengesIdsExpressions.length; j++) {
        buffChallengesIdsExpressionsV.setUint16(2*j, challengesIdsExpressions[j], true);
    }

    const buffPublicsIdsExpressions = new Uint8Array(2*publicsIdsExpressions.length);
    const buffPublicsIdsExpressionsV = new DataView(buffPublicsIdsExpressions.buffer);
    for(let j = 0; j < publicsIdsExpressions.length; j++) {
        buffPublicsIdsExpressionsV.setUint16(2*j, publicsIdsExpressions[j], true);
    }

    const buffAirgroupValuesIdsExpressions = new Uint8Array(2*airgroupValuesIdsExpressions.length);
    const buffAirgroupValuesIdsExpressionsV = new DataView(buffAirgroupValuesIdsExpressions.buffer);
    for(let j = 0; j < airgroupValuesIdsExpressions.length; j++) {
        buffAirgroupValuesIdsExpressionsV.setUint16(2*j, airgroupValuesIdsExpressions[j], true);
    }

    const buffAirValuesIdsExpressions = new Uint8Array(2*airValuesIdsExpressions.length);
    const buffAirValuesIdsExpressionsV = new DataView(buffAirValuesIdsExpressions.buffer);
    for(let j = 0; j < airValuesIdsExpressions.length; j++) {
        buffAirValuesIdsExpressionsV.setUint16(2*j, airValuesIdsExpressions[j], true);
    }

    const buffCustomCommitsIdsExpressions = new Uint8Array(2*customCommitsIdsExpressions.length);
    const buffCustomCommitsIdsExpressionsV = new DataView(buffCustomCommitsIdsExpressions.buffer);
    for(let j = 0; j < customCommitsIdsExpressions.length; j++) {
        buffCustomCommitsIdsExpressionsV.setUint16(2*j, customCommitsIdsExpressions[j], true);
    }
    
    await cHelpersBin.write(buffOpsExpressions);
    await cHelpersBin.write(buffArgsExpressions);
    await cHelpersBin.write(buffNumbersExpressions);

    await cHelpersBin.write(buffConstPolsIdsExpressions);
    await cHelpersBin.write(buffCmPolsIdsExpressions);
    await cHelpersBin.write(buffChallengesIdsExpressions);
    await cHelpersBin.write(buffPublicsIdsExpressions);
    await cHelpersBin.write(buffAirgroupValuesIdsExpressions);
    await cHelpersBin.write(buffAirValuesIdsExpressions);
    await cHelpersBin.write(buffCustomCommitsIdsExpressions);


    await endWriteSection(cHelpersBin);
}

async function writeConstraintsSection(cHelpersBin, constraintsInfo, numbersConstraints, section) {
    console.log(`··· Writing Section ${section}. CHelpers constraints debug section`);

    const nCustomCommits = constraintsInfo[0].customValuesIds.length;

    await startWriteSection(cHelpersBin, section);

    const opsDebug = [];
    const argsDebug = [];
    const constPolsIdsDebug = [];
    const cmPolsIdsDebug = [];
    const challengesIdsDebug = [];
    const publicsIdsDebug = [];
    const airgroupValuesIdsDebug = [];
    const airValuesIdsDebug = [];
    const customCommitsIdsDebug = [];

    const opsOffsetDebug = [];
    const argsOffsetDebug = [];
    const constPolsIdsOffsetDebug = [];
    const cmPolsIdsOffsetDebug = [];
    const challengesIdsOffsetDebug = [];
    const publicsIdsOffsetDebug = [];
    const airgroupValuesIdsOffsetDebug = [];
    const airValuesIdsOffsetDebug = [];
    const customCommitsIdsOffsetDebug = [];

    const nConstraints = constraintsInfo.length;

    for(let i = 0; i < nConstraints; i++) {
        if(i == 0) {
            opsOffsetDebug.push(0);
            argsOffsetDebug.push(0);
            constPolsIdsOffsetDebug.push(0);
            cmPolsIdsOffsetDebug.push(0);
            challengesIdsOffsetDebug.push(0);
            publicsIdsOffsetDebug.push(0);
            airgroupValuesIdsOffsetDebug.push(0);
            airValuesIdsOffsetDebug.push(0);
            customCommitsIdsOffsetDebug[0] = [];
            for(let j = 0; j < nCustomCommits; ++j) {
                customCommitsIdsOffsetDebug[0].push(0);
            }
        } else {
            opsOffsetDebug.push(opsOffsetDebug[i-1] + constraintsInfo[i-1].ops.length);
            argsOffsetDebug.push(argsOffsetDebug[i-1] + constraintsInfo[i-1].args.length);
            constPolsIdsOffsetDebug.push(constPolsIdsOffsetDebug[i-1] + constraintsInfo[i-1].constPolsIds.length);
            cmPolsIdsOffsetDebug.push(cmPolsIdsOffsetDebug[i-1] + constraintsInfo[i-1].cmPolsIds.length);
            challengesIdsOffsetDebug.push(challengesIdsOffsetDebug[i-1] + constraintsInfo[i-1].challengeIds.length);
            publicsIdsOffsetDebug.push(publicsIdsOffsetDebug[i-1] + constraintsInfo[i-1].publicsIds.length);
            airgroupValuesIdsOffsetDebug.push(airgroupValuesIdsOffsetDebug[i-1] + constraintsInfo[i-1].airgroupValuesIds.length);
            airValuesIdsOffsetDebug.push(airValuesIdsOffsetDebug[i-1] + constraintsInfo[i-1].airValuesIds.length);
            customCommitsIdsOffsetDebug[i] = [];
            for(let j = 0; j < nCustomCommits; ++j) {
                customCommitsIdsOffsetDebug[i].push(customCommitsIdsOffsetDebug[i-1][j] + constraintsInfo[i-1].customValuesIds[j].length);
            }
        }
        for(let j = 0; j < constraintsInfo[i].ops.length; j++) {
            opsDebug.push(constraintsInfo[i].ops[j]);
        }
        for(let j = 0; j < constraintsInfo[i].args.length; j++) {
            argsDebug.push(constraintsInfo[i].args[j]);
        }
        for(let j = 0; j < constraintsInfo[i].constPolsIds.length; j++) {
            constPolsIdsDebug.push(constraintsInfo[i].constPolsIds[j]);
        }
        for(let j = 0; j < constraintsInfo[i].cmPolsIds.length; j++) {
            cmPolsIdsDebug.push(constraintsInfo[i].cmPolsIds[j]);
        }
        for(let j = 0; j < constraintsInfo[i].challengeIds.length; j++) {
            challengesIdsDebug.push(constraintsInfo[i].challengeIds[j]);
        }
        for(let j = 0; j < constraintsInfo[i].publicsIds.length; j++) {
            publicsIdsDebug.push(constraintsInfo[i].publicsIds[j]);
        }
        for(let j = 0; j < constraintsInfo[i].airgroupValuesIds.length; j++) {
            airgroupValuesIdsDebug.push(constraintsInfo[i].airgroupValuesIds[j]);
        }
        for(let j = 0; j < constraintsInfo[i].airValuesIds.length; j++) {
            airValuesIdsDebug.push(constraintsInfo[i].airValuesIds[j]);
        }

        for(let j = 0; j < nCustomCommits; ++j) {
            for(let k = 0; k < constraintsInfo[i].customValuesIds[j].length; k++) {
                customCommitsIdsDebug.push(constraintsInfo[i].customValuesIds[j][k]);
            }
        }
    }

    await cHelpersBin.writeULE32(opsDebug.length);
    await cHelpersBin.writeULE32(argsDebug.length);
    await cHelpersBin.writeULE32(numbersConstraints.length);

    await cHelpersBin.writeULE32(constPolsIdsDebug.length);
    await cHelpersBin.writeULE32(cmPolsIdsDebug.length);
    await cHelpersBin.writeULE32(challengesIdsDebug.length);
    await cHelpersBin.writeULE32(publicsIdsDebug.length);
    await cHelpersBin.writeULE32(airgroupValuesIdsDebug.length);
    await cHelpersBin.writeULE32(airValuesIdsDebug.length);
    await cHelpersBin.writeULE32(customCommitsIdsDebug.length);

    await cHelpersBin.writeULE32(nCustomCommits);
    
    await cHelpersBin.writeULE32(nConstraints);

    for(let i = 0; i < nConstraints; i++) {
        const constraintInfo = constraintsInfo[i];

        await cHelpersBin.writeULE32(constraintInfo.stage);

        await cHelpersBin.writeULE32(constraintInfo.destDim);
        await cHelpersBin.writeULE32(constraintInfo.destId);

        await cHelpersBin.writeULE32(constraintInfo.firstRow);
        await cHelpersBin.writeULE32(constraintInfo.lastRow);
        await cHelpersBin.writeULE32(constraintInfo.nTemp1);
        await cHelpersBin.writeULE32(constraintInfo.nTemp3);

        await cHelpersBin.writeULE32(constraintInfo.ops.length);
        await cHelpersBin.writeULE32(opsOffsetDebug[i]);

        await cHelpersBin.writeULE32(constraintInfo.args.length);
        await cHelpersBin.writeULE32(argsOffsetDebug[i]);
        
        await cHelpersBin.writeULE32(constraintInfo.constPolsIds.length);
        await cHelpersBin.writeULE32(constPolsIdsOffsetDebug[i]);

        await cHelpersBin.writeULE32(constraintInfo.cmPolsIds.length);
        await cHelpersBin.writeULE32(cmPolsIdsOffsetDebug[i]);

        await cHelpersBin.writeULE32(constraintInfo.challengeIds.length);
        await cHelpersBin.writeULE32(challengesIdsOffsetDebug[i]);

        await cHelpersBin.writeULE32(constraintInfo.publicsIds.length);
        await cHelpersBin.writeULE32(publicsIdsOffsetDebug[i]);

        await cHelpersBin.writeULE32(constraintInfo.airgroupValuesIds.length);
        await cHelpersBin.writeULE32(airgroupValuesIdsOffsetDebug[i]);

        await cHelpersBin.writeULE32(constraintInfo.airValuesIds.length);
        await cHelpersBin.writeULE32(airValuesIdsOffsetDebug[i]);

        for(let j = 0; j < nCustomCommits; ++j) {
            await cHelpersBin.writeULE32(constraintInfo.customValuesIds[j].length);
            await cHelpersBin.writeULE32(customCommitsIdsOffsetDebug[i][j]);
        }

        await cHelpersBin.writeULE32(constraintInfo.imPol);
        module.exports.writeStringToFile(cHelpersBin, constraintInfo.line);
    }

    const buffOpsDebug = new Uint8Array(opsDebug.length);
    const buffOpsDebugV = new DataView(buffOpsDebug.buffer);
    for(let j = 0; j < opsDebug.length; j++) {
        buffOpsDebugV.setUint8(j, opsDebug[j]);
    }

    const buffArgsDebug = new Uint8Array(2*argsDebug.length);
    const buffArgsDebugV = new DataView(buffArgsDebug.buffer);
    for(let j = 0; j < argsDebug.length; j++) {
        buffArgsDebugV.setUint16(2*j, argsDebug[j], true);
    }

    const buffNumbersDebug = new Uint8Array(8*numbersConstraints.length);
    const buffNumbersDebugV = new DataView(buffNumbersDebug.buffer);
    for(let j = 0; j < numbersConstraints.length; j++) {
        buffNumbersDebugV.setBigUint64(8*j, BigInt(numbersConstraints[j]), true);
    }

    const buffConstPolsIdsDebug = new Uint8Array(2*constPolsIdsDebug.length);
    const buffConstPolsIdsDebugV = new DataView(buffConstPolsIdsDebug.buffer);
    for(let j = 0; j < constPolsIdsDebug.length; j++) {
        buffConstPolsIdsDebugV.setUint16(2*j, constPolsIdsDebug[j], true);
    }

    const buffCmPolsIdsDebug = new Uint8Array(2*cmPolsIdsDebug.length);
    const buffCmPolsIdsDebugV = new DataView(buffCmPolsIdsDebug.buffer);
    for(let j = 0; j < cmPolsIdsDebug.length; j++) {
        buffCmPolsIdsDebugV.setUint16(2*j, cmPolsIdsDebug[j], true);
    }

    const buffChallengesIdsDebug = new Uint8Array(2*challengesIdsDebug.length);
    const buffChallengesIdsDebugV = new DataView(buffChallengesIdsDebug.buffer);
    for(let j = 0; j < challengesIdsDebug.length; j++) {
        buffChallengesIdsDebugV.setUint16(2*j, challengesIdsDebug[j], true);
    }

    const buffPublicsIdsDebug = new Uint8Array(2*publicsIdsDebug.length);
    const buffPublicsIdsDebugV = new DataView(buffPublicsIdsDebug.buffer);
    for(let j = 0; j < publicsIdsDebug.length; j++) {
        buffPublicsIdsDebugV.setUint16(2*j, publicsIdsDebug[j], true);
    }

    const buffAirgroupValuesIdsDebug = new Uint8Array(2*airgroupValuesIdsDebug.length);
    const buffAirgroupValuesIdsDebugV = new DataView(buffAirgroupValuesIdsDebug.buffer);
    for(let j = 0; j < airgroupValuesIdsDebug.length; j++) {
        buffAirgroupValuesIdsDebugV.setUint16(2*j, airgroupValuesIdsDebug[j], true);
    }

    const buffAirValuesIdsDebug = new Uint8Array(2*airValuesIdsDebug.length);
    const buffAirValuesIdsDebugV = new DataView(buffAirValuesIdsDebug.buffer);
    for(let j = 0; j < airValuesIdsDebug.length; j++) {
        buffAirValuesIdsDebugV.setUint16(2*j, airValuesIdsDebug[j], true);
    }

    const buffCustomCommitsIdsDebug = new Uint8Array(2*customCommitsIdsDebug.length);
    const buffCustomCommitsIdsDebugV = new DataView(buffCustomCommitsIdsDebug.buffer);
    for(let j = 0; j < customCommitsIdsDebug.length; j++) {
        buffCustomCommitsIdsDebugV.setUint16(2*j, customCommitsIdsDebug[j], true);
    }
    
    await cHelpersBin.write(buffOpsDebug);
    await cHelpersBin.write(buffArgsDebug);
    await cHelpersBin.write(buffNumbersDebug);

    await cHelpersBin.write(buffConstPolsIdsDebug);
    await cHelpersBin.write(buffCmPolsIdsDebug);
    await cHelpersBin.write(buffChallengesIdsDebug);
    await cHelpersBin.write(buffPublicsIdsDebug);
    await cHelpersBin.write(buffAirgroupValuesIdsDebug);
    await cHelpersBin.write(buffAirValuesIdsDebug);
    await cHelpersBin.write(buffCustomCommitsIdsDebug);

    await endWriteSection(cHelpersBin);
}

async function writeHintsSection(cHelpersBin, hintsInfo, section) {
    console.log(`··· Writing Section ${section}. Hints section`);

    await startWriteSection(cHelpersBin, section);

    const nHints = hintsInfo.length;
    await cHelpersBin.writeULE32(nHints);

    for(let j = 0; j < nHints; j++) {
        const hint = hintsInfo[j];
        await module.exports.writeStringToFile(cHelpersBin, hint.name);
        const nFields = hint.fields.length;
        await cHelpersBin.writeULE32(nFields);
        for(let k = 0; k < nFields; k++) {
            const field = hint.fields[k];
            await module.exports.writeStringToFile(cHelpersBin, field.name);
            const nValues = field.values.length;
            await cHelpersBin.writeULE32(nValues);
            for(let v = 0; v < field.values.length; ++v) {
                const value = field.values[v];
                await module.exports.writeStringToFile(cHelpersBin, value.op);
                if(value.op === "number") {
                    const buffNumber = new Uint8Array(8);
                    const buffNumberV = new DataView(buffNumber.buffer);
                    buffNumberV.setBigUint64(0, BigInt(value.value), true);
                    await cHelpersBin.write(buffNumber);
                } else if(value.op === "string") {
                    module.exports.writeStringToFile(cHelpersBin, value.string);
                } else {
                    await cHelpersBin.writeULE32(value.id);
                }
                if(value.op === "custom" || value.op === "const" || value.op === "cm") await cHelpersBin.writeULE32(value.rowOffsetIndex);
                if(value.op === "tmp") await cHelpersBin.writeULE32(value.dim);
                if(value.op === "custom") await cHelpersBin.writeULE32(value.commitId);

                await cHelpersBin.writeULE32(value.pos.length);
                for(let p = 0; p < value.pos.length; ++p) {
                    await cHelpersBin.writeULE32(value.pos[p]);
                }
            }
            
        }
    }

    await endWriteSection(cHelpersBin);
}

async function prepareExpressionsBin(starkInfo, expressionsInfo) {
    
    const expsInfo = [];
    const constraintsInfo = [];
    const numbersExps = [];
    const numbersConstraints = [];

    let operations = getAllOperations();

    const N = 1 << (starkInfo.starkStruct.nBits);

    let maxTmp1 = 0;
    let maxTmp3 = 0;
    let maxArgs = 0;
    let maxOps = 0;

    // Get parser args for each constraint
    for(let j = 0; j < expressionsInfo.constraints.length; ++j) {
        const constraintCode = expressionsInfo.constraints[j];
        let firstRow;
        let lastRow;

        if(constraintCode.boundary === "everyRow") {
            firstRow = 0;
            lastRow = N;
        } else if(constraintCode.boundary === "firstRow" || constraintCode.boundary === "finalProof") {
            firstRow = 0;
            lastRow = 1;
        } else if(constraintCode.boundary === "lastRow") {
            firstRow = N-1;
            lastRow = N;
        } else if(constraintCode.boundary === "everyFrame") {
            firstRow = constraintCode.offsetMin;
            lastRow = N - constraintCode.offsetMax;
        } else throw new Error("Invalid boundary: " + constraintCode.boundary);

        const {expsInfo: constraintInfo} = getParserArgs(starkInfo, operations, constraintCode, numbersConstraints);

        // const {expsInfo: constraintInfo} = starkInfo.pil2 
        //     ? getParserArgs(starkInfo, operations, constraintCode, numbersConstraints)
        //     : getParserArgsPil1(starkInfo, operations, constraintCode, numbersConstraints);
        constraintInfo.stage = constraintCode.stage;
        constraintInfo.firstRow = firstRow;
        constraintInfo.lastRow = lastRow;
        constraintInfo.line = constraintCode.line;
        constraintInfo.imPol = constraintCode.imPol;
        constraintsInfo.push(constraintInfo);

        if(constraintInfo.nTemp1 > maxTmp1) maxTmp1 = constraintInfo.nTemp1;
        if(constraintInfo.nTemp3 > maxTmp3) maxTmp3 = constraintInfo.nTemp3;
        if(constraintInfo.args.length > maxArgs) maxArgs = constraintInfo.args.length;
        if(constraintInfo.ops.length > maxOps) maxOps = constraintInfo.ops.length;
    }

    // Get parser args for each expression
    for(let i = 0; i < expressionsInfo.expressionsCode.length; ++i) {
        const expCode = JSON.parse(JSON.stringify(expressionsInfo.expressionsCode[i]));
        if(!expCode) continue;
        if(expCode.expId === starkInfo.cExpId || expCode.expId === starkInfo.friExpId || starkInfo.cmPolsMap.find(c => c.expId === expCode.expId)) {
                expCode.code[expCode.code.length - 1].dest.type = "tmp";
                expCode.code[expCode.code.length - 1].dest.id = expCode.tmpUsed++;
        }
        const {expsInfo: expInfo} = getParserArgs(starkInfo, operations, expCode, numbersExps);
        expInfo.expId = expCode.expId;
        expInfo.stage = expCode.stage;
        expInfo.line = expCode.line;
        expsInfo.push(expInfo);

        if(expInfo.nTemp1 > maxTmp1) maxTmp1 = expInfo.nTemp1;
        if(expInfo.nTemp3 > maxTmp3) maxTmp3 = expInfo.nTemp3;
        if(expInfo.args.length > maxArgs) maxArgs = expInfo.args.length;
        if(expInfo.ops.length > maxOps) maxOps = expInfo
    }
    
    const res = {
        expsInfo, constraintsInfo, hintsInfo: expressionsInfo.hintsInfo, numbersExps, numbersConstraints, maxTmp1, maxTmp3, maxArgs, maxOps
    };

    return res;
}

async function prepareVerifierExpressionsBin(starkInfo, verifierInfo) {
    
    let operations = getAllOperations();

    let maxTmp1 = 0;
    let maxTmp3 = 0;
    let maxArgs = 0;
    let maxOps = 0;
    let numbersExps = [];
    let {expsInfo: qCode} = getParserArgs(starkInfo, operations, verifierInfo.qVerifier, numbersExps, false, true, true);
    qCode.expId = starkInfo.cExpId;
    qCode.line = "";
    if (qCode.nTemp1 > maxTmp1) maxTmp1 = qCode.nTemp1;
    if (qCode.nTemp3 > maxTmp3) maxTmp3 = qCode.nTemp3;
    if (qCode.args.length > maxArgs) maxArgs = qCode.args.length;
    if (qCode.ops.length > maxOps) maxOps = qCode.ops.length;
    let {expsInfo: queryCode} = getParserArgs(starkInfo, operations, verifierInfo.queryVerifier, numbersExps, false, true);
    queryCode.expId = starkInfo.friExpId;
    queryCode.line = "";
    if (queryCode.nTemp1 > maxTmp1) maxTmp1 = queryCode.nTemp1;
    if (queryCode.nTemp3 > maxTmp3) maxTmp3 = queryCode.nTemp3;
    if (queryCode.args.length > maxArgs) maxArgs = queryCode.args.length;
    if (queryCode.ops.length > maxOps) maxOps = queryCode.ops.length;
   
    return {qCode, queryCode, numbersExps, maxTmp1, maxTmp3, maxArgs, maxOps};
}