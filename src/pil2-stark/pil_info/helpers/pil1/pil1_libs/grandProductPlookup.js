const ExpressionOps = require("../../../expressionops");
const { getExpDim } = require("../../helpers");


module.exports.initChallengesPlookup = function initChallengesPlookup() {
    const stage1 = 2;
    const stage2 = 3;
    const dim = 3;

    const alpha = {name: "std_alpha", stage: stage1, dim, stageId: 0};
    const beta = {name: "std_beta", stage: stage1, dim, stageId: 1};
    const gamma = {name: "std_gamma", stage: stage2, dim, stageId: 0};
    const delta = {name: "std_delta", stage: stage2, dim, stageId: 1};

    return [alpha, beta, gamma, delta];
}

module.exports.grandProductPlookup = function grandProductPlookup(pil, symbols, hints, airgroupId, airId) {
    const E = new ExpressionOps();

    const stage1 = 2;
    const stage2 = 3;
    const dim = 3;

    let alphaSymbol = symbols.find(s => s.type === "challenge" && s.name === "std_alpha");
    const alpha = E.challenge("std_alpha", alphaSymbol.stage, alphaSymbol.dim, alphaSymbol.stageId, alphaSymbol.id);

    let betaSymbol = symbols.find(s => s.type === "challenge" && s.name === "std_beta");
    const beta = E.challenge("std_beta", betaSymbol.stage, betaSymbol.dim, betaSymbol.stageId, betaSymbol.id);

    let gammaSymbol = symbols.find(s => s.type === "challenge" && s.name === "std_gamma");
    const gamma = E.challenge("std_gamma", gammaSymbol.stage, gammaSymbol.dim, gammaSymbol.stageId, gammaSymbol.id);

    let deltaSymbol = symbols.find(s => s.type === "challenge" && s.name === "std_delta");
    const delta = E.challenge("std_delta", deltaSymbol.stage, deltaSymbol.dim, deltaSymbol.stageId, deltaSymbol.id);


    for (let i=0; i<pil.plookupIdentities.length; i++) {
        const puCtx = {};
        const pi = pil.plookupIdentities[i];

        let tExp = null;
        for (let j=0; j<pi.t.length; j++) {
            const e = E.exp(pi.t[j],0,stage1);
            if (tExp) {
                tExp = E.add(E.mul(alpha, tExp), e);
            } else {
                tExp = e;
            }
        }
        if (pi.selT !== null) {
            tExp = E.sub(tExp, beta);
            tExp = E.mul(tExp, E.exp(pi.selT,0,stage1));
            tExp = E.add(tExp, beta);
        }

        puCtx.tExpId = pil.expressions.length;
        tExp.keep = true;
        tExp.stage = stage1;
        pil.expressions.push(tExp);
        const tDim = getExpDim(pil.expressions, puCtx.tExpId);
        pil.expressions[puCtx.tExpId].deg = tDim;

        fExp = null;
        for (let j=0; j<pi.f.length; j++) {
            const e = E.exp(pi.f[j],0,stage1);
            if (fExp) {
                fExp = E.add(E.mul(fExp, alpha), e);
            } else {
                fExp = e;
            }
        }
        if (pi.selF !== null) {
            fExp = E.sub(fExp, E.exp(puCtx.tExpId,0,stage1));
            fExp = E.mul(fExp, E.exp(pi.selF,0,stage1));
            fExp = E.add(fExp, E.exp(puCtx.tExpId,0,stage1));
        }

        puCtx.fExpId = pil.expressions.length;
        fExp.keep = true;
        fExp.stage = stage1;
        pil.expressions.push(fExp);
        const fDim = getExpDim(pil.expressions, puCtx.fExpId);
        pil.expressions[puCtx.fExpId].deg = fDim;

        puCtx.h1Id = pil.nCommitments++;
        puCtx.h2Id = pil.nCommitments++;
                
        puCtx.zId = pil.nCommitments++;

        const hDim = Math.max(fDim, tDim);

        const h1 = E.cm(puCtx.h1Id, 0, stage1, hDim);
        const h1p = E.cm(puCtx.h1Id, 1, stage1, hDim);
        const h2 =  E.cm(puCtx.h2Id, 0, stage1, hDim);
        const f = E.exp(puCtx.fExpId, 0, stage1);
        const t = E.exp(puCtx.tExpId, 0, stage1);
        const tp = E.exp(puCtx.tExpId, 1, stage1);
        const z = E.cm(puCtx.zId, 0, stage2, dim);
        const zp = E.cm(puCtx.zId, 1, stage2, dim);
        
        h1.stageId = pil.nCm2++;
        h2.stageId = pil.nCm2++;
        z.stageId = pil.nCm3++;


        if ( typeof pil.references["Global.L1"] === "undefined") throw new Error("Global.L1 must be defined");
        const l1 = E.const(pil.references["Global.L1"].id, 0, 0, 1);
        let c1 = E.mul(l1,  E.sub(z, E.number(1)));


        c1.deg=2;
        pil.expressions.push(c1);
        let c1Id = pil.expressions.length - 1;
        pil.polIdentities.push({e: c1Id, boundary: "everyRow", fileName: pi.fileName, line: pi.line });
        let c1Dim = getExpDim(pil.expressions, c1Id);
        pil.expressions[c1Id].dim = c1Dim;


        const numExp = E.mul(
            E.mul(
                E.add(f, gamma),
                E.add(
                    E.add(
                        t,
                        E.mul(
                            tp,
                            delta
                        )
                    ),
                    E.mul(gamma,E.add(E.number(1), delta))
                )
            ),
            E.add(E.number(1), delta)
        );
        puCtx.numId = pil.expressions.length;
        numExp.keep = true;
        numExp.stage = stage2;
        pil.expressions.push(numExp);
        const numDim = getExpDim(pil.expressions, puCtx.numId);
        pil.expressions[puCtx.numId].dim = numDim;

        const denExp = E.mul(
            E.add(
                E.add(
                    h1,
                    E.mul(
                        h2,
                        delta
                    )
                ),
                E.mul(gamma,E.add(E.number(1), delta))
            ),
            E.add(
                E.add(
                    h2,
                    E.mul(
                        h1p,
                        delta
                    )
                ),
                E.mul(gamma,E.add(E.number(1), delta))
            )
        );
        puCtx.denId = pil.expressions.length;
        denExp.keep = true;
        denExp.stage = stage2;
        pil.expressions.push(denExp);
        const denDim = getExpDim(pil.expressions, puCtx.denId);
        pil.expressions[puCtx.denId].dim = denDim;

        const num = E.exp(puCtx.numId,0,stage2);
        const den = E.exp(puCtx.denId,0,stage2);

        const c2 = E.sub(  E.mul(zp, den), E.mul(z, num)  );
        c2.deg=2;
        pil.expressions.push(c2);
        let c2Id = pil.expressions.length - 1;
        pil.polIdentities.push({e: c2Id, boundary: "everyRow", fileName: pi.fileName, line: pi.line });
        let c2Dim = getExpDim(pil.expressions, c2Id);
        pil.expressions[c2Id].dim = c2Dim;

        const hint1 = {
            name: "h1h2",
            fields: [
                {name: "referenceH1", values: [h1]},
                {name: "referenceH2", values: [h2]},
                {name: "f", values: [E.exp(puCtx.fExpId, 0, stage1)]},
                {name: "t", values: [E.exp(puCtx.tExpId, 0, stage1)]},
            ],
        };

        const hint2 = {
            name: "gprod",
            fields: [
                {name: "reference", values: [z]},
                {name: "numerator", values: [E.exp(puCtx.numId, 0, stage2)]},
                {name: "denominator", values: [E.exp(puCtx.denId, 0, stage2)]},
            ],
        };

        hints.push(hint1);
        hints.push(hint2);

        symbols.push({ type: "witness", name: `Plookup${i}.h1`, polId: puCtx.h1Id, stage: stage1, dim: Math.max(fDim, tDim), airId, airgroupId});
        symbols.push({ type: "witness", name: `Plookup${i}.h2`, polId: puCtx.h2Id, stage: stage1, dim: Math.max(fDim, tDim), airId, airgroupId});
        symbols.push({ type: "witness", name: `Plookup${i}.z`, polId: puCtx.zId, stage: stage2, dim: Math.max(numDim, denDim), airId, airgroupId});
    }
}
