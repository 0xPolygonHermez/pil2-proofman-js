const { getAllOperations, getGlobalOperations } = require("./utils");

module.exports.generateParser = function generateParser(parserType = "avx", global = false) {

    let operations = !global ? getAllOperations() : getGlobalOperations();

    let c_args = 0;
    
    if(!["avx", "avx512", "pack"].includes(parserType)) throw new Error("Invalid parser type");

    let isAvx = ["avx", "avx512"].includes(parserType);

    let avxTypeElement;
    let avxTypeExtElement;
    let avxSet1Epi64;
    let avxLoad;
    let avxStore;
    let avxCopy;

    if(isAvx) {
        avxTypeElement = parserType === "avx" ? "__m256i" : "__m512i";
        avxTypeExtElement = parserType === "avx" ? "Goldilocks3::Element_avx" : "Goldilocks3::Element_avx512";
        avxSet1Epi64 = parserType === "avx" ? "_mm256_set1_epi64x" : "_mm512_set1_epi64";
        avxLoad = parserType === "avx" ? "load_avx" : "load_avx512";
        avxStore = parserType === "avx" ? "store_avx" : "store_avx512";
        avxCopy = parserType === "avx" ? "copy_avx" : "copy_avx512";

    }

    const parserCPP = [];

    if(parserType === "avx") {
        parserCPP.push("uint64_t nrowsPack = 4;");
    } else if (parserType === "avx512") {
        parserCPP.push("uint64_t nrowsPack = 8;");
    } else {
        parserCPP.push("uint64_t nrowsPack;");
    }

    parserCPP.push(...[
        "uint64_t nCols;",
        "vector<uint64_t> nColsStages;",
        "vector<uint64_t> nColsStagesAcc;",
        "vector<uint64_t> offsetsStages;",
    ]);

    const expressionsClassName = parserType === "avx" ? `ExpressionsAvx` : parserType === "avx512" ? "ExpressionsAvx512" : "ExpressionsPack";

    if(isAvx) {
        parserCPP.push(`${expressionsClassName}(SetupCtx& setupCtx) : ExpressionsCtx(setupCtx) {};\n`);
    } else {
        parserCPP.push(`${expressionsClassName}(SetupCtx& setupCtx, uint64_t nrowsPack_ = 4) : ExpressionsCtx(setupCtx), nrowsPack(nrowsPack_) {};\n`);
    }
   

    parserCPP.push(`void setBufferTInfo(bool domainExtended, int64_t expId) {`);
    if(isAvx) {
        parserCPP.push(`    uint64_t nOpenings = setupCtx.starkInfo.openingPoints.size();`);
        parserCPP.push(`    uint64_t ns = 2 + setupCtx.starkInfo.nStages + setupCtx.starkInfo.customCommits.size();`);
    } else {
        // parserCPP.push(`    uint64_t nOpenings = setupCtx.starkInfo.verify ? 1 : setupCtx.starkInfo.openingPoints.size();`);
        parserCPP.push(`    uint64_t nOpenings = setupCtx.starkInfo.openingPoints.size();`);
        parserCPP.push(`    uint64_t ns = 2 + setupCtx.starkInfo.nStages + setupCtx.starkInfo.customCommits.size();`);
    }
        
    parserCPP.push(...[
        "    offsetsStages.resize(ns*nOpenings + 1);",
        "    nColsStages.resize(ns*nOpenings + 1);",
        "    nColsStagesAcc.resize(ns*nOpenings + 1);\n",
        "    nCols = setupCtx.starkInfo.nConstants;\n",
        "    for(uint64_t o = 0; o < nOpenings; ++o) {",
        "        for(uint64_t stage = 0; stage < ns; ++stage) {",
        "            if(stage == 0) {",
        "                offsetsStages[ns*o] = 0;",
        `                nColsStages[ns*o] = setupCtx.starkInfo.mapSectionsN["const"];`,
        "                nColsStagesAcc[ns*o] = o == 0 ? 0 : nColsStagesAcc[ns*o + stage - 1] + nColsStages[stage - 1];",
        "            } else if(stage < 2 + setupCtx.starkInfo.nStages) {",
        `                std::string section = "cm" + to_string(stage);`,
        "                offsetsStages[ns*o + stage] = setupCtx.starkInfo.mapOffsets[std::make_pair(section, domainExtended)];",
        "                nColsStages[ns*o + stage] = setupCtx.starkInfo.mapSectionsN[section];",
        "                nColsStagesAcc[ns*o + stage] = nColsStagesAcc[ns*o + stage - 1] + nColsStages[stage - 1];",
        "            } else {",
        "                uint64_t index = stage - setupCtx.starkInfo.nStages - 2;",
        `                std::string section = setupCtx.starkInfo.customCommits[index].name + "0";`,
        "                offsetsStages[ns*o + stage] = setupCtx.starkInfo.mapOffsets[std::make_pair(section, domainExtended)];",
        "                nColsStages[ns*o + stage] = setupCtx.starkInfo.mapSectionsN[section];",
        "                nColsStagesAcc[ns*o + stage] = nColsStagesAcc[ns*o + stage - 1] + nColsStages[stage - 1];",
        "            }",
        "        }",
        "    }\n",
        "    nColsStagesAcc[ns*nOpenings] = nColsStagesAcc[ns*nOpenings - 1] + nColsStages[ns*nOpenings - 1];",
        "    if(expId == int64_t(setupCtx.starkInfo.cExpId)) {",
        "        nCols = nColsStagesAcc[ns*nOpenings] + setupCtx.starkInfo.boundaries.size() + 1;",
        "    } else if(expId == int64_t(setupCtx.starkInfo.friExpId)) {",
        "        nCols = nColsStagesAcc[ns*nOpenings] + nOpenings*FIELD_EXTENSION;",
        "    } else {",
        "        nCols = nColsStagesAcc[ns*nOpenings] + 1;",
        "    }",
        "}\n",
    ]);
    
    if(isAvx) {
        parserCPP.push(...[
            `inline void loadPolynomials(StepsParams& params, ParserArgs &parserArgs, std::vector<Dest> &dests, ${avxTypeElement} *bufferT_, uint64_t row, uint64_t domainSize) {`,
            "    uint64_t nOpenings = setupCtx.starkInfo.openingPoints.size();",
            "    uint64_t ns = 2 + setupCtx.starkInfo.nStages + setupCtx.starkInfo.customCommits.size();",
            "    bool domainExtended = domainSize == uint64_t(1 << setupCtx.starkInfo.starkStruct.nBitsExt) ? true : false;\n",
            "    uint64_t extendBits = (setupCtx.starkInfo.starkStruct.nBitsExt - setupCtx.starkInfo.starkStruct.nBits);",
            "    int64_t extend = domainExtended ? (1 << extendBits) : 1;",
            "    uint64_t nextStrides[nOpenings];",
            "    for(uint64_t i = 0; i < nOpenings; ++i) {",
            "        uint64_t opening = setupCtx.starkInfo.openingPoints[i] < 0 ? setupCtx.starkInfo.openingPoints[i] + domainSize : setupCtx.starkInfo.openingPoints[i];",
            "        nextStrides[i] = opening * extend;",
            "    }\n",
            "    Goldilocks::Element *constPols = domainExtended ? &params.pConstPolsExtendedTreeAddress[2] : params.pConstPolsAddress;\n",
            "    std::vector<bool> constPolsUsed(setupCtx.starkInfo.constPolsMap.size(), false);",
            "    std::vector<bool> cmPolsUsed(setupCtx.starkInfo.cmPolsMap.size(), false);",
            "    std::vector<std::vector<bool>> customCommitsUsed(setupCtx.starkInfo.customCommits.size());",
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.customCommits.size(); ++i) {",
            "        customCommitsUsed[i] = std::vector<bool>(setupCtx.starkInfo.customCommits[i].stageWidths[0], false);",
            "    }\n",
            "    for(uint64_t i = 0; i < dests.size(); ++i) {",
            "        for(uint64_t j = 0; j < dests[i].params.size(); ++j) {",
            "            if(dests[i].params[j].op == opType::cm) {",
            "                cmPolsUsed[dests[i].params[j].polsMapId] = true;",
            "            } else if (dests[i].params[j].op == opType::const_) {",
            "                constPolsUsed[dests[i].params[j].polsMapId] = true;",
            "            } else if(dests[i].params[j].op == opType::tmp) {",
            "                uint16_t* cmUsed = &parserArgs.cmPolsIds[dests[i].params[j].parserParams.cmPolsOffset];",
            "                uint16_t* constUsed = &parserArgs.constPolsIds[dests[i].params[j].parserParams.constPolsOffset];\n",
            "                for(uint64_t k = 0; k < dests[i].params[j].parserParams.nConstPolsUsed; ++k) {",
            "                    constPolsUsed[constUsed[k]] = true;",
            "                }\n",
            "                for(uint64_t k = 0; k < dests[i].params[j].parserParams.nCmPolsUsed; ++k) {",
            "                    cmPolsUsed[cmUsed[k]] = true;",
            "                }\n",
            "                for(uint64_t k = 0; k < setupCtx.starkInfo.customCommits.size(); ++k) {",
            "                    uint16_t* customCmUsed = &parserArgs.customCommitsPolsIds[dests[i].params[j].parserParams.customCommitsOffset[k]];",
            "                    for(uint64_t l = 0; l < dests[i].params[j].parserParams.nCustomCommitsPolsUsed[k]; ++l) {",
            "                        customCommitsUsed[k][customCmUsed[l]] = true;",
            "                    }",
            "                }",
            "            }",
            "        }",
            "    }",
            "    Goldilocks::Element bufferT[nOpenings*nrowsPack];\n",
            "    for(uint64_t k = 0; k < constPolsUsed.size(); ++k) {",
            "        if(!constPolsUsed[k]) continue;",
            "        for(uint64_t o = 0; o < nOpenings; ++o) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                uint64_t l = (row + j + nextStrides[o]) % domainSize;",
            "                bufferT[nrowsPack*o + j] = constPols[l * nColsStages[0] + k];",
            "            }",
            `            Goldilocks::${avxLoad}(bufferT_[nColsStagesAcc[ns*o] + k], &bufferT[nrowsPack*o]);`,
            "        }",
            "    }\n",
            "    for(uint64_t k = 0; k < cmPolsUsed.size(); ++k) {",
            "        if(!cmPolsUsed[k]) continue;",
            "        PolMap polInfo = setupCtx.starkInfo.cmPolsMap[k];",
            "        uint64_t stage = polInfo.stage;",
            "        uint64_t stagePos = polInfo.stagePos;",
            "        for(uint64_t d = 0; d < polInfo.dim; ++d) {",
            "            for(uint64_t o = 0; o < nOpenings; ++o) {",
            "                for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                    uint64_t l = (row + j + nextStrides[o]) % domainSize;",
            "                    if(stage == 1 && !domainExtended) {",
            "                        bufferT[nrowsPack*o + j] = params.trace[l * nColsStages[stage] + stagePos + d];",
            "                    } else {",
            "                        bufferT[nrowsPack*o + j] = params.aux_trace[offsetsStages[stage] + l * nColsStages[stage] + stagePos + d];",
            "                    }",
            "                }",
            `                Goldilocks::${avxLoad}(bufferT_[nColsStagesAcc[ns*o + stage] + (stagePos + d)], &bufferT[nrowsPack*o]);`,
            "            }",
            "        }",
            "    }\n",
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.customCommits.size(); ++i) {",
            "        Goldilocks::Element *customCommits = domainExtended ? params.pCustomCommitsExtended[i] : params.pCustomCommits[i];",
            "        for(uint64_t j = 0; j < setupCtx.starkInfo.customCommits[i].stageWidths[0]; ++j) {",
            "            if(!customCommitsUsed[i][j]) continue;",
            "            PolMap polInfo = setupCtx.starkInfo.customCommitsMap[i][j];",
            "            uint64_t stage = setupCtx.starkInfo.nStages + 2 + i;",
            "            uint64_t stagePos = polInfo.stagePos;",
            "            for(uint64_t d = 0; d < polInfo.dim; ++d) {",
            "                for(uint64_t o = 0; o < nOpenings; ++o) {",
            "                    for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                        uint64_t l = (row + j + nextStrides[o]) % domainSize;",
            "                        bufferT[nrowsPack*o + j] = customCommits[offsetsStages[stage] + l * nColsStages[stage] + stagePos + d];",
            "                    }",
            "                    Goldilocks::load_avx(bufferT_[nColsStagesAcc[ns*o + stage] + (stagePos + d)], &bufferT[nrowsPack*o]);",
            "                }",
            "            }",
            "        }",
            "    }\n",
            "    if(dests[0].params[0].parserParams.expId == int64_t(setupCtx.starkInfo.cExpId)) {",
            "        for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "            bufferT[j] = setupCtx.proverHelpers.x_2ns[row + j];",
            "        }",
            `        Goldilocks::${avxLoad}(bufferT_[nColsStagesAcc[ns*nOpenings]], &bufferT[0]);`,
            "        for(uint64_t d = 0; d < setupCtx.starkInfo.boundaries.size(); ++d) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                bufferT[j] = setupCtx.proverHelpers.zi[row + j + d*domainSize];",
            "            }",
            `            Goldilocks::${avxLoad}(bufferT_[nColsStagesAcc[ns*nOpenings] + 1 + d], &bufferT[0]);`,
            "        }",
            "    } else if(dests[0].params[0].parserParams.expId == int64_t(setupCtx.starkInfo.friExpId)) {",
            "        for(uint64_t d = 0; d < setupCtx.starkInfo.openingPoints.size(); ++d) {",
            "           for(uint64_t k = 0; k < FIELD_EXTENSION; ++k) {",
            "                for(uint64_t j = 0; j < nrowsPack; ++j) {",
            `                    bufferT[j] = params.xDivXSub[(row + j + d*domainSize)*FIELD_EXTENSION + k];`,
            "                }",
            `                Goldilocks::${avxLoad}(bufferT_[nColsStagesAcc[ns*nOpenings] + d*FIELD_EXTENSION + k], &bufferT[0]);`,
            "            }",
            "        }",
            "    } else {",
            "        for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "            bufferT[j] = setupCtx.proverHelpers.x_n[row + j];",
            "        }",
            `        Goldilocks::${avxLoad}(bufferT_[nColsStagesAcc[ns*nOpenings]], &bufferT[0]);`,
            "    }",
            "}\n",
        ])
    } else {
        parserCPP.push(...[
            `inline void loadPolynomials(StepsParams& params, ParserArgs &parserArgs, std::vector<Dest> &dests, Goldilocks::Element *bufferT_, uint64_t row, uint64_t domainSize) {`,
            // "    uint64_t nOpenings = setupCtx.starkInfo.verify ? 1 : setupCtx.starkInfo.openingPoints.size();",
            "    uint64_t nOpenings = setupCtx.starkInfo.openingPoints.size();",
            "    uint64_t ns = 2 + setupCtx.starkInfo.nStages + setupCtx.starkInfo.customCommits.size();",
            "    bool domainExtended = domainSize == uint64_t(1 << setupCtx.starkInfo.starkStruct.nBitsExt) ? true : false;\n",
            "    uint64_t extendBits = (setupCtx.starkInfo.starkStruct.nBitsExt - setupCtx.starkInfo.starkStruct.nBits);",
            "    int64_t extend = domainExtended ? (1 << extendBits) : 1;",
            "    uint64_t nextStrides[nOpenings];",
            "    for(uint64_t i = 0; i < nOpenings; ++i) {",
            // "        uint64_t opening = setupCtx.starkInfo.verify ? 0 : setupCtx.starkInfo.openingPoints[i] < 0 ? setupCtx.starkInfo.openingPoints[i] + domainSize : setupCtx.starkInfo.openingPoints[i];",
            "        uint64_t opening = setupCtx.starkInfo.openingPoints[i] < 0 ? setupCtx.starkInfo.openingPoints[i] + domainSize : setupCtx.starkInfo.openingPoints[i];",
            "        nextStrides[i] = opening * extend;",
            "    }\n",
            "    Goldilocks::Element *constPols = domainExtended ? &params.pConstPolsExtendedTreeAddress[2] : params.pConstPolsAddress;\n",
            "    std::vector<bool> constPolsUsed(setupCtx.starkInfo.constPolsMap.size(), false);",
            "    std::vector<bool> cmPolsUsed(setupCtx.starkInfo.cmPolsMap.size(), false);",
            "    std::vector<std::vector<bool>> customCommitsUsed(setupCtx.starkInfo.customCommits.size());",
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.customCommits.size(); ++i) {",
            "        customCommitsUsed[i] = std::vector<bool>(setupCtx.starkInfo.customCommits[i].stageWidths[0], false);",
            "    }\n",
            "    for(uint64_t i = 0; i < dests.size(); ++i) {",
            "        for(uint64_t j = 0; j < dests[i].params.size(); ++j) {",
            "            if(dests[i].params[j].op == opType::cm) {",
            "                cmPolsUsed[dests[i].params[j].polsMapId] = true;",
            "            } else if (dests[i].params[j].op == opType::const_) {",
            "                constPolsUsed[dests[i].params[j].polsMapId] = true;",
            "            } else if(dests[i].params[j].op == opType::tmp) {",
            "                uint16_t* cmUsed = &parserArgs.cmPolsIds[dests[i].params[j].parserParams.cmPolsOffset];",
            "                uint16_t* constUsed = &parserArgs.constPolsIds[dests[i].params[j].parserParams.constPolsOffset];\n",
            "                for(uint64_t k = 0; k < dests[i].params[j].parserParams.nConstPolsUsed; ++k) {",
            "                    constPolsUsed[constUsed[k]] = true;",
            "                }\n",
            "                for(uint64_t k = 0; k < dests[i].params[j].parserParams.nCmPolsUsed; ++k) {",
            "                    cmPolsUsed[cmUsed[k]] = true;",
            "                }\n",
            "                for(uint64_t k = 0; k < setupCtx.starkInfo.customCommits.size(); ++k) {",
            "                    uint16_t* customCmUsed = &parserArgs.customCommitsPolsIds[dests[i].params[j].parserParams.customCommitsOffset[k]];",
            "                    for(uint64_t l = 0; l < dests[i].params[j].parserParams.nCustomCommitsPolsUsed[k]; ++l) {",
            "                        customCommitsUsed[k][customCmUsed[l]] = true;",
            "                    }",
            "                }",
            "            }",
            "        }",
            "    }",
            "    for(uint64_t k = 0; k < constPolsUsed.size(); ++k) {",
            "        if(!constPolsUsed[k]) continue;",
            "        for(uint64_t o = 0; o < nOpenings; ++o) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                uint64_t l = (row + j + nextStrides[o]) % domainSize;",
            "                bufferT_[(nColsStagesAcc[ns*o] + k)*nrowsPack + j] = constPols[l * nColsStages[0] + k];",
            "            }",
            "        }",
            "    }\n",
            "    for(uint64_t k = 0; k < cmPolsUsed.size(); ++k) {",
            "        if(!cmPolsUsed[k]) continue;",
            "        PolMap polInfo = setupCtx.starkInfo.cmPolsMap[k];",
            "        uint64_t stage = polInfo.stage;",
            "        uint64_t stagePos = polInfo.stagePos;",
            "        for(uint64_t d = 0; d < polInfo.dim; ++d) {",
            "            for(uint64_t o = 0; o < nOpenings; ++o) {",
            "                for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                    uint64_t l = (row + j + nextStrides[o]) % domainSize;",
            "                    if(stage == 1 && !domainExtended) {",
            "                        bufferT_[(nColsStagesAcc[ns*o + stage] + (stagePos + d))*nrowsPack + j] = params.trace[l * nColsStages[stage] + stagePos + d];",
            "                    } else {",
            "                        bufferT_[(nColsStagesAcc[ns*o + stage] + (stagePos + d))*nrowsPack + j] = params.aux_trace[offsetsStages[stage] + l * nColsStages[stage] + stagePos + d];",
            "                    }",
            "                }",
            "            }",
            "        }",
            "    }\n",
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.customCommits.size(); ++i) {",
            "        Goldilocks::Element *customCommits = domainExtended ? params.pCustomCommitsExtended[i] : params.pCustomCommits[i];",
            "        for(uint64_t j = 0; j < setupCtx.starkInfo.customCommits[i].stageWidths[0]; ++j) {",
            "            if(!customCommitsUsed[i][j]) continue;",
            "            PolMap polInfo = setupCtx.starkInfo.customCommitsMap[i][j];",
            "            uint64_t stage = setupCtx.starkInfo.nStages + 2 + i;",
            "            uint64_t stagePos = polInfo.stagePos;",
            "            for(uint64_t d = 0; d < polInfo.dim; ++d) {",
            "                for(uint64_t o = 0; o < nOpenings; ++o) {",
            "                    for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                        uint64_t l = (row + j + nextStrides[o]) % domainSize;",
            "                        bufferT_[(nColsStagesAcc[ns*o + stage] + (stagePos + d))*nrowsPack + j] = customCommits[offsetsStages[stage] + l * nColsStages[stage] + stagePos + d];",
            "                    }",
            "                }",
            "            }",
            "        }",
            "    }\n",
            "    if(dests[0].params[0].parserParams.expId == int64_t(setupCtx.starkInfo.cExpId)) {",
            "        for(uint64_t d = 0; d < setupCtx.starkInfo.boundaries.size(); ++d) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            // "                if(setupCtx.starkInfo.verify) {",
            // "                    for(uint64_t e = 0; e < FIELD_EXTENSION; ++e) {",
            // "                        bufferT_[((nColsStagesAcc[ns*nOpenings] + d + FIELD_EXTENSION)*nrowsPack + j) + e] = setupCtx.proverHelpers.zi[d*FIELD_EXTENSION + e];",
            // "                    }",
            // "                } else {",
            "                bufferT_[(nColsStagesAcc[ns*nOpenings] + d + 1)*nrowsPack + j] = setupCtx.proverHelpers.zi[row + j + d*domainSize];",
            // "                }",
            "            }",
            "        }",
            "        for(uint64_t j = 0; j < nrowsPack; ++j) {",
            // "            if(setupCtx.starkInfo.verify) {",
            // "                for(uint64_t e = 0; e < FIELD_EXTENSION; ++e) {",
            // "                    bufferT_[((nColsStagesAcc[ns*nOpenings])*nrowsPack + j)*FIELD_EXTENSION + e] = setupCtx.proverHelpers.x_n[e];",
            // "                }",
            // "            } else {",
            "            bufferT_[(nColsStagesAcc[ns*nOpenings])*nrowsPack + j] = setupCtx.proverHelpers.x_2ns[row + j];",
            // "            }",
            "        }",
            "    } else if(dests[0].params[0].parserParams.expId == int64_t(setupCtx.starkInfo.friExpId)) {",
            "        for(uint64_t d = 0; d < setupCtx.starkInfo.openingPoints.size(); ++d) {",
            "           for(uint64_t k = 0; k < FIELD_EXTENSION; ++k) {",
            "                for(uint64_t j = 0; j < nrowsPack; ++j) {",
            `                    bufferT_[(nColsStagesAcc[ns*nOpenings] + d*FIELD_EXTENSION + k)*nrowsPack + j] = params.xDivXSub[(row + j + d*domainSize)*FIELD_EXTENSION + k];`,
            "                }",
            "            }",
            "        }",
            "    } else {",
            "        for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "            bufferT_[(nColsStagesAcc[ns*nOpenings])*nrowsPack + j] = setupCtx.proverHelpers.x_n[row + j];",
            "        }",
            "    }",
            "}\n",
        ])
    }
    
    parserCPP.push(...[
        `inline void copyPolynomial(${isAvx ? avxTypeElement : "Goldilocks::Element"}* destVals, bool inverse${!isAvx ? ", bool batch" :""}, uint64_t dim, ${isAvx ? avxTypeElement : "Goldilocks::Element"}* tmp) {`,
        "    if(dim == 1) {",
        "        if(inverse) {",
    ]);

    if(!isAvx) {
        parserCPP.push(...[
            "            if(batch) {",
            "                Goldilocks::batchInverse(&destVals[0], &tmp[0], nrowsPack);",
            "            } else {",
            "                for(uint64_t i = 0; i < nrowsPack; ++i) {",
            "                    Goldilocks::inv(destVals[i], tmp[i]);",
            "                }",
            "            }",
        ])
    } else {
        parserCPP.push(...[
            "            Goldilocks::Element buff[nrowsPack];",
            `            Goldilocks::${avxStore}(buff, tmp[0]);`,
            "            Goldilocks::batchInverse(buff, buff, nrowsPack);",
            `            Goldilocks::${avxLoad}(destVals[0], buff);`,
        ]);
    }

    parserCPP.push(...[
        "        } else {",
        `            Goldilocks::${isAvx ? avxCopy : "copy_pack"}(${!isAvx ? "nrowsPack, &destVals[0]" : "destVals[0]"},${!isAvx ? " &tmp[0]" : "tmp[0]"});`,
        "        }",
        "    } else if(dim == FIELD_EXTENSION) {",
        "        if(inverse) {",
        "            Goldilocks::Element buff[FIELD_EXTENSION*nrowsPack];",
        `            Goldilocks::${isAvx ? avxStore : "copy_pack"}(${!isAvx ? "nrowsPack," : ""} &buff[0], uint64_t(FIELD_EXTENSION), ${!isAvx ? "&tmp[0]" : "tmp[0]"});`,
        `            Goldilocks::${isAvx ? avxStore : "copy_pack"}(${!isAvx ? "nrowsPack," : ""} &buff[1], uint64_t(FIELD_EXTENSION), ${!isAvx ? "&tmp[nrowsPack]" : "tmp[1]"});`,
        `            Goldilocks::${isAvx ? avxStore : "copy_pack"}(${!isAvx ? "nrowsPack," : ""} &buff[2], uint64_t(FIELD_EXTENSION), ${!isAvx ? "&tmp[2*nrowsPack]" : "tmp[2]"});`,
    ]);
    if(isAvx) {
        parserCPP.push("            Goldilocks3::batchInverse((Goldilocks3::Element *)buff, (Goldilocks3::Element *)buff, nrowsPack);");
    } else {
        parserCPP.push(...[
            "            if(batch) {",
            "                Goldilocks3::batchInverse((Goldilocks3::Element *)buff, (Goldilocks3::Element *)buff, nrowsPack);",
            "            } else {",
            "                for(uint64_t i = 0; i < nrowsPack; ++i) {",
            "                    Goldilocks3::inv((Goldilocks3::Element &)buff[i*FIELD_EXTENSION], (Goldilocks3::Element &)buff[i*FIELD_EXTENSION]);",
            "                }",
            "            }",
        ])
    }
    parserCPP.push(...[    
        `            Goldilocks::${isAvx ? avxLoad : "copy_pack"}(${!isAvx ? "nrowsPack, &destVals[0]" : "destVals[0]"}, &buff[0], uint64_t(FIELD_EXTENSION));`,
        `            Goldilocks::${isAvx ? avxLoad : "copy_pack"}(${!isAvx ? "nrowsPack, &destVals[nrowsPack]" : "destVals[1]"}, &buff[1], uint64_t(FIELD_EXTENSION));`,
        `            Goldilocks::${isAvx ? avxLoad : "copy_pack"}(${!isAvx ? "nrowsPack, &destVals[2*nrowsPack]" : "destVals[2]"}, &buff[2], uint64_t(FIELD_EXTENSION));`,
        "        } else {",
        `            Goldilocks::${isAvx ? avxCopy : "copy_pack"}(${!isAvx ? "nrowsPack, &destVals[0]" : "destVals[0]"}, ${!isAvx ? "&tmp[0]" : "tmp[0]"});`,
        `            Goldilocks::${isAvx ? avxCopy : "copy_pack"}(${!isAvx ? "nrowsPack, &destVals[nrowsPack]" : "destVals[1]"},${!isAvx ? " &tmp[nrowsPack]" : "tmp[1]"});`,
        `            Goldilocks::${isAvx ? avxCopy : "copy_pack"}(${!isAvx ? "nrowsPack, &destVals[2*nrowsPack]" : "destVals[2]"},${!isAvx ? " &tmp[2*nrowsPack]" : "tmp[2]"});`,
        "        }",
        "    }",
        "}\n",
    ]);

    if(isAvx) {
        parserCPP.push(...[
            `inline void multiplyPolynomials(Dest &dest, ${avxTypeElement}* destVals) {`,
            "    if(dest.dim == 1) {",
            `        Goldilocks::op_${parserType}(2, destVals[0], destVals[0], destVals[FIELD_EXTENSION]);`,
            "    } else {",
            `        ${avxTypeElement} vals3[FIELD_EXTENSION];`,
            `        if(dest.params[0].dim == FIELD_EXTENSION && dest.params[1].dim == FIELD_EXTENSION) {`,
            `            Goldilocks3::op_${parserType}(2, (${avxTypeExtElement} &)vals3, (${avxTypeExtElement} &)destVals[0], (${avxTypeExtElement} &)destVals[FIELD_EXTENSION]);`,
            `        } else if(dest.params[0].dim == FIELD_EXTENSION && dest.params[1].dim == 1) {`,
            `            Goldilocks3::op_31_${parserType}(2, (${avxTypeExtElement} &)vals3, (${avxTypeExtElement} &)destVals[0], destVals[FIELD_EXTENSION]);`,
            `        } else {`,
            `            Goldilocks3::op_31_${parserType}(2, (${avxTypeExtElement} &)vals3, (${avxTypeExtElement} &)destVals[FIELD_EXTENSION], destVals[0]);`,
            `        }`,
            `        Goldilocks::${avxCopy}(destVals[0], vals3[0]);`,
            `        Goldilocks::${avxCopy}(destVals[1], vals3[1]);`,
            `        Goldilocks::${avxCopy}(destVals[2], vals3[2]);`,
            "    }",
            "}\n",
        ]);

        parserCPP.push(...[
            `inline void storePolynomial(std::vector<Dest> dests, ${avxTypeElement}** destVals, uint64_t row) {`,
            "    for(uint64_t i = 0; i < dests.size(); ++i) {",
            "        if(dests[i].dim == 1) {",
            "            uint64_t offset = dests[i].offset != 0 ? dests[i].offset : 1;",
            `            Goldilocks::${avxStore}(&dests[i].dest[row*offset], uint64_t(offset), destVals[i][0]);`,
            "        } else {",
            "            uint64_t offset = dests[i].offset != 0 ? dests[i].offset : FIELD_EXTENSION;",
            `            Goldilocks::${avxStore}(&dests[i].dest[row*offset], uint64_t(offset), destVals[i][0]);`,
            `            Goldilocks::${avxStore}(&dests[i].dest[row*offset + 1], uint64_t(offset),destVals[i][1]);`,
            `            Goldilocks::${avxStore}(&dests[i].dest[row*offset + 2], uint64_t(offset), destVals[i][2]);`,
            "        }",
            "    }",
            "}\n",
        ]);
    } else {
        parserCPP.push(...[
            `inline void multiplyPolynomials(Dest &dest, Goldilocks::Element* destVals) {`,
            "    if(dest.dim == 1) {",
            `        Goldilocks::op_pack(nrowsPack, 2, &destVals[0], &destVals[0], &destVals[FIELD_EXTENSION*nrowsPack]);`,
            "    } else {",
            `        Goldilocks::Element vals[FIELD_EXTENSION*nrowsPack];`,
            `        if(dest.params[0].dim == FIELD_EXTENSION && dest.params[1].dim == FIELD_EXTENSION) {`,
            `            Goldilocks3::op_${parserType}(nrowsPack, 2, &vals[0], &destVals[0], &destVals[FIELD_EXTENSION*nrowsPack]);`,
            `        } else if(dest.params[0].dim == FIELD_EXTENSION && dest.params[1].dim == 1) {`,
            `            Goldilocks3::op_31_${parserType}(nrowsPack, 2, &vals[0], &destVals[0], &destVals[FIELD_EXTENSION*nrowsPack]);`,
            `        } else {`,
            `            Goldilocks3::op_31_${parserType}(nrowsPack, 2, &vals[0], &destVals[FIELD_EXTENSION*nrowsPack], &destVals[0]);`,
            `        }`,
            `        Goldilocks::copy_pack(nrowsPack, &destVals[0], &vals[0]);`,
            `        Goldilocks::copy_pack(nrowsPack, &destVals[nrowsPack], &vals[nrowsPack]);`,
            `        Goldilocks::copy_pack(nrowsPack, &destVals[2*nrowsPack], &vals[2*nrowsPack]);`,
            "    }",
            "}\n",
        ]);

        parserCPP.push(...[
            `inline void storePolynomial(std::vector<Dest> dests, Goldilocks::Element** destVals, uint64_t row) {`,
            "    for(uint64_t i = 0; i < dests.size(); ++i) {",           
            "        if(dests[i].dim == 1) {",
            "            uint64_t offset = dests[i].offset != 0 ? dests[i].offset : 1;",
            `            Goldilocks::copy_pack(nrowsPack, &dests[i].dest[row*offset], uint64_t(offset), &destVals[i][0]);`,
            "        } else {",
            "            uint64_t offset = dests[i].offset != 0 ? dests[i].offset : FIELD_EXTENSION;",
            `            Goldilocks::copy_pack(nrowsPack, &dests[i].dest[row*offset], uint64_t(offset), &destVals[i][0]);`,
            `            Goldilocks::copy_pack(nrowsPack, &dests[i].dest[row*offset + 1], uint64_t(offset), &destVals[i][nrowsPack]);`,
            `            Goldilocks::copy_pack(nrowsPack, &dests[i].dest[row*offset + 2], uint64_t(offset), &destVals[i][2*nrowsPack]);`,
            "        }",
            "    }",
            "}\n",
        ]);
    }
    

    parserCPP.push(...[
        `inline void printTmp1(uint64_t row, ${isAvx ? avxTypeElement : "Goldilocks::Element*"} tmp) {`,
        "    Goldilocks::Element buff[nrowsPack];",
        `    Goldilocks::${isAvx ? avxStore : "copy_pack"}(${!isAvx ? "nrowsPack, " : ""}buff, tmp);`,
        "    for(uint64_t i = 0; i < nrowsPack; ++i) {",
        `        cout << "Value at row " << row + i << " is " << Goldilocks::toString(buff[i]) << endl;`,
        "    }",
        "}\n"
    ]);
    
    if(!isAvx) {
        parserCPP.push(...[
            `inline void printTmp3(uint64_t row, Goldilocks::Element* tmp) {`,     
            "    for(uint64_t i = 0; i < nrowsPack; ++i) {",
            `        cout << "Value at row " << row + i << " is [" << Goldilocks::toString(tmp[i]) << ", " << Goldilocks::toString(tmp[nrowsPack + i]) << ", " << Goldilocks::toString(tmp[2*nrowsPack + i]) << "]" << endl;`,
            "    }",
            "}\n",
        ]);
    } else {
        parserCPP.push(...[
            `inline void printTmp3(uint64_t row, ${avxTypeExtElement} tmp) {`,
            "    Goldilocks::Element buff[FIELD_EXTENSION*nrowsPack];",
            `    Goldilocks::${avxStore}(&buff[0], uint64_t(FIELD_EXTENSION), tmp[0]);`,
            `    Goldilocks::${avxStore}(&buff[1], uint64_t(FIELD_EXTENSION), tmp[1]);`,
            `    Goldilocks::${avxStore}(&buff[2], uint64_t(FIELD_EXTENSION), tmp[2]);`,
            "    for(uint64_t i = 0; i < 1; ++i) {",
            `        cout << "Value at row " << row + i << " is [" << Goldilocks::toString(buff[FIELD_EXTENSION*i]) << ", " << Goldilocks::toString(buff[FIELD_EXTENSION*i + 1]) << ", " << Goldilocks::toString(buff[FIELD_EXTENSION*i + 2]) << "]" << endl;`,
            "    }",
            "}\n",
        ]);
    }
   
    
    parserCPP.push(...[
        `inline void printCommit(uint64_t row, ${isAvx ? avxTypeElement : "Goldilocks::Element"}* bufferT, bool extended) {`,
        "    if(extended) {",
        "        Goldilocks::Element buff[FIELD_EXTENSION*nrowsPack];",
        `        Goldilocks::${isAvx ? avxStore : "copy_pack"}(${!isAvx ? "nrowsPack, " : ""}&buff[0], uint64_t(FIELD_EXTENSION), ${!isAvx ? "&bufferT[0]" : "bufferT[0]"});`,
        `        Goldilocks::${isAvx ? avxStore : "copy_pack"}(${!isAvx ? "nrowsPack, " : ""}&buff[1], uint64_t(FIELD_EXTENSION), ${!isAvx ? "&bufferT[setupCtx.starkInfo.openingPoints.size()]" : "bufferT[setupCtx.starkInfo.openingPoints.size()]"});`,
        `        Goldilocks::${isAvx ? avxStore : "copy_pack"}(${!isAvx ? "nrowsPack, " : ""}&buff[2], uint64_t(FIELD_EXTENSION), ${!isAvx ? "&bufferT[2*setupCtx.starkInfo.openingPoints.size()]" : "bufferT[2*setupCtx.starkInfo.openingPoints.size()]"});`,
        "        for(uint64_t i = 0; i < 1; ++i) {",
        `            cout << "Value at row " << row + i << " is [" << Goldilocks::toString(buff[FIELD_EXTENSION*i]) << ", " << Goldilocks::toString(buff[FIELD_EXTENSION*i + 1]) << ", " << Goldilocks::toString(buff[FIELD_EXTENSION*i + 2]) << "]" << endl;`,
        "        }",
        "    } else {",
        "        Goldilocks::Element buff[nrowsPack];",
        `        Goldilocks::${isAvx ? avxStore : "copy_pack"}(${!isAvx ? "nrowsPack, " : ""}&buff[0], ${!isAvx ? "&bufferT[0]" : "bufferT[0]"});`,
        "        for(uint64_t i = 0; i < nrowsPack; ++i) {",
        `            cout << "Value at row " << row + i << " is " << Goldilocks::toString(buff[i]) << endl;`,
        "        }",
        "    }",
        "}\n",
    ]);
    
    parserCPP.push(...[
        `void calculateExpressions(StepsParams& params, ParserArgs &parserArgs, std::vector<Dest> dests, uint64_t domainSize, bool compilation_time) override {`,
        "    uint64_t nOpenings = setupCtx.starkInfo.openingPoints.size();",
        "    uint64_t ns = 2 + setupCtx.starkInfo.nStages + setupCtx.starkInfo.customCommits.size();",
        "    bool domainExtended = domainSize == uint64_t(1 << setupCtx.starkInfo.starkStruct.nBitsExt) ? true : false;\n",
    ]);

    
    parserCPP.push("    uint64_t expId = dests[0].params[0].op == opType::tmp ? dests[0].params[0].parserParams.destDim : 0;");
    parserCPP.push("    setBufferTInfo(domainExtended, expId);\n")
      
    if(isAvx) {
        parserCPP.push(...[
            `    ${avxTypeExtElement} challenges[setupCtx.starkInfo.challengesMap.size()];`,
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.challengesMap.size(); ++i) {",
            `        challenges[i][0] = ${avxSet1Epi64}(params.challenges[i * FIELD_EXTENSION].fe);`,
            `        challenges[i][1] = ${avxSet1Epi64}(params.challenges[i * FIELD_EXTENSION + 1].fe);`,
            `        challenges[i][2] = ${avxSet1Epi64}(params.challenges[i * FIELD_EXTENSION + 2].fe);\n`,
            "    }\n",
        ]);

        parserCPP.push(...[
            `    ${avxTypeElement} numbers_[parserArgs.nNumbers];`,
            "    for(uint64_t i = 0; i < parserArgs.nNumbers; ++i) {",
            `        numbers_[i] = ${avxSet1Epi64}(parserArgs.numbers[i]);`,
            "    }\n",
        ])
    
        parserCPP.push(...[
            `    ${avxTypeElement} publics[setupCtx.starkInfo.nPublics];`,
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.nPublics; ++i) {",
            `        publics[i] = ${avxSet1Epi64}(params.publicInputs[i].fe);`,
            "    }\n",
        ]);

        parserCPP.push(...[
            "    uint64_t p = 0;",
            `    ${avxTypeExtElement} proofValues[setupCtx.starkInfo.proofValuesMap.size()];`,
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.proofValuesMap.size(); ++i) {",
            "        if(setupCtx.starkInfo.proofValuesMap[i].stage == 1) {",
            `           proofValues[i][0] = ${avxSet1Epi64}(params.proofValues[p].fe);`,
            `           proofValues[i][1] = ${avxSet1Epi64}(0);`,
            `           proofValues[i][2] = ${avxSet1Epi64}(0);`,
            "           p += 1;",
            "        } else {",
            `           proofValues[i][0] = ${avxSet1Epi64}(params.proofValues[p].fe);`,
            `           proofValues[i][1] = ${avxSet1Epi64}(params.proofValues[p + 1].fe);`,
            `           proofValues[i][2] = ${avxSet1Epi64}(params.proofValues[p + 2].fe);`,
            "           p += 3;",
            "        }",
            "    }\n",
        ]);
    
        parserCPP.push(...[
            `    ${avxTypeExtElement} airgroupValues[setupCtx.starkInfo.airgroupValuesMap.size()];`,
            "    p = 0;",
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.airgroupValuesMap.size(); ++i) {",
            "        if(setupCtx.starkInfo.airgroupValuesMap[i].stage == 1) {",
            `           airgroupValues[i][0] = ${avxSet1Epi64}(params.airgroupValues[p].fe);`,
            `           airgroupValues[i][1] = ${avxSet1Epi64}(0);`,
            `           airgroupValues[i][2] = ${avxSet1Epi64}(0);`,
            "           p += 1;",
            "        } else {",
            `           airgroupValues[i][0] = ${avxSet1Epi64}(params.airgroupValues[p].fe);`,
            `           airgroupValues[i][1] = ${avxSet1Epi64}(params.airgroupValues[p+ 1].fe);`,
            `           airgroupValues[i][2] = ${avxSet1Epi64}(params.airgroupValues[p+ 2].fe);`,
            "           p += 3;",
            "        }",
            "    }\n",
        ]);

        parserCPP.push(...[
            `    ${avxTypeExtElement} airValues[setupCtx.starkInfo.airValuesMap.size()];`,
            "    p = 0;",
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.airValuesMap.size(); ++i) {",
            "        if(setupCtx.starkInfo.airValuesMap[i].stage == 1) {",
            `           airValues[i][0] = ${avxSet1Epi64}(params.airValues[p].fe);`,
            `           airValues[i][1] = ${avxSet1Epi64}(0);`,
            `           airValues[i][2] = ${avxSet1Epi64}(0);`,
            "           p += 1;",
            "        } else {",
            `           airValues[i][0] = ${avxSet1Epi64}(params.airValues[p].fe);`,
            `           airValues[i][1] = ${avxSet1Epi64}(params.airValues[p + 1].fe);`,
            `           airValues[i][2] = ${avxSet1Epi64}(params.airValues[p + 2].fe);`,
            "           p += 3;",
            "        }",
            "    }\n",
        ]);
    
        parserCPP.push(...[
            `    ${avxTypeExtElement} evals[setupCtx.starkInfo.evMap.size()];`,
            "    for(uint64_t i = 0; i < setupCtx.starkInfo.evMap.size(); ++i) {",
            `        evals[i][0] = ${avxSet1Epi64}(params.evals[i * FIELD_EXTENSION].fe);`,
            `        evals[i][1] = ${avxSet1Epi64}(params.evals[i * FIELD_EXTENSION + 1].fe);`,
            `        evals[i][2] = ${avxSet1Epi64}(params.evals[i * FIELD_EXTENSION + 2].fe);`,
            "    }\n",
        ]);

    } else {
        parserCPP.push(...[
            `    Goldilocks::Element challenges[setupCtx.starkInfo.challengesMap.size()*FIELD_EXTENSION*nrowsPack];`,
            "    if(!compilation_time) {",
            "        for(uint64_t i = 0; i < setupCtx.starkInfo.challengesMap.size(); ++i) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            `                challenges[(i*FIELD_EXTENSION)*nrowsPack + j] = params.challenges[i * FIELD_EXTENSION];`,
            `                challenges[(i*FIELD_EXTENSION + 1)*nrowsPack + j] = params.challenges[i * FIELD_EXTENSION + 1];`,
            `                challenges[(i*FIELD_EXTENSION + 2)*nrowsPack + j] = params.challenges[i * FIELD_EXTENSION + 2];`,
            "            }",
            "        }",
            "    }\n",
        ]);
        parserCPP.push(...[
            `    Goldilocks::Element numbers_[parserArgs.nNumbers*nrowsPack];`,
            "    for(uint64_t i = 0; i < parserArgs.nNumbers; ++i) {",
            "        for(uint64_t k = 0; k < nrowsPack; ++k) {",
            `            numbers_[i*nrowsPack + k] = Goldilocks::fromU64(parserArgs.numbers[i]);`,
            "        }",
            "    }\n",
        ])

        parserCPP.push(...[
            "    Goldilocks::Element publics[setupCtx.starkInfo.nPublics*nrowsPack];",
            "    if(!compilation_time) {",
            "        for(uint64_t i = 0; i < setupCtx.starkInfo.nPublics; ++i) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            `                publics[i*nrowsPack + j] = params.publicInputs[i];`,
            "            }",
            "        }",
            "    }\n",
        ])

        parserCPP.push(...[
            `    Goldilocks::Element evals[setupCtx.starkInfo.evMap.size()*FIELD_EXTENSION*nrowsPack];`,
            "    if(!compilation_time) {",
            "        for(uint64_t i = 0; i < setupCtx.starkInfo.evMap.size(); ++i) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            `                evals[(i*FIELD_EXTENSION)*nrowsPack + j] = params.evals[i * FIELD_EXTENSION];`,
            `                evals[(i*FIELD_EXTENSION + 1)*nrowsPack + j] = params.evals[i * FIELD_EXTENSION + 1];`,
            `                evals[(i*FIELD_EXTENSION + 2)*nrowsPack + j] = params.evals[i * FIELD_EXTENSION + 2];`,
            "            }",
            "        }",
            "    }\n",
        ]);

        parserCPP.push(...[
            `    Goldilocks::Element airgroupValues[setupCtx.starkInfo.airgroupValuesMap.size()*FIELD_EXTENSION*nrowsPack];`,
            "    if(!compilation_time) {",
            "        uint64_t p = 0;",
            "        for(uint64_t i = 0; i < setupCtx.starkInfo.airgroupValuesMap.size(); ++i) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                if(setupCtx.starkInfo.airgroupValuesMap[i].stage == 1) {",
            `                    airgroupValues[(i*FIELD_EXTENSION)*nrowsPack + j] = params.airgroupValues[p];`,
            `                    airgroupValues[(i*FIELD_EXTENSION + 1)*nrowsPack + j] = Goldilocks::zero();`,
            `                    airgroupValues[(i*FIELD_EXTENSION + 2)*nrowsPack + j] = Goldilocks::zero();`,
            "                    p += 1;",
            "                } else {",
            `                    airgroupValues[(i*FIELD_EXTENSION)*nrowsPack + j] = params.airgroupValues[p];`,
            `                    airgroupValues[(i*FIELD_EXTENSION + 1)*nrowsPack + j] = params.airgroupValues[p + 1];`,
            `                    airgroupValues[(i*FIELD_EXTENSION + 2)*nrowsPack + j] = params.airgroupValues[p + 2];`,
            "                    p += 3;",
            "                }",
            "            }",
            "        }",
            "    }\n",
        ]);

        parserCPP.push(...[
            `    Goldilocks::Element proofValues[setupCtx.starkInfo.proofValuesMap.size()*FIELD_EXTENSION*nrowsPack];`,
            "    if(!compilation_time) {",
            "        uint64_t p = 0;",
            "        for(uint64_t i = 0; i < setupCtx.starkInfo.proofValuesMap.size(); ++i) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                if(setupCtx.starkInfo.proofValuesMap[i].stage == 1) {",
            `                    proofValues[(i*FIELD_EXTENSION)*nrowsPack + j] = params.proofValues[p];`,
            `                    proofValues[(i*FIELD_EXTENSION + 1)*nrowsPack + j] = Goldilocks::zero();`,
            `                    proofValues[(i*FIELD_EXTENSION + 2)*nrowsPack + j] = Goldilocks::zero();`,
            "                    p += 1;",
            "                } else {",
            `                    proofValues[(i*FIELD_EXTENSION)*nrowsPack + j] = params.proofValues[p];`,
            `                    proofValues[(i*FIELD_EXTENSION + 1)*nrowsPack + j] = params.proofValues[p + 1];`,
            `                    proofValues[(i*FIELD_EXTENSION + 2)*nrowsPack + j] = params.proofValues[p + 2];`,
            "                    p += 3;",
            "                }",
            "            }",
            "        }",
            "    }\n",
        ]);

        parserCPP.push(...[
            `    Goldilocks::Element airValues[setupCtx.starkInfo.airValuesMap.size()*FIELD_EXTENSION*nrowsPack];`,
            "    if(!compilation_time) {",
            "        uint64_t p = 0;",
            "        for(uint64_t i = 0; i < setupCtx.starkInfo.airValuesMap.size(); ++i) {",
            "            for(uint64_t j = 0; j < nrowsPack; ++j) {",
            "                if(setupCtx.starkInfo.airValuesMap[i].stage == 1) {",
            `                    airValues[(i*FIELD_EXTENSION)*nrowsPack + j] = params.airValues[p];`,
            `                    airValues[(i*FIELD_EXTENSION + 1)*nrowsPack + j] = Goldilocks::zero();`,
            `                    airValues[(i*FIELD_EXTENSION + 2)*nrowsPack + j] = Goldilocks::zero();`,
            "                    p += 1;",
            "                } else {",
            `                    airValues[(i*FIELD_EXTENSION)*nrowsPack + j] = params.airValues[p];`,
            `                    airValues[(i*FIELD_EXTENSION + 1)*nrowsPack + j] = params.airValues[p + 1];`,
            `                    airValues[(i*FIELD_EXTENSION + 2)*nrowsPack + j] = params.airValues[p + 2];`,
            "                    p += 3;",
            "                }",
            "            }",
            "        }",
            "    }\n",
        ]);
    }

    parserCPP.push(...[
        `#pragma omp parallel for`,
        `    for (uint64_t i = 0; i < domainSize; i+= nrowsPack) {`,
    ]);

    if(isAvx) {
        parserCPP.push(`        ${avxTypeElement} bufferT_[nOpenings*nCols];\n`);
    } else {
        parserCPP.push(`        Goldilocks::Element bufferT_[nOpenings*nCols*nrowsPack];\n`);    
    }
    

    if(isAvx) {
        parserCPP.push("        loadPolynomials(params, parserArgs, dests, bufferT_, i, domainSize);\n");
        parserCPP.push(`        ${avxTypeElement}** destVals = new ${avxTypeElement}*[dests.size()];\n`); 
    } else {
        parserCPP.push("        if(!compilation_time) loadPolynomials(params, parserArgs, dests, bufferT_, i, domainSize);\n");
        parserCPP.push(`        Goldilocks::Element **destVals = new Goldilocks::Element*[dests.size()];\n`); 
    }

    parserCPP.push(...[
        "        for(uint64_t j = 0; j < dests.size(); ++j) {",
        `            destVals[j] = new ${isAvx ? avxTypeElement : "Goldilocks::Element"}[dests[j].params.size() * FIELD_EXTENSION${!isAvx ? "* nrowsPack" : ""}];`,
        "            for(uint64_t k = 0; k < dests[j].params.size(); ++k) {",
        "                uint64_t i_args = 0;\n",
        "                if(dests[j].params[k].op == opType::cm || dests[j].params[k].op == opType::const_) {",
        "                    uint64_t openingPointIndex = dests[j].params[k].rowOffsetIndex;",
        "                    uint64_t buffPos = ns*openingPointIndex + dests[j].params[k].stage;",
        "                    uint64_t stagePos = dests[j].params[k].stagePos;",
        `                    copyPolynomial(${!isAvx ? "&destVals[j][k*FIELD_EXTENSION*nrowsPack]" : "&destVals[j][k*FIELD_EXTENSION]"}, dests[j].params[k].inverse${!isAvx ? ",dests[j].params[k].batch" : ""},dests[j].params[k].dim, ${!isAvx ? "&bufferT_[(nColsStagesAcc[buffPos] + stagePos)*nrowsPack]" : "&bufferT_[nColsStagesAcc[buffPos] + stagePos]"});`,
        "                    continue;",
        "                } else if(dests[j].params[k].op == opType::number) {",
    ]);

    if(isAvx) {
        parserCPP.push(`                    destVals[j][k*FIELD_EXTENSION] = ${avxSet1Epi64}(dests[j].params[k].value);`);
    } else {
        parserCPP.push(...[
            "                    for(uint64_t r = 0; r < nrowsPack; ++r) {",
            `                        destVals[j][k*FIELD_EXTENSION*nrowsPack + r] = Goldilocks::fromU64(dests[j].params[k].value);`,
            "                    }",
        ]);
    }
    parserCPP.push(...[
        "                    continue;",
        "                }\n",
    ]);

    parserCPP.push(...[
        "                uint8_t* ops = &parserArgs.ops[dests[j].params[k].parserParams.opsOffset];",
        "                uint16_t* args = &parserArgs.args[dests[j].params[k].parserParams.argsOffset];",
    ]);

    if(isAvx) {
        parserCPP.push(...[
            `                ${avxTypeElement} tmp1[dests[j].params[k].parserParams.nTemp1];`,
            `                ${avxTypeExtElement} tmp3[dests[j].params[k].parserParams.nTemp3];\n`,
        ]);
    } else {
        parserCPP.push(...[
            `                Goldilocks::Element tmp1[dests[j].params[k].parserParams.nTemp1*nrowsPack];`,
            `                Goldilocks::Element tmp3[dests[j].params[k].parserParams.nTemp3*nrowsPack*FIELD_EXTENSION];\n`,
        ]);
    }

    parserCPP.push(...[
        "                for (uint64_t kk = 0; kk < dests[j].params[k].parserParams.nOps; ++kk) {",
        `                    switch (ops[kk]) {`,
    ]);
           
    for(let i = 0; i < operations.length; i++) {
        const op = operations[i];
        
        const operationCase = [`                        case ${i}: {`];
        
        let operationDescription;
        if(op.src1_type) {
            operationDescription = `                                // OPERATION WITH DEST: ${op.dest_type} - SRC0: ${op.src0_type} - SRC1: ${op.src1_type}`;
        } else {
            operationDescription = `                                // COPY ${op.src0_type} to ${op.dest_type}`;
        }
        operationCase.push(operationDescription);
                
        operationCase.push(writeOperation(op));
        operationCase.push(`                                i_args += ${c_args};`);

        operationCase.push(...[
            "                                break;",
            "                            }",
        ])
        parserCPP.push(operationCase.join("\n"));
        
    }

    parserCPP.push(...[
        "                        default: {",
        `                            std::cout << " Wrong operation!" << std::endl;`,
        "                            exit(1);",
        "                        }",
        "                    }",
        "                }\n",
    ]);

    parserCPP.push(...[
        `                if (i_args != dests[j].params[k].parserParams.nArgs) std::cout << " " << i_args << " - " << dests[j].params[k].parserParams.nArgs << std::endl;`,
        "                assert(i_args == dests[j].params[k].parserParams.nArgs);\n",
    ]);

    parserCPP.push(...[
        "                if(dests[j].params[k].parserParams.destDim == 1) {", 
        `                    copyPolynomial(${!isAvx ? "&destVals[j][k*FIELD_EXTENSION*nrowsPack]" : "&destVals[j][k*FIELD_EXTENSION]"}, dests[j].params[k].inverse${!isAvx ? ",dests[j].params[k].batch" : ""}, dests[j].params[k].parserParams.destDim, ${isAvx ? "&tmp1[dests[j].params[k].parserParams.destId]" : "&tmp1[dests[j].params[k].parserParams.destId*nrowsPack]"});`, 
        "                } else {", 
        `                    copyPolynomial(${!isAvx ? "&destVals[j][k*FIELD_EXTENSION*nrowsPack]" : "&destVals[j][k*FIELD_EXTENSION]"}, dests[j].params[k].inverse${!isAvx ? ",dests[j].params[k].batch" : ""}, dests[j].params[k].parserParams.destDim, ${isAvx ? "tmp3[dests[j].params[k].parserParams.destId]" : "&tmp3[dests[j].params[k].parserParams.destId*FIELD_EXTENSION*nrowsPack]"});`, 
        "                }", 
    ]);
    parserCPP.push("            }");
    parserCPP.push("            if(dests[j].params.size() == 2) {");
    parserCPP.push("                multiplyPolynomials(dests[j], destVals[j]);");
    parserCPP.push("            }");
    parserCPP.push("        }");

    parserCPP.push(`        storePolynomial(dests, destVals, i);\n`);
    parserCPP.push(...[
        `        for(uint64_t j = 0; j < dests.size(); ++j) {`,
        "            delete destVals[j];",
        "        }",
        "        delete[] destVals;",
    ]);


    parserCPP.push("    }");

    parserCPP.push("}");
    const parserCPPCode = parserCPP.map(l => `    ${l}`).join("\n");

    return parserCPPCode;

    function writeOperation(operation) {

        let name = ["tmp1", "commit1"].includes(operation.dest_type) ? "Goldilocks::" : "Goldilocks3::";
        
        if (operation.src1_type) {
            name += "op";
        } else {
            name += "copy";
        }

        if(["tmp3", "commit3"].includes(operation.dest_type)) {
            if(operation.src1_type)  {
                let dimType = "";
                let dims1 = ["public", "commit1", "tmp1", "const", "number", "airvalue1", "proofvalue1"];
                let dims3 = ["commit3", "tmp3", "airgroupvalue", "airvalue3", "proofvalue3", "challenge", "eval", "xDivXSubXi"];
                if(global) dims3.push("proofvalue");
                if(dims1.includes(operation.src0_type)) dimType += "1";
                if (dims3.includes(operation.src0_type)) dimType += "3";
                if(dims1.includes(operation.src1_type)) dimType += "1";
                if (dims3.includes(operation.src1_type)) dimType += "3";

                if(dimType !== "33") name += "_" + dimType;
            }
        } 
        
        if(parserType === "avx") {
            name += "_avx(";
        } else if(parserType === "avx512") {
            name += "_avx512(";
        } else if(parserType === "pack") {
            name += "_pack(nrowsPack, ";
        }

        c_args = 0;

        if(operation.src1_type) {
            if(!operation.op) {
                name += `args[i_args + ${c_args}], `;
            }
            c_args++;
        }

        let typeDest = writeType(operation.dest_type, c_args, parserType, global);
        c_args += numberOfArgs(operation.dest_type, global);

        let typeSrc0 = writeType(operation.src0_type, c_args, parserType, global);
        c_args += numberOfArgs(operation.src0_type, global);

        let typeSrc1;
        if(operation.src1_type) {
            typeSrc1 = writeType(operation.src1_type, c_args, parserType, global);
            c_args += numberOfArgs(operation.src1_type, global);
        }
                
        const operationCall = [];

        name += typeDest + ", ";
        name += typeSrc0 + ", ";
        if(operation.src1_type) {
            name += typeSrc1 + ", ";
        }

        name = name.substring(0, name.lastIndexOf(", ")) + ");";

        operationCall.push(`                                ${name}`);
       
        return operationCall.join("\n").replace(/i_args \+ 0/g, "i_args");
    }
}

function writeType(type, c_args, parserType, global = false) {
    if(global && !["public", "number", "airgroupvalue", "tmp1", "tmp3", "proofvalue", "challenge"].includes(type)) {
        throw new Error("Global constraints only allow for publics, numbers, airgroupvalues and proofvalues");
    }
    switch (type) {
        case "public":
            return parserType === "pack" 
                ? `&publics[args[i_args + ${c_args}] * nrowsPack]`
                : `publics[args[i_args + ${c_args}]]`;
        case "proofvalue3":
            return parserType === "pack" 
                ? `&proofValues[args[i_args + ${c_args}] * nrowsPack * FIELD_EXTENSION]`
                : `proofValues[args[i_args + ${c_args}]]`;
        case "proofvalue1":
            return parserType === "pack" 
                ? `&proofValues[args[i_args + ${c_args}] * nrowsPack * FIELD_EXTENSION]`
                : `proofValues[args[i_args + ${c_args}]][0]`;
        case "tmp1":
            return parserType === "pack" 
                ? `&tmp1[args[i_args + ${c_args}] * nrowsPack]`
                : `tmp1[args[i_args + ${c_args}]]`; 
        case "tmp3":
            return parserType === "pack" 
                ? `&tmp3[args[i_args + ${c_args}] * nrowsPack * FIELD_EXTENSION]`
                : `tmp3[args[i_args + ${c_args}]]`;
        case "commit1":
        case "commit3":
        case "const":
            return parserType === "pack"
                ? `&bufferT_[(nColsStagesAcc[args[i_args + ${c_args}]] + args[i_args + ${c_args + 1}]) * nrowsPack]`
                : `${type === "commit3" ? `(${parserType === "avx" ? "Goldilocks3::Element_avx" : "Goldilocks3::Element_avx512"} &)` : ""}bufferT_[nColsStagesAcc[args[i_args + ${c_args}]] + args[i_args + ${c_args + 1}]]`;
        case "challenge":
            return parserType === "pack"
                ? `&challenges[args[i_args + ${c_args}]*FIELD_EXTENSION*nrowsPack]`
                : `challenges[args[i_args + ${c_args}]]`;
        case "eval":
            return parserType === "pack"
                ? `&evals[args[i_args + ${c_args}]*FIELD_EXTENSION*nrowsPack]`
                : `evals[args[i_args + ${c_args}]]`;
        case "airgroupvalue":
            if(global) {
                return `&airgroupValues[args[i_args + ${c_args}]][args[i_args + ${c_args + 1}] * FIELD_EXTENSION]`;
            } else {
                return parserType === "pack"
                ? `&airgroupValues[args[i_args + ${c_args}]*FIELD_EXTENSION*nrowsPack]`
                : `airgroupValues[args[i_args + ${c_args}]]`;
            }
        case "airvalue1":
            return parserType === "pack"
            ? `&airValues[args[i_args + ${c_args}]*FIELD_EXTENSION*nrowsPack]`
            : `airValues[args[i_args + ${c_args}]][0]`;
        case "airvalue3":
            return parserType === "pack"
            ? `&airValues[args[i_args + ${c_args}]*FIELD_EXTENSION*nrowsPack]`
            : `airValues[args[i_args + ${c_args}]]`;
        case "number":
            return parserType === "pack" 
                ? `&numbers_[args[i_args + ${c_args}]*nrowsPack]`
                : `numbers_[args[i_args + ${c_args}]]`;
        default:
            throw new Error("Invalid type: " + type);
    }
}


function numberOfArgs(type, global = false) {
    if(global && !["public", "number", "airgroupvalue", "tmp1", "tmp3", "proofvalue", "challenge"].includes(type)) {
        throw new Error("Global constraints only allow for publics, numbers, proofvalues and airgroupValues");
    }
    switch (type) {
        case "public":            
        case "tmp1":
        case "tmp3":
        case "challenge":
        case "eval":
        case "number":
        case "airvalue1":
        case "airvalue3":
        case "proofvalue1":
        case "proofvalue3":
            return 1;
        case "airgroupvalue":
            return global ? 2 : 1;
        case "const":
        case "commit1":
        case "commit3":
            return 2;  
        default:
            throw new Error("Invalid type: " + type);
    }
}