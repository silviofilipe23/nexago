import {
  DEFAULT_SQUAD_RULES,
  affectsContracts,
  cloneRules,
  formatNumber,
  parseNumberText,
  rulesFromDoc,
  sameNumber,
  scoreTotal,
  validateRules,
  versionLabel,
  type SquadRules,
} from './squad-rules';

function rules(edit: (r: SquadRules) => void = () => undefined): SquadRules {
  const r = cloneRules(DEFAULT_SQUAD_RULES);
  edit(r);
  return r;
}

describe('squad-rules', () => {
  describe('números em pt-BR', () => {
    it('lê inteiro, decimal com vírgula e milhar com ponto', () => {
      expect(parseNumberText('10')).toBe(10);
      expect(parseNumberText('1,5')).toBe(1.5);
      expect(parseNumberText('1.000')).toBe(1000);
      expect(parseNumberText(' 25 ')).toBe(25);
      expect(parseNumberText('')).toBeNaN();
      expect(parseNumberText('dez')).toBeNaN();
    });

    it('faixa só quando permitida, com hífen ou travessão', () => {
      expect(parseNumberText('10–15', true)).toEqual([10, 15]);
      expect(parseNumberText('10-15', true)).toEqual([10, 15]);
      expect(parseNumberText('10-15')).toBeNaN();
      const partial = parseNumberText('10–', true) as [number, number];
      expect(partial[0]).toBe(10);
      expect(partial[1]).toBeNaN();
    });

    it('formata faixa com travessão e milhar só quando pedido', () => {
      expect(formatNumber([10, 15])).toBe('10–15');
      expect(formatNumber(1000, true)).toBe('1.000');
      expect(formatNumber(1000)).toBe('1000');
      expect(formatNumber(1.5)).toBe('1,5');
      expect(formatNumber(NaN)).toBe('');
    });

    it('NaN é igual a NaN: campo inválido não reescreve o texto digitado', () => {
      expect(sameNumber(NaN, NaN)).toBeTrue();
      expect(sameNumber([10, NaN], [10, NaN])).toBeTrue();
      expect(sameNumber(10, [10, 15])).toBeFalse();
    });

    it('versão no formato do desenho', () => {
      expect(versionLabel(1)).toBe('v1.0');
      expect(versionLabel(12)).toBe('v12.0');
    });
  });

  describe('validateRules (espelho de functions/src/squad-rules.ts)', () => {
    it('o padrão do piloto é válido e soma 100', () => {
      expect(validateRules(DEFAULT_SQUAD_RULES)).toEqual({});
      expect(scoreTotal(DEFAULT_SQUAD_RULES.scoreWeights)).toBe(100);
    });

    it('comissão + desconto acima da margem acusa com a mensagem do desenho', () => {
      const issues = validateRules(rules((r) => (r.tiers.cap.commissionPct = 16)));
      expect(issues['tiers.cap.margin']).toBe('Comissão + desconto passam a margem de 25% por inscrição');
    });

    it('no Pro a margem conta o piso da faixa', () => {
      expect(validateRules(rules((r) => (r.tiers.pro.commissionPct = [10, 20])))).toEqual({});
      expect(validateRules(rules((r) => (r.tiers.pro.commissionPct = [11, 20])))['tiers.pro.margin']).toBeDefined();
    });

    it('faixa fora do Pro é recusada', () => {
      const issues = validateRules(rules((r) => (r.tiers.amb.commissionPct = [10, 12])));
      expect(issues['tiers.amb.commissionPct']).toBe('Faixa só no Pro: informe um número');
    });

    it('escada: Ambassador abaixo do Athlete acusa no Ambassador; Captain fica fora', () => {
      const issues = validateRules(
        rules((r) => {
          r.tiers.ath.commissionPct = 12;
          r.tiers.ath.followerDiscountPct = 5;
          r.tiers.cap.commissionPct = 1;
        }),
      );
      expect(Object.keys(issues)).toEqual(['tiers.amb.ladder']);
      expect(issues['tiers.amb.ladder']).toBe('Menor que a comissão do Athlete (12%)');
    });

    it('pesos fora de 100 mostram o total', () => {
      const issues = validateRules(rules((r) => (r.scoreWeights.reach = 15)));
      expect(issues['scoreWeights.total']).toBe('Total 105 — ajuste para 100');
    });

    it('limites de nível estritamente crescentes', () => {
      const issues = validateRules(rules((r) => (r.points.levels[2]!.min = 500)));
      expect(issues['points.levels.2']).toBe('Acima de 500 pts');
    });

    it('campo vazio (NaN) é erro, não zero', () => {
      const issues = validateRules(rules((r) => (r.attribution.windowDays = NaN)));
      expect(issues['attribution.windowDays']).toBe('De 1 a 90 dias');
    });

    it('checklist sem item vazio', () => {
      const issues = validateRules(rules((r) => (r.termination.checklist = ['Conduta', ' '])));
      expect(issues['termination.checklist']).toBeDefined();
    });
  });

  it('só o pacote por nível afeta contrato', () => {
    expect(affectsContracts(DEFAULT_SQUAD_RULES, rules((r) => (r.tiers.ath.kitCostCents = 70_00)))).toBeTrue();
    expect(affectsContracts(DEFAULT_SQUAD_RULES, rules((r) => (r.attribution.windowDays = 15)))).toBeFalse();
    expect(affectsContracts(DEFAULT_SQUAD_RULES, rules((r) => (r.scoreWeights.reach = 5)))).toBeFalse();
  });

  it('doc ausente vira o padrão; doc parcial completa com o padrão', () => {
    expect(rulesFromDoc(undefined)).toEqual(DEFAULT_SQUAD_RULES);
    const partial = rulesFromDoc({ rules: { marginMaxPct: 30, tiers: { ath: { kitCostCents: 99_00 } } } });
    expect(partial.marginMaxPct).toBe(30);
    expect(partial.tiers.ath.kitCostCents).toBe(99_00);
    expect(partial.tiers.ath.commissionPct).toBe(5);
    expect(partial.points).toEqual(DEFAULT_SQUAD_RULES.points);
  });
});
