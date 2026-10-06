import { rankingFromRaw, type RankingAthlete, type RankingCard } from '../../painel/data/broadcast-ranking';
import { broadcastControlFromRaw } from '../../painel/data/broadcast-control';
import { rankingMoveOf, rankingPointsText, rankingRowsOf } from './overlay-ranking';

const ath = (id: string, posBefore: number | null, posAfter: number, over: Partial<RankingAthlete> = {}): RankingAthlete => ({
  id,
  name: id.toUpperCase(),
  photo: null,
  sub: null,
  posBefore,
  posAfter,
  ptsBefore: 1000,
  ptsAfter: 1100,
  gain: 100,
  ...over,
});

const card = (before: RankingAthlete[], after: RankingAthlete[]): RankingCard => ({
  key: 'k1',
  categoryLabel: 'MASCULINO',
  stageName: 'Praia do Futuro',
  updated: true,
  before,
  after,
  leader: null,
  climber: null,
  topGain: null,
});

describe('overlay-ranking', () => {
  it('movimentação: sobe, cai, igual e novo (vindo de fora do top 10 ou sem pontos)', () => {
    expect(rankingMoveOf({ posBefore: 9, posAfter: 7 })).toEqual({ kind: 'up', n: 2 });
    expect(rankingMoveOf({ posBefore: 7, posAfter: 8 })).toEqual({ kind: 'down', n: 1 });
    expect(rankingMoveOf({ posBefore: 4, posAfter: 4 })).toEqual({ kind: 'same' });
    expect(rankingMoveOf({ posBefore: 12, posAfter: 9 })).toEqual({ kind: 'new' });
    expect(rankingMoveOf({ posBefore: null, posAfter: 9 })).toEqual({ kind: 'new' });
  });

  it('linhas: desliza quem está nos dois, entra quem só está no depois e sai quem só estava no antes', () => {
    const a = ath('a', 1, 2);
    const b = ath('b', 2, 1);
    const entra = ath('c', 11, 3);
    const sai = ath('d', 3, 11);
    const rows = rankingRowsOf(card([a, b, sai], [b, a, entra]));
    expect(rows.map((r) => [r.athlete.id, r.idxBefore, r.idxAfter])).toEqual([
      ['b', 1, 0],
      ['a', 0, 1],
      ['c', null, 2],
      ['d', 2, null],
    ]);
  });

  it('pontos com milhar em pt-BR', () => {
    expect(rankingPointsText(2960)).toBe((2960).toLocaleString('pt-BR'));
  });

  it('parser do card gravado pelo painel; lista de antes vazia cai na do depois; sem atletas descarta', () => {
    const raw = {
      on: true,
      mode: 'before',
      card: {
        key: 'k',
        categoryLabel: 'FEMININO',
        stageName: 'Etapa 3',
        updated: false,
        after: [{ id: 'x', name: 'Ana', posAfter: 1, ptsBefore: 10, ptsAfter: 20, gain: null }],
        leader: { name: 'Ana', points: 20, keeps: true },
      },
    };
    const r = rankingFromRaw(raw);
    expect(r.on).toBeTrue();
    expect(r.mode).toBe('before');
    expect(r.card?.before.length).toBe(1);
    expect(r.card?.after[0]?.gain).toBeNull();
    expect(r.card?.leader?.keeps).toBeTrue();
    expect(rankingFromRaw({ on: true, card: { key: 'k', after: [] } }).card).toBeNull();
    expect(broadcastControlFromRaw(null).ranking).toEqual({ on: false, mode: 'auto', card: null });
  });
});
