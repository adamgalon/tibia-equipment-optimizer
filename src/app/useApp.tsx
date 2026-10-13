// The app's state and handlers, shared by App and its sections.
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import data from '../../data/items.json';
import { translate } from '../i18n.ts';
import type { Lang } from '../i18n.ts';
import { SLOTS } from '../lib/types.ts';
import type { Creature, CreatureData, Element, Hunt, HuntData, Imbuement, Item, Proficiency, ProficiencyData, Slot, Vocation } from '../lib/types.ts';
import { perkEffects } from '../lib/proficiency.ts';
import { visibleRows } from '../lib/stats.ts';
import { buildTotals, equip, fromStored, sharedVocations, toStored } from '../lib/build.ts';
import type { Build, Worn } from '../lib/build.ts';
import { attackElements, bestProtection, incomingDamage } from '../lib/hunt.ts';
import { formatGold, marketPrice, parseGold, upgradesPerGold } from '../lib/prices.ts';
import type { Price } from '../lib/prices.ts';
import { byId, imbuements, imbuementByName, MAX_COMPARE, PAGE, initialLang, readStored, writeStored, shareCode, sharedBuild, initialSaved, MAX_HUNT, initialHunt, marketJson, worldNames, cachedWorlds, cachedMarket, initialOwnPrices, initialCompare, sortValue, usable, vocationText, items } from './helpers.ts';
import type { Sort, T, SavedBuild, OwnPrices } from './helpers.ts';

export function useApp() {
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
    Promise.all([import('../../data/creatures.json'), import('../../data/hunts.json'), import('../../data/proficiency.json')])
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


  return { lang, setLang, query, setQuery, vocation, setVocation, slot, setSlot, level, setLevel, element, setElement, sort, setSort, showUnavailable, setShowUnavailable, limit, setLimit, compareIds, setCompareIds, notice, setNotice, build, setBuild, shareUrl, setShareUrl, shareCopied, setShareCopied, saved, setSaved, buildName, setBuildName, buildNotice, setBuildNotice, creatures, setCreatures, creaturesFailed, setCreaturesFailed, hunt, setHunt, creatureQuery, setCreatureQuery, huntNotice, setHuntNotice, places, setPlaces, proficiency, setProficiency, place, setPlace, placeQuery, setPlaceQuery, worlds, setWorlds, worldsLoading, setWorldsLoading, world, setWorld, market, setMarket, marketStatus, setMarketStatus, ownPrices, setOwnPrices, budget, setBudget, t, maxLevel, filtered, slotOptions, perkTable, chosenPerks, totals, vocationClash, creatureOptions, hunted, incoming, attack, best, protectionAgainst, priceById, priceOf, currentPlace, placeOptions, wornPrices, buildValue, unpriced, anyPrice, upgrades, compared, rows, toggleCompare, wear, imbue, loadBuild, setPerk, shareBuild, saveBuild, loadWorlds, priceText, commitOwnPrice, findName, loadPlace, addCreature };
}

export type AppState = ReturnType<typeof useApp>;
