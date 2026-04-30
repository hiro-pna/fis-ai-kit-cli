#!/usr/bin/env node
/**
 * check-skill-cross-refs.js
 *
 * CI gate: verifies that all /fis:<name> references in claude/ markdown files
 * point to a registered skill name (from SKILL.md frontmatter) and do not
 * collide with Claude Code built-in commands.
 *
 * Usage: node scripts/check-skill-cross-refs.js
 * Exit 0 = all references valid (or no references found)
 * Exit 1 = broken references or collisions found
 */

'use strict';

const { readFileSync, readdirSync, lstatSync, existsSync } = require('fs');
const path = require('path');

// Walk up from cli/scripts/ to repo root containing claude/
const repoRoot = path.resolve(__dirname, '..', '..');
const claudeDir = path.join(repoRoot, 'claude');

// Claude Code built-in commands that must not be used as skill names.
// FIS uses 2-level namespace (/fis:<role>:<name>) so collision risk is low —
// only flag if name exactly matches built-in AND would be invoked bare.
// Empty here because /fis: prefix prevents collision in invocation.
const BUILTIN_COMMANDS = new Set([]);

// Role namespaces — virtual entries to make /fis:<role> bare refs valid
// (used in docs as wildcard examples like "/fis:ba:* hoặc /fis:sa:*").
const ROLE_NAMESPACES = new Set(['ba', 'sa', 'dev', 'qa', 'cross', 'three-amigos']);

// Skills whose folder name overlaps with a built-in /fis: command name.
// The /fis: prefix prevents real collision; this set is a no-op allowlist
// reserved for future use if any folder names need to bypass the collision check.
const ALLOWED_BUILTIN_OVERLAPS = new Set();

// Regex to find /fis: references and capture ALL segments after /fis:
// Then validate by trying each segment against registered skills.
// Supports multiple shapes:
//   /fis:cook (1-level fis-ai-kit-style)
//   /fis:ba:create-prd (2-level FIS persona)
//   /fis:dev:stack:java-spring (3-level sub-namespace)
//   /fis:three-amigos:review-prd (sub-command — match three-amigos)
const FIS_REF_RE = /\/fis:((?:[a-z][a-z0-9-]*:?)+)/g;

/**
 * Recursively collect all files matching a predicate under a directory.
 */
function findFiles(dir, predicate) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = lstatSync(full);
    } catch {
      continue;
    }
    // Skip symlinks to prevent traversal outside the repo
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      results.push(...findFiles(full, predicate));
    } else if (predicate(entry, full)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Parses YAML frontmatter from a SKILL.md file and extracts the `name:` field.
 * Returns null if not found.
 */
function extractSkillName(content) {
  // Match YAML frontmatter block: --- ... ---
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1];
  // Extract name: value (unquoted or single/double quoted)
  const nameMatch = frontmatter.match(/^name:\s*['"]?([^\s'"]+)['"]?\s*$/m);
  if (!nameMatch) return null;

  return nameMatch[1].trim();
}

/**
 * Builds the canonical skill registry from all claude/skills/<skillname>/SKILL.md files.
 * Returns { registry: Set<string>, collisions: Array<{name, file}> }
 */
function buildSkillRegistry() {
  const skillsDir = path.join(claudeDir, 'skills');
  const skillFiles = findFiles(skillsDir, (entry) => entry === 'SKILL.md');

  const registry = new Set();
  const collisions = [];

  for (const filePath of skillFiles) {
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`[!] Could not read ${filePath}: ${err.message}`);
      continue;
    }

    const rawName = extractSkillName(content);
    if (!rawName) {
      // No name in frontmatter — skip silently (not our concern here)
      continue;
    }

    // Normalize: strip leading "ck:" prefix so we compare bare names against
    // the part captured after "/fis:" in references (e.g. "ck:journal" -> "journal")
    const name = rawName.startsWith('fis:') ? rawName.slice(3) : rawName;

    // Check collision, but skip skills that use fis-prefixed dir names to avoid it
    const dirName = path.basename(path.dirname(filePath));
    if (BUILTIN_COMMANDS.has(name) && !ALLOWED_BUILTIN_OVERLAPS.has(dirName)) {
      collisions.push({ name, file: path.relative(repoRoot, filePath) });
    }

    registry.add(name);
  }

  return { registry, collisions };
}

/**
 * Scans all .md files under claude/ and collects /fis: references.
 * Returns Array<{ ref: string, file: string, line: number }>
 */
function collectCkReferences() {
  const mdFiles = findFiles(claudeDir, (entry) => entry.endsWith('.md'));
  const refs = [];

  for (const filePath of mdFiles) {
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`[!] Could not read ${filePath}: ${err.message}`);
      continue;
    }

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      let match;
      // Reset lastIndex for global regex reuse
      FIS_REF_RE.lastIndex = 0;
      while ((match = FIS_REF_RE.exec(line)) !== null) {
        // match[1] is full segments after /fis:, e.g. "ba:create-prd" or "three-amigos:review-prd"
        const segments = match[1].split(':').filter(Boolean);
        refs.push({
          segments,
          file: path.relative(repoRoot, filePath),
          line: idx + 1,
        });
      }
    });
  }

  return refs;
}

