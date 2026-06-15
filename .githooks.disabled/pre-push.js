#!/usr/bin/env node

// =============================================================================
// pre-push hook — Warns if any outgoing commit is missing AI-Assisted trailer.
// Set BLOCK = true below to hard-block the push instead of just warning.
// =============================================================================

const { execSync } = require('child_process');

const BLOCK = false;  // Change to true to prevent push on missing trailers

const input = require('fs').readFileSync(0, 'utf8').trim();
if (!input) process.exit(0);

let errors = 0;
for (const line of input.split('\n')) {
    const parts = line.split(' ');
    if (parts.length < 4) continue;
    const [, localSha, , remoteSha] = parts;
    const ZERO = '0000000000000000000000000000000000000000';
    if (localSha === ZERO) continue;  // branch delete

    const range = remoteSha === ZERO ? localSha : `${remoteSha}..${localSha}`;
    let log;
    try { log = execSync(`git log --format="%H %s%n%B" ${range}`, { encoding: 'utf8' }); }
    catch { continue; }

    const commits = log.split(/^(?=[0-9a-f]{40} )/m).filter(Boolean);
    for (const block of commits) {
        const sha = block.slice(0, 8);
        if (!/^AI-Assisted:\s*.+/m.test(block)) {
            console.error(`[AI Tracker] Missing AI-Assisted trailer in ${sha}`);
            errors++;
        }
    }
}

if (errors > 0) {
    if (BLOCK) {
        console.error(`\n[AI Tracker] Push blocked: ${errors} commit(s) missing AI-Assisted trailer.`);
        process.exit(1);
    } else {
        console.error(`\n[AI Tracker] Warning: ${errors} commit(s) missing AI-Assisted trailer.`);
    }
}
