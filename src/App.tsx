import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import data from '../data/items.json';
import imbuementData from '../data/imbuements.json';
import { LANGS, translate } from './i18n.ts';
import type { Lang } from './i18n.ts';
import { ELEMENTS, SKILLS, SLOTS, VOCATIONS } from './lib/types.ts';
import type { Creature, CreatureData, Element, Hunt, HuntData, Imbuement, ImbuementData, Item, ItemData, Proficiency, ProficiencyData, Slot, Vocation } from './lib/types.ts';
import { perkEffects } from './lib/proficiency.ts';
import { bestIndexes, formatDelta, formatValue, maxTier, visibleRows } from './lib/stats.ts';
import { ROW_BY_KEY, buildTotals, canImbue, equip, fitsTogether, fromStored, sharedVocations, toStored } from './lib/build.ts';
import type { Build, StoredBuild, Worn } from './lib/build.ts';
import { attackElements, bestProtection, incomingDamage, lootPerKill } from './lib/hunt.ts';
import { formatGold, marketPrice, parseGold, upgradesPerGold } from './lib/prices.ts';
import type { Price } from './lib/prices.ts';

const { meta, items } = data as ItemData;
const byId = new Map(items.map((i) => [i.id, i]));
const IMBUEMENT_LEVELS = ['Basic', 'Intricate', 'Powerful'];
// Grouped by type, weakest first, as in the game's imbuing window. The importer writes this shape; TypeScript infers one type per entry.
const imbuements = [...(imbuementData as unknown as ImbuementData).imbuements]
  .sort((a, b) => a.type.localeCompare(b.type) || IMBUEMENT_LEVELS.indexOf(a.level) - IMBUEMENT_LEVELS.indexOf(b.level));
const imbuementByName = new Map(imbuements.map((i) => [i.name, i]));
const MAX_COMPARE = 4;
const PAGE = 150;
type Sort = 'level' | 'name' | 'armor' | 'defense' | 'attack' | 'protection';
type T = (key: string, vars?: Record<string, string | number>) => string;

// Language is a per-viewer convenience, so browser storage is enough (and may be unavailable).
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'pl') return saved;
  } catch { /* storage blocked */ }
  return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

// Builds live in this browser only; storage may be blocked or hold IDs from older item data.
function readStored(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}
interface SavedBuild { name: string; slots: StoredBuild }
// A shared build travels in the link as #build=<base64url of its stored JSON>; it is read once, before the hash is rewritten.
const toBase64Url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const shareCode = (stored: StoredBuild) => toBase64Url(JSON.stringify(stored));
const sharedBuild: unknown = (() => {
  const code = location.hash.match(/build=([\w-]+)/)?.[1];
  if (!code) return null;
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
})();

function initialSaved(): SavedBuild[] {
  const value = readStored('builds');
  const saved: SavedBuild[] = Array.isArray(value) ? value.filter((b) => typeof b?.name === 'string') : [];
  // Opening a shared link replaces the current build, so the one it replaces is kept here first.
  const current = readStored('build');
  if (sharedBuild && current && typeof current === 'object' && Object.keys(current).length && JSON.stringify(current) !== JSON.stringify(sharedBuild)) {
    saved.push({ name: `Before link ${new Date().toLocaleString()}`, slots: current as StoredBuild });
  }
  return saved;
}

const MAX_HUNT = 12;
const stars = (n: number) => '★'.repeat(Math.min(n, 5)) + '☆'.repeat(5 - Math.min(n, 5));
/** The hunt advisor's creatures by wiki page name; names the data no longer has are simply not shown. */
function initialHunt(): string[] {
  const value = readStored('hunt');
  return Array.isArray(value) ? value.filter((name) => typeof name === 'string').slice(0, MAX_HUNT) : [];
}

