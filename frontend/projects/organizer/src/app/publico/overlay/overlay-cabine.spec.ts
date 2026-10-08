import { DEFAULT_BROADCAST_CABINE, type BroadcastCabine, type CabinePessoa } from '../../painel/data/broadcast-cabine';
import { cabineApoioOf, cabineComandoDe, cabineViewOf } from './overlay-cabine';

const P = (id: string, over: Partial<CabinePessoa> = {}): CabinePessoa => ({ id, role: 'Narração', name: id, handle: null, desc: null, photoUrl: null, mic: true, ...over });
const cfg = (p: Partial<BroadcastCabine>): BroadcastCabine => ({ ...DEFAULT_BROADCAST_CABINE, ...p });
const NOW = 9_000_000;

describe('overlay-cabine', () => {
  it('view: uma pessoa pelo idx, cabine com as duas primeiras, nada sem modo ou sem a pessoa', () => {
    const pessoas = [P('a'), P('b'), P('c')];
    expect(cabineViewOf(cfg({ pessoas, modo: 'um', idx: 2 }))!.pessoas.map((p) => p.id)).toEqual(['c']);
    expect(cabineViewOf(cfg({ pessoas, modo: 'cabine' }))!.pessoas.map((p) => p.id)).toEqual(['a', 'b']);
    expect(cabineViewOf(cfg({ pessoas: [P('a')], modo: 'cabine' }))!.pessoas.length).toBe(1);
    expect(cabineViewOf(cfg({ pessoas, modo: null }))).toBeNull();
    expect(cabineViewOf(cfg({ pessoas: [P('a')], modo: 'um', idx: 3 }))).toBeNull();
    expect(cabineViewOf(cfg({ pessoas: [], modo: 'cabine' }))).toBeNull();
  });

  it('comando: seq novo mostra ou sai; igual não faz nada', () => {
    const base = { pessoas: [P('a')], modo: 'um' as const, idx: 0 };
    expect(cabineComandoDe(1, cfg({ ...base, seq: 2 }), NOW)).toBe('mostrar');
    expect(cabineComandoDe(1, cfg({ ...base, seq: 2, modo: null }), NOW)).toBe('sair');
    expect(cabineComandoDe(2, cfg({ ...base, seq: 2 }), NOW)).toBe('nada');
    expect(cabineComandoDe(null, DEFAULT_BROADCAST_CABINE, NOW)).toBe('nada');
  });

  it('ao carregar o OBS só mostra comando recente', () => {
    const base = { pessoas: [P('a')], modo: 'um' as const, seq: 3 };
    expect(cabineComandoDe(null, cfg({ ...base, at: new Date(NOW - 4000) }), NOW)).toBe('mostrar');
    expect(cabineComandoDe(null, cfg({ ...base, at: new Date(NOW - 3_600_000) }), NOW)).toBe('nada');
    expect(cabineComandoDe(null, cfg({ ...base, at: null }), NOW)).toBe('mostrar');
    expect(cabineComandoDe(null, cfg({ ...base, modo: null, at: new Date(NOW) }), NOW)).toBe('nada');
  });

  it('apoio: @ ganha o arroba quando falta', () => {
    expect(cabineApoioOf(P('a', { handle: 'rafamoura', desc: 'Ex-atleta' }))).toEqual({ handle: '@rafamoura', desc: 'Ex-atleta' });
    expect(cabineApoioOf(P('a', { handle: '@x' })).handle).toBe('@x');
    expect(cabineApoioOf(P('a'))).toEqual({ handle: null, desc: null });
  });
});
