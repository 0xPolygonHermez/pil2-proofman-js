const { assert } = require("chai");
const Decimal = require("decimal.js");

const DEFAULT_TARGET_SECURITY_BITS = 128;

// Configure Decimal for high precision
Decimal.set({ precision: 200 });

/**
 * Base class for security calculations
 */
class DecodingRegime {
    constructor(params) {
        this.fieldSize = params.fieldSize;
        this.dimension = params.dimension;
        this.rate = params.rate;
        this.codewordLength = this.dimension / this.rate;
    }

    get name() {
        throw new Error("Must be implemented by subclass");
    }

    get maxDecodingRadius() {
        throw new Error("Must be implemented by subclass");
    }

    get proximityParameter() {
        throw new Error("Must be implemented by subclass");
    }

    get maxListSize() {
        throw new Error("Must be implemented by subclass");
    }

    calculateLinearError() {
        throw new Error("Must be implemented by subclass");
    }

    calculatePowersError(nFunctions) {
        return this.calculateLinearError().mul(nFunctions - 1);
    }
}

/**
 * Unique Decoding Regime (UDR)
 * Decoding radius: (0, (1 - rate) / 2)
 */
class UDR extends DecodingRegime {
    get name() {
        return "Unique Decoding Regime (UDR)";
    }

    get maxDecodingRadius() {
        return (1 - this.rate) / 2;
    }

    get proximityParameter() {
        // How close we are to the Unique Decoding Bound (1 - rate) / 2

        // TODO: Heuristic correction to stay within the decoding radius
        const correction =
            this.fieldSize >= 1n << 150n
                ? 1 / this.codewordLength
                : this.rate / 20;

        const pp = this.maxDecodingRadius - correction;
        assert(pp > 0, "Proximity parameter must be positive in UDR");
        return pp;
    }

    get maxListSize() {
        // In UDR, list size is always 1
        return 1;
    }

    calculateLinearError() {
        // Theorem 1.4 of BCIKS20
        return new Decimal(this.codewordLength).div(this.fieldSize);
    }
}

/**
 * Johnson Bound Regime (JBR)
 * Decoding radius: (0, 1 - sqrt(rate))
 */
class JBR extends DecodingRegime {
    get name() {
        return "Johnson Bound Regime (JBR)";
    }

    get sqrtRate() {
        return Math.sqrt(this.rate);
    }

    get maxDecodingRadius() {
        return 1 - this.sqrtRate;
    }

    get proximityParameter() {
        // How close we are to the Johnson Bound 1-sqrt(rate)

        // TODO: Let's use a heuristic to figure out the proximity parameter here.
        const correction =
            this.fieldSize >= 1n << 150n
                ? 1 / this.codewordLength
                : this.rate / 20;

        const pp = this.maxDecodingRadius - correction;
        assert(pp > 0, "Proximity parameter must be positive in JBR");
        return pp;
    }

    get gap() {
        // Distance from proximity parameter to Johnson bound
        return this.maxDecodingRadius - this.proximityParameter;
    }

    get maxListSize() {
        // RS codes are (1 - sqrt(rate) - gap, 1/(2*gap*sqrt(rate)))-list decodable
        return 1 / (2 * this.gap * this.sqrtRate);
    }

    get multiplicity() {
        // Theorem 4.2 of BCHKS25:
        //    m = max{ceil(sqrt(rate) / gap), 3}
        const m = Math.ceil(this.sqrtRate / this.gap);
        return Math.max(m, 3);
    }

    calculateLinearError() {
        // Theorem 4.2 of BCHKS25, but substituting pp·n + 1 with n
        const n = this.dimension / this.rate;
        const m = this.multiplicity;
        const m_shifted = m + 0.5;

        const numerator = (2 * m_shifted ** 5 + 3 * m_shifted * this.rate) * n;
        const denominator = new Decimal(3 * this.rate * this.sqrtRate).mul(
            this.fieldSize
        );

        return new Decimal(numerator).div(denominator);
    }
}

/**
 * FRI Security Calculator
 */
