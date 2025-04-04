const { assert } = require("chai");

const operationsTypeMap = {
    "add": 0,
    "sub": 1,
    "mul": 2,
    "sub_swap": 3,
}


const operationsMap = {
    "commit1": 0,
    "x": 0,
    "Zi": 0,
    "const": 0,
    "custom1": 0,
    "tmp1": 1,
    "public": 2,
    "number": 3,
    "airvalue1": 4,
    "proofvalue1": 5,
    "custom3": 6,
    "commit3": 6,
    "xDivXSubXi": 6,
    "tmp3": 7,
    "airvalue3": 8,
    "airgroupvalue": 9,
    "proofvalue": 10,
    "proofvalue3": 10,
    "challenge": 11, 
    "eval": 12,
}

module.exports.getParserArgsPil1 = function getParserArgsPil1(starkInfo, operations, codeInfo, numbers = [], global = false, verify = false, globalInfo = {}) {

    var ops = [];
    var args = [];

    let code_ = codeInfo.code;

    let symbolsUsed = codeInfo.symbolsUsed;

    const customCommits = !global ? starkInfo.customCommits : [];
    let nStages = starkInfo.nStages + 2 + customCommits.length;

    // Evaluate max and min temporal variable for tmp_ and tmp3_
    let maxid = 1000000;
    let ID1D = new Array(maxid).fill(-1);
    let ID3D = new Array(maxid).fill(-1);
    let { count1d, count3d } = getIdMaps(maxid, ID1D, ID3D, code_);
        
    for (let j = 0; j < code_.length; j++) {
        const r = code_[j];
        
        let operation = getOperation(r, verify);

        if(operation.op !== "copy") args.push(operationsTypeMap[operation.op]);

        pushArgs(r.dest, r.dest.type, true, operation.dest_type, verify);
        for(let i = 0; i < operation.src.length; i++) {
            pushArgs(operation.src[i], operation.src[i].type, false, operation[`src${i}_type`], verify);
        }

        let opsIndex = operations.findIndex(op => !op.op && op.dest_type === operation.dest_dim && op.src0_type === operation.src0_dim && op.src1_type === operation.src1_dim);
        if (opsIndex === -1) throw new Error("Operation not considered: " + JSON.stringify(operation));

        ops.push(opsIndex);
    }

   

    const expsInfo = {
        nTemp1: count1d,
        nTemp3: count3d,
        ops,
        args,
    }

    if(symbolsUsed) {
        expsInfo.constPolsIds = symbolsUsed.filter(s => s.op === "const").map(s => s.id).sort();
        expsInfo.cmPolsIds = symbolsUsed.filter(s => s.op === "cm").map(s => s.id).sort();
        expsInfo.challengeIds = symbolsUsed.filter(s => s.op === "challenge").map(s => s.id).sort();
        expsInfo.publicsIds = symbolsUsed.filter(s => s.op === "public").map(s => s.id).sort();
        expsInfo.airgroupValuesIds = symbolsUsed.filter(s => s.op === "airgroupvalue").map(s => s.id).sort();
        expsInfo.airValuesIds = symbolsUsed.filter(s => s.op === "airvalue").map(s => s.id).sort();
        expsInfo.customValuesIds = [];
        for(let i = 0; i < customCommits.length; ++i) {
            expsInfo.customValuesIds.push(symbolsUsed.filter(s => s.op === "custom" && s.commitId === i).map(s => s.id).sort());
        }
    }

    const destTmp = code_[code_.length - 1].dest;
    if(destTmp.dim == 1) {
        expsInfo.destDim = 1;
        expsInfo.destId = ID1D[destTmp.id];
    } else if(destTmp.dim == 3) {
        expsInfo.destDim = 3;
        expsInfo.destId = ID3D[destTmp.id];
    } else throw new Error("Unknown");
    
    return {expsInfo};

    function pushArgs(r, type, dest, operationType, verify) {
        if(dest && !["tmp", "cm"].includes(r.type)) throw new Error("Invalid reference type set: " + r.type);
        
        args.push(operationsMapParser[operationType]);        
        switch (type) {
            case "tmp": {
                if(!global) args.push(0);
                if (r.dim == 1) {
                    args.push(ID1D[r.id]);
                } else {
                    assert(r.dim == 3);
                    args.push(3*ID3D[r.id]);
                }
                break;
            }
            case "const": {
                if(global) throw new Error("const pols should not appear in a global constraint");
                const primeIndex = starkInfo.openingPoints.findIndex(p => p === r.prime);
                if(primeIndex == -1) throw new Error("Something went wrong");

                if(verify) {
                    args.push(0);
                } else {
                    args.push(nStages*primeIndex);
                }
                args.push(r.id);
                
                
                break;
            }
            case "custom": {
                if(global) throw new Error("custom pols should not appear in a global constraint");
                const primeIndex = starkInfo.openingPoints.findIndex(p => p === r.prime);
                if(primeIndex == -1) throw new Error("Something went wrong");

                if(verify) {
                    args.push(starkInfo.nStages + 2 + r.commitId);
                } else {
                    args.push(nStages*primeIndex + starkInfo.nStages + 2 + r.commitId);
                }
                
                args.push(r.id);

                break;
            }
            case "cm": {    
                if(global) throw new Error("witness pols should not appear in a global constraint");
                const primeIndex = starkInfo.openingPoints.findIndex(p => p === r.prime);
                if(primeIndex == -1) throw new Error("Something went wrong");
        
       
                if(verify) {
                    args.push(starkInfo.cmPolsMap[r.id].stage);
                } else {
                    args.push(nStages*primeIndex + starkInfo.cmPolsMap[r.id].stage);
                }
                args.push(Number(starkInfo.cmPolsMap[r.id].stagePos));
                break;
            }
            case "number": {
                let num = BigInt(r.value);
                if(num < 0n) num += BigInt(0xFFFFFFFF00000001n);
                let numString = `${num.toString()}`;
                if(!numbers.includes(numString)) numbers.push(numString);
                if(!global) args.push(0);
                args.push(numbers.indexOf(numString));
                break;
            }
            case "public": {
                if(!global) args.push(0);
                args.push(r.id);
                break;
            }
            case "eval":            
            case "airvalue": {
                if(global) throw new Error("evals and airvalues should not appear in a global constraint");
                args.push(0);
                args.push(3*r.id);
                break;
            }
            case "proofvalue":
            case "challenge": {
                if(!global) args.push(0);
                args.push(3*r.id);
                break;
            }
            case "airgroupvalue": {
                if(!global) args.push(0);
                if(!global) {
                    args.push(3*r.id);
                } else {
                    let offset = 0;
                    for(let i = 0; i < r.airgroupId; ++i) {
                        offset += 3 * globalInfo.aggTypes[i].length;
                    }
                    args.push(offset + 3*r.id);
                }
                break;
            }
            case "xDivXSubXi":
                if(global) throw new Error("xDivXSub should not appear in a global constraint");
                if(verify) {
                    args.push(nStages);
                    args.push(3*r.id);
                } else {
                    args.push(nStages*starkInfo.openingPoints.length);
                    args.push(3*r.id);
                }
                break;
            case "Zi": {
                if(global) throw new Error("Zerofier polynomial should not appear in a global constraint");
                if(verify) {
                    args.push(nStages);
                    args.push(3 + 3*r.boundaryId);
                } else {
                    args.push(nStages*starkInfo.openingPoints.length);
                    args.push(1 + r.boundaryId);
                }
                break;
            }
            case "x": {
                if(global) throw new Error("X should not appear in a global constraint");
                if(verify) {
                    args.push(nStages);
                    args.push(0);
                } else {
                    args.push(nStages*starkInfo.openingPoints.length);
                    args.push(0);
                }
                break;
            }
            default: 
                throw new Error("Unknown type " + type);
        }
        if(!dest) {
            if(["number", "public", "eval", "airvalue", "proofvalue", "challenge", "airgroupvalue"].includes(type)) {
                args.push(1);
            } else {
                args.push(0);
            }
        }
    }

    function getType(r, verify) {
        if(r.type === "cm") {
            return `commit${r.dim}`;
        } else if(r.type === "const" || (r.type === "custom" && r.dim === 1) || ((r.type === "Zi" || r.type === "x") && !verify)) {
            return "commit1";
        } else if(r.type === "xDivXSubXi" || (r.type === "custom" && r.dim === 3) || ((r.type === "Zi" || r.type === "x") && verify)) {
            return "commit3";
        } else if(r.type === "tmp") {
            return `tmp${r.dim}`;
        } else if(r.type === "airvalue") {
            return `airvalue${r.dim}`;
        } else if(r.type === "proofvalue") {
            return `proofvalue${r.dim}`;
        } else {
            return r.type;
        }
    }

    function getOperation(r, verify = false) {
        const _op = {};
        _op.op = r.op;
        if(r.dest.type === "cm") {
            _op.dest_type = `commit${r.dest.dim}`;
        } else if(r.dest.type === "tmp") {
            _op.dest_type = `tmp${r.dest.dim}`;
        } else {
            _op.dest_type = r.dest.type;
        }

        _op.dest_dim = `dim${r.dest.dim}`;
        
        _op.src = [...r.src];
        
        _op.src.sort((a, b) => {
            let opA =  a.type === "cm" ? operationsMap[`commit${a.dim}`] :  ["airvalue", "proofvalue", "tmp", "custom"].includes(a.type) ? operationsMap[`${a.type}${a.dim}`] : operationsMap[a.type];
            let opB = b.type === "cm" ? operationsMap[`commit${b.dim}`] : ["airvalue", "proofvalue", "tmp", "custom"].includes(b.type) ? operationsMap[`${b.type}${b.dim}`] : operationsMap[b.type];
            let swap = a.dim !== b.dim ? b.dim - a.dim : opA - opB;
            if(r.op === "sub" && swap < 0) _op.op = "sub_swap";
            return swap;
        });
        
    
        for(let i = 0; i < _op.src.length; i++) {
            _op[`src${i}_type`] = getType(_op.src[i], verify);
            _op[`src${i}_dim`] = `dim${_op.src[i].dim}`;
        }
        
        return _op;
    }
}


