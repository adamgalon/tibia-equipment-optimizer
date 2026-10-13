import { describe, expect, it } from 'vitest';
import { perkEffects } from './proficiency.ts';
import { parseProficiency } from './wiki.ts';

describe('weapon proficiency', () => {
  it('reads perk levels per group and the weapons in each group', () => {
    const tables = '<includeonly>\n===Soul 1H Sword===\n{{Weapon Proficiency Table\n|perk_1 = \n{{Weapon Proficiency Button |skill_image=Sword|icon=|text=+1 Sword Fighting}}\n'
      + '|perk_2 = \n{{Weapon Proficiency Button |skill_image=A|icon=|text=+3% life leech}}\n{{Weapon Proficiency Button |skill_image=B|icon=X|text=+10% critical extra damage for [[Fierce Berserk]]}}\n}}\n'
      + '===Unused Group===\n{{Weapon Proficiency Table\n|perk_1 = \n{{Weapon Proficiency Button |text=+1 attack}}\n}}\n</includeonly>';
    const names = '{{#switch:{{{1|}}}\n| Soulcutter = Soul 1H Sword\n| Soulcutter Copy = Soul 1H Sword\n}}';
    expect(parseProficiency(tables, names)).toEqual([
      { name: 'Soul 1H Sword', items: ['Soulcutter', 'Soulcutter Copy'], levels: [['+1 Sword Fighting'], ['+3% life leech', '+10% critical extra damage for Fierce Berserk']] },
    ]);
  });

  it('counts skill, critical and leech perks and leaves conditional ones out', () => {
    expect(perkEffects('+1 Sword Fighting')).toEqual({ 'skill.sword': 1 });
    expect(perkEffects('+2 Magic Level')).toEqual({ 'skill.magic': 2 });
    expect(perkEffects('+2% critical hit chance')).toEqual({ critChance: 2 });
    expect(perkEffects('+10% critical extra damage')).toEqual({ critExtra: 10 });
    expect(perkEffects('+2.5% mana leech')).toEqual({ manaLeech: 2.5 });
    expect(perkEffects('+2% critical hit chance for auto-attacks')).toEqual({});
    expect(perkEffects('+3% damage against bosses and Sinister Embraced')).toEqual({});
  });
});
