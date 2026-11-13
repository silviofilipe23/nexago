import { canSearchPlatform, platformAthleteName, rankPlatformAthletes, type PlatformAthleteDoc } from './platform-athlete-search';

function athlete(id: string, fullName: string, nickname = '', keywords: string[] = []): PlatformAthleteDoc {
  return { id, data: { fullName, nickname, keywords, profilePhotoUrl: `https://x/${id}.jpg` } };
}

const DOCS: PlatformAthleteDoc[] = [
  athlete('u1', 'João Souza', 'joaozinho', ['joao', 'souza']),
  athlete('u2', 'Maria João Lima', '', ['maria', 'joao', 'lima']),
  athlete('u3', 'João Pedro Alves', 'jp', ['joao', 'pedro', 'alves']),
];

describe('rankPlatformAthletes', () => {
  it('exige todos os tokens digitados (AND)', () => {
    const result = rankPlatformAthletes(DOCS, 'joao pedro');
    expect(result.map((r) => r.athleteId)).toEqual(['u3']);
  });

  it('ignora acento e caixa', () => {
    const result = rankPlatformAthletes(DOCS, 'JOÃO souza');
    expect(result.map((r) => r.athleteId)).toEqual(['u1']);
  });

  it('tira quem já aparece na lista de clientes da arena', () => {
    const result = rankPlatformAthletes(DOCS, 'joao', new Set(['u1']));
    expect(result.map((r) => r.athleteId)).not.toContain('u1');
    expect(result.length).toBe(2);
  });

  it('leva a foto do perfil público', () => {
    const [first] = rankPlatformAthletes(DOCS, 'souza');
    expect(first.photoUrl).toBe('https://x/u1.jpg');
  });

  it('termo vazio não devolve ninguém', () => {
    expect(rankPlatformAthletes(DOCS, '   ')).toEqual([]);
  });
});

describe('platformAthleteName', () => {
  it('mostra nome completo com o apelido entre aspas', () => {
    expect(platformAthleteName({ fullName: 'Beatriz Lima', nickname: 'Bia' })).toBe('Beatriz Lima “Bia”');
  });

  it('não repete o apelido igual ao nome', () => {
    expect(platformAthleteName({ fullName: 'Bia', nickname: 'bia' })).toBe('Bia');
  });

  it('sem nome completo usa o apelido', () => {
    expect(platformAthleteName({ nickname: 'Bia' })).toBe('Bia');
  });
});

describe('canSearchPlatform', () => {
  it('pede pelo menos 2 letras no maior token', () => {
    expect(canSearchPlatform('j')).toBeFalse();
    expect(canSearchPlatform('a b')).toBeFalse();
    expect(canSearchPlatform('jo')).toBeTrue();
  });
});
