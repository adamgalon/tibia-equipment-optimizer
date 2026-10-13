import data from '../data/items.json';
import { LANGS } from './i18n.ts';
import { ELEMENTS, SLOTS, VOCATIONS } from './lib/types.ts';
import type { Element, Slot, Vocation } from './lib/types.ts';
import { bestIndexes, formatDelta, formatValue } from './lib/stats.ts';
import { MAX_COMPARE, PAGE, wikiUrl, mainStats, protections, bonuses, vocationText, meta, items } from './app/helpers.ts';
import type { Sort } from './app/helpers.ts';
import { useApp } from './app/useApp.tsx';
import { BuildEditor } from './app/BuildEditor.tsx';
import { HuntAdvisor } from './app/HuntAdvisor.tsx';

export default function App() {
  const app = useApp();
  const { lang, setLang, query, setQuery, vocation, setVocation, slot, setSlot, level, setLevel, element, setElement, sort, setSort, showUnavailable, setShowUnavailable, limit, setLimit, compareIds, setCompareIds, notice, market, t, filtered, attack, best, compared, rows, toggleCompare, character, setCharacter, characterStatus, lookUpCharacter } = app;

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

      <form className="filters character" onSubmit={lookUpCharacter}>
        <label className="grow">
          {t('character')}
          <input value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="Bubble" />
        </label>
        <button type="submit">{t('lookUp')}</button>
        {characterStatus && <p className="muted small" role="status">{characterStatus}</p>}
      </form>

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

      <BuildEditor app={app} />

      <HuntAdvisor app={app} />

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
        <p>{t('footerTrademark')} <a href="https://github.com/adamgalon/tibia-equipment-optimizer/issues/new" target="_blank" rel="noreferrer">{t('feedback')}</a></p>
      </footer>
    </div>
  );
}

