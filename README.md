## ⚠️ Disclaimer: Software Under Development ⚠️

This software is currently under **active development** and has not been audited for security or correctness.

Please be aware of the following:
* The software is **not fully tested**.
* **Do not use it in production environments** until a stable production release is available. 🚧
* Additional functionalities and optimizations **are planned for future releases**.
* Future updates may introduce breaking **backward compatible changes** as development progresses.

If you encounter any errors or unexpected behavior, please report them. Your feedback is highly appreciated in improving the software.

# Proof Manager JS
The Proof Manager is an adaptable Proof Manager designed to assist in the creation of proofs from an Airout-formatted files. This repository generates the setup that will later be used using [PIL2-Proofman](https://github.com/0xPolygonHermez/pil2-proofman) to generate proofs

## Usage
To generate a proof that a computation was executed correctly, you will need to do the following:

1. Define one or several AIRs of your computations using an Airout formatted file. See [PIL2 compiler](https://github.com/0xPolygonHermez/pil2-compiler) for more info.
2. Define your executors implementing a class derived from witness_calculator_component to write you execution trace/s for your computation. 
3. Define a configuration of your execution plan defining the used executors, used libraries, prover and verifier.
4. Execute your computation and get a new proof.


## License

All crates in this monorepo are licensed under one of the following options:

- The Apache License, Version 2.0 (see LICENSE-APACHE or http://www.apache.org/licenses/LICENSE-2.0)

- The MIT License (see LICENSE-MIT or http://opensource.org/licenses/MIT)

You may choose either license at your discretion.

## Acknowledgements

ProofMan is a collaborative effort made possible by the contributions of researchers, engineers, and developers dedicated to advancing zero-knowledge technology.

We extend our gratitude to the [Polygon zkEVM](https://github.com/0xpolygonhermez) and [Plonky3](https://github.com/Plonky3/Plonky3) teams for their foundational work in zero-knowledge proving systems.

Additionally, we acknowledge the efforts of the open-source cryptography and ZK research communities, whose insights and contributions continue to shape the evolution of efficient and scalable zero-knowledge technologies.

🚀 Special thanks to all contributors who have helped develop, refine, and improve ProofMan!