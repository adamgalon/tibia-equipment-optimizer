// The build editor: slots, forge tiers, imbuements, perks, prices, totals and saved builds.
import { SLOTS } from '../lib/types.ts';
import { formatValue, maxTier } from '../lib/stats.ts';
import { canImbue, fitsTogether, fromStored } from '../lib/build.ts';
import { formatGold } from '../lib/prices.ts';
import { byId, imbuements, imbuementByName, mainStats, protections, effectText, items } from './helpers.ts';
import type { AppState } from './useApp.tsx';

export function BuildEditor({ app }: { app: AppState }) {
  const { slot, level, notice, build, setBuild, shareUrl, shareCopied, saved, setSaved, buildName, setBuildName, buildNotice, worlds, worldsLoading, world, setWorld, market, marketStatus, ownPrices, t, slotOptions, perkTable, totals, vocationClash, wornPrices, buildValue, unpriced, upgrades, wear, imbue, loadBuild, setPerk, shareBuild, saveBuild, loadWorlds, priceText, commitOwnPrice } = app;
  return (
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
  );
}