function getIdMaps(maxid, ID1D, ID3D, code) {

    let Ini1D = new Array(maxid).fill(-1);
    let End1D = new Array(maxid).fill(-1);

    let Ini3D = new Array(maxid).fill(-1);
    let End3D = new Array(maxid).fill(-1);

    // Explore all the code to find the first and last appearance of each tmp
    for (let j = 0; j < code.length; j++) {
        const r = code[j];
        if (r.dest.type == 'tmp') {

            let id_ = r.dest.id;
            let dim_ = r.dest.dim;
            assert(id_ >= 0, "Invalid id");
            assert(id_ < maxid, "Id exceeds maxid");

            if (dim_ == 1) {
                if (Ini1D[id_] == -1) {
                    Ini1D[id_] = j;
                    End1D[id_] = j;
                } else {
                    End1D[id_] = j;
                }
            } else {
                assert(dim_ == 3);
                if (Ini3D[id_] == -1) {
                    Ini3D[id_] = j;
                    End3D[id_] = j;
                } else {
                    End3D[id_] = j;
                }
            }
        }
        for (k = 0; k < r.src.length; k++) {
            if (r.src[k].type == 'tmp') {

                let id_ = r.src[k].id;
                let dim_ = r.src[k].dim;
                assert(id_ >= 0 && id_ < maxid);

                if (dim_ == 1) {
                    if (Ini1D[id_] == -1) {
                        Ini1D[id_] = j;
                        End1D[id_] = j;
                    } else {
                        End1D[id_] = j;
                    }
                } else {
                    assert(dim_ == 3);
                    if (Ini3D[id_] == -1) {
                        Ini3D[id_] = j;
                        End3D[id_] = j;
                    } else {
                        End3D[id_] = j;
                    }
                }
            }
        }
    }

    // Store, for each temporal ID, its first and last appearance in the following form: [first, last, id]
    const segments1D = [];
    const segments3D = [];
    for (let j = 0; j < maxid; j++) {
        if (Ini1D[j] >= 0) {
            segments1D.push([Ini1D[j], End1D[j], j])
        }
        if (Ini3D[j] >= 0) {
            segments3D.push([Ini3D[j], End3D[j], j])
        }
    }

    // Create subsets of non-intersecting segments for basefield and extended field temporal variables
    subsets1D = temporalsSubsets(segments1D);
    subsets3D = temporalsSubsets(segments3D);
    
    // Assign unique numerical IDs to subsets of segments representing 1D and 3D temporal variables
    let count1d = 0;
    for (s of subsets1D) {
        for (a of s) {
            ID1D[a[2]] = count1d;
        }
        ++count1d;
    }
    let count3d = 0;
    for (s of subsets3D) {
        for (a of s) {
            ID3D[a[2]] = count3d;
        }
        ++count3d;
    }
    return { count1d, count3d };
}

function temporalsSubsets(segments) {
    segments.sort((a, b) => a[1] - b[1]);
    const tmpSubsets = [];
    for (const segment of segments) {
        let closestSubset = null;
        let minDistance = Infinity;
        for (const subset of tmpSubsets) {
            const lastSegmentSubset = subset[subset.length - 1];
            if(isIntersecting(segment, lastSegmentSubset)) continue;

            const distance = Math.abs(lastSegmentSubset[1] - segment[0]);
            if(distance < minDistance){
                minDistance = distance;
                closestSubset = subset;
            }
        }

        if(closestSubset) {
            closestSubset.push(segment);
        } else {
            tmpSubsets.push([segment]);
        }
    }
    return tmpSubsets;
}

function isIntersecting(segment1, segment2) {
    const [start1, end1] = segment1;
    const [start2, end2] = segment2;
    return start2 < end1 && start1 < end2;
}