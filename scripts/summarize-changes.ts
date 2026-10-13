// Prints the commit message body for a data refresh: a short note by Claude, then the exact change list.
// Compares data/ in the working tree with a git revision (default HEAD): node scripts/summarize-changes.ts [rev]
// Without Claude credentials, or if the call fails, it prints the change list alone, so a data update never waits on it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { describeChanges, diffEntries } from '../src/lib/changes.ts';
import type { Entry } from '../src/lib/changes.ts';

const rev = process.argv[2] ?? 'HEAD';
const FILES = [
  { title: 'Items', file: 'items.json', list: 'items', key: (e: Entry) => String(e.id), label: (e: Entry) => String(e.name) },
  { title: 'Imbuements', file: 'imbuements.json', list: 'imbuements', key: (e: Entry) => String(e.name) },
  { title: 'Creatures', file: 'creatures.json', list: 'creatures', key: (e: Entry) => String(e.name) },
  { title: 'Hunting places', file: 'hunts.json', list: 'hunts', key: (e: Entry) => String(e.name) },
  { title: 'Weapon proficiency', file: 'proficiency.json', list: 'proficiency', key: (e: Entry) => String(e.name) },
];

const SYSTEM = `You write the change note for a data refresh of the Tibia Equipment Optimizer, a fan site whose item, imbuement \
and creature data is imported weekly from TibiaWiki. You get the exact list of what this refresh changed. Write a short note \
for the site's maintainer: lead with what matters to players (new or removed gear, changed armor, attack, protections or level \
requirements, creatures that hit harder or take different damage), then sum up the rest. Plain text without headings, under \
150 words. Use only what the list says; do not guess why something changed.`;

function entries(json: string | undefined, list: string): Entry[] {
  return json ? (JSON.parse(json)[list] as Entry[]) : [];
}

// A file that did not exist at `rev` counts as empty, so all of its entries are new.
function committed(file: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${rev}:data/${file}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
}

async function summarize(changeList: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // On a policy decline the API re-runs the request on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [{ role: 'user', content: changeList }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`declined (${response.stop_details?.category ?? 'no category'})`);
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('').trim();
  if (!text || response.stop_reason === 'max_tokens') throw new Error(`no complete note (stop reason ${response.stop_reason})`);
  return text;
}

const changeList = describeChanges(FILES.map(({ title, file, list, key, label }) => ({
  title,
  changes: diffEntries(entries(committed(file), list), entries(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'), list), key, label),
})));

if (!changeList) {
  console.log('No data changes.');
} else {
  let note = '';
  try {
    note = await summarize(changeList);
  } catch (err) {
    const reason = err instanceof Anthropic.APIError ? `API error ${err.status ?? ''} ${err.message}` : (err as Error).message;
    console.error(`Claude note skipped: ${reason}`);
  }
  console.log(note ? `${note}\n\nChanges:\n${changeList}` : changeList);
}
