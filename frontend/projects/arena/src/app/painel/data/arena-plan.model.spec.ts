import {
  ARENA_FEATURES_UNLOCKED,
  arenaCapabilitiesFor,
  maxCourtsFor,
  maxRecurringActiveFor,
  nextCourtsTierFor,
} from './arena-plan.model';

/** Gates por plano (chave de funções liberadas desligada). */
const LOCKED = false;

describe('funções liberadas (fase sem cobrança por plano)', () => {
  it('a chave está ligada', () => {
    expect(ARENA_FEATURES_UNLOCKED).toBe(true);
  });

  it('toda arena tem todas as capabilities, com ou sem plano', () => {
    const caps = arenaCapabilitiesFor(null, false);
    for (const c of ['pdvComandas', 'estoque', 'promocoes', 'clubinho', 'aulas', 'planosHorario',
      'metricasCompletas', 'receberTorneios', 'multiUnidade', 'equipe', 'horariosPico'] as const) {
      expect(caps.has(c)).toBe(true);
    }
  });

  it('sem limite de quadras nem de horários fixos', () => {
    expect(maxCourtsFor(null, false)).toBeNull();
    expect(maxRecurringActiveFor('starter', true)).toBeNull();
    expect(nextCourtsTierFor(null, false)).toBeNull();
  });

  it('com a chave desligada, sem plano volta ao teto de 2 quadras', () => {
    expect(maxCourtsFor(null, false, LOCKED)).toBe(2);
    expect(maxRecurringActiveFor(null, false, LOCKED)).toBe(3);
  });
});


describe('arenaCapabilitiesFor — capability equipe', () => {
  it('pro com titularidade tem equipe', () => {
    expect(arenaCapabilitiesFor('pro', true, LOCKED).has('equipe')).toBe(true);
  });

  it('elite com titularidade tem equipe', () => {
    expect(arenaCapabilitiesFor('elite', true, LOCKED).has('equipe')).toBe(true);
  });

  it('starter nao tem equipe', () => {
    expect(arenaCapabilitiesFor('starter', true, LOCKED).has('equipe')).toBe(false);
  });

  it('sem titularidade nao tem equipe mesmo em elite', () => {
    expect(arenaCapabilitiesFor('elite', false, LOCKED).has('equipe')).toBe(false);
  });

  it('sem plano nao tem equipe', () => {
    expect(arenaCapabilitiesFor(null, false, LOCKED).has('equipe')).toBe(false);
  });
});
