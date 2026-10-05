import { isNamedTeamSize, parseTeamSizeField, participantUnit, rosterSizeFromField } from './team-size';

describe('tamanho de equipe no painel (fase 4b1)', () => {
  it('campo `teamSize`: 1 = individual, 3–5 = equipe, resto = dupla (null)', () => {
    expect(parseTeamSizeField(1)).toBe(1);
    expect(parseTeamSizeField('4')).toBe(4);
    expect(parseTeamSizeField(2)).toBeNull();
    expect(parseTeamSizeField(9)).toBeNull();
    expect(parseTeamSizeField(undefined)).toBeNull();
  });

  it('equipe nomeada é só 3+; elenco da dupla é 2', () => {
    expect(isNamedTeamSize(1)).toBeFalse();
    expect(isNamedTeamSize(null)).toBeFalse();
    expect(isNamedTeamSize(3)).toBeTrue();
    expect(rosterSizeFromField(null)).toBe(2);
    expect(rosterSizeFromField(1)).toBe(1);
    expect(rosterSizeFromField(4)).toBe(4);
  });

  it('unidade do participante', () => {
    expect(participantUnit(1)).toBe('atleta');
    expect(participantUnit(null)).toBe('dupla');
    expect(participantUnit(5)).toBe('equipe');
    expect(participantUnit(1, { plural: true, capitalized: true })).toBe('Atletas');
    expect(participantUnit(null, { plural: true })).toBe('duplas');
    expect(participantUnit(3, { capitalized: true })).toBe('Equipe');
  });
});
