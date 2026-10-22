import { toCsv } from './csv';

describe('toCsv', () => {
  it('junta com ; e começa com BOM', () => {
    expect(toCsv([['a', 1], ['b', null]])).toBe('﻿a;1\r\nb;');
  });

  it('escapa aspas, ; e quebra de linha', () => {
    expect(toCsv([['x;y', 'diz "oi"', 'l1\nl2']])).toBe('﻿"x;y";"diz ""oi""";"l1\nl2"');
  });
});
