'use strict';

/**
 * Wrapper for Rust↔JS interop — bidirectional line-delimited JSON protocol.
 *
 * Each line on stdin  is a JSON request:
 *   { "type": "call", "fn": "setup_part1"|"setup_part2", "id": <n>, "args": { ... } }
 *
 * Each line on stdout is a JSON response:
 *   { "type": "result", "id": <n>, "ok": true,  "value": <any> }
 *   { "type": "result", "id": <n>, "ok": false }
 *   { "type": "error",  "id": <n>, "message": "...", "stack": "..." }
 *   { "type": "log",               "level": "info|warn|error", "msg": "..." }
 *
 * setup_part1 → returns plain JSON (no BigInt yet, constRoot not computed)
 * setup_part2 → no return value; all output is written to disk
 *
 * Future: JS can request Rust work via:
 *   { "type": "rust_call", "id": <n>, "fn": "...", "args": { ... } }
 *   Rust replies on stdin:
 *   { "type": "rust_result", "id": <n>, "value": { ... } }
 */

const readline = require('readline');
const { setupPart1, setupPart2 } = require('./setup_cmd');

// ---------------------------------------------------------------------------
// Redirect all console output to stderr — stdout is reserved for the protocol.
// ---------------------------------------------------------------------------
console.log   = (...args) => process.stderr.write(args.join(' ') + '\n');
console.info  = (...args) => process.stderr.write('[INFO]  ' + args.join(' ') + '\n');
console.warn  = (...args) => process.stderr.write('[WARN]  ' + args.join(' ') + '\n');
console.error = (...args) => process.stderr.write('[ERROR] ' + args.join(' ') + '\n');

// ---------------------------------------------------------------------------
// Protocol helpers
// ---------------------------------------------------------------------------
const proto = {
    result(id, value) {
        const msg = value !== undefined
            ? { type: 'result', id, ok: true, value }
            : { type: 'result', id, ok: true };
        process.stdout.write(JSON.stringify(msg) + '\n');
    },
    error(id, message, stack) {
        process.stdout.write(JSON.stringify({ type: 'error', id, message, stack: stack || null }) + '\n');
    },
};

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------
async function handleSetupPart1(id, { config, buildDir }) {
    const setup = await setupPart1(config, buildDir);
    // setup contains plain JSON (starkInfo, verifierInfo, expressionsInfo).
    // No BigInt values at this point — constRoot is only added in Part 2.
    proto.result(id, setup);
}

async function handleSetupPart2(id, { config, buildDir, starkStructs }) {
    await setupPart2(config, buildDir, starkStructs);
    proto.result(id);
}

// ---------------------------------------------------------------------------
// Main loop: read requests line by line from stdin
// ---------------------------------------------------------------------------
async function main() {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });

    for await (const line of rl) {
        if (!line.trim()) continue;

        let request;
        try {
            request = JSON.parse(line);
        } catch (err) {
            // Malformed line — send an error without an id
            proto.error(null, 'Failed to parse request: ' + err.message);
            process.exit(1);
        }

        const { id, fn, args } = request;

        try {
            if (fn === 'setup_part1') {
                await handleSetupPart1(id, args);
            } else if (fn === 'setup_part2') {
                await handleSetupPart2(id, args);
            } else {
                throw new Error(`Unknown function: ${fn}`);
            }
        } catch (err) {
            proto.error(id, err.message, err.stack);
            process.exit(1);
        }
    }
}

main();
