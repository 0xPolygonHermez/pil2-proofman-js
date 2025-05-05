const { pilCodeGen, buildCode } = require("./codegen");


module.exports.generateExpressionsCode = function generateExpressionsCode(res, symbols, expressions) {
    const expressionsCode = [];
    for(let j = 0; j < expressions.length; ++j) {
        const exp = expressions[j];
        if(!exp.keep && !exp.imPol && ![res.cExpId, res.friExpId].includes(j)) continue;
        // if(res.pil2 && res.cExpId === j) continue;
        const dom = (j === res.cExpId || j === res.friExpId) ? "ext" : "n";
        const ctx = {
            stage: exp.stage,
            calculated: {},
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
                    ctx.calculated[expId][openingPoint] = { used: true, cm: true };
                }
            }
        }
        let exprDest;
        if(exp.imPol) {
            const symbolDest = symbols.find(s => s.expId === j);
            exprDest = { op: "cm", stage: symbolDest.stage, stageId: symbolDest.stageId, id: symbolDest.polId};
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
        evMap: res.evMap,
        dom: "n",
        airId: res.airId,
        airgroupId: res.airgroupId,
        openingPoints: res.openingPoints,
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

    pilCodeGen(ctx, symbols, expressions, res.cExpId, 0);
    verifierInfo.qVerifier = buildCode(ctx, expressions);
    verifierInfo.qVerifier.line = "";
}

