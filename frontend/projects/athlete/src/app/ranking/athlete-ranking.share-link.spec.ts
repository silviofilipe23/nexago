import { sharedRankingFromQuery, sharerFirstName } from './athlete-ranking.share-link';

function query(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

describe('sharedRankingFromQuery', () => {
  it('lê o recorte inteiro do link do app', () => {
    const slice = sharedRankingFromQuery(
      query('esporte=VOLEI_PRAIA&modo=equipes&ano=2026&genero=feminino&nivel=open&formato=trio&por=uid-ray'),
    );

    expect(slice).toEqual({
      sport: 'VOLEI_PRAIA',
      mode: 'doubles',
      period: 'temporada',
      year: 2026,
      gender: 'female',
      level: 'open',
      format: 'trio',
      sharedBy: 'uid-ray',
    });
  });

  it('sem ano é o ranking geral; sem recortes, "Todos"', () => {
    const slice = sharedRankingFromQuery(query('esporte=VOLEI_PRAIA&modo=atletas'));

    expect(slice).toEqual({
      sport: 'VOLEI_PRAIA',
      mode: 'individual',
      period: 'geral',
      year: null,
      gender: 'all',
      level: 'all',
      format: 'all',
      sharedBy: null,
    });
  });

  it('abrir /ranking pelo menu não é compartilhamento', () => {
    expect(sharedRankingFromQuery(query(''))).toBeNull();
    expect(sharedRankingFromQuery(query('utm_source=site'))).toBeNull();
  });

  it('formato não vale no Individual', () => {
    expect(sharedRankingFromQuery(query('modo=atletas&formato=trio'))!.format).toBe('all');
  });

  it('valor desconhecido cai em "Todos" em vez de esvaziar a lista', () => {
    const slice = sharedRankingFromQuery(query('modo=duplas&genero=x&nivel=Intermediário 1&formato=sexteto&ano=26&esporte=XADREZ'))!;

    expect(slice.mode).toBe('doubles');
    expect(slice.gender).toBe('all');
    expect(slice.level).toBe('all');
    expect(slice.format).toBe('all');
    expect(slice.year).toBeNull();
    expect(slice.period).toBe('geral');
    expect(slice.sport).toBeNull();
  });

  it('aceita caixa alta nos códigos', () => {
    const slice = sharedRankingFromQuery(query('modo=EQUIPES&genero=Masculino&nivel=Avancado'))!;

    expect(slice.mode).toBe('doubles');
    expect(slice.gender).toBe('male');
    expect(slice.level).toBe('avancado');
  });
});

describe('sharerFirstName', () => {
  it('apelido vence; sem apelido, o primeiro nome', () => {
    expect(sharerFirstName({ nickname: 'Ray', displayName: 'Ray' })).toBe('Ray');
    expect(sharerFirstName({ nickname: null, displayName: 'Raissa Lima' })).toBe('Raissa');
  });

  it('sem perfil ou sem nome, aviso genérico', () => {
    expect(sharerFirstName(undefined)).toBeNull();
    expect(sharerFirstName({ nickname: null, displayName: 'Atleta (…abc123)' })).toBeNull();
  });
});