class FRISecurityCalculator {
    constructor(regime, params) {
        this.regime = regime;
        this.treeArity = params.treeArity ?? 2;
        this.nFunctions = params.nFunctions;
        this.foldingFactors = params.foldingFactors;

        // Query Phase parameters
        this.targetSecurityBits =
            params.targetSecurityBits ?? DEFAULT_TARGET_SECURITY_BITS;
        if (params.nQueries !== undefined) {
            this.nQueries = params.nQueries;
            this.nGrindingBits = params.nGrindingBits ?? 0;
        } else if (params.maxGrindingBits !== undefined) {
            const optimal = this._calculateOptimalQueryParams(
                this.targetSecurityBits,
                params.maxGrindingBits
            );
            this.nQueries = optimal.nQueries;
            this.nGrindingBits = optimal.nGrindingBits;
        } else {
            throw new Error("Must provide either nQueries or maxGrindingBits");
        }
    }

    _calculateMTPHashes(nLeafs) {
        return (this.treeArity - 1) * Math.ceil(Math.log2(nLeafs) / Math.log2(this.treeArity));
    }

    _calculateQueryNumHashes() {
        // To be precise, to check one query one needs to:
        //   a) Send MTP for fi(qj) for each folded function fi and each folding factor j
        //   b) Send MTP for gi(q0) for each input function gi
        // Where MTP is the Merkle Tree Proof, which involves (arity - 1) * log(nFunctions) hashes
        // In total:
        //   a) sumj foldingFactors[j] * (arity - 1) * log2(n/prod k foldingFactors[k <= j]) hashes (except the last one)
        //   b) nFunctions * foldingFactors[0] * (arity - 1) * log2(n) hashes
        let accFoldingFactor = 1;
        let totalHashes = 0;
        for (let j = 0; j < this.foldingFactors.length - 1; j++) {
            const nLeafs = this.regime.codewordLength / accFoldingFactor;
            totalHashes += this.foldingFactors[j] * this._calculateMTPHashes(nLeafs);
            accFoldingFactor *= this.foldingFactors[j];
        }
        const nLeafsInput = this.regime.codewordLength;
        totalHashes += this.foldingFactors[0] * this._calculateMTPHashes(nLeafsInput);

        return totalHashes;
    }

    _calculateOptimalQueryParams(targetSecurityBits, maxGrindingBits) {
        // Security bits per query
        const singleQueryError = this.calculateSingleQueryError();
        const bitsPerQuery = -Math.log2(singleQueryError);

        // Cost per query (in hash operations)
        const hashesPerQuery = this._calculateQueryNumHashes();

        // Find optimal nQueries and nGrindingBits
        // Goal: nQueries * bitsPerQuery + nGrindingBits >= targetSecurityBits
        //
        // Strategy:
        // 1. Add grinding bits while 2^grindingBits < hashesPerQuery
        // 2. Once grinding costs more than a query, use queries for the rest

        // Find max grinding where grinding is still cheaper than one query
        // 2^g < hashesPerQuery  =>  g < log2(hashesPerQuery)
        const maxEfficientGrinding = Math.floor(Math.log2(hashesPerQuery));
        const nGrindingBits = Math.min(maxEfficientGrinding, maxGrindingBits);

        const neededFromQueries = targetSecurityBits - nGrindingBits;
        const nQueries = neededFromQueries > 0 
            ? Math.ceil(neededFromQueries / bitsPerQuery)
            : 1; // Need at least 1 query

        return {
            nQueries,
            nGrindingBits,
        };
    }

    get nCommitRounds() {
        return this.foldingFactors.length;
    }

    /**
     * Grinding Phase
     *
     * Reduces error probability by a factor of 2^grindingBits
     */
    calculateGrindingError(grindingBits) {
        return new Decimal(1).div(new Decimal(2).pow(grindingBits));
    }

    /**
     * Batch Phase
     *
     * Combines multiple polynomials into one using random linear combination.
     */
    calculateBatchPhaseError() {
        return this.regime.calculatePowersError(this.nFunctions);
    }

    /**
     * Phase 2: Commit Phase (Folding Rounds)
     *
     * Each round folds the polynomial, reducing degree by `foldingFactor`.
     */
    calculateCommitPhaseError(idx) {
        return this.regime.calculatePowersError(this.foldingFactors[idx]);
    }

    /**
     * Phase 3: Single Query Error
     *
     * Probability that a single query misses an inconsistency
     */
    calculateSingleQueryError() {
        return 1 - this.regime.proximityParameter;
    }

    /**
     * Phase 3: Query Phase
     *
     * Verifier queries random positions to check consistency
     */
    calculateQueryPhaseError() {
        const grindingError = this.calculateGrindingError(this.nGrindingBits);
        const singleQueryError = this.calculateSingleQueryError();
        const queryError = new Decimal(singleQueryError).pow(this.nQueries);
        return queryError.mul(grindingError);
    }

