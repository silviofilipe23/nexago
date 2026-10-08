import { DEFAULT_BROADCAST_ATLETA, type AtletaCard, type BroadcastAtleta } from '../../painel/data/broadcast-atleta';
import { atletaColunasOf, atletaComandoDe, atletaH2hLabel, atletaSequenciaLabel } from './overlay-atleta';

const CARD: AtletaCard = {
  key: 'k', name: 'Rafael Batrane', partner: 'Tiisaar', photoUrl: null, court: '2', category: 'Masculino B', rankPos: 11, rankPoints: 1105,
  city: 'Recife', state: 'PE', season: null, games: [], setsWon: 0, setsLost: 0, h2h: null,
};
const cfg = (p: Partial<BroadcastAtleta>): BroadcastAtleta => ({ ...DEFAULT_BROADCAST_ATLETA, ...p });
const NOW = 5_000_000;

describe('overlay-atleta', () => {
  it('mostra quando o seq muda; sai quando chega sem card', () => {
    expect(atletaComandoDe(1, cfg({ seq: 2, card: CARD }), NOW)).toBe('mostrar');
    expect(atletaComandoDe(1, cfg({ seq: 2, card: null }), NOW)).toBe('sair');
    expect(atletaComandoDe(2, cfg({ seq: 2, card: CARD }), NOW)).toBe('nada');
    expect(atletaComandoDe(null, DEFAULT_BROADCAST_ATLETA, NOW)).toBe('nada');
  });

  it('ao carregar o OBS só mostra comando recente e com card', () => {
    expect(atletaComandoDe(null, cfg({ seq: 3, card: CARD, at: new Date(NOW - 5000) }), NOW)).toBe('mostrar');
    expect(atletaComandoDe(null, cfg({ seq: 3, card: CARD, at: new Date(NOW - 3_600_000) }), NOW)).toBe('nada');
    expect(atletaComandoDe(null, cfg({ seq: 3, card: CARD, at: null }), NOW)).toBe('mostrar');
    expect(atletaComandoDe(null, cfg({ seq: 3, card: null, at: new Date(NOW) }), NOW)).toBe('nada');
  });

  it('colunas só com dado', () => {
    expect(atletaColunasOf(CARD)).toEqual([
      { label: 'Cidade', valor: 'Recife', sub: 'PE', laranja: false },
      { label: 'Ranking', valor: '11º', sub: '1105 pts', laranja: true },
    ]);
    expect(atletaColunasOf({ ...CARD, city: null, rankPos: null })).toEqual([]);
    expect(atletaColunasOf({ ...CARD, games: [{ phase: 'G', opponent: 'X', partials: '', score: '', won: true }], setsWon: 5, setsLost: 3 }).map((c) => c.valor)).toEqual(['Recife', '11º', '5–3']);
  });

  it('rótulos', () => {
    expect(atletaH2hLabel({ wins: 1, losses: 3, vs: 'x' })).toBe('1V·3D');
    expect(atletaSequenciaLabel({ kind: 'V', n: 1 })).toBe('1V');
  });
});
