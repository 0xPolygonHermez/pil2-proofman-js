'use strict';

/**
 * Wrapper for Rust↔JS interop — bidirectional line-delimited JSON protocol.
 *
 * Each line on stdin  is a JSON request:
 *   { "type": "call", "fn": "setup_part1"|"setup_part2", "args": { ... } }
 *
 * Each line on stdout is a JSON response:
 *   { "type": "result", "ok": true,  "value": <any> }
 *   { "type": "result", "ok": false }
 *   { "type": "error",  "message": "...", "stack": "..." }
 *   { "type": "log",    "level": "info|warn|error", "msg": "..." }
 *
 * setup_part1 → returns plain JSON (no BigInt yet, constRoot not computed)
 * setup_part2 → no return value; all output is written to disk
 */

const readline = require('readline');
const { setupPart1, setupPart2 } = require('./setup_cmd');

// ---------------------------------------------------------------------------
// Redirect all console output to stderr — stdout is reserved for the protocol.
// ---------------------------------------------------------------------------
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
console.info = (...args) => process.stderr.write('[INFO]  ' + args.join(' ') + '\n');
console.warn = (...args) => process.stderr.write('[WARN]  ' + args.join(' ') + '\n');
console.error = (...args) => process.stderr.write('[ERROR] ' + args.join(' ') + '\n');

// ---------------------------------------------------------------------------
// Protocol helpers
// ---------------------------------------------------------------------------
const proto = {
    result(value) {
        const msg = value !== undefined
            ? { type: 'result', ok: true, value }
            : { type: 'result', ok: true };
        process.stdout.write(JSON.stringify(msg) + '\n');
    },
    error(message, stack) {
        process.stdout.write(JSON.stringify({ type: 'error', message, stack: stack || null }) + '\n');
    },
};

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------
async function handleSetupPart1({ config, buildDir }) {
    const setup = await setupPart1(config, buildDir);
    // setup contains plain JSON (starkInfo, verifierInfo, expressionsInfo).
    // No BigInt values at this point — constRoot is only added in Part 2.
    proto.result(setup);
}

async function handleSetupPart2({ config, buildDir, starkStructs }) {
    await setupPart2(config, buildDir, starkStructs);
    proto.result();
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
            proto.error('Failed to parse request: ' + err.message);
            process.exit(1);
        }

        const { fn, args } = request;

        try {
            if (fn === 'setup_part1') {
                await handleSetupPart1(args);
            } else if (fn === 'setup_part2') {
                await handleSetupPart2(args);
            } else {
                throw new Error(`Unknown function: ${fn}`);
            }
        } catch (err) {
            proto.error(err.message, err.stack);
            process.exit(1);
        }
    }
}

main();