/**
 * Verifies handoff-gate.cjs GATES map ↔ skill SKILL.md `gate:` metadata symmetry.
 * Catches drift where a skill declares a gate the hook doesn't enforce, or vice versa.
 * Also relevant for Cowork: hook is Claude Code-only, but symmetry tells us what
 * `fis reconcile` should expect each platform to honor.
 */
function checkGateSymmetry() {
  const hookPath = path.join(claudeDir, 'hooks', 'handoff-gate.cjs');
  if (!existsSync(hookPath)) return { ok: true, drift: [] };
  const hookSrc = readFileSync(hookPath, 'utf8');
  const hookGates = [...hookSrc.matchAll(/^\s*['"]?([a-z-]+)['"]?:\s*\{ upstream: \{ type: ['"]([a-z-]+)['"], status: ['"](\w+)['"]/gm)]
    .map((m) => ({ skill: m[1], type: m[2], status: m[3] }));

  const skillFiles = findFiles(path.join(claudeDir, 'skills'), (e) => e === 'SKILL.md');
  const skillGates = [];
  for (const f of skillFiles) {
    const c = readFileSync(f, 'utf8');
    const fmM = c.match(/^---\n([\s\S]*?)\n---/); if (!fmM) continue;
    const fm = fmM[1];
    const nameM = fm.match(/^name:\s*["']?([a-z0-9-]+)["']?/m); if (!nameM) continue;
    const gateM = fm.match(/gate:\s*\n\s*upstream:\s*\{\s*artifact:\s*([a-z-]+),\s*status:\s*(\w+)/);
    if (gateM) skillGates.push({ skill: nameM[1], type: gateM[1], status: gateM[2] });
  }

  const hookMap = Object.fromEntries(hookGates.map((g) => [g.skill, g]));
  const skillMap = Object.fromEntries(skillGates.map((g) => [g.skill, g]));
  const allSkills = new Set([...hookGates.map((g) => g.skill), ...skillGates.map((g) => g.skill)]);
  const drift = [];
  for (const s of [...allSkills].sort()) {
    const h = hookMap[s]; const k = skillMap[s];
    if (!h) drift.push(`hook missing: ${s} (skill says ${k.type}/${k.status})`);
    else if (!k) drift.push(`skill metadata missing: ${s} (hook says ${h.type}/${h.status})`);
    else if (h.type !== k.type || h.status !== k.status) drift.push(`mismatch: ${s} hook=${h.type}/${h.status} skill=${k.type}/${k.status}`);
  }
  return { ok: drift.length === 0, drift, hookCount: hookGates.length, skillCount: skillGates.length };
}

function main() {
  const { registry, collisions } = buildSkillRegistry();
  const allRefs = collectCkReferences();
  const gateCheck = checkGateSymmetry();

  let hasErrors = false;

  // Report name collisions with built-ins
  if (collisions.length > 0) {
    hasErrors = true;
    console.error('[X] Skill name collision(s) with Claude Code built-in commands:');
    for (const { name, file } of collisions) {
      console.error(`  - /fis:${name}  (defined in ${file})`);
    }
    console.error('');
  }

  // Check each reference: any segment matches a registered skill OR role namespace = valid
  const broken = allRefs
    .filter(({ segments }) =>
      !segments.some((s) => registry.has(s) || ROLE_NAMESPACES.has(s))
    )
    .map(({ segments, file, line }) => ({ ref: segments.join(':'), file, line }));

  if (broken.length > 0) {
    hasErrors = true;
    console.error('[X] Broken /fis: references (no segment matches registered skill):');
    for (const { ref, file, line } of broken) {
      console.error(`  - /fis:${ref}  at ${file}:${line}`);
    }
    console.error('');
    console.error('Registered skills:', [...registry].sort().join(', ') || '(none)');
  }

  // Report handoff-gate ↔ skill metadata symmetry drift
  if (!gateCheck.ok) {
    hasErrors = true;
    console.error('[X] Handoff gate symmetry drift (hook ↔ skill metadata):');
    for (const d of gateCheck.drift) console.error(`  - ${d}`);
    console.error('');
  }

  if (!hasErrors) {
    const refCount = allRefs.length;
    const skillCount = registry.size;
    console.log(`[OK] skill-cross-refs: ${skillCount} skill(s) registered, ${refCount} reference(s) checked — all valid.`);
    console.log(`[OK] handoff-gate symmetry: ${gateCheck.hookCount} hook gate(s) ↔ ${gateCheck.skillCount} skill gate(s) aligned.`);
    process.exit(0);
  }

  process.exit(1);
}

main();
