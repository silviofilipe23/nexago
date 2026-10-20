import {
  buildPeladaRow,
  parsePelada,
  peladaMineOf,
  peladaStandings,
  peladasOf,
  peladasSummary,
  type SavedPelada,
} from './public-profile-peladas';

/** Maria (u1) + Enzo (u2) contra Rafael (u3) + Lia (u4), 2–1 em sets. */
function pelada(overrides: Partial<SavedPelada> = {}): SavedPelada {
  return {
    bookingId: 'b1',
    arenaName: 'Arena CFC',
    courtName: 'Quadra 1',
    dateKey: '2026-10-14',
    startTime: '09:00',
    endTime: '10:30',
    status: 'confirmed',
    teams: [
      { id: 0, players: [{ id: 'u1', name: 'Maria Alves' }, { id: 'u2', name: 'Enzo Lima' }] },
      { id: 1, players: [{ id: 'u3', name: 'Rafael Souza' }, { id: 'u4', name: 'Lia Martins' }] },
    ],
    games: [
      { teamA: 0, teamB: 1, scoreA: 21, scoreB: 18 },
      { teamA: 0, teamB: 1, scoreA: 17, scoreB: 21 },
      { teamA: 0, teamB: 1, scoreA: 15, scoreB: 12 },
    ],
    ...overrides,
  };
}

/** Rei da quadra: A vence B e C; B vence C. */
function kingOfCourt(): SavedPelada {
  return pelada({
    teams: [
      { id: 0, players: [{ id: 'u1', name: 'Maria' }] },
      { id: 1, players: [{ id: 'u3', name: 'Rafael' }] },
      { id: 2, players: [{ id: 'u5', name: 'Bia' }] },
    ],
    games: [
      { teamA: 0, teamB: 1, scoreA: 12, scoreB: 10 },
      { teamA: 0, teamB: 2, scoreA: 12, scoreB: 4 },
      { teamA: 1, teamB: 2, scoreA: 12, scoreB: 9 },
    ],
  });
}

describe('public-profile-peladas', () => {
  describe('peladaStandings', () => {
    it('ordena por vitórias, depois saldo', () => {
      const rows = peladaStandings(kingOfCourt());
      expect(rows.map((r) => [r.teamId, r.wins, r.losses, r.position])).toEqual([
        [0, 2, 0, 1],
        [1, 1, 1, 2],
        [2, 0, 2, 3],
      ]);
      expect(rows[0].pointDiff).toBe(10);
    });

    it('empate em vitórias, saldo e pontos divide a posição', () => {
      const rows = peladaStandings(
        pelada({
          games: [
            { teamA: 0, teamB: 1, scoreA: 21, scoreB: 19 },
            { teamA: 0, teamB: 1, scoreA: 19, scoreB: 21 },
          ],
        }),
      );
      expect(rows.map((r) => r.position)).toEqual([1, 1]);
    });
  });

  describe('peladaMineOf', () => {
    it('é a linha do time de quem joga', () => {
      expect(peladaMineOf(pelada(), 'u3')).toEqual({
        wins: 1,
        losses: 2,
        balance: -2,
        position: 2,
        teamsCount: 2,
      });
    });

    it('null para quem não está no placar', () => {
      expect(peladaMineOf(pelada(), 'u9')).toBeNull();
    });
  });

  describe('peladasOf', () => {
    it('só as do atleta, mais recentes primeiro (data e horário da reserva)', () => {
      const list = peladasOf(
        [
          pelada({ bookingId: 'a', dateKey: '2026-09-30' }),
          pelada({ bookingId: 'b', dateKey: '2026-10-14', startTime: '08:00' }),
          pelada({ bookingId: 'c', dateKey: '2026-10-14', startTime: '19:00' }),
          kingOfCourt(),
          pelada({ bookingId: 'sem-data', dateKey: '' }),
        ],
        'u2',
      );
      expect(list.map((p) => p.bookingId)).toEqual(['c', 'b', 'a']);
    });
  });

  describe('peladasSummary', () => {
    it('conta só confirmadas do ano: horários, aproveitamento e vezes em 1º', () => {
      const summary = peladasSummary(
        [
          pelada({ bookingId: 'a' }),
          pelada({ bookingId: 'b', dateKey: '2026-03-02' }),
          kingOfCourt(),
          pelada({ bookingId: 'pendente', status: 'pending' }),
          pelada({ bookingId: 'ano-passado', dateKey: '2025-12-30' }),
        ],
        'u1',
        2026,
      );
      expect(summary).toEqual({
        year: 2026,
        sessions: 3,
        games: 8,
        wins: 6,
        firstPlaces: 3,
        winRatePercent: 75,
      });
    });

    it('sem pelada no ano não tem horário nem divisão por zero', () => {
      expect(peladasSummary([pelada({ dateKey: '2025-05-01' })], 'u1', 2026)).toEqual({
        year: 2026,
        sessions: 0,
        games: 0,
        wins: 0,
        firstPlaces: 0,
        winRatePercent: 0,
      });
    });
  });

  describe('buildPeladaRow', () => {
    it('data da reserva, horário, quadra, campanha e posição do dono do perfil', () => {
      expect(buildPeladaRow(pelada(), 'u1')).toEqual({
        id: 'b1',
        weekday: 'QUA',
        day: '14',
        month: 'OUT',
        arenaName: 'Arena CFC',
        placeLabel: '09:00–10:30 · Quadra 1',
        recordLabel: '2V · 1D',
        positionLabel: '1º de 2',
        isFirst: true,
      });
    });

    it('sem quadra fica só o horário; quem perdeu não é 1º', () => {
      const row = buildPeladaRow(pelada({ courtName: null, startTime: '21:00:00', endTime: '23:00:00' }), 'u4');
      expect(row?.placeLabel).toBe('21:00–23:00');
      expect(row?.positionLabel).toBe('2º de 2');
      expect(row?.isFirst).toBeFalse();
    });

    it('null para quem não jogou', () => {
      expect(buildPeladaRow(pelada(), 'u9')).toBeNull();
    });
  });

  describe('parsePelada', () => {
    const doc = {
      createdBy: 'u1',
      arenaName: ' Arena CFC ',
      courtName: '',
      dateKey: '2026-10-14',
      startTime: '09:00',
      endTime: '10:30',
      status: 'confirmed',
      teams: [
        { id: 0, players: [{ id: 'u1', name: 'Maria' }, { id: '', name: 'sem id' }] },
        { id: 1, customName: 'Os brabos', players: [{ id: 'u3' }] },
      ],
      games: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 18 }, { teamA: 0, teamB: 1, scoreA: '21' }],
    };

    it('lê o doc de `bookingResults` como o app', () => {
      expect(parsePelada('b1', doc)).toEqual({
        bookingId: 'b1',
        arenaName: 'Arena CFC',
        courtName: null,
        dateKey: '2026-10-14',
        startTime: '09:00',
        endTime: '10:30',
        status: 'confirmed',
        teams: [
          { id: 0, players: [{ id: 'u1', name: 'Maria' }] },
          { id: 1, players: [{ id: 'u3', name: 'Atleta' }] },
        ],
        games: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 18 }],
      });
    });

    it('descarta doc sem autor, com menos de dois times ou sem jogo', () => {
      expect(parsePelada('x', { ...doc, createdBy: '' })).toBeNull();
      expect(parsePelada('x', { ...doc, teams: [doc.teams[0]] })).toBeNull();
      expect(parsePelada('x', { ...doc, games: [] })).toBeNull();
    });
  });
});
