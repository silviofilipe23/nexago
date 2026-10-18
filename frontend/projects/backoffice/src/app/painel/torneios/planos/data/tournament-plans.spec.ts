import {
  DEFAULT_PLANS,
  DEFAULT_RULES,
  DEFAULT_SPONSORS,
  addDays,
  clone,
  effectivePlan,
  marginPct,
  marginTone,
  newPlanFrom,
  planDiffs,
  samePlan,
  suggestedPrice,
  tierIdFor,
  validatePlan,
  validateSponsors,
} from './tournament-plans';

/** `Intl` separa "R$" do valor com espaço rígido. */
const nb = (t: string) => t.replace(/\u00a0/g, ' ');

describe('tournament-plans', () => {
  const plan2 = () => clone(DEFAULT_PLANS[1]!.plan);

  it('margem da tabela do dono: 1 quadra 41%, 4 quadras 29%', () => {
    expect(marginPct(DEFAULT_PLANS[0]!.plan, DEFAULT_RULES)).toBe(41);
    expect(marginPct(DEFAULT_PLANS[3]!.plan, DEFAULT_RULES)).toBe(29);
  });

  it('tom: até 5 pontos abaixo da mínima é amarelo, mais que isso vermelho', () => {
    expect(marginTone(35, 35)).toBe('green');
    expect(marginTone(31, 35)).toBe('yellow');
    expect(marginTone(29, 35)).toBe('red');
  });

  it('preço sugerido alcança a margem mínima em múltiplos de R$ 10', () => {
    // custo de 4 quadras = R$ 2.500 → 2500 / 0,65 = 3846,15 → R$ 3.850
    expect(suggestedPrice(4, DEFAULT_RULES)).toBe(3850_00);
    expect(marginPct({ priceCents: 3850_00, courts: 4 }, DEFAULT_RULES)).toBeGreaterThanOrEqual(35);
  });

  it('diff lista só o que mudou, formatado', () => {
    const next = plan2();
    next.priceCents = 2600_00;
    next.extraHourCents = 150_00;
    const flat = planDiffs(DEFAULT_PLANS[1]!.plan, next).map((d) => ({ ...d, before: nb(d.before), after: nb(d.after) }));
    expect(flat).toEqual([
      { label: 'Preço por evento', before: 'R$ 2.500', after: 'R$ 2.600' },
      { label: 'Hora extra', before: '—', after: 'R$ 150' },
    ]);
  });

  it('narrador desligado sem transmissão não conta como diferença extra', () => {
    const a = plan2();
    a.live = false;
    const b = { ...a, narrator: false };
    expect(samePlan(a, b)).toBeTrue();
  });

  it('agendado vale a partir do dia', () => {
    const next = { plan: { ...plan2(), priceCents: 1 }, version: 2, effectiveFrom: '2026-11-01' };
    const e = { current: plan2(), next };
    expect(effectivePlan(e, '2026-10-31')!.priceCents).toBe(2500_00);
    expect(effectivePlan(e, '2026-11-01')!.priceCents).toBe(1);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('valida campos fora do limite', () => {
    const p = plan2();
    p.name = 'x';
    p.depositPct = 120;
    p.priceCents = NaN;
    expect(Object.keys(validatePlan(p)).sort()).toEqual(['depositPct', 'name', 'priceCents']);
  });

  it('plano novo nasce em rascunho com uma quadra a mais', () => {
    const p = newPlanFrom(DEFAULT_PLANS[3]!.plan, 4);
    expect(p).toEqual(jasmine.objectContaining({ name: 'Plano 5', status: 'rascunho', courts: 5, priceCents: 4000_00 }));
  });

  it('cota com nome repetido é acusada; id novo não colide', () => {
    const s = clone(DEFAULT_SPONSORS);
    s.tiers[1]!.name = 'bronze';
    expect(validateSponsors(s)['tiers.1.name']).toBeDefined();
    expect(tierIdFor('Ouro', ['ouro'])).toBe('ouro-2');
    expect(tierIdFor('Patrocínio Máster', [])).toBe('patrocinio-master');
  });
});
