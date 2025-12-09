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
        const correction = this.fieldSize >= (1n << 150n) ? 1 / this.codewordLength : this.rate / 20;

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
        const correction = this.fieldSize >= (1n << 150n) ? 1 / this.codewordLength : this.rate / 20;

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
        const denominator = new Decimal(3 * this.rate * this.sqrtRate).mul(this.fieldSize);

        return new Decimal(numerator).div(denominator); 
    }
}

/**
 * FRI Security Calculator
 */
class FRISecurityCalculator {
    constructor(regime, params) {
        this.regime = regime;
        this.nFunctions = params.nFunctions;
        this.foldingFactors = params.foldingFactors;
        this.nGrindingBits = params.nGrindingBits;
        this.nQueries = params.nQueries;
    }

    get nCommitRounds() {
        return this.foldingFactors.length;
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
     * Phase 3: Query Phase
     * Verifier queries random positions to check consistency
     */
    calculateQueryPhaseError() {
        const base = 1 - this.regime.proximityParameter;
        const numerator = new Decimal(base).pow(this.nQueries);
        const denominator = new Decimal(2).pow(this.nGrindingBits);
        return numerator.div(denominator);
    }

    /**
     * Calculate total FRI security in bits
     */
    calculateError() {
        const errors = [];

        // Batch phase error
        errors.push(this.calculateBatchPhaseError());

        // Commit phase errors
        for (let i = 0; i < this.nCommitRounds; i++) {
            errors.push(this.calculateCommitPhaseError(i));
        }

        // Query phase error
        errors.push(this.calculateQueryPhaseError());

        // Security is limited by the worst (maximum) error
        const maxError = Decimal.max(...errors);

        return maxError;
    }

    /**
     * Get breakdown of security by phase
     */
    getSecurityBreakdown() {
        const batchError = this.calculateBatchPhaseError();
        const queryError = this.calculateQueryPhaseError();

        // Calculate per-round commit errors
        const commitRounds = [];
        let worstCommitError = new Decimal(0);
        for (let i = 0; i < this.nCommitRounds; i++) {
            const roundError = this.calculateCommitPhaseError(i);
            worstCommitError = Decimal.max(worstCommitError, roundError);
            commitRounds.push({
                round: i,
                foldingFactor: this.foldingFactors[i],
                error: roundError,
                securityBits: get_security_from_error(roundError),
            });
        }

        // Security is limited by the maximum error (minimum security)
        const maxError = Decimal.max(batchError, worstCommitError, queryError);

        return {
            batchPhase: {
                nFunctions: this.nFunctions,
                error: batchError,
                securityBits: get_security_from_error(batchError),
            },
            commitPhase: {
                nRounds: this.nCommitRounds,
                rounds: commitRounds,
                worstError: worstCommitError,
                securityBits: get_security_from_error(worstCommitError),
            },
            queryPhase: {
                nQueries: this.nQueries,
                nGrindingBits: this.nGrindingBits,
                error: queryError,
                securityBits: get_security_from_error(queryError),
            },
            total: {
                error: maxError,
                securityBits: get_security_from_error(maxError),
            },
        };
    }

    formatReport() {
        const b = this.getSecurityBreakdown();
        const lines = [];

        lines.push("FRI Security Breakdown:");
        lines.push(
            `  - Batch Phase (${b.batchPhase.nFunctions} functions): ${b.batchPhase.securityBits} bits`
        );
        lines.push(
            `  - Commit Phase: ${b.commitPhase.securityBits} bits`
        );
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
        this.fieldBits = Decimal.log2(this.fieldSize);

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
            throw new Error(`Unknown decoding regime: ${params.regime}`);
        }

        // Constraint parameters
        this.nConstraints = params.nConstraints;
        this.maxConstraintDegree = params.maxConstraintDegree;

        // FRI parameters
        this.nFunctions = params.nFunctions;
        this.foldingFactors = params.foldingFactors;
        this.nQueries = params.nQueries;
        this.nGrindingBits = params.nGrindingBits ?? 0;

        // Create FRI calculator
        this.friCalculator = new FRISecurityCalculator(this.regime, {
            nFunctions: this.nFunctions,
            foldingFactors: this.foldingFactors,
            nQueries: this.nQueries,
            nGrindingBits: this.nGrindingBits,
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
        const numerator = this.regime.maxListSize *
            ((this.maxConstraintDegree - 1) * (this.augmentedDimension - 1) +
                (this.dimension - 1));
        const denominator = this.fieldSize.minus(this.codewordLength + this.dimension);
        return new Decimal(numerator).div(denominator);
    }

    // Fast Reed-Solomon IOPP (FRI) Security
    calculateFRIError() {
        return this.friCalculator.calculateError();
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

        lines.push(
            "==================== SECURITY ANALYSIS ===================="
        );
        lines.push(`Target Security: ${this.targetSecurityBits} bits`);
        lines.push("");

        lines.push("Code Parameters:");
        lines.push(`  - Regime: ${b.regime}`);
        lines.push(`  - Dimension: 2^${Math.log2(this.dimension)}`);
        lines.push(`  - Length: 2^${Math.log2(this.codewordLength)}`);
        lines.push(`  - Rate: ${this.rate}`);
        lines.push(`  - Field Size: 2^${Decimal.floor(this.fieldBits)}`);
        lines.push("");

        lines.push("FRI Parameters:");
        lines.push(`  - Num Functions: ${this.nFunctions}`);
        lines.push(`  - Folding Factors: [${this.foldingFactors.join(", ")}]`);
        lines.push(`  - Num Queries: ${this.nQueries}`);
        lines.push(`  - Query Grinding Bits: ${this.nGrindingBits}`);
        lines.push("");

        lines.push(
            `Total Security: ${b.totalSecurityBits} bits (bottleneck: ${b.bottleneck})`
        );
        lines.push("");

        if (b.meetsTarget) {
            lines.push(
                `✓ Security target of ${b.targetSecurityBits} bits is MET`
            );
            const margin = b.totalSecurityBits - b.targetSecurityBits;
            lines.push(`  Margin: +${margin} bits`);
        } else {
            lines.push(
                `✗ Security target of ${b.targetSecurityBits} bits is NOT MET`
            );
            lines.push(`  Deficit: ${b.deficit} bits`);
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
            "-------------------------------------------------------------"
        );

        lines.push("Security Breakdown:");
        lines.push(`  - ALI:  ${b.aliSecurityBits} bits`);
        lines.push(`  - DEEP: ${b.deepSecurityBits} bits`);
        lines.push(`  - FRI:  ${b.friSecurityBits} bits`);
        lines.push("");

        lines.push(this.friCalculator.formatReport());
        lines.push(
            "============================================================"
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

module.exports = {
    createSecurityCalculator,
};


// Usage example
if (require.main === module) {
    const field = 2n ** 64n - 2n ** 32n + 1n; // Goldilocks
    const extensionDegree = 3n;
    const fieldSize = field ** extensionDegree;

    const calc = createSecurityCalculator("JBR", {
        // Field
        fieldSize,

        // Code parameters
        dimension: 2 ** 20,
        rate: 1 / 4,

        // Constraints
        nConstraints: 100,
        maxConstraintDegree: 8,
        nOpeningPoints: 3,

        // FRI
        nFunctions: 10,
        foldingFactors: [4, 4, 4, 2],
        nQueries: 64,
        nGrindingBits: 16,

        // Target
        targetSecurityBits: 128,
    });

    console.log(calc.formatReport());

    // Compare with UDR
    const calcUDR = createSecurityCalculator("UDR", {
        fieldSize,
        dimension: 2 ** 20,
        rate: 1 / 8,
        nConstraints: 100,
        maxConstraintDegree: 8,
        nOpeningPoints: 3,
        nFunctions: 10,
        foldingFactors: [4, 4, 4, 2],
        nQueries: 64,
        nGrindingBits: 16,
        targetSecurityBits: 128,
    });

    console.log(calcUDR.formatReport());
}
