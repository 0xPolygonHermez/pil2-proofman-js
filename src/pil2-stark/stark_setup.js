
const pilInfo = require("./pil_info/pil_info.js");

module.exports.starkSetup = async function starkSetup(pil, starkStruct, options) {        
    const {pilInfo: starkInfo, expressionsInfo, verifierInfo, stats} = await pilInfo(pil, starkStruct, options);

    const res = {
        starkInfo,
        expressionsInfo,
        verifierInfo,
        stats,
    }
    
    return res;
}
