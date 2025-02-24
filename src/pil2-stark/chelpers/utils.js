module.exports.getGlobalOperations = function getGlobalOperations() {
    const possibleOps = [
        { dest_type: "dim1", src0_type: "dim1"}, // Copy operation for PIL1
        { dest_type: "dim1", src0_type: "dim1", src1_type: "dim1"}, 
        { dest_type: "dim3", src0_type: "dim3", src1_type: "dim1"}, 
        { dest_type: "dim3", src0_type: "dim3", src1_type: "dim3"},
        { dest_type: "dim3", src0_type: "dim3" }, // Copy operation for PIL1
    ];

    return possibleOps;
}

module.exports.getAllOperations = function getAllOperations() {
    const possibleOps = [
        { dest_type: "dim1", src0_type: "dim1"}, // Copy operation for PIL1
        { dest_type: "dim1", src0_type: "dim1", src1_type: "dim1"}, 
        { dest_type: "dim3", src0_type: "dim3", src1_type: "dim1"}, 
        { dest_type: "dim3", src0_type: "dim3", src1_type: "dim3"},
        { dest_type: "dim3", src0_type: "dim3" }, // Copy operation for PIL1
    ];

    return possibleOps;
}