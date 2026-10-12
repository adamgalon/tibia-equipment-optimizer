import { expect, it } from 'vitest';
import { DICTIONARIES, translate } from './i18n.ts';

it('has a Polish translation for every English key', () => {
  const missing = Object.keys(DICTIONARIES.en).filter((k) => !(k in DICTIONARIES.pl));
  expect(missing).toEqual([]);
});

it('fills placeholders', () => {
  expect(translate('en', 'results', { n: 12 })).toBe('12 items');
});