const MARKET_API = 'https://api.tibiamarket.top';
// The rate-limited API is asked at most hourly per world; world names are kept for a day.
const MARKET_TTL = 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** Tibia Market allows about one request per 5 seconds, so a 429 is retried once. */
async function marketJson(path: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${MARKET_API}${path}`);
    // Retry-After is not readable cross-origin; its usual value is 5 s.
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 6000));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

const worldNames = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((w) => (typeof w?.name === 'string' ? [w.name] : [])).sort() : [];

function cachedWorlds(): string[] {
  const cached = readStored('worlds') as { fetchedAt?: number; list?: unknown } | null;
  return cached && Date.now() - (cached.fetchedAt ?? 0) < DAY ? worldNames(cached.list) : [];
}

function cachedMarket(world: string): Map<number, Price> | undefined {
  const cached = readStored('market') as { world?: string; fetchedAt?: number; prices?: unknown } | null;
  if (cached?.world !== world || Date.now() - (cached.fetchedAt ?? 0) >= MARKET_TTL || !Array.isArray(cached.prices)) return undefined;
  return new Map(cached.prices.filter((e): e is [number, Price] => typeof e?.[0] === 'number' && typeof e?.[1]?.gold === 'number'));
}

/** The player's own prices: world ("" when none is chosen) -> item ID -> gold. */
type OwnPrices = Record<string, Record<string, number>>;
function initialOwnPrices(): OwnPrices {
  const value = readStored('prices');
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as OwnPrices) : {};
}

// A comparison lives in the URL hash (#compare=id,id) so it can be shared as a link.
function initialCompare(): number[] {
  const match = location.hash.match(/compare=([\d,]+)/);
  if (!match) return [];
  return match[1].split(',').map(Number).filter((id) => items.some((i) => i.id === id)).slice(0, MAX_COMPARE);
}

const wikiUrl = (title: string) => `https://tibia.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const attackValue = (i: Item) => (i.damage ? (i.damage.min + i.damage.max) / 2 : (i.attack ?? 0) + (i.elementAttack?.value ?? 0));

function sortValue(item: Item, sort: Sort, element: Element | ''): number {
  switch (sort) {
    case 'level': return item.level;
    case 'armor': return item.armor ?? 0;
    case 'defense': return item.defense ?? 0;
    case 'attack': return attackValue(item);
    case 'protection': return element ? (item.resist[element] ?? 0) : Object.values(item.resist).reduce((s, v) => s + (v ?? 0), 0);
    default: return 0;
  }
}

function mainStats(item: Item, t: T): string {
  const parts: string[] = [];
  if (item.armor) parts.push(`${t('armor')} ${item.armor}`);
  if (item.attack) parts.push(`${t('attack')} ${item.attack}${item.elementAttack ? ` + ${item.elementAttack.value} ${t(`el.${item.elementAttack.element}`)}` : ''}`);
  if (item.damage) parts.push(`${item.damage.min}–${item.damage.max} ${t(`el.${item.damage.element}`)}`);
  if (item.atkMod) parts.push(`${t('atkMod')} ${signed(item.atkMod)}`);
  if (item.defense) parts.push(`${t('defense')} ${item.defense}${item.defenseMod ? ` ${signed(item.defenseMod)}` : ''}`);
  if (item.range) parts.push(`${t('range')} ${item.range}`);
  return parts.join(' · ');
}

function protections(item: Item, t: T): string {
  return ELEMENTS.filter((e) => item.resist[e] !== undefined).map((e) => `${t(`el.${e}`)} ${signed(item.resist[e]!)}%`).join(', ');
}

function bonuses(item: Item, t: T): string {
  const parts = SKILLS.filter((s) => item.skills[s]).map((s) => `${t(`skill.${s}`)} ${signed(item.skills[s]!)}`);
  if (item.speed) parts.push(`${t('speed')} ${signed(item.speed)}`);
  if (item.critChance) parts.push(`${t('critChance')} ${item.critChance}%`);
  if (item.critExtra) parts.push(`${t('critExtra')} ${item.critExtra}%`);
  if (item.lifeLeech) parts.push(`${t('lifeLeech')} ${item.lifeLeech}%`);
  if (item.manaLeech) parts.push(`${t('manaLeech')} ${item.manaLeech}%`);
  if (item.damageReflection) parts.push(`${t('damageReflection')} ${item.damageReflection}`);
  if (item.mantra) parts.push(`${t('mantra')} ${item.mantra}`);
  return [...parts, ...(item.other ?? [])].join(', ');
}

const usable = (i: Item, vocation: Vocation | '', maxLevel: number, showUnavailable: boolean) =>
  (showUnavailable || !i.status) && (!vocation || !i.vocations.length || i.vocations.includes(vocation)) && i.level <= maxLevel;

const effectText = (imbuement: Imbuement, t: T) =>
  Object.entries(imbuement.effects).map(([key, value]) => {
    const row = ROW_BY_KEY.get(key)!;
    return `${row.label(t)} +${formatValue(row, value)}`;
  }).join(', ');

/** "5 charges" or "60 minutes" for items that wear out, so a cheap price is not mistaken for a lasting upgrade. */
const wearsOut = (item: Item, t: T) => (item.charges ? t('charges', { n: item.charges }) : item.duration);

const vocationText = (item: Item, t: T) => (item.vocations.length ? item.vocations.map((v) => t(`voc.${v}`)).join(', ') : t('everyVocation'));

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [query, setQuery] = useState('');
  const [vocation, setVocation] = useState<Vocation | ''>('');
  const [slot, setSlot] = useState<Slot | ''>('');
  const [level, setLevel] = useState('');
  const [element, setElement] = useState<Element | ''>('');
  const [sort, setSort] = useState<Sort>('level');
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [compareIds, setCompareIds] = useState<number[]>(initialCompare);
  const [notice, setNotice] = useState('');
  const [build, setBuild] = useState<Build>(() => fromStored(sharedBuild ?? readStored('build'), byId, imbuementByName));
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [saved, setSaved] = useState<SavedBuild[]>(initialSaved);
  const [buildName, setBuildName] = useState('');
  const [buildNotice, setBuildNotice] = useState('');
  const [creatures, setCreatures] = useState<Map<string, Creature>>();
  const [creaturesFailed, setCreaturesFailed] = useState(false);
  const [hunt, setHunt] = useState<string[]>(initialHunt);
  const [creatureQuery, setCreatureQuery] = useState('');
  const [huntNotice, setHuntNotice] = useState('');
  const [places, setPlaces] = useState<Map<string, Hunt>>();
  const [proficiency, setProficiency] = useState<Map<string, Proficiency>>();
  const [place, setPlace] = useState(() => { const p = readStored('place'); return typeof p === 'string' ? p : ''; });
  const [placeQuery, setPlaceQuery] = useState('');
  const [worlds, setWorlds] = useState<string[]>(cachedWorlds);
  const [worldsLoading, setWorldsLoading] = useState(false);
  const [world, setWorld] = useState(() => { const w = readStored('world'); return typeof w === 'string' ? w : ''; });
  const [market, setMarket] = useState<Map<number, Price>>();
  const [marketStatus, setMarketStatus] = useState(''); // "loading" or the reason loading failed
  const [ownPrices, setOwnPrices] = useState<OwnPrices>(initialOwnPrices);
  const [budget, setBudget] = useState('');

  const t: T = (key, vars) => translate(lang, key, vars);

  useEffect(() => {
    // Loaded after the first paint: only the hunt advisor needs creatures and hunting places.
    Promise.all([import('../data/creatures.json'), import('../data/hunts.json'), import('../data/proficiency.json')])
      .then(([c, h, p]) => {
        setProficiency(new Map((p.default as unknown as ProficiencyData).proficiency.flatMap((x) => x.items.map((item) => [item, x] as const))));
        setCreatures(new Map((c.default as unknown as CreatureData).creatures.map((x) => [x.name, x])));
        setPlaces(new Map((h.default as unknown as HuntData).hunts.map((x) => [x.name, x])));
      })
      .catch(() => setCreaturesFailed(true));
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* storage blocked */ }
  }, [lang]);

  useEffect(() => {
    history.replaceState(null, '', compareIds.length ? `#compare=${compareIds.join(',')}` : location.pathname + location.search);
  }, [compareIds]);

  useEffect(() => writeStored('build', toStored(build)), [build]);
  useEffect(() => setShareUrl(''), [build]); // a link made earlier no longer matches the build
  useEffect(() => writeStored('builds', saved), [saved]);
  useEffect(() => writeStored('hunt', hunt), [hunt]);
  useEffect(() => writeStored('place', place), [place]);
  useEffect(() => writeStored('world', world), [world]);
  useEffect(() => writeStored('prices', ownPrices), [ownPrices]);

  // Community prices are only fetched once the player has picked a world.
  useEffect(() => {
    setMarket(undefined);
    setMarketStatus('');
    if (!world) return;
    const cached = cachedMarket(world);
    if (cached) return setMarket(cached);
    let current = true;
    setMarketStatus('loading');
    marketJson(`/market_values?server=${encodeURIComponent(world)}&limit=10000`)
      .then((values) => {
        // ~5,000 entries per world, ~1,200 of them wearable: only the catalog's items are kept.
        const prices = (Array.isArray(values) ? values : []).flatMap((v) => {
          const p = marketPrice(v);
          return p && byId.has(p.id) ? [[p.id, p.price] as [number, Price]] : [];
        });
        writeStored('market', { world, fetchedAt: Date.now(), prices });
        if (current) { setMarket(new Map(prices)); setMarketStatus(''); }
      })
      .catch((err) => { if (current) setMarketStatus((err as Error).message); });
    return () => { current = false; };
  }, [world]);

  const maxLevel = level === '' ? Infinity : Number(level);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) =>
        usable(i, vocation, maxLevel, showUnavailable) &&
        (!slot || i.slot === slot) &&
        (!element || (i.resist[element] ?? 0) > 0) &&
        (!q || i.name.toLowerCase().includes(q)))
      .sort((a, b) => (sort === 'name' ? 0 : sortValue(b, sort, element) - sortValue(a, sort, element)) || a.name.localeCompare(b.name));
  }, [query, vocation, slot, maxLevel, element, sort, showUnavailable]);

  const slotOptions = useMemo(() => {
    const fit = items.filter((i) => usable(i, vocation, maxLevel, showUnavailable)).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
    return Object.fromEntries(SLOTS.map((s) => [s, fit.filter((i) => i.slot === s)])) as Record<Slot, Item[]>;
  }, [vocation, maxLevel, showUnavailable]);
  // The worn weapon's chosen proficiency perks; only those that map onto a stat change the totals.
  const perkTable = build.weapon && (proficiency?.get(build.weapon.item.wiki) ?? proficiency?.get(build.weapon.item.name));
  const chosenPerks = (build.weapon?.perks ?? []).flatMap((choice, level) => perkTable?.levels[level]?.[choice] ?? []);
  const totals = buildTotals(build, chosenPerks.map(perkEffects));
  // Only vocation-restricted items can clash, so only they are named in the warning.
  const vocationClash = sharedVocations(build).length === 0
    && SLOTS.flatMap((s) => (build[s]?.item.vocations.length ? [`${build[s].item.name} (${vocationText(build[s].item, t)})`] : [])).join(', ');

  const creatureOptions = useMemo(() => [...(creatures?.keys() ?? [])].map((name) => <option key={name} value={name} />), [creatures]);
  const hunted = hunt.flatMap((name) => creatures?.get(name) ?? []);
  const incoming = incomingDamage(hunted);
  const attack = hunted.length ? attackElements(hunted) : [];
  const best = bestProtection(slotOptions, incoming);
  const protectionAgainst = (e: Element) => totals.find(({ row }) => row.key === `resist.${e}`)?.total ?? 0;

  const priceById = (id: number): Price | undefined => {
    const own = ownPrices[world]?.[id];
    return typeof own === 'number' && own > 0 ? { gold: own, kind: 'yours' } : market?.get(id);
  };
  const priceOf = (item: Item) => priceById(item.id);
  const currentPlace = place ? places?.get(place) : undefined;
  const placeOptions = useMemo(() => [...(places?.keys() ?? [])].map((name) => <option key={name} value={name} />), [places]);
  const wornPrices = SLOTS.flatMap((s) => (build[s] ? [priceOf(build[s].item)] : []));
  const buildValue = wornPrices.reduce((sum, p) => sum + (p?.gold ?? 0), 0);
  const unpriced = wornPrices.filter((p) => !p).length;
  const anyPrice = !!market?.size || Object.keys(ownPrices[world] ?? {}).length > 0;
  const upgrades = anyPrice ? upgradesPerGold(slotOptions, incoming, (s) => build[s]?.item, (i) => priceOf(i)?.gold, parseGold(budget)) : [];

  useEffect(() => setLimit(PAGE), [filtered]);

  const compared = compareIds.map((id) => items.find((i) => i.id === id)!).filter(Boolean);
  const rows = visibleRows(compared);

  function toggleCompare(id: number) {
    if (compareIds.includes(id)) {
      setCompareIds(compareIds.filter((x) => x !== id));
      setNotice('');
    } else if (compareIds.length >= MAX_COMPARE) {
      setNotice(t('compareFull', { n: MAX_COMPARE }));
    } else {
      setCompareIds([...compareIds, id]);
      setNotice('');
    }
  }

  function wear(slot: Slot, item: Item | undefined) {
    const next = equip(build, slot, item);
    const removed = SLOTS.filter((s) => s !== slot && build[s] && next[s] !== build[s]).map((s) => build[s]!.item.name);
    setBuildNotice(item && removed.length ? t('unequipped', { name: removed.join(', '), other: item.name }) : '');
    setBuild(next);
  }

  // Clearing an imbuement closes the gap, so the chosen ones always fill the first dropdowns.
  function imbue(slot: Slot, worn: Worn, index: number, imbuement: Imbuement | undefined) {
    const list = worn.imbuements.slice();
    if (imbuement) list[index] = imbuement;
    else list.splice(index, 1);
    setBuild({ ...build, [slot]: { ...worn, imbuements: list } });
  }

  function loadBuild(next: Build) {
    setBuild(next);
    setBuildNotice('');
  }

  function setPerk(worn: Worn, level: number, choice: number) {
    const perks = Array.from({ length: Math.max(worn.perks?.length ?? 0, level + 1) }, (_, i) => worn.perks?.[i] ?? -1);
    perks[level] = choice;
    setBuild({ ...build, weapon: { ...worn, perks } });
  }

  function shareBuild() {
    const url = `${location.origin}${location.pathname}#build=${shareCode(toStored(build))}`;
    setShareUrl(url);
    setShareCopied(false);
    navigator.clipboard?.writeText(url).then(() => setShareCopied(true), () => setShareCopied(false));
  }

  function saveBuild(e: FormEvent) {
    e.preventDefault();
    const name = buildName.trim();
    if (!name) return;
    setSaved([...saved.filter((b) => b.name !== name), { name, slots: toStored(build) }]);
    setBuildName('');
  }

  function loadWorlds() {
    setWorldsLoading(true);
    marketJson('/world_data')
      .then((list) => {
        writeStored('worlds', { fetchedAt: Date.now(), list });
        setWorlds(worldNames(list));
      })
      .catch((err) => setMarketStatus((err as Error).message))
      .finally(() => setWorldsLoading(false));
  }

  function priceText(item: Item): string {
    const p = priceOf(item);
    if (!p) return market ? t('noPrice') : '';
    if (p.kind === 'yours') return `${formatGold(p.gold)} (${t('priceYours')})`;
    const age = p.observed ? t('seenOn', { date: new Date(p.observed).toLocaleDateString(lang) }) : '';
    return `${formatGold(p.gold)} (${[t(p.kind === 'sale' ? 'priceSale' : 'priceOffer'), age].filter(Boolean).join(', ')})`;
  }

  // Saved on leaving the field, and only when the text changed: re-reading "31.4kk" would round the stored price.
  function commitOwnPrice(item: Item, input: HTMLInputElement) {
    if (input.value === input.defaultValue) return;
    const gold = parseGold(input.value);
    if (input.value.trim() && !gold) {
      input.value = input.defaultValue; // unreadable text keeps the previous price
      return;
    }
    const forWorld = { ...ownPrices[world] };
    if (gold) forWorld[item.id] = gold;
    else delete forWorld[item.id];
    setOwnPrices({ ...ownPrices, [world]: forWorld });
  }

  // An exact name wins, otherwise the first name that starts with the text ("brach" -> Brachiodemon).
  const findName = (names: Iterable<string> | undefined, text: string) => {
    const q = text.trim().toLowerCase();
    const list = [...(names ?? [])];
    return q ? list.find((n) => n.toLowerCase() === q) ?? list.find((n) => n.toLowerCase().startsWith(q)) : undefined;
  };

  function loadPlace(e: FormEvent) {
    e.preventDefault();
    if (!placeQuery.trim()) return;
    const found = places?.get(findName(places.keys(), placeQuery) ?? '');
    if (!found) return setHuntNotice(t('placeNotFound', { name: placeQuery.trim() }));
    const known = found.creatures.filter((n) => creatures?.has(n));
    setHunt(known.slice(0, MAX_HUNT));
    setPlace(found.name);
    setPlaceQuery('');
    setHuntNotice(known.length > MAX_HUNT ? t('placeTrimmed', { n: MAX_HUNT }) : '');
  }

  function addCreature(e: FormEvent) {
    e.preventDefault();
    if (!creatureQuery.trim()) return;
    const found = findName(creatures?.keys(), creatureQuery);
    if (!found) return setHuntNotice(t('creatureNotFound', { name: creatureQuery.trim() }));
    setCreatureQuery('');
    if (hunt.includes(found)) return setHuntNotice('');
    if (hunt.length >= MAX_HUNT) return setHuntNotice(t('huntFull', { n: MAX_HUNT }));
    setHunt([...hunt, found]);
    setHuntNotice('');
  }

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>{t('title')}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
        <div className="lang" role="group" aria-label={t('language')}>
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </header>

      <section className="filters" aria-label={t('sortBy')}>
        <label className="grow">
          {t('search')}
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Falcon, Sanguine…" />
        </label>
        <label>
          {t('vocation')}
          <select value={vocation} onChange={(e) => setVocation(e.target.value as Vocation | '')}>
            <option value="">{t('all')}</option>
            {VOCATIONS.map((v) => <option key={v} value={v}>{t(`voc.${v}`)}</option>)}
          </select>
        </label>
        <label>
          {t('slot')}
          <select value={slot} onChange={(e) => setSlot(e.target.value as Slot | '')}>
            <option value="">{t('anySlot')}</option>
            {SLOTS.map((s) => <option key={s} value={s}>{t(`slot.${s}`)}</option>)}
          </select>
        </label>
        <label className="narrow">
          {t('myLevel')}
          <input type="number" min={1} inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="300" />
        </label>
        <label>
          {t('protectionFilter')}
          <select
            value={element}
            onChange={(e) => {
              setElement(e.target.value as Element | '');
              if (e.target.value) setSort('protection');
            }}
          >
            <option value="">{t('anyElement')}</option>
            {ELEMENTS.map((el) => <option key={el} value={el}>{t(`el.${el}`)}</option>)}
          </select>
        </label>
        <label>
          {t('sortBy')}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(['level', 'name', 'armor', 'defense', 'attack', 'protection'] as Sort[]).map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
          {t('showUnavailable')}
        </label>
      </section>

      <section className="build" aria-labelledby="build-title">
        <div className="compare-head">
          <h2 id="build-title">{t('build')}</h2>
          {totals.length > 0 && <button type="button" onClick={() => loadBuild({})}>{t('clear')}</button>}
        </div>
        <p className="muted small">{t('buildHint')}</p>
        {buildNotice && <p className="notice" role="status">{buildNotice}</p>}
        {vocationClash && <p className="notice" role="status">{t('vocationClash', { items: vocationClash })}</p>}
        <div className="build-grid">
          <div className="slots">
            {SLOTS.map((s) => {
              const worn = build[s];
              const options = worn && !slotOptions[s].includes(worn.item) ? [worn.item, ...slotOptions[s]] : slotOptions[s];
              const otherHand = (s === 'weapon' ? build.shield : s === 'shield' ? build.weapon : undefined)?.item;
              const tiers = worn ? maxTier(worn.item) : 0;
              // One more dropdown than chosen imbuements, up to the item's slots.
              const imbueSelects = worn ? Math.min(worn.item.imbueSlots ?? 0, worn.imbuements.length + 1) : 0;
              return (
                <div key={s} className="slot" role="group" aria-label={t(`slot.${s}`)}>
                  <label>
                    {t(`slot.${s}`)}
                    <select value={worn?.item.id ?? ''} onChange={(e) => wear(s, byId.get(Number(e.target.value)))}>
                      <option value="">{t('emptySlot')}</option>
                      {options.map((i) => {
                        const clash = otherHand && !(s === 'weapon' ? fitsTogether(i, otherHand) : fitsTogether(otherHand, i))
                          ? ` · ${t('takesOff', { name: otherHand.name })}` : '';
                        return (
                          <option key={i.id} value={i.id}>
                            {i.name}{i.level ? ` (${i.level})` : ''}{i.hands === 2 ? ` · ${t('twoHanded')}` : ''}{clash}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {worn && <span className="muted small">{[mainStats(worn.item, t), protections(worn.item, t)].filter(Boolean).join(' · ')}</span>}
                  {worn && (
                    <div className="price">
                      <span className="muted small">{priceText(worn.item)}</span>
                      <input
                        key={`${world}-${worn.item.id}-${ownPrices[world]?.[worn.item.id] ?? ''}`}
                        defaultValue={ownPrices[world]?.[worn.item.id] ? formatGold(ownPrices[world][worn.item.id]) : ''}
                        placeholder={t('yourPrice')}
                        aria-label={t('yourPriceFor', { name: worn.item.name })}
                        onBlur={(e) => commitOwnPrice(worn.item, e.currentTarget)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </div>
                  )}
                  {worn && (tiers > 0 || imbueSelects > 0) && (
                    <div className="upgrades">
                      {tiers > 0 && (
                        <label>
                          {t('tier')}
                          <select value={worn.tier} onChange={(e) => setBuild({ ...build, [s]: { ...worn, tier: Number(e.target.value) } })}>
                            {Array.from({ length: tiers + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                      )}
                      {Array.from({ length: imbueSelects }, (_, n) => {
                        const chosen = worn.imbuements[n];
                        const others = worn.imbuements.filter((_, j) => j !== n);
                        return (
                          <label key={n} className="grow">
                            {t('imbuement', { n: n + 1 })}
                            <select value={chosen?.name ?? ''} onChange={(e) => imbue(s, worn, n, imbuementByName.get(e.target.value))}>
                              <option value="">{t('noImbuement')}</option>
                              {imbuements.filter((i) => i === chosen || canImbue(worn.item, i, others)).map((i) => (
                                <option key={i.name} value={i.name}>{i.name}: {effectText(i, t)}</option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {s === 'weapon' && worn && perkTable && (
                    <div className="upgrades">
                      {perkTable.levels.map((options, level) => (
                        <label key={level} className="grow">
                          {t('perkLevel', { n: level + 1 })}
                          <select value={worn.perks?.[level] ?? -1} onChange={(e) => setPerk(worn, level, Number(e.target.value))}>
                            <option value={-1}>{t('noPerk')}</option>
                            {options.map((text, i) => <option key={i} value={i}>{text}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div>
            <h3>{t('prices')}</h3>
            <div className="prices">
              {worlds.length ? (
                <label>
                  {t('world')}
                  <select value={world} onChange={(e) => setWorld(e.target.value)}>
                    <option value="">{t('ownPricesOnly')}</option>
                    {worlds.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </label>
              ) : (
                <button type="button" onClick={loadWorlds} disabled={worldsLoading}>{t(worldsLoading ? 'pricesLoading' : 'loadPrices')}</button>
              )}
            </div>
            <p className="muted small" role="status">
              {marketStatus === 'loading' ? t('pricesLoading')
                : marketStatus ? t('pricesFailed', { reason: marketStatus })
                : market ? t('pricesFrom', { world, n: market.size })
                : t('pricesHint')}
            </p>
            {wornPrices.length > 0 && (
              <p>
                {t('buildValue')}: <strong>{buildValue ? formatGold(buildValue) : '—'}</strong>
                {unpriced > 0 && <span className="muted small"> · {t('unpriced', { n: unpriced })}</span>}
              </p>
            )}
            <h3>{t('totals')}</h3>
            {totals.length === 0 ? (
              <p className="muted">{t('totalsEmpty')}</p>
            ) : (
              <table className="totals">
                <tbody>
                  {totals.map(({ row, total }) => (
                    <tr key={row.key}>
                      <th scope="row">{row.label(t)}</th>
                      <td className="num">{formatValue(row, total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small">{t('totalsHint')}</p>
            <p className="muted small">{t('imbuementHint')}</p>
            {perkTable && <p className="muted small">{t('perkHint')}</p>}
            <form className="save" onSubmit={saveBuild}>
              <input value={buildName} onChange={(e) => setBuildName(e.target.value)} placeholder={t('buildName')} aria-label={t('buildName')} maxLength={40} required />
              <button type="submit">{t('save')}</button>
            </form>
            {totals.length > 0 && (
              <div className="save">
                <button type="button" onClick={shareBuild}>{t('shareBuild')}</button>
                {shareUrl && <input readOnly value={shareUrl} aria-label={t('shareLink')} onFocus={(e) => e.currentTarget.select()} />}
              </div>
            )}
            {shareUrl && <p className="muted small" role="status">{t(shareCopied ? 'shareCopied' : 'shareManual')}</p>}
            {saved.length > 0 && (
              <>
                <h3>{t('savedBuilds')}</h3>
                <ul className="saved">
                  {saved.map((b) => (
                    <li key={b.name}>
                      <span>{b.name}</span>
                      <button type="button" aria-label={t('loadBuild', { name: b.name })} onClick={() => loadBuild(fromStored(b.slots, byId, imbuementByName))}>{t('load')}</button>
                      <button type="button" aria-label={t('deleteBuild', { name: b.name })} onClick={() => setSaved(saved.filter((x) => x !== b))}>{t('delete')}</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="muted small">{t('savedLocal')}</p>
          </div>
        </div>
      </section>

      <section className="hunt" aria-labelledby="hunt-title">
        <div className="compare-head">
          <h2 id="hunt-title">{t('hunt')}</h2>
          {hunt.length > 0 && <button type="button" onClick={() => { setHunt([]); setPlace(''); setHuntNotice(''); }}>{t('clear')}</button>}
        </div>
        <p className="muted small">{t('huntHint')}</p>
        {places && (
          <form className="hunt-pick" onSubmit={loadPlace}>
            <label>
              {t('huntingPlace')}
              <input list="place-names" value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder="Claustrophobic Inferno…" />
            </label>
            <datalist id="place-names">{placeOptions}</datalist>
            <button type="submit">{t('loadPlace')}</button>
          </form>
        )}
        {currentPlace && (
          <p className="small">
            <a href={wikiUrl(currentPlace.name)} target="_blank" rel="noreferrer" title={t('openWiki')}>{currentPlace.name}</a>
            {currentPlace.city && ` · ${currentPlace.city}`}
            {currentPlace.exp && <> · {t('expRating')} <span aria-label={t('stars', { n: currentPlace.exp })}>{stars(currentPlace.exp)}</span></>}
            {currentPlace.loot && <> · {t('lootRating')} <span aria-label={t('stars', { n: currentPlace.loot })}>{stars(currentPlace.loot)}</span></>}
            <br />
            <span className="muted">{t('placeLevels', { knight: currentPlace.level.knight ?? '?', paladin: currentPlace.level.paladin ?? '?', mage: currentPlace.level.mage ?? '?' })}</span>
          </p>
        )}
        {creatures ? (
          <form className="hunt-pick" onSubmit={addCreature}>
            <label>
              {t('addCreature')}
              <input list="creature-names" value={creatureQuery} onChange={(e) => setCreatureQuery(e.target.value)} placeholder="Demon, Brachiodemon…" />
            </label>
            <datalist id="creature-names">{creatureOptions}</datalist>
            <button type="submit">{t('addButton')}</button>
          </form>
        ) : (
          <p className="muted">{t(creaturesFailed ? 'creaturesFailed' : 'creaturesLoading')}</p>
        )}
        {huntNotice && <p className="notice" role="status">{huntNotice}</p>}
        {hunted.length > 0 && (
          <>
            <ul className="chips" aria-label={t('hunt')}>
              {hunted.map((c) => (
                <li key={c.name}>
                  <a href={wikiUrl(c.name)} target="_blank" rel="noreferrer" title={t('openWiki')}>{c.name}</a>
                  {c.boss && <span className="tag">{t('boss')}</span>}
                  <button type="button" className="icon" aria-label={t('removeCreature', { name: c.name })} onClick={() => setHunt(hunt.filter((n) => n !== c.name))}>×</button>
                </li>
              ))}
            </ul>
            <div className="hunt-grid">
              <div>
                <h3>{t('incoming')}</h3>
                {incoming.length === 0 ? (
                  <p className="muted">{t('noDamageData')}</p>
                ) : (
                  <div className="scroll">
                    <table className="totals">
                      <thead>
                        <tr>
                          <th scope="col">{t('col.element')}</th>
                          <th scope="col" className="num">{t('col.maxHit')}</th>
                          <th scope="col" className="num">{t('col.yourProtection')}</th>
                          <th scope="col" className="num">{t('col.youTake')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incoming.map(({ element, max, from }) => {
                          const protection = protectionAgainst(element);
                          return (
                            <tr key={element}>
                              <th scope="row">{t(`el.${element}`)}</th>
                              <td className="num">{max}{hunted.length > 1 && <span className="muted small"> · {from}</span>}</td>
                              <td className="num">{protection}%</td>
                              <td className="num">{Math.round(max * (1 - protection / 100))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="muted small">{t('incomingHint')}</p>
                <h3>{t('perKill')}</h3>
                <div className="scroll">
                  <table className="totals">
                    <thead>
                      <tr>
                        <th scope="col">{t('col.creature')}</th>
                        <th scope="col" className="num">{t('col.exp')}</th>
                        <th scope="col" className="num">{t('col.lootPerKill')}</th>
                        <th scope="col" className="num">{t('col.kills')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...hunted].sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0)).map((c) => {
                        const loot = lootPerKill(c, (id) => priceById(id)?.gold);
                        return (
                          <tr key={c.name}>
                            <th scope="row">{c.name}</th>
                            <td className="num">{c.exp?.toLocaleString(lang) ?? '—'}</td>
                            <td className="num">{loot === undefined ? '—' : formatGold(loot)}</td>
                            <td className="num muted">{c.loot?.kills.toLocaleString(lang) ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="muted small">{t('perKillHint')}</p>
                <h3>{t('attackWith')}</h3>
                <p>
                  {attack.map(({ element, takes }) => (
                    <span key={element} className={takes === attack[0].takes ? 'tag best' : 'tag'}>{t(`el.${element}`)} {takes}%</span>
                  ))}
                </p>
                <p className="muted small">{t('attackHint')}</p>
              </div>
              <div>
                <h3>{t('bestProtection')}</h3>
                {best.length === 0 ? (
                  <p className="muted">{t(incoming.length ? 'noProtection' : 'noDamageData')}</p>
                ) : best.map(({ slot, picks }) => (
                  <div key={slot} className="best-slot">
                    <h4>{t(`slot.${slot}`)}</h4>
                    <ol>
                      {picks.map(({ item, blocks }) => (
                        <li key={item.id}>
                          <span>
                            <a href={wikiUrl(item.wiki)} target="_blank" rel="noreferrer" title={t('openWiki')}>{item.name}</a>
                            {item.level ? ` (${item.level})` : ''} · {t('blocks', { n: Math.round(blocks * 10) / 10 })}
                            {priceOf(item) && ` · ${formatGold(priceOf(item)!.gold)}`}
                            {wearsOut(item, t) && <span className="tag">{wearsOut(item, t)}</span>}
                            <span className="muted small"> · {protections(item, t)}</span>
                          </span>
                          {build[slot]?.item === item ? (
                            <span className="tag">{t('worn')}</span>
                          ) : (
                            <button type="button" aria-label={t('wearItem', { name: item.name })} onClick={() => wear(slot, item)}>{t('wear')}</button>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
                <p className="muted small">{t('bestProtectionHint')}</p>
                <h3>{t('upgrades')}</h3>
                {!anyPrice ? (
                  <p className="muted">{t('upgradesNeedPrices')}</p>
                ) : (
                  <>
                    <label className="budget">
                      {t('budget')}
                      <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="50kk" />
                    </label>
                    {upgrades.length === 0 ? (
                      <p className="muted">{t('noUpgrades')}</p>
                    ) : (
                      <div className="best-slot">
                        <ol>
                          {upgrades.map(({ slot, item, gain, gold }) => (
                            <li key={item.id}>
                              <span>
                                {t(`slot.${slot}`)}: <a href={wikiUrl(item.wiki)} target="_blank" rel="noreferrer" title={t('openWiki')}>{item.name}</a>
                                {item.level ? ` (${item.level})` : ''} · {t('upgradeGain', { n: Math.round(gain * 10) / 10 })} · {formatGold(gold)}
                                {item.duration && <span className="tag">{item.duration}</span>}
                              </span>
                              <button type="button" aria-label={t('wearItem', { name: item.name })} onClick={() => wear(slot, item)}>{t('wear')}</button>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    <p className="muted small">{t('upgradesHint')}</p>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="compare" aria-labelledby="compare-title">
        <div className="compare-head">
          <h2 id="compare-title">{t('compare')} ({compared.length}/{MAX_COMPARE})</h2>
          {compared.length > 0 && <button type="button" onClick={() => setCompareIds([])}>{t('clear')}</button>}
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}
        {compared.length === 0 ? (
          <p className="muted">{t('compareHint', { n: MAX_COMPARE })}</p>
        ) : (
          <div className="scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">{t('col.name')}</span></th>
                  {compared.map((item) => (
                    <th key={item.id} scope="col">
                      <a href={wikiUrl(item.wiki)} target="_blank" rel="noreferrer" title={t('openWiki')}>{item.name}</a>
                      <button type="button" className="icon" aria-label={t('removeItem', { name: item.name })} onClick={() => toggleCompare(item.id)}>×</button>
                      <div className="muted small">{t(`slot.${item.slot}`)} · {vocationText(item, t)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const best = bestIndexes(row, compared);
                  const baseValue = row.get(compared[0]);
                  return (
                    <tr key={row.key}>
                      <th scope="row">{row.label(t)}</th>
                      {compared.map((item, idx) => {
                        const value = row.get(item);
                        const delta = idx > 0 ? formatDelta(row, value, baseValue) : '';
                        return (
                          <td key={item.id} className={best.has(idx) ? 'best' : undefined}>
                            {formatValue(row, value)}
                            {best.has(idx) && <span className="sr-only"> ({t('best')})</span>}
                            {delta && <span className="delta"> {delta}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {compared.some((i) => i.augments || i.other) && (
                  <tr>
                    <th scope="row">{t('other')}</th>
                    {compared.map((item) => <td key={item.id} className="small">{[...(item.augments ?? []), ...(item.other ?? [])].join('; ') || '—'}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="results-title">
        <h2 id="results-title" className="results-title">{t('results', { n: filtered.length })}</h2>
        {filtered.length === 0 ? (
          <p className="muted">{t('noResults')}</p>
        ) : (
          <div className="scroll">
            <table className="items">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">{t('compare')}</span></th>
                  <th scope="col">{t('col.name')}</th>
                  <th scope="col">{t('col.slot')}</th>
                  <th scope="col" className="num">{t('col.level')}</th>
                  <th scope="col">{t('col.vocations')}</th>
                  <th scope="col">{t('col.main')}</th>
                  <th scope="col">{t('col.protections')}</th>
                  <th scope="col">{t('col.bonuses')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((item) => {
                  const selected = compareIds.includes(item.id);
                  return (
                    <tr key={item.id} className={selected ? 'selected' : undefined}>
                      <td>
                        <button
                          type="button"
                          className="icon add"
                          aria-pressed={selected}
                          aria-label={t(selected ? 'removeItem' : 'add', { name: item.name })}
                          onClick={() => toggleCompare(item.id)}
                        >
                          {selected ? '✓' : '+'}
                        </button>
                      </td>
                      <td>
                        <a href={wikiUrl(item.wiki)} target="_blank" rel="noreferrer" title={t('openWiki')}>{item.name}</a>
                        {item.hands === 2 && <span className="tag">{t('twoHanded')}</span>}
                        {item.status && <span className="tag warn">{t(`status.${item.status}`)}</span>}
                      </td>
                      <td data-label={t('col.slot')}>{t(`slot.${item.slot}`)}</td>
                      <td className="num" data-label={t('col.level')}>{item.level || '—'}</td>
                      <td data-label={t('col.vocations')}>{vocationText(item, t)}</td>
                      <td data-label={t('col.main')}>{mainStats(item, t)}</td>
                      <td data-label={t('col.protections')}>{protections(item, t)}</td>
                      <td className="small" data-label={t('col.bonuses')}>{bonuses(item, t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > limit && (
          <button type="button" className="more" onClick={() => setLimit(limit + PAGE)}>{t('showMore')}</button>
        )}
      </section>

      <footer className="muted small">
        <p>
          {t('footerData', { source: meta.source, license: meta.license, date: new Date(meta.fetchedAt).toLocaleDateString(lang) })}{' '}
          <a href={meta.sourceUrl} target="_blank" rel="noreferrer">TibiaWiki</a> · <a href={meta.licenseUrl} target="_blank" rel="noreferrer">{meta.license}</a>
        </p>
        {market && <p>{t('footerPrices')} <a href="https://tibiamarket.top" target="_blank" rel="noreferrer">Tibia Market</a></p>}
        <p>{t('footerTrademark')}</p>
      </footer>
    </div>
  );
}
