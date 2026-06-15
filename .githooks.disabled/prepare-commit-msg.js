#!/usr/bin/env node

// =============================================================================
// prepare-commit-msg hook — Automated AI trailer injection
//
// Reads .ai-tracker.json (written by the VS Code extension) and appends
// AI trailers to the commit message automatically. No prompts, no manual input.
//
// Git calls this hook with:  prepare-commit-msg <msg-file> [<source>] [<sha>]
//   source = "message" (git commit -m), "merge", "squash", "commit" (amend)
//
// WHAT THIS DOES:
//   1. Reads .ai-tracker.json from the repo root
//   2. Finds which staged files overlap with AI-tracked files
//   3. Computes signals: AI-Assisted, tool, model proxy, languages, percentage
//   4. Appends trailers to the commit message file
//   5. Resets the tracker for the next session
// =============================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COMMIT_MSG_FILE = process.argv[2];
const SOURCE = process.argv[3] || '';  // "message", "merge", "commit", or empty

// Skip for merges and amends — only process normal commits
if (['merge', 'squash'].includes(SOURCE)) process.exit(0);

const REPO_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const TRACKER_FILE = path.join(REPO_ROOT, '.ai-tracker.json');

// --- Read tracker ---

let tracker;
try {
    tracker = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
} catch {
    // No tracker file → extension not running or never set up → mark unknown
    appendTrailers({ 'AI-Assisted': 'unknown' });
    process.exit(0);
}

// --- Get staged files ---

let stagedFiles;
try {
    stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
} catch {
    stagedFiles = [];
}

// --- Correlate staged files with tracker ---
//
// Priority:
//   1. Use `staged` snapshots (per-staging-event tracking) — most accurate
//   2. Fall back to `files` (session-based) — backwards compatible
//
// The VS Code extension snapshots file data when `git add` is run, ensuring
// each commit only reflects the delta since files were staged.

let aiEdits = 0;
let manualEdits = 0;
let aiLines = 0;
let manualLines = 0;
let untrackedFiles = 0;
const languages = new Set();
const models = new Set();
let earliestEdit = null;   // earliest firstEdit across staged files
let latestEdit = null;     // latest lastEdit across staged files

// Check if we have staged snapshots (new per-staging-event approach)
const hasStaged = tracker.staged && Object.keys(tracker.staged).length > 0;

for (const file of stagedFiles) {
    const normalized = file.replace(/\\/g, '/');
    
    // Prefer staged snapshot if available, otherwise fall back to files
    const entry = hasStaged 
        ? (tracker.staged?.[normalized] || tracker.files?.[normalized])
        : tracker.files?.[normalized];
    
    if (entry && (entry.aiEdits > 0 || entry.manualEdits > 0 || entry.aiLines > 0 || entry.manualLines > 0)) {
        // File has real tracking data
        aiEdits += entry.aiEdits || 0;
        manualEdits += entry.manualEdits || 0;
        aiLines += entry.aiLines || 0;
        manualLines += entry.manualLines || 0;
        if (entry.lang) languages.add(entry.lang);
        if (entry.models && Array.isArray(entry.models)) {
            for (const m of entry.models) {
                if (m.id) models.add(m.id);
            }
        }
        // Collect edit timestamps to compute actual editing duration
        if (entry.firstEdit) {
            const t = new Date(entry.firstEdit);
            if (!earliestEdit || t < earliestEdit) earliestEdit = t;
        }
        if (entry.lastEdit) {
            const t = new Date(entry.lastEdit);
            if (!latestEdit || t > latestEdit) latestEdit = t;
        }
    } else {
        // File staged but not tracked by extension (extension not running,
        // or file edited before extension was active)
        untrackedFiles++;
    }
}

// If NO staged files had any tracking data at all → unknown (extension wasn't
// tracking this session, not the same as "no AI used")
if (aiEdits === 0 && manualEdits === 0 && aiLines === 0 && manualLines === 0 && untrackedFiles > 0) {
    appendTrailers({ 'AI-Assisted': 'unknown' });
    resetTracker();   // always reset so counts don't accumulate across commits
    process.exit(0);
}

// --- Compute signals ---

// Lines are more reliable than edit counts because edit counts are inflated by
// debounce events, auto-close brackets, and agent-mode multi-step edits.
// Use lines as the primary percentage when available, fall back to edits.
const totalLines = aiLines + manualLines;
// Cap at 99% when the other side has any contribution — 100% means truly zero manual/AI lines
const aiLinesPercentage = totalLines > 0
    ? Math.min(Math.round((aiLines / totalLines) * 100), manualLines > 0 ? 99 : 100)
    : 0;

const totalEdits = aiEdits + manualEdits;
const aiPercentage = totalEdits > 0
    ? Math.min(Math.round((aiEdits / totalEdits) * 100), manualEdits > 0 ? 99 : 100)
    : 0;

let aiAssisted;
// When line data is available, use ONLY lines for AI-Assisted determination.
// Edit event counts are noisy — small agent edits (e.g. single-line replacements)
// fall below size thresholds and get misclassified as manual, even though they
// produce 0 manual lines. Lines are the ground truth.
if (totalLines > 0) {
    if (aiLines === 0) aiAssisted = 'no';
    else if (manualLines === 0) aiAssisted = 'yes';
    else aiAssisted = 'partial';
} else {
    // No line data — fall back to edit counts
    if (aiEdits === 0) aiAssisted = 'no';
    else if (manualEdits === 0) aiAssisted = 'yes';
    else aiAssisted = 'partial';
}

