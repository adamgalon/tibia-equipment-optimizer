// Imports equipment items, imbuements, creatures (with loot statistics) and hunting places from TibiaWiki into data/*.json.
// Usage: npm run import:items
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { num, parseInfobox, parseLoot, parseProficiency, parseSources, toCreature, toHunt, toImbuement, toItem } from '../src/lib/wiki.ts';
import type { Creature, DataMeta, Hunt, Imbuement, Item } from '../src/lib/types.ts';

const API = 'https://tibia.fandom.com/api.php';
const USER_AGENT = 'tibia-equipment-optimizer/0.1 (+https://github.com/adamgalon/tibia-equipment-optimizer)';
// A healthy import returns ~1,600 items, ~70 imbuements and ~2,000 creatures; far fewer means the wiki or the parser broke.
const MIN_ITEMS = 1000;
const MIN_IMBUEMENTS = 60;
const MIN_CREATURES = 1500;
const MIN_LOOT = 500;
const MIN_HUNTS = 300;
const MIN_PROFICIENCY = 300;

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

type OnPage = (fields: Record<string, string>, page: { title: string; rev: number }, wikitext: string) => void;

/** Serial requests, 50 pages each, over every page in the namespace that uses the template; calls onPage with its parsed infobox. */
async function eachInfobox(template: string, onPage: OnPage, namespace = '0') {
  let cont: Record<string, string> = {};
  let requests = 0;
  do {
    const body = await getJson({
      action: 'query', generator: 'embeddedin', geititle: `Template:${template}`, geinamespace: namespace, geilimit: '50',
      prop: 'revisions', rvprop: 'content|ids', rvslots: 'main', ...cont,
    });
    for (const page of body.query?.pages ?? []) {
      const rev = page.revisions?.[0];
      const fields = rev && parseInfobox(rev.slots.main.content, template);
      if (fields) onPage(fields, { title: page.title, rev: rev.revid }, rev.slots.main.content);
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
// Every object with an ID, wearable or not, by name and page title: loot statistics name their drops this way.
const objects = new Map<string, { id: number; npc: number }>();
const itemRequests = await eachInfobox('Infobox Object', (fields, page) => {
  const id = num(fields.itemid);
  if (id !== undefined) for (const name of [fields.name, page.title]) if (name && !objects.has(name)) objects.set(name, { id, npc: num(fields.npcvalue) ?? 0 });
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
  if (imbuement) {
    // Materials by item ID, so their market prices can count toward imbuing costs.
    const sources = parseSources(fields.astralsources).flatMap(([name, n]): [number, number][] => (objects.has(name) ? [[objects.get(name)!.id, n]] : []));
    if (sources.length) imbuement.sources = sources;
    imbuements.push(imbuement);
  }
  else console.log(`Imbuement page not modelled: ${page.title}`);
});
console.log(`Parsed ${imbuements.length} imbuements.`);

// Weapon proficiency: two pages hold every perk table and the weapon -> table mapping.
async function pageText(title: string): Promise<string> {
  const body = await getJson({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: title });
  return body.query?.pages?.[0]?.revisions?.[0]?.slots.main.content ?? '';
}
const proficiency = parseProficiency(await pageText('Weapon Proficiency Tables'), await pageText('Template:Weapon Proficiency Name'));
console.log(`Parsed ${proficiency.length} weapon proficiency tables for ${proficiency.reduce((n, p) => n + p.items.length, 0)} weapons.`);

// Creatures: ~2,800 pages use the creature infobox, ~57 requests.
const creatures: Creature[] = [];
let creaturesSkipped = 0;
await eachInfobox('Infobox Creature', (fields, page) => {
  const creature = toCreature(fields, page);
  if (creature) creatures.push(creature);
  else creaturesSkipped++;
});
console.log(`Parsed ${creatures.length} creatures; ${creaturesSkipped} pages skipped (removed, or no hit points, damage or experience).`);

// Loot statistics live in their own namespace (112, "Loot Statistics:"); drops are kept by item ID with their NPC value.
const byCreature = new Map(creatures.map((c) => [c.name, c]));
let lootPages = 0;
await eachInfobox('Loot2', (_fields, page, wikitext) => {
  const loot = parseLoot(wikitext);
  const creature = byCreature.get(loot?.name ?? page.title.replace(/^Loot Statistics:/, ''));
  if (!loot || !creature) return;
  const drops = loot.drops.flatMap(([name, perKill]): [number, number, number][] => {
    const object = objects.get(name);
    return object ? [[object.id, perKill, object.npc]] : [];
  });
  creature.loot = { kills: loot.kills, drops };
  lootPages++;
}, '112');
console.log(`Attached loot statistics to ${lootPages} creatures.`);

// Hunting pages sometimes write "troll" or "Carrion_Worm"; those still mean the creature page.
const canonical = new Map(creatures.map((c) => [c.name.toLowerCase(), c.name]));
const hunts: Hunt[] = [];
await eachInfobox('Infobox Hunt', (fields, page, wikitext) => {
  const hunt = toHunt(fields, wikitext, page);
  hunt.creatures = [...new Set(hunt.creatures.map((n) => canonical.get(n.replace(/_/g, ' ').toLowerCase()) ?? n))];
  hunts.push(hunt);
});
console.log(`Parsed ${hunts.length} hunting places.`);

// Check all before writing any, so a broken run never leaves the files out of step.
if (lootPages < MIN_LOOT) throw new Error(`Only ${lootPages} creatures got loot statistics; keeping the existing data files.`);
if (proficiency.length < MIN_PROFICIENCY) throw new Error(`Only ${proficiency.length} proficiency tables parsed; keeping the existing data files.`);
if (hunts.length < MIN_HUNTS) throw new Error(`Only ${hunts.length} hunting places parsed; keeping the existing data files.`);
if (items.size < MIN_ITEMS) throw new Error(`Only ${items.size} items parsed; keeping the existing data files.`);
if (imbuements.length < MIN_IMBUEMENTS) throw new Error(`Only ${imbuements.length} imbuements parsed; keeping the existing data files.`);
if (creatures.length < MIN_CREATURES) throw new Error(`Only ${creatures.length} creatures parsed; keeping the existing data files.`);
writeIfChanged('items.json', 'items', [...items.values()].sort((a, b) => a.name.localeCompare(b.name)));
writeIfChanged('imbuements.json', 'imbuements', imbuements.sort((a, b) => a.name.localeCompare(b.name)));
writeIfChanged('creatures.json', 'creatures', creatures.sort((a, b) => a.name.localeCompare(b.name)));
writeIfChanged('hunts.json', 'hunts', hunts.sort((a, b) => a.name.localeCompare(b.name)));
writeIfChanged('proficiency.json', 'proficiency', proficiency.sort((a, b) => a.name.localeCompare(b.name)));
