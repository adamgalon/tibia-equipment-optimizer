/**
 * The stat a proficiency perk adds, as a totals row key, for the perks that map onto one ("+1 Sword Fighting",
 * "+2% critical hit chance"). Conditional perks ("... for auto-attacks", "... against bosses") return nothing:
 * they apply only some of the time, so they are listed rather than counted.
 */
export function perkEffects(text: string): Record<string, number> {
  let m: RegExpExecArray | null;
  if ((m = /^\+(\d+) (sword|axe|club|distance|fist) fighting$/i.exec(text))) return { [`skill.${m[2].toLowerCase()}`]: Number(m[1]) };
  if ((m = /^\+(\d+) magic level$/i.exec(text))) return { 'skill.magic': Number(m[1]) };
  if ((m = /^\+(\d+) shielding$/i.exec(text))) return { 'skill.shielding': Number(m[1]) };
  if ((m = /^\+([\d.]+)% critical hit chance$/i.exec(text))) return { critChance: Number(m[1]) };
  if ((m = /^\+([\d.]+)% critical extra damage$/i.exec(text))) return { critExtra: Number(m[1]) };
  if ((m = /^\+([\d.]+)% life leech$/i.exec(text))) return { lifeLeech: Number(m[1]) };
  if ((m = /^\+([\d.]+)% mana leech$/i.exec(text))) return { manaLeech: Number(m[1]) };
  return {};
}
