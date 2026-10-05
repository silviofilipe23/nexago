import { countStagesByLeague, leagueSummaryFromDoc } from './leagues-repository';
import type { ArenaTournament } from './tournament.model';

function tournament(overrides: Partial<ArenaTournament> = {}): ArenaTournament {
  return {
    id: 't1',
    name: 'Etapa',
    sport: 'Vôlei de praia',
    dateLabel: '10 ago',
    startAt: null,
    status: 'inscricoes',
    enrolledCount: 0,
    capacity: 0,
    collectedReais: 0,
    leagueId: null,
    ...overrides,
  };
}

describe('countStagesByLeague', () => {
  it('conta uma etapa por torneio da liga', () => {
    const counts = countStagesByLeague([
      tournament({ id: 't1', leagueId: 'l1' }),
      tournament({ id: 't2', leagueId: 'l1' }),
      tournament({ id: 't3', leagueId: 'l2' }),
    ]);
    expect(counts.get('l1')).toBe(2);
    expect(counts.get('l2')).toBe(1);
  });

  it('ignora torneio avulso (sem liga)', () => {
    const counts = countStagesByLeague([tournament({ id: 't1', leagueId: null }), tournament({ id: 't2', leagueId: 'l1' })]);
    expect(counts.size).toBe(1);
    expect(counts.get('l1')).toBe(1);
  });

  it('não acha liga nenhuma sem torneios', () => {
    expect(countStagesByLeague([]).size).toBe(0);
  });
});

describe('leagueSummaryFromDoc', () => {
  it('traduz o esporte e conta as etapas totais da liga', () => {
    const summary = leagueSummaryFromDoc(
      'l1',
      { name: 'Liga nexaGO', sport: 'beachVolleyball', city: 'Goiânia', seasonLabel: '2026', stages: [{}, {}, {}] },
      2,
    );
    expect(summary).toEqual({
      id: 'l1',
      name: 'Liga nexaGO',
      sport: 'Vôlei de praia',
      city: 'Goiânia',
      seasonLabel: '2026',
      stagesHereCount: 2,
      stagesTotalCount: 3,
    });
  });

  it('cai nos rótulos de fallback quando o doc vem sem os campos', () => {
    const summary = leagueSummaryFromDoc('l1', {}, 0);
    expect(summary.name).toBe('Liga');
    expect(summary.sport).toBe('Esporte');
    expect(summary.city).toBe('');
    expect(summary.seasonLabel).toBeNull();
    expect(summary.stagesTotalCount).toBe(0);
  });

  // Contrato do catálogo (spec multiesporte, emenda de 04/10): esporte que o
  // catálogo conhece sai com o rótulo dele; desconhecido sai em title case.
  it('esporte conhecido pelo catálogo sai com o rótulo, mesmo fora do wizard', () => {
    expect(leagueSummaryFromDoc('l1', { sport: 'beachTennis' }, 0).sport).toBe('Beach tennis');
  });

  it('esporte desconhecido sai em title case, sem inventar tradução', () => {
    expect(leagueSummaryFromDoc('l1', { sport: 'padel' }, 0).sport).toBe('Padel');
  });

  it('não confunde `stages` malformado com etapas', () => {
    expect(leagueSummaryFromDoc('l1', { stages: 'três' }, 0).stagesTotalCount).toBe(0);
  });
});
