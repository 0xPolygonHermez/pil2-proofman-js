'use strict';

/**
 * Wrapper script for Rust↔JS interop.
 *
 * Protocol (line-delimited JSON on stdout):
 *   Rust → Node  (stdin):  { "type": "call", "fn": "setup", "args": { "config": {...}, "buildDir": "..." } }
 *   Node → Rust  (stdout): { "type": "log",    "level": "info|warn|error", "msg": "..." }
 *                          { "type": "result",  "ok": true }
 *                          { "type": "error",   "message": "...", "stack": "..." }
 *
 * All regular console output is redirected to stderr so stdout stays clean for the protocol.
 * In the future, JS can request Rust work via:
 *   Node → Rust  (stdout): { "type": "rust_call", "id": 1, "fn": "...", "args": {...} }
 *   Rust → Node  (stdin):  { "type": "rust_result", "id": 1, "value": {...} }
 */

const setupCmd = require('./setup_cmd');

// --- stdout helpers ---------------------------------------------------------

const proto = {
    log(level, msg) {
        process.stdout.write(JSON.stringify({ type: 'log', level, msg }) + '\n');
    },
    result(ok) {
        process.stdout.write(JSON.stringify({ type: 'result', ok }) + '\n');
    },
    error(message, stack) {
        process.stdout.write(JSON.stringify({ type: 'error', message, stack: stack || null }) + '\n');
    },
};

// Redirect all console output to stderr so stdout stays clean for the protocol.
console.log   = (...args) => process.stderr.write(args.join(' ') + '\n');
console.info  = (...args) => process.stderr.write('[INFO]  ' + args.join(' ') + '\n');
console.warn  = (...args) => process.stderr.write('[WARN]  ' + args.join(' ') + '\n');
console.error = (...args) => process.stderr.write('[ERROR] ' + args.join(' ') + '\n');

// ---------------------------------------------------------------------------

async function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => { data += chunk; });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
}

async function main() {
    let raw;
    try {
        raw = await readStdin();
    } catch (err) {
        proto.error('Failed to read stdin: ' + err.message, err.stack);
        process.exit(1);
    }

    let message;
    try {
        message = JSON.parse(raw);
    } catch (err) {
        proto.error('Failed to parse stdin JSON: ' + err.message);
        process.exit(1);
    }

    if (message.type !== 'call' || message.fn !== 'setup') {
        proto.error(`Unexpected message: ${JSON.stringify(message)}`);
        process.exit(1);
    }

    const { config, buildDir } = message.args;

    try {
        await setupCmd(config, buildDir);
        proto.result(true);
    } catch (err) {
        proto.error(err.message, err.stack);
        process.exit(1);
    }
}

main();