// Determine tool name using session-wide totals — tool type (inline vs chat)
// is a property of the whole coding session, not per-staged-file.
const sessionInlineCount = tracker.inlineAcceptCount || 0;
const sessionChatCount   = tracker.chatInsertCount   || 0;

let aiTool = 'none';
if (tracker.copilotActive) {
    if (sessionChatCount > 0 && sessionInlineCount > 0) {
        aiTool = 'copilot+copilot-chat';
    } else if (sessionChatCount > 0) {
        aiTool = 'copilot-chat';
    } else {
        aiTool = 'copilot';
    }
}

// For the count trailers we MUST use staged snapshots only.
// Session totals span every file touched all day; publishing them on a 2-file
// commit would massively over-count completions for those files.
// When the staging watcher fired (hasStaged = true), stagedInlineAcceptCount
// is a point-in-time snapshot taken at `git add` — accurate and scoped.
// When hasStaged is false (Windows watcher miss), we omit the raw counts
// rather than emit misleading session-wide numbers.
const inlineCount = hasStaged ? (tracker.stagedInlineAcceptCount || 0) : 0;
const chatCount   = hasStaged ? (tracker.stagedChatInsertCount   || 0) : 0;

// Model: Use selectedModel if available, otherwise fall back to version proxy
let aiModel = 'unknown';
if (tracker.selectedModel && tracker.selectedModel.id) {
    aiModel = tracker.selectedModel.name || tracker.selectedModel.id;
} else if ([...models].length > 0) {
    aiModel = [...models].join(', ');
} else if (tracker.copilotVersion) {
    aiModel = `copilot-v${tracker.copilotVersion}`;
}

// Language: pick the most common, or join if few
const langList = [...languages];
const aiLanguage = langList.length > 0
    ? (langList.length <= 3 ? langList.join(', ') : `${langList.slice(0, 3).join(', ')} +${langList.length - 3} more`)
    : 'unknown';

// Session duration (minutes) — computed from actual edit timestamps of staged
// files, NOT from sessionStart. The extension's in-memory state overwrites the
// hook's reset of sessionStart within 2 seconds, so sessionStart is stale and
// grows unboundedly. Edit timestamps are per-file, accurate, and scoped.
const sessionMinutes = (earliestEdit && latestEdit)
    ? Math.max(1, Math.round((latestEdit - earliestEdit) / 60000))
    : 0;

// --- Build trailers ---

const trailers = {
    'AI-Assisted': aiAssisted,
};

if (aiAssisted !== 'no') {
    trailers['AI-Tool'] = aiTool;
    trailers['AI-Model'] = aiModel;
    trailers['AI-Language'] = aiLanguage;
    trailers['AI-Percentage'] = String(aiPercentage);
    trailers['AI-Lines-Percentage'] = String(aiLinesPercentage);
    trailers['AI-Edits'] = String(aiEdits);
    trailers['AI-Manual-Edits'] = String(manualEdits);
    trailers['AI-Lines'] = String(aiLines);
    trailers['Manual-Lines'] = String(manualLines);
    if (inlineCount > 0)
        trailers['AI-Inline-Completions'] = String(inlineCount);
    if (chatCount > 0)
        trailers['AI-Chat-Insertions'] = String(chatCount);
    if (sessionMinutes > 0)
        trailers['AI-Session-Minutes'] = String(sessionMinutes);
}

appendTrailers(trailers);

// --- Reset tracker after successful trailer injection ---
resetTracker();

// --- Helper functions ---

function appendTrailers(trailerObj) {
    try {
        let msg = fs.readFileSync(COMMIT_MSG_FILE, 'utf8');

        // Don't add trailers if they already exist (e.g. amend)
        if (msg.includes('AI-Assisted:')) return;

        // Strip trailing comment lines (git adds # comments)
        const lines = msg.split('\n');
        const contentLines = [];
        const commentLines = [];
        let hitComments = false;

        for (const line of lines) {
            if (line.startsWith('#') && !hitComments) {
                hitComments = true;
            }
            if (hitComments) {
                commentLines.push(line);
            } else {
                contentLines.push(line);
            }
        }

        // Ensure blank line before trailers
        const content = contentLines.join('\n').trimEnd();
        const trailerStr = Object.entries(trailerObj)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n');

        const newMsg = content + '\n\n' + trailerStr + '\n' + commentLines.join('\n');
        fs.writeFileSync(COMMIT_MSG_FILE, newMsg, 'utf8');
    } catch (e) {
        // Don't block the commit if we can't write trailers
        console.error(`[AI Tracker] Warning: could not append trailers: ${e.message}`);
    }
}

function resetTracker() {
    try {
        const empty = {
            sessionStart: new Date().toISOString(),
            copilotActive: tracker.copilotActive || false,
            copilotVersion: tracker.copilotVersion || null,
            copilotChatVersion: tracker.copilotChatVersion || null,
            selectedModel: tracker.selectedModel || null,
            files: {},
            staged: {},                    // Clear staged snapshots after commit
            inlineAcceptCount: 0,
            chatInsertCount: 0,
            stagedInlineAcceptCount: 0,    // Clear staged counts
            stagedChatInsertCount: 0,
        };
        fs.writeFileSync(TRACKER_FILE, JSON.stringify(empty, null, 2), 'utf8');
    } catch {
        // Silent — tracker will be overwritten by the extension anyway
    }
}
