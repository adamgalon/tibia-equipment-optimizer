// Imports every equipment item from TibiaWiki into data/items.json.
// Usage: npm run import:items
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseInfobox, toItem } from '../src/lib/wiki.ts';
import type { Item, ItemData } from '../src/lib/types.ts';

const API = 'https://tibia.fandom.com/api.php';
const USER_AGENT = 'tibia-equipment-optimizer/0.1 (+https://github.com/adamgalon/tibia-equipment-optimizer)';
const OUT = new URL('../data/items.json', import.meta.url);
// A healthy import returns ~1,600 items; far fewer means the wiki or the parser broke.
const MIN_ITEMS = 1000;

async function getJson(params: Record<string, string>): Promise<any> {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2', maxlag: '5' })}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`${body.error.code}: ${body.error.info}`);
      return body;
    } catch (err) {
      if (attempt >= 4) throw err;
      const wait = 2 ** attempt * 1000;
      console.warn(`Request failed (${(err as Error).message}); retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Serial requests, 50 pages each: every page that uses the object infobox (~10,000 pages, ~200 requests).
const items = new Map<number, Item>();
const skipped: string[] = [];
let cont: Record<string, string> = {};
let requests = 0;
do {
  const body = await getJson({
    action: 'query', generator: 'embeddedin', geititle: 'Template:Infobox Object', geinamespace: '0', geilimit: '50',
    prop: 'revisions', rvprop: 'content|ids', rvslots: 'main', ...cont,
  });
  for (const page of body.query?.pages ?? []) {
    const rev = page.revisions?.[0];
    const fields = rev && parseInfobox(rev.slots.main.content);
    if (!fields) continue;
    const item = toItem(fields, { title: page.title, rev: rev.revid });
    if (!item) {
      if (fields.objectclass === 'Body Equipment' || fields.objectclass === 'Weapons') skipped.push(page.title);
      continue;
    }
    const existing = items.get(item.id);
    if (existing) console.warn(`Duplicate item ID ${item.id}: "${existing.wiki}" and "${item.wiki}"; keeping the first`);
    else items.set(item.id, item);
  }
  cont = body.continue ?? {};
  if (++requests % 25 === 0) console.log(`${requests} requests, ${items.size} items so far`);
} while (Object.keys(cont).length);

const sorted = [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
console.log(`Parsed ${sorted.length} items in ${requests} requests; ${skipped.length} equipment pages skipped (no item ID or not wearable).`);
if (sorted.length < MIN_ITEMS) throw new Error(`Only ${sorted.length} items parsed; keeping the existing data file.`);

// One item per line keeps git diffs readable.
const itemLines = sorted.map((i) => JSON.stringify(i)).join(',\n');
if (existsSync(OUT)) {
  const previous = JSON.parse(readFileSync(OUT, 'utf8')) as ItemData;
  if (previous.items.map((i) => JSON.stringify(i)).join(',\n') === itemLines) {
    console.log('No item changes; data file left untouched.');
    process.exit(0);
  }
}
const meta: ItemData['meta'] = {
  source: 'TibiaWiki (tibia.fandom.com)',
  sourceUrl: 'https://tibia.fandom.com/',
  license: 'CC BY-SA',
  licenseUrl: 'https://www.fandom.com/licensing',
  fetchedAt: new Date().toISOString(),
  count: sorted.length,
};
writeFileSync(OUT, `{"meta":${JSON.stringify(meta)},\n"items":[\n${itemLines}\n]}\n`);
console.log(`Wrote ${sorted.length} items to data/items.json`);
