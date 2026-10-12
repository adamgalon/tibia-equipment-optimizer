// Imports every equipment item and imbuement from TibiaWiki into data/items.json and data/imbuements.json.
// Usage: npm run import:items
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseInfobox, toImbuement, toItem } from '../src/lib/wiki.ts';
import type { DataMeta, Imbuement, Item } from '../src/lib/types.ts';

const API = 'https://tibia.fandom.com/api.php';
const USER_AGENT = 'tibia-equipment-optimizer/0.1 (+https://github.com/adamgalon/tibia-equipment-optimizer)';
// A healthy import returns ~1,600 items and ~70 imbuements; far fewer means the wiki or the parser broke.
const MIN_ITEMS = 1000;
const MIN_IMBUEMENTS = 60;

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

/** Serial requests, 50 pages each, over every page that uses the template; calls onPage with its parsed infobox. */
async function eachInfobox(template: string, onPage: (fields: Record<string, string>, page: { title: string; rev: number }) => void) {
  let cont: Record<string, string> = {};
  let requests = 0;
  do {
    const body = await getJson({
      action: 'query', generator: 'embeddedin', geititle: `Template:${template}`, geinamespace: '0', geilimit: '50',
      prop: 'revisions', rvprop: 'content|ids', rvslots: 'main', ...cont,
    });
    for (const page of body.query?.pages ?? []) {
      const rev = page.revisions?.[0];
      const fields = rev && parseInfobox(rev.slots.main.content, template);
      if (fields) onPage(fields, { title: page.title, rev: rev.revid });
    }
    cont = body.continue ?? {};
    if (++requests % 25 === 0) console.log(`${template}: ${requests} requests so far`);
  } while (Object.keys(cont).length);
  return requests;
}

/** Writes `{"meta":…, "<key>":[…]}` with one entry per line (readable git diffs), unless the entries are unchanged. */
function writeIfChanged(file: string, key: string, entries: object[]) {
  const out = new URL(`../data/${file}`, import.meta.url);
  const lines = entries.map((e) => JSON.stringify(e)).join(',\n');
  if (existsSync(out)) {
    const previous = JSON.parse(readFileSync(out, 'utf8'))[key] as object[];
    if (previous.map((e) => JSON.stringify(e)).join(',\n') === lines) return console.log(`No changes; data/${file} left untouched.`);
  }
  const meta: DataMeta = {
    source: 'TibiaWiki (tibia.fandom.com)',
    sourceUrl: 'https://tibia.fandom.com/',
    license: 'CC BY-SA',
    licenseUrl: 'https://www.fandom.com/licensing',
    fetchedAt: new Date().toISOString(),
    count: entries.length,
  };
  writeFileSync(out, `{"meta":${JSON.stringify(meta)},\n"${key}":[\n${lines}\n]}\n`);
  console.log(`Wrote ${entries.length} entries to data/${file}`);
}

// Items: every page that uses the object infobox (~10,000 pages, ~200 requests).
const items = new Map<number, Item>();
const skipped: string[] = [];
const itemRequests = await eachInfobox('Infobox Object', (fields, page) => {
  const item = toItem(fields, page);
  if (!item) {
    if (fields.objectclass === 'Body Equipment' || fields.objectclass === 'Weapons') skipped.push(page.title);
    return;
  }
  const existing = items.get(item.id);
  if (existing) console.warn(`Duplicate item ID ${item.id}: "${existing.wiki}" and "${item.wiki}"; keeping the first`);
  else items.set(item.id, item);
});
console.log(`Parsed ${items.size} items in ${itemRequests} requests; ${skipped.length} equipment pages skipped (no item ID or not wearable).`);

const imbuements: Imbuement[] = [];
await eachInfobox('Infobox Imbuement', (fields, page) => {
  const imbuement = toImbuement(fields, page);
  if (imbuement) imbuements.push(imbuement);
  else console.log(`Imbuement page not modelled: ${page.title}`);
});
console.log(`Parsed ${imbuements.length} imbuements.`);

// Check both before writing either, so a broken run never leaves the files out of step.
if (items.size < MIN_ITEMS) throw new Error(`Only ${items.size} items parsed; keeping the existing data files.`);
if (imbuements.length < MIN_IMBUEMENTS) throw new Error(`Only ${imbuements.length} imbuements parsed; keeping the existing data files.`);
writeIfChanged('items.json', 'items', [...items.values()].sort((a, b) => a.name.localeCompare(b.name)));
writeIfChanged('imbuements.json', 'imbuements', imbuements.sort((a, b) => a.name.localeCompare(b.name)));
