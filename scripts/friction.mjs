#!/usr/bin/env node
// Append one friction event to $STATE/friction.jsonl.
// Usage: node friction.mjs <free-text description>
// State dir: CC_ASCENSION_STATE or ~/.claude/evolution
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const state = process.env.CC_ASCENSION_STATE ?? join(homedir(), '.claude', 'evolution');
const text = process.argv.slice(2).join(' ').trim();
if (!text) {
  console.error('usage: friction.mjs <description>');
  process.exit(1);
}
mkdirSync(state, { recursive: true });
const file = join(state, 'friction.jsonl');
appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), cwd: process.cwd(), text }) + '\n');
console.log(`logged to ${file}`);
