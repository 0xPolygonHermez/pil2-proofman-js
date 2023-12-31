module.exports.joinzkinFinal = function joinzkinFinal(proofsBySubproofId, globalInfo, publics, challenges, challengesFRISteps) {
    const zkinFinal = {};

    zkinFinal.publics = publics;
    zkinFinal.challenges = challenges.flat();
    zkinFinal.challengesFRISteps = challengesFRISteps;

    for(let i = 0; i < proofsBySubproofId.length; ++i) {
        const zkin = proofsBySubproofId[i].zkinFinal;
        const starkInfo = proofsBySubproofId[i].starkInfoRecursive2;
        for (let j = 0; j < starkInfo.numChallenges.length; ++j) {
            zkinFinal[`s${i}_root${j + 1}`] = zkin[`root${j + 1}`]; 
        }

        zkinFinal[`s${i}_rootQ`] = zkin.rootQ; 

        for (let j = 0; j < starkInfo.numChallenges.length; ++j) {
            zkinFinal[`s${i}_s0_vals${j + 1}`] = zkin[`s0_vals${j + 1}`]; 
        }

        zkinFinal[`s${i}_s0_valsQ`] = zkin.s0_valsQ; 
        zkinFinal[`s${i}_s0_valsC`] = zkin.s0_valsC; 

        for (let j = 0; j < starkInfo.numChallenges.length; ++j) {
            zkinFinal[`s${i}_s0_siblings${j + 1}`] = zkin[`s0_siblings${j + 1}`]; 
        }

        zkinFinal[`s${i}_s0_siblingsQ`] = zkin.s0_siblingsQ; 
        zkinFinal[`s${i}_s0_siblingsC`] = zkin.s0_siblingsC;

        zkinFinal[`s${i}_evals`] = zkin.evals; 

        for (let j = 1; j < starkInfo.starkStruct.steps.length; ++j) {
            zkinFinal[`s${i}_s${j}_root`] = zkin[`s${j}_root`];
            zkinFinal[`s${i}_s${j}_vals`] = zkin[`s${j}_vals`]; 
            zkinFinal[`s${i}_s${j}_siblings`] = zkin[`s${j}_siblings`];  
        }

        zkinFinal[`s${i}_finalPol`] = zkin.finalPol; 

        zkinFinal[`s${i}_circuitType`] = zkin.sv_circuitType;
        zkinFinal[`s${i}_aggregationTypes`] = zkin.sv_aggregationTypes;
        zkinFinal[`s${i}_subAirValues`] = zkin.sv_subAirValues;

        zkinFinal[`s${i}_sv_rootC`] = zkin.sv_rootC;
        for(let j = 0; j < globalInfo.numChallenges.length; ++j) {
            zkinFinal[`s${i}_sv_root${j + 1}`] = zkin[`sv_root${j + 1}`];
        }
        zkinFinal[`s${i}_sv_rootQ`] = zkin.sv_rootQ;
        zkinFinal[`s${i}_sv_evalsHash`] = zkin.sv_evalsHash;
        
        for(let j = 0; j < globalInfo.stepsFRI.length - 1; ++j) {
            zkinFinal[`s${i}_sv_s${j+1}_root`] = zkin[`sv_s${j+1}_root`];
        }

        zkinFinal[`s${i}_sv_finalPolHash`] = zkin.sv_finalPolHash;
    }

    return zkinFinal;
}