    calculateBatchCommitError() {
        const batchError = this.calculateBatchPhaseError();

        let commitError = new Decimal(0);
        for (let i = 0; i < this.nCommitRounds; i++) {
            const roundError = this.calculateCommitPhaseError(i);
            commitError = Decimal.max(commitError, roundError);
        }

        // Overall error is the maximum of batch and commit errors
        return Decimal.max(batchError, commitError);
    }

    /**
     * Calculate total FRI security in bits
     */
    calculateTotalError() {
        const batchCommitError = this.calculateBatchCommitError();
        const queryError = this.calculateQueryPhaseError();
        return Decimal.max(batchCommitError, queryError);
    }

    /**
     * Get breakdown of security by phase
     */
    getSecurityBreakdown() {
        // calculate errors per phase
        const batchError = this.calculateBatchPhaseError();

        const commitRounds = [];
        let worstCommitError = new Decimal(0);
        for (let i = 0; i < this.nCommitRounds; i++) {
            const roundError = this.calculateCommitPhaseError(i);
            worstCommitError = Decimal.max(worstCommitError, roundError);
            commitRounds.push({
                round: i,
                foldingFactor: this.foldingFactors[i],
                securityBits: get_security_from_error(roundError),
            });
        }

        const queryError = this.calculateQueryPhaseError();

        // Overall error
        const totalError = Decimal.max(
            batchError,
            worstCommitError,
            queryError
        );

        return {
            batchPhase: {
                nFunctions: this.nFunctions,
                securityBits: get_security_from_error(batchError),
            },
            commitPhase: {
                rounds: commitRounds,
                securityBits: get_security_from_error(worstCommitError),
            },
            queryPhase: {
                nQueries: this.nQueries,
                nGrindingBits: this.nGrindingBits,
                securityBits: get_security_from_error(queryError),
            },
            total: {
                securityBits: get_security_from_error(totalError),
            }
        };
    }

    formatParameters() {
        const lines = [];
        lines.push("FRI Parameters:");
        lines.push(`  - Num Functions: ${this.nFunctions}`);
        lines.push(`  - Folding Factors: [${this.foldingFactors.join(", ")}]`);
        lines.push(`  - Num Queries: ${this.nQueries}`);
        lines.push(`  - Query Grinding Bits: ${this.nGrindingBits}`);
        return lines.join("\n");
    }

    formatReport() {
        const b = this.getSecurityBreakdown();
        const lines = [];

        lines.push("FRI Security Breakdown:");
        lines.push(
            `  - Batch Phase (${b.batchPhase.nFunctions} functions): ${b.batchPhase.securityBits} bits`
        );
        lines.push(`  - Commit Phase: ${b.commitPhase.securityBits} bits`);
        for (const round of b.commitPhase.rounds) {
            lines.push(
                `    · Round ${round.round} (fold ${round.foldingFactor}x): ${round.securityBits} bits`
            );
        }
        lines.push(
            `  - Query Phase (${b.queryPhase.nQueries} queries, ${b.queryPhase.nGrindingBits} grinding bits): ${b.queryPhase.securityBits} bits`
        );
        lines.push(`  Total: ${b.total.securityBits} bits`);

        return lines.join("\n");
    }
}

/**
 * Security Calculator
 */
class SecurityCalculator {
    constructor(params) {
        this.name = params.name ?? "";

        // Store original parameters
        this.dimension = params.dimension;
        this.rate = params.rate;
        this.codewordLength = this.dimension / this.rate;
        this.nOpeningPoints = params.nOpeningPoints ?? 1;

        // Augmented code parameters (for DEEP)
        this.augmentedDimension = this.dimension + this.nOpeningPoints;
        this.augmentedRate =
            this.rate * (this.augmentedDimension / this.dimension);

        // Field parameters
        this.fieldSize = new Decimal(params.fieldSize);

        // Create the appropriate regime
        const regimeParams = {
            fieldSize: this.fieldSize,
            dimension: this.augmentedDimension,
            rate: this.augmentedRate,
        };

        if (params.regime === "JBR") {
            this.regime = new JBR(regimeParams);
        } else if (params.regime === "UDR") {
            this.regime = new UDR(regimeParams);
        } else {
            throw new Error(
                `Unknown decoding regime: ${params.regime}. Supported regimes are "JBR" and "UDR".`
            );
        }

        // Constraint parameters
        this.nConstraints = params.nConstraints;
        this.maxConstraintDegree = params.maxConstraintDegree;

        // FRI parameters
        this.nFunctions = params.nFunctions;
        this.foldingFactors = params.foldingFactors;
        this.nQueries = params.nQueries;
        this.nGrindingBits = params.nGrindingBits;

        // Create FRI calculator
        this.friCalculator = new FRISecurityCalculator(this.regime, {
            nFunctions: this.nFunctions,
            foldingFactors: this.foldingFactors,
            nQueries: this.nQueries,
            nGrindingBits: this.nGrindingBits,
            maxGrindingBits: params.maxGrindingBits,
        });

        // Target
        this.targetSecurityBits =
            params.targetSecurityBits ?? DEFAULT_TARGET_SECURITY_BITS;
    }

