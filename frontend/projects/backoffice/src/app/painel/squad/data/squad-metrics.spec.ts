import { DEFAULT_CYCLE } from './squad-program';
import { cycleProgress, funnelOf, funnelSteps, originSplit, weekOf } from './squad-metrics';
import type { CommissionOrigin, CommissionStatus } from '../comissoes/data/commission';

const at = (iso: string) => new Date(iso);
const c = (status: CommissionStatus, origin: CommissionOrigin = 'code', netCents = 100_00, registeredAt: Date | null = null) => ({
  status,
  origin,
  netCents,
  registeredAt,
});

describe('cycleProgress', () => {
  it('dia 38 de 90 no piloto (08/09 → 06/12), com a revisão no dia 45', () => {
    const p = cycleProgress(DEFAULT_CYCLE, at('2026-10-15T15:00:00-03:00'));
    expect(p.state).toBe('running');
    expect(p.day).toBe(38);
    expect(p.total).toBe(90);
    expect(p.reviewDay).toBe(45);
    expect(Math.round(p.pct)).toBe(42);
    expect(p.pill).toBe('Piloto · dia 38 de 90');
    expect(p.startLabel).toBe('08 set');
    expect(p.endLabel).toBe('06 dez');
  });

  it('o dia vira à meia-noite de São Paulo, não em UTC', () => {
    // 23:30 de SP já é dia seguinte em UTC.
    expect(cycleProgress(DEFAULT_CYCLE, at('2026-09-08T23:30:00-03:00')).day).toBe(1);
    expect(cycleProgress(DEFAULT_CYCLE, at('2026-09-09T00:10:00-03:00')).day).toBe(2);
  });

  it('antes e depois do ciclo', () => {
    const before = cycleProgress(DEFAULT_CYCLE, at('2026-09-01T12:00:00-03:00'));
    expect(before.state).toBe('before');
    expect(before.pct).toBe(0);
    expect(before.pill).toBe('Piloto · começa em 08 set');
    const after = cycleProgress(DEFAULT_CYCLE, at('2026-12-07T12:00:00-03:00'));
    expect(after.state).toBe('done');
    expect(after.pct).toBe(100);
    expect(after.pill).toBe('Piloto · encerrado em 06 dez');
    expect(cycleProgress({ ...DEFAULT_CYCLE, id: 'ciclo-2' }, at('2026-10-15T12:00:00-03:00')).pill).toBe('Ciclo · dia 38 de 90');
  });
});

describe('funil', () => {
  it('inscrição = qualquer comissão; paga = liberada ou paga; cliques sem medição', () => {
    const f = funnelOf([c('pending'), c('released'), c('paid'), c('canceled')], 9);
    expect(f).toEqual({ clicks: null, signups: 9, registrations: 4, paid: 2 });
    const steps = funnelSteps(f);
    expect(steps.map((s) => s.label)).toEqual(['Cliques', 'Cadastros', 'Inscrições', 'Pagas']);
    expect(steps[0]!.value).toBeNull();
    expect(steps[0]!.pct).toBe(0);
    // Relativo ao maior número conhecido (os cadastros).
    expect(steps[1]!.pct).toBe(100);
    expect(Math.round(steps[3]!.pct)).toBe(22);
  });

  it('sem nada: barras mínimas, sem dividir por zero', () => {
    const steps = funnelSteps(funnelOf([], 0));
    expect(steps.slice(1).every((s) => s.pct === 4)).toBeTrue();
  });
});

describe('originSplit', () => {
  it('só conversões, inteiros que somam 100', () => {
    const list = [c('paid', 'code'), c('paid', 'link'), c('released', 'qr'), c('pending', 'link'), c('canceled', 'qr')];
    const split = originSplit(list);
    expect(split.code + split.link + split.qr).toBe(100);
    expect(split).toEqual({ code: 34, link: 33, qr: 33 });
    expect(originSplit([c('pending')])).toEqual({ code: 0, link: 0, qr: 0 });
  });
});

describe('weekOf', () => {
  it('conversões dos últimos 7 dias pela data da inscrição', () => {
    const now = at('2026-10-17T12:00:00-03:00');
    const list = [
      c('paid', 'code', 120_00, at('2026-10-16T10:00:00-03:00')),
      c('released', 'code', 80_00, at('2026-10-11T10:00:00-03:00')),
      c('pending', 'code', 50_00, at('2026-10-16T10:00:00-03:00')),
      c('paid', 'code', 90_00, at('2026-10-01T10:00:00-03:00')),
    ];
    expect(weekOf(list, now)).toEqual({ conversions: 2, revenueCents: 200_00 });
  });
});
