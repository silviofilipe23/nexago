import type { TournamentMatch } from '../../../data/matches-repository';
import type { TournamentSummary } from '../../../data/tournaments-repository';
import { crossingRowsOf, wherePlayOf } from './focus-group.component';

/**
 * Cobre só a lógica NOVA desta seção (Task 9): `crossingRowsOf` e `wherePlayOf`. O resto que o
 * componente consome (`standingsViewOf`, `qualificationNoteOf`, `liveRowsOf` — Task 3;
 * `roundScenariosOf` — Task 4; `groupLabelOf`/`knockoutLabelOf` — seletores) já tem cobertura
 * própria em `focus-views.spec.ts`, `focus-scenarios.spec.ts` e `tournament-live.selectors.spec.ts`
 * — testá-las de novo aqui seria duplicar, não verificar. Extraídas como funções puras (parâmetros
 * crus) pra não precisar de `TestBed`, no mesmo padrão de `focus-journey.component.spec.ts`.
 */

function match(partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'knockout',
    poolId: '',
    teamAId: '',
    teamBId: '',
    teamADescription: null,
    teamBDescription: null,
    status: 'Scheduled',
    resultA: null,
    resultB: null,
    sets: [],
    winnerId: null,
    isGroupMatch: false,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    scheduleTime: null,
    courtName: null,
    liveScore: null,
    matchStartedAt: null,
    checkIn: { teamA: null, teamB: null },
    queueStatus: null,
    bestOf: 3,
    currentSetIndex: null,
    ...partial,
  };
}

describe('crossingRowsOf', () => {
  it('sem categoria, devolve vazio', () => {
    const matches = [match({ id: 'q1', teamADescription: '1º do Grupo A', teamBDescription: '2º do Grupo B' })];
    expect(crossingRowsOf(matches, null)).toEqual([]);
  });

  it('só entra quando os DOIS slots já têm descrição do sorteio — nunca metade adivinhada', () => {
    const matches = [
      match({ id: 'q1', teamADescription: '1º do Grupo A', teamBDescription: null }),
      match({ id: 'q2', teamADescription: null, teamBDescription: '2º do Grupo B' }),
      match({ id: 'q3', teamADescription: null, teamBDescription: null }),
    ];
    expect(crossingRowsOf(matches, 'c1')).toEqual([]);
  });

  it('nunca inclui partida de grupo, mesmo com descrição nos dois lados', () => {
    const matches = [match({ id: 'g1', poolId: 'p1', isGroupMatch: true, teamADescription: '1º do Grupo A', teamBDescription: '2º do Grupo B' })];
    expect(crossingRowsOf(matches, 'c1')).toEqual([]);
  });

  it('ignora partida de outra categoria', () => {
    const matches = [match({ id: 'q1', categoryId: 'outra', teamADescription: '1º do Grupo A', teamBDescription: '2º do Grupo B' })];
    expect(crossingRowsOf(matches, 'c1')).toEqual([]);
  });

  it('monta label + os dois lados a partir da descrição declarada pelo bracket', () => {
    const matches = [match({ id: 'q1', matchType: 'Final', teamADescription: '1º do Grupo A', teamBDescription: '2º do Grupo B' })];
    expect(crossingRowsOf(matches, 'c1')).toEqual([{ id: 'q1', label: 'Final', a: '1º do Grupo A', b: '2º do Grupo B' }]);
  });

  it('ordena por round e depois por número da partida', () => {
    const matches = [
      match({ id: 'r2-b', round: 2, matchNumber: 2, teamADescription: 'x', teamBDescription: 'y' }),
      match({ id: 'r1', round: 1, matchNumber: 1, teamADescription: 'x', teamBDescription: 'y' }),
      match({ id: 'r2-a', round: 2, matchNumber: 1, teamADescription: 'x', teamBDescription: 'y' }),
    ];
    expect(crossingRowsOf(matches, 'c1').map((r) => r.id)).toEqual(['r1', 'r2-a', 'r2-b']);
  });

  it('corta em 4 linhas — a Task 10 (chave) é o lugar da árvore completa, não este resumo', () => {
    const matches = Array.from({ length: 6 }, (_, i) =>
      match({ id: `q${i}`, round: 1, matchNumber: i, teamADescription: `a${i}`, teamBDescription: `b${i}` }),
    );
    expect(crossingRowsOf(matches, 'c1').length).toBe(4);
  });
});

describe('wherePlayOf', () => {
  const tournament: Pick<TournamentSummary, 'location' | 'locationAddress' | 'city'> = {
    location: 'Arena Praia Central',
    locationAddress: 'Av. Beira Mar, 100',
    city: 'Florianópolis',
  };

  it('sem quadra e sem torneio carregado, devolve tudo nulo — sem inventar endereço', () => {
    expect(wherePlayOf(null, null)).toEqual({ court: null, arena: null, address: null, mapsUrl: null });
  });

  it('usa o endereço explícito da arena quando existe', () => {
    const view = wherePlayOf('3', tournament);
    expect(view.arena).toBe('Arena Praia Central');
    expect(view.address).toBe('Av. Beira Mar, 100');
  });

  // O dado cru gravado em `TournamentMatch.courtName` é o valor que o organizador digita
  // (`tournament_match_display.dart`/`courtLabelOf`, `tournament-format.ts`) — normalmente só o
  // número da quadra, nunca "Quadra N" pronto. `focus-views.ts` já normaliza esse mesmo campo com
  // `courtLabelOf` em três lugares (Agora, timeline, ao vivo); sem a mesma normalização aqui a
  // seção Grupo mostraria "3" onde a seção Agora, pra essa MESMA partida, mostra "Quadra 3".
  it('normaliza o nome cru da quadra com courtLabelOf — nunca mostra o dígito solto', () => {
    expect(wherePlayOf('3', tournament).court).toBe('Quadra 3');
  });

  it('nome de quadra já por extenso passa intacto (courtLabelOf é idempotente)', () => {
    expect(wherePlayOf('Quadra 3', tournament).court).toBe('Quadra 3');
  });

  it('sem quadra nenhuma, court continua null', () => {
    expect(wherePlayOf(null, tournament).court).toBeNull();
  });

  it('sem endereço explícito, cai para "local, cidade" — mesma fórmula de focus-now', () => {
    const view = wherePlayOf(null, { location: 'Arena Praia Central', locationAddress: null, city: 'Florianópolis' });
    expect(view.address).toBe('Arena Praia Central, Florianópolis');
  });

  it('o link do Maps aponta pro endereço, urlencodado — nunca pra "quadra N" (não existe posição de quadra)', () => {
    const view = wherePlayOf('3', tournament);
    expect(view.mapsUrl).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Av. Beira Mar, 100')}`);
    expect(view.mapsUrl).not.toContain('Quadra');
  });
});