    // Augmented Algebraic IOP (AAI) Security
    calculateAAIError() {
        // TODO
        return new Error("AAI security calculation not implemented");
    }

    // Algebraic Linking IOP (ALI) Security
    calculateALIError() {
        const numerator = this.regime.maxListSize * this.nConstraints;
        const denominator = this.fieldSize;
        return new Decimal(numerator).div(denominator);
    }

    // Domain Extending for Eliminating Pretenders (DEEP) Security
    calculateDEEPError() {
        const numerator =
            this.regime.maxListSize *
            ((this.maxConstraintDegree - 1) * (this.augmentedDimension - 1) +
                (this.dimension - 1));
        const denominator = this.fieldSize.minus(
            this.codewordLength + this.dimension
        );
        return new Decimal(numerator).div(denominator);
    }

    // Fast Reed-Solomon IOPP (FRI) Security
    calculateFRIError() {
        return this.friCalculator.calculateTotalError();
    }

    calculateTotalError() {
        // const aai = this.calculateAAIError();
        const ali = this.calculateALIError();
        const deep = this.calculateDEEPError();
        const fri = this.calculateFRIError();

        return Decimal.max(ali, deep, fri);
    }

    calculateTotalSecurityBits() {
        return get_security_from_error(this.calculateTotalError());
    }

    meetsSecurityTarget() {
        return this.calculateTotalSecurityBits() >= this.targetSecurityBits;
    }

    getSecurityBreakdown() {
        // const aai_security = get_security_from_error(this.calculateAAIError());
        const ali_security = get_security_from_error(this.calculateALIError());
        const deep_security = get_security_from_error(
            this.calculateDEEPError()
        );
        const fri_security = get_security_from_error(this.calculateFRIError());
        const total_security = Decimal.min(
            ali_security,
            deep_security,
            fri_security
        );

        const bottleneck = total_security.equals(ali_security)
            ? "ALI"
            : total_security.equals(deep_security)
              ? "DEEP"
              : "FRI";

        return {
            // Regime info
            regime: this.regime.name,
            proximityParameter: this.regime.proximityParameter,
            maxListSize: this.regime.maxListSize,

            // Security components
            aliSecurityBits: ali_security,
            deepSecurityBits: deep_security,
            friSecurityBits: fri_security,
            friBreakdown: this.friCalculator.getSecurityBreakdown(),

            // Total
            totalSecurityBits: total_security,
            targetSecurityBits: this.targetSecurityBits,
            meetsTarget: total_security >= this.targetSecurityBits,
            deficit: Decimal.max(0, this.targetSecurityBits - total_security),
            bottleneck,
        };
    }

