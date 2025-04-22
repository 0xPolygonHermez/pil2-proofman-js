const { pilCodeGen, buildCode } = require("./codegen");


module.exports.generateExpressionsCode = function generateExpressionsCode(res, symbols, expressions) {
    const expressionsCode = [];
    for(let j = 0; j < expressions.length; ++j) {
        const exp = expressions[j];
        if(!exp.keep && !exp.imPol && ![res.cExpId, res.friExpId].includes(j)) continue;
        if(res.pil2 && res.cExpId === j) continue;
        const dom = (j === res.cExpId || j === res.friExpId) ? "ext" : "n";
        const ctx = {
            stage: exp.stage,
            calculated: {},
            symbolsUsed: [],
            tmpUsed: 0,
            code: [],
            dom,
            airId: res.airId,
            airgroupId: res.airgroupId,
        };

        if(j === res.friExpId) ctx.openingPoints = res.openingPoints;
        if(j === res.cExpId) {
            for(let i = 0; i < symbols.length; i++) {
                if(!symbols[i].imPol) continue;
                const expId = symbols[i].expId;
                ctx.calculated[expId] = {};
                for(let i = 0; i < res.openingPoints.length; ++i) {
                    const openingPoint = res.openingPoints[i];
                    ctx.calculated[expId][openingPoint] = { used: true };
                }
            }
        }
        let exprDest;
        if(exp.imPol) {
            const symbolDest = symbols.find(s => s.expId === j);
            exprDest = { op: "cm", stage: symbolDest.stage, stageId: symbolDest.stageId, id: symbolDest.polId};
        }

        if(exp.symbols) {
            for(let k = 0; k < exp.symbols.length; k++) {
                const symbolUsed = exp.symbols[k];
                if(!ctx.symbolsUsed.find(s => s.op === symbolUsed.op && s.stage === symbolUsed.stage && s.id === symbolUsed.id)) {
                    ctx.symbolsUsed.push(symbolUsed);
                };
            }
        }
         

        pilCodeGen(ctx, symbols, expressions, j, 0);
        const expInfo = buildCode(ctx);
        
        if(j == res.cExpId) {
            expInfo.code[expInfo.code.length-1].dest = { type: "q", id: 0, dim: res.qDim };
        }

        if(j == res.friExpId) {
            expInfo.code[expInfo.code.length-1].dest = { type: "f", id: 0, dim: 3 };
        }

        expInfo.expId = j;
        expInfo.stage = exp.stage;
        expInfo.dest = exprDest;
        expInfo.line = exp.line || "";       

        expressionsCode.push(expInfo);
    }

    return expressionsCode;
}

module.exports.generateConstraintsDebugCode = function generateConstraintsDebugCode(res, symbols, constraints, expressions) {
    const constraintsCode = [];
    for(let j = 0; j < constraints.length; ++j) {
        const ctx = {
            stage: constraints[j].stage,
            calculated: {},
            symbolsUsed: [],
            tmpUsed: 0,
            code: [],
            dom: "n",
            airId: res.airId,
            airgroupId: res.airgroupId,
        };

        for(let i = 0; i < symbols.length; i++) {
            if(!symbols[i].imPol) continue;
            const expId = symbols[i].expId;
            ctx.calculated[expId] = {};
            for(let i = 0; i < res.openingPoints.length; ++i) {
                const openingPoint = res.openingPoints[i];
                ctx.calculated[expId][openingPoint] = { used: true, cm: true };
            }
        }

        const e = expressions[constraints[j].e];
        for(let k = 0; k < e.symbols.length; k++) {
            const symbolUsed = e.symbols[k];
            if(!ctx.symbolsUsed.find(s => s.op === symbolUsed.op && s.stage === symbolUsed.stage && s.id === symbolUsed.id)) {
                ctx.symbolsUsed.push(symbolUsed);
            };
        }

        pilCodeGen(ctx, symbols, expressions, constraints[j].e, 0);
        const constraint = buildCode(ctx);
        constraint.boundary = constraints[j].boundary;
        constraint.line = constraints[j].line;
        constraint.imPol = constraints[j].imPol ? 1 : 0;
        constraint.stage = constraints[j].stage === 0 ? 1 : constraints[j].stage;
        if(constraints[j].boundary === "everyFrame") {
            constraint.offsetMin = constraints[j].offsetMin;
            constraint.offsetMax = constraints[j].offsetMax;
        }
        constraintsCode[j] = constraint;
    }
    return constraintsCode;
}

module.exports.generateConstraintPolynomialVerifierCode = function generateConstraintPolynomialVerifierCode(res, verifierInfo, symbols, expressions) {       

    let ctx = {
        stage: res.nStages + 1,
        calculated: {},
        tmpUsed: 0,
        code: [],
        evMap: [],
        dom: "n",
        airId: res.airId,
        airgroupId: res.airgroupId,
        openingPoints: res.openingPoints,
        symbolsUsed: [],
        verifierEvaluations: true,
    };

    for(let i = 0; i < symbols.length; i++) {
        if(!symbols[i].imPol) continue;
        const expId = symbols[i].expId;
        ctx.calculated[expId] = {};
        for(let i = 0; i < res.openingPoints.length; ++i) {
            const openingPoint = res.openingPoints[i];
            ctx.calculated[expId][openingPoint] = { cm: true };
        }
    }

    if(expressions[res.cExpId].symbols) {
        for(let k = 0; k < expressions[res.cExpId].symbols.length; k++) {
            const symbolUsed = expressions[res.cExpId].symbols[k];
            if(!ctx.symbolsUsed.find(s => s.op === symbolUsed.op && s.stage === symbolUsed.stage && s.id === symbolUsed.id)) {
                ctx.symbolsUsed.push(symbolUsed);
            };
            if(["cm", "const", "custom"].includes(symbolUsed.op)) {
                for(let l = 0; l < symbolUsed.rowsOffsets.length; ++l) {
                    const prime = symbolUsed.rowsOffsets[l];
                    const openingPos = res.openingPoints.findIndex(p => p === prime);
                    const rf = { type: symbolUsed.op, id: symbolUsed.id, prime, openingPos };
                    if(symbolUsed.op === "custom") rf.commitId = symbolUsed.commitId;
                    ctx.evMap.push(rf);
                }
            }
        }
    }

    let qIndex = res.cmPolsMap.findIndex(p => p.stage === res.nStages + 1 && p.stageId === 0);
    let openingPos = res.openingPoints.findIndex(p => p === 0);
    for (let i = 0; i < res.qDeg; i++) {
        ctx.evMap.push({ type: "cm", id: qIndex + i, prime: 0, openingPos });
    }

    const typeOrder = { "cm": 0, "const": 1 };
    for(let i = 0; i < res.customCommits.length; ++i) {
        typeOrder[`custom${i}`] = i + 2;
    }
    ctx.evMap.sort((a, b) => {
        const a_type = ["const", "cm"].includes(a.type) ? a.type : `custom${a.commitId}`;
        const b_type = ["const", "cm"].includes(b.type) ? b.type : `custom${b.commitId}`;
        if(typeOrder[a_type] !== typeOrder[b_type]) {
            return typeOrder[b_type] - typeOrder[a_type];
        } else if(a.id !== b.id) {
            return a.id - b.id;
        } else {
            return a.prime - b.prime;
        }
    })

    pilCodeGen(ctx, symbols, expressions, res.cExpId, 0);
    verifierInfo.qVerifier = buildCode(ctx, expressions);
    verifierInfo.qVerifier.line = "";

    res.evMap = ctx.evMap;
}

