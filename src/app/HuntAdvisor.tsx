// The hunt advisor: creatures and hunting places, incoming damage, attack elements, protection, upgrades, experience and loot.
import { bestProtection, damageTaken, expMultiplier, lootPerKill, perHour } from '../lib/hunt.ts';
import { formatGold, imbuementUpkeep, parseGold } from '../lib/prices.ts';
import { stars, wikiUrl, protections, wearsOut } from './helpers.ts';
import type { Creature } from '../lib/types.ts';
import type { AppState } from './useApp.tsx';
import { Toggle } from './Toggle.tsx';

export function HuntAdvisor({ app }: { app: AppState }) {
  const { lang, slot, element, notice, build, creatures, creaturesFailed, hunt, setHunt, creatureQuery, setCreatureQuery, huntNotice, setHuntNotice, places, place, setPlace, placeQuery, setPlaceQuery, budget, setBudget, t, totals, creatureOptions, hunted, incoming, attack, best, protectionAgainst, priceById, priceOf, currentPlace, placeOptions, anyPrice, upgrades, wear, loadPlace, addCreature, killsPerHour, setKillsPerHour, hourSettings, setHourSettings, optimize } = app;
  const armorTotal = totals.find(({ row }) => row.key === 'armor')?.total ?? 0;
  const hs = hourSettings;
  const setHs = (change: Partial<typeof hs>) => setHourSettings({ ...hs, ...change });
  // Prey and the boosted creature apply to one creature each; a boosted creature also drops twice the loot.
  const lootOf = (c: Creature) => (lootPerKill(c, (id) => priceById(id)?.gold) ?? 0) * (c.name === hs.boosted ? 2 : 1);
  const expOf = (c: Creature) => (c.exp ?? 0) * expMultiplier(hs) * (c.name === hs.boosted ? 2 : 1) * (c.name === hs.prey ? 1 + Number(hs.preyBonus) / 100 : 1);
  const hourly = perHour(hunted, Number(killsPerHour), lootOf, expOf);
  const upkeep = imbuementUpkeep(Object.values(build).flatMap((w) => w?.imbuements ?? []), (id) => priceById(id)?.gold);
  const supplies = parseGold(hs.supplies) ?? 0;
  const profit = hourly ? hourly.loot - upkeep.perHour - supplies : 0;
  return (
    <section className="hunt" aria-labelledby="hunt-title">
      <div className="compare-head">
        <h2 id="hunt-title">{t('hunt')}</h2>
        {hunt.length > 0 && <button type="button" onClick={() => { setHunt([]); setPlace(''); setHuntNotice(''); }}>{t('clear')}</button>}
        <Toggle app={app} name="hunt" />
      </div>
      <div id="hunt-body" hidden={!!app.hidden.hunt}>
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
                            <td className="num">{damageTaken(max, protection, element, armorTotal)}</td>
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
              <label className="budget">
                {t('killsPerHour')}
                <input type="number" min={0} inputMode="numeric" value={killsPerHour} onChange={(e) => setKillsPerHour(e.target.value)} placeholder="300" />
              </label>
              <div className="hour-options">
                {(['stamina', 'xpBoost', 'doubleXp'] as const).map((k) => (
                  <label key={k} className="check"><input type="checkbox" checked={hs[k]} onChange={(e) => setHs({ [k]: e.target.checked })} /> {t(`bonus.${k}`)}</label>
                ))}
                <label>
                  {t('prey')}
                  <select value={hs.prey} onChange={(e) => setHs({ prey: e.target.value })}>
                    <option value="">{t('none')}</option>
                    {hunted.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
                {hs.prey && (
                  <label>
                    {t('preyBonus')}
                    <select value={hs.preyBonus} onChange={(e) => setHs({ preyBonus: e.target.value })}>
                      {Array.from({ length: 10 }, (_, n) => 13 + n * 3).map((p) => <option key={p} value={p}>+{p}%</option>)}
                    </select>
                  </label>
                )}
                <label>
                  {t('boosted')}
                  <select value={hs.boosted} onChange={(e) => setHs({ boosted: e.target.value })}>
                    <option value="">{t('none')}</option>
                    {hunted.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
                <label>
                  {t('suppliesPerHour')}
                  <input value={hs.supplies} onChange={(e) => setHs({ supplies: e.target.value })} placeholder="1.5kk" />
                </label>
              </div>
              {hourly && (
                <table className="totals">
                  <tbody>
                    <tr><th scope="row">{t('expPerHour')}</th><td className="num">{hourly.exp.toLocaleString(lang)}</td></tr>
                    <tr><th scope="row">{t('lootPerHour')}</th><td className="num">{formatGold(hourly.loot)}</td></tr>
                    <tr><th scope="row">{t('imbuementsPerHour')}{upkeep.unpriced > 0 && <span className="muted small"> · {t('unpricedMaterials', { n: upkeep.unpriced })}</span>}</th><td className="num">−{formatGold(upkeep.perHour)}</td></tr>
                    <tr><th scope="row">{t('suppliesPerHour')}</th><td className="num">−{formatGold(supplies)}</td></tr>
                    <tr><th scope="row"><strong>{t('profitPerHour')}</strong></th><td className="num"><strong>{profit < 0 ? '−' : ''}{formatGold(Math.abs(profit))}</strong></td></tr>
                  </tbody>
                </table>
              )}
              <p className="muted small">{t('perHourHint')}</p>
              <h3>{t('attackWith')}</h3>
              <p>
                {attack.map(({ element, takes }) => (
                  <span key={element} className={takes === attack[0].takes ? 'tag best' : 'tag'}>{t(`el.${element}`)} {takes}%</span>
                ))}
              </p>
              <p className="muted small">{t('attackHint')}</p>
            </div>
            <div>
              <button type="button" className="optimize" onClick={optimize} disabled={!incoming.length}>{t('optimize')}</button>
              <p className="muted small">{t('optimizeHint')}</p>
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
      </div>
    </section>
  );
}
