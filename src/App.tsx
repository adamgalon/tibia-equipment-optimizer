import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import data from '../data/items.json';
import imbuementData from '../data/imbuements.json';
import { LANGS, translate } from './i18n.ts';
import type { Lang } from './i18n.ts';
import { ELEMENTS, SKILLS, SLOTS, VOCATIONS } from './lib/types.ts';
import type { Element, Imbuement, ImbuementData, Item, ItemData, Slot, Vocation } from './lib/types.ts';
import { bestIndexes, formatDelta, formatValue, maxTier, visibleRows } from './lib/stats.ts';
import { ROW_BY_KEY, buildTotals, canImbue, equip, fitsTogether, fromStored, toStored } from './lib/build.ts';
import type { Build, StoredBuild, Worn } from './lib/build.ts';

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
function initialSaved(): SavedBuild[] {
  const value = readStored('builds');
  return Array.isArray(value) ? value.filter((b) => typeof b?.name === 'string') : [];
}

// A comparison lives in the URL hash (#compare=id,id) so it can be shared as a link.
function initialCompare(): number[] {
  const match = location.hash.match(/compare=([\d,]+)/);
  if (!match) return [];
  return match[1].split(',').map(Number).filter((id) => items.some((i) => i.id === id)).slice(0, MAX_COMPARE);
}

const wikiUrl = (item: Item) => `https://tibia.fandom.com/wiki/${encodeURIComponent(item.wiki.replace(/ /g, '_'))}`;
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
  const [build, setBuild] = useState<Build>(() => fromStored(readStored('build'), byId, imbuementByName));
  const [saved, setSaved] = useState<SavedBuild[]>(initialSaved);
  const [buildName, setBuildName] = useState('');
  const [buildNotice, setBuildNotice] = useState('');

  const t: T = (key, vars) => translate(lang, key, vars);

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* storage blocked */ }
  }, [lang]);

  useEffect(() => {
    history.replaceState(null, '', compareIds.length ? `#compare=${compareIds.join(',')}` : location.pathname + location.search);
  }, [compareIds]);

  useEffect(() => writeStored('build', toStored(build)), [build]);
  useEffect(() => writeStored('builds', saved), [saved]);

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
  const totals = buildTotals(build);

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

  function saveBuild(e: FormEvent) {
    e.preventDefault();
    const name = buildName.trim();
    if (!name) return;
    setSaved([...saved.filter((b) => b.name !== name), { name, slots: toStored(build) }]);
    setBuildName('');
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
                </div>
              );
            })}
          </div>
          <div>
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
            <form className="save" onSubmit={saveBuild}>
              <input value={buildName} onChange={(e) => setBuildName(e.target.value)} placeholder={t('buildName')} aria-label={t('buildName')} maxLength={40} required />
              <button type="submit">{t('save')}</button>
            </form>
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
                      <a href={wikiUrl(item)} target="_blank" rel="noreferrer" title={t('openWiki')}>{item.name}</a>
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
                        <a href={wikiUrl(item)} target="_blank" rel="noreferrer" title={t('openWiki')}>{item.name}</a>
                        {item.hands === 2 && <span className="tag">{t('twoHanded')}</span>}
                        {item.status && <span className="tag warn">{t(`status.${item.status}`)}</span>}
                      </td>
                      <td>{t(`slot.${item.slot}`)}</td>
                      <td className="num">{item.level || '—'}</td>
                      <td>{vocationText(item, t)}</td>
                      <td>{mainStats(item, t)}</td>
                      <td>{protections(item, t)}</td>
                      <td className="small">{bonuses(item, t)}</td>
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
        <p>{t('footerTrademark')}</p>
      </footer>
    </div>
  );
}