    formatReport() {
        const b = this.getSecurityBreakdown();
        const lines = [];

        lines.push("==================== SECURITY ANALYSIS ====================");
        if (this.name) lines.push(`${this.name}`);
        lines.push("");
        lines.push(`Target Security: ${this.targetSecurityBits} bits`);
        lines.push("");

        lines.push("Code Parameters:");
        lines.push(`  - Regime: ${b.regime}`);
        lines.push(`  - Dimension: 2^${Math.log2(this.dimension)}`);
        lines.push(`  - Length: 2^${Math.log2(this.codewordLength)}`);
        lines.push(`  - Rate: 1/${this.codewordLength / this.dimension}`);
        lines.push(
            `  - Field Size: 2^${Math.floor(Math.log2(this.fieldSize))}`
        );
        lines.push("");

        lines.push(this.friCalculator.formatParameters());
        lines.push("");

        if (this.meetsSecurityTarget()) {
            lines.push(`Total Security: ${b.totalSecurityBits} bits`);
        } else {
            lines.push(
                `Total Security: ${b.totalSecurityBits} bits (bottleneck: ${b.bottleneck})`
            );
        }
        lines.push("");

        if (b.meetsTarget) {
            const margin = b.totalSecurityBits - b.targetSecurityBits;
            lines.push(
                `✓ Security target of ${b.targetSecurityBits} bits is MET with margin of ${margin} bits`
            );
        } else {
            lines.push(
                `✗ Security target of ${b.targetSecurityBits} bits is NOT MET with deficit of ${b.deficit} bits`
            );
            lines.push("");
            lines.push("Recommendations:");
            if (b.bottleneck === "FRI") {
                lines.push(
                    `  - Increase nQueries (currently ${this.nQueries})`
                );
                lines.push(
                    `  - Increase grinding bits (currently ${this.nGrindingBits})`
                );
            } else if (b.bottleneck === "DEEP") {
                lines.push(
                    `  - Reduce max constraint degree (currently ${this.maxConstraintDegree})`
                );
                lines.push(`  - Use a larger field`);
            } else if (b.bottleneck === "ALI") {
                lines.push(
                    `  - Reduce number of constraints (currently ${this.nConstraints})`
                );
                lines.push(`  - Use a larger field`);
            }
        }
        lines.push(
            "-----------------------------------------------------------"
        );

        lines.push("Security Breakdown:");
        lines.push(`  - ALI:  ${b.aliSecurityBits} bits`);
        lines.push(`  - DEEP: ${b.deepSecurityBits} bits`);
        lines.push(`  - FRI:  ${b.friSecurityBits} bits`);
        lines.push("");

        lines.push(this.friCalculator.formatReport());
        lines.push(
            "==========================================================="
        );
        return lines.join("\n");
    }
}

// Return the maximum k such that error ≤ 2^-k
function get_security_from_error(error) {
    return Decimal.floor(Decimal.log2(error).neg());
}

function createSecurityCalculator(regime, params) {
    return new SecurityCalculator({ ...params, regime });
}

function getOptimalFRIQueryParams(regime, params) {
    const friCalculator = new FRISecurityCalculator(regime, 
        {
            nFunctions: params.nFunctions,
            foldingFactors: params.foldingFactors,
            targetSecurityBits: params.targetSecurityBits,
            maxGrindingBits: params.maxGrindingBits,
        });
    return {
        nQueries: friCalculator.nQueries,
        nGrindingBits: friCalculator.nGrindingBits,
    }
}

module.exports = {
    createSecurityCalculator,
    getOptimalFRIQueryParams,
};

// Usage example
if (require.main === module) {
    const field = 2n ** 64n - 2n ** 32n + 1n;
    const extensionDegree = 3n;
    const fieldSize = field ** extensionDegree;

    const jbr = createSecurityCalculator("JBR", {
        name: "Example JBR Calculation",
        // Field
        fieldSize,

        // Code parameters
        dimension: 2 ** 17,
        rate: 1 / 2,

        // Constraints
        nConstraints: 2432,
        maxConstraintDegree: 3,
        nOpeningPoints: 26,

        // FRI
        nFunctions: 4065,
        foldingFactors: [4, 4, 4],
        maxGrindingBits: 25,

        // Target
        targetSecurityBits: 128,
    });

    console.log(jbr.formatReport());

    const jbr_opt = getOptimalFRIQueryParams(jbr.regime, {
        nFunctions: 4065,
        foldingFactors: [4, 4, 4],
        maxGrindingBits: 25,
        targetSecurityBits: 128,
    });

    console.log("Optimal FRI Query Params for JBR:");
    console.log(jbr_opt);

    // Compare with UDR
    const udr = createSecurityCalculator("UDR", {
        name: "Example UDR Calculation",
        fieldSize,
        dimension: 2 ** 17,
        rate: 1 / 2,
        nConstraints: 2432,
        maxConstraintDegree: 3,
        nOpeningPoints: 26,
        nFunctions: 4065,
        foldingFactors: [4, 4, 4],
        nQueries: 128,
        nGrindingBits: 16,
        targetSecurityBits: 128,
    });

    console.log(udr.formatReport());

    const udr_opt = getOptimalFRIQueryParams(udr.regime, {
        nFunctions: 4065,
        foldingFactors: [4, 4, 4],
        maxGrindingBits: 25,
        targetSecurityBits: 128,
    });

    console.log("Optimal FRI Query Params for UDR:");
    console.log(udr_opt);
}
