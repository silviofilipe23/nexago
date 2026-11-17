import { partnerPrivateSet } from './club.repository';
import {
  emptyPartnerForm,
  formFromPartner,
  partnerFromDoc,
  partnerPayload,
  partnerPrivateFromDoc,
  payloadWith,
  privateTierCoupons,
  validatePartnerForm,
  type PartnerForm,
} from './partner';
import { emptyLevelTier, levelTierErrors, levelTiersFromDoc, type LevelTierForm } from './partner-level-tiers';

function tier(minRank: LevelTierForm['minRank'], over: Partial<LevelTierForm> = {}): LevelTierForm {
  return { minRank, benefitHighlight: '15% OFF', benefitTitle: '15% em todo pedido', couponCode: `NEXA${minRank}`, ...over };
}

function form(over: Partial<PartnerForm> = {}): PartnerForm {
  return {
    ...emptyPartnerForm(),
    name: 'Fast Açaí',
    benefitHighlight: '10% OFF',
    benefitTitle: '10% de desconto em todo pedido',
    ctaLabel: 'Pedir',
    link: 'https://fast.example',
    couponMode: 'fixed',
    couponCode: 'NEXAGO10',
    ...over,
  };
}

describe('clube: desconto por elo (levelTiers)', () => {
  it('leitura defensiva como o servidor: só faixas bem-formadas, uma por elo, na ordem da escada', () => {
    const tiers = levelTiersFromDoc([
      { minRank: 'ELITE', benefitHighlight: '20% OFF', benefitTitle: '20% em tudo' },
      { minRank: 'COMPETIDOR', benefitHighlight: '12% OFF', benefitTitle: '12% em tudo' },
      { minRank: 'ELITE', benefitHighlight: 'repetido', benefitTitle: 'ignora' },
      { minRank: 'INICIANTE', benefitHighlight: 'x', benefitTitle: 'é o benefício-base' },
      { minRank: 'MESTRE', benefitHighlight: 'x'.repeat(25), benefitTitle: 'selo longo' },
      { minRank: 'LENDA', benefitHighlight: '', benefitTitle: '  ' },
      'lixo',
      null,
    ]);
    expect(tiers).toEqual([
      { minRank: 'COMPETIDOR', benefitHighlight: '12% OFF', benefitTitle: '12% em tudo' },
      { minRank: 'ELITE', benefitHighlight: '20% OFF', benefitTitle: '20% em tudo' },
    ]);
    expect(levelTiersFromDoc(undefined)).toEqual([]);
    expect(partnerFromDoc('x', { name: 'X', levelTiers: 'nada' }).levelTiers).toEqual([]);
  });

  it('cupons das faixas no privado: só os 5 elos, com código', () => {
    const priv = partnerPrivateFromDoc({ tierCoupons: { ELITE: ' NEXA20 ', INICIANTE: 'X', LENDA: '', MESTRE: 3 } });
    expect(priv.tierCoupons).toEqual({ ELITE: 'NEXA20' });
    expect(partnerPrivateFromDoc({ tierCoupons: ['ELITE'] }).tierCoupons).toEqual({});
  });

  it('grava em ordem crescente da escada, aparando o texto, e os cupons num mapa por elo', () => {
    const f = form({
      levelTiers: [tier('LENDA', { benefitTitle: ' 30% em tudo ' }), tier('COMPETIDOR', { couponCode: ' NEXA12 ' })],
    });
    expect(partnerPayload(f).levelTiers).toEqual([
      { minRank: 'COMPETIDOR', benefitHighlight: '15% OFF', benefitTitle: '15% em todo pedido' },
      { minRank: 'LENDA', benefitHighlight: '15% OFF', benefitTitle: '30% em tudo' },
    ]);
    expect(privateTierCoupons(f)).toEqual({ COMPETIDOR: 'NEXA12', LENDA: 'NEXALENDA' });
  });

  it('só com cupom fixo: em outro modo grava levelTiers vazio, nenhum cupom de faixa e não valida as faixas', () => {
    for (const couponMode of ['none', 'athlete'] as const) {
      const f = form({ couponMode, levelTiers: [tier('ELITE', { couponCode: '' })] });
      expect(partnerPayload(f).levelTiers).toEqual([]);
      expect(privateTierCoupons(f)).toEqual({});
      expect(validatePartnerForm(f).levelTiers).toBeUndefined();
    }
  });

  it('volta ao mesmo form com os cupons do privado', () => {
    const f = form({ levelTiers: [tier('DESAFIANTE'), tier('MESTRE')] });
    const read = partnerFromDoc('fast-acai', partnerPayload(f) as unknown as Record<string, unknown>);
    const back = formFromPartner(read, null, privateTierCoupons(f));
    expect(back.levelTiers).toEqual(f.levelTiers);
    expect(formFromPartner(read).levelTiers.map((t) => t.couponCode)).toEqual(['', '']);
  });

  it('validação: tudo obrigatório, limites da rule, elo sem repetir e até 5 faixas', () => {
    expect(validatePartnerForm(form({ levelTiers: [tier('ELITE')] }))).toEqual({});
    const msg = (t: LevelTierForm) => validatePartnerForm(form({ levelTiers: [tier('COMPETIDOR'), t] })).levelTiers;
    expect(msg(tier('ELITE', { benefitHighlight: ' ' }))).toBe('Faixa 2: Informe o selo.');
    expect(msg(tier('ELITE', { benefitHighlight: 'x'.repeat(25) }))).toContain('Selo até 24');
    expect(msg(tier('ELITE', { benefitTitle: '' }))).toBe('Faixa 2: Descreva o benefício.');
    expect(msg(tier('ELITE', { benefitTitle: 'x'.repeat(81) }))).toContain('Benefício até 80');
    expect(msg(tier('ELITE', { couponCode: ' ' }))).toBe('Faixa 2: Informe o cupom.');
    expect(msg(tier('ELITE', { couponCode: 'x'.repeat(25) }))).toContain('Cupom até 24');
    expect(msg(tier('COMPETIDOR'))).toBe('Faixa 2: Competidor já tem faixa: escolha outro elo.');
    expect(levelTierErrors([tier('ELITE'), tier('ELITE')])).toEqual([null, jasmine.stringContaining('Elite já tem faixa')]);

    const six = [...(['COMPETIDOR', 'DESAFIANTE', 'ELITE', 'MESTRE', 'LENDA'] as const).map((r) => tier(r)), tier('LENDA')];
    expect(validatePartnerForm(form({ levelTiers: six })).levelTiers).toBe('No máximo 5 faixas.');
  });

  it('faixa nova pega o primeiro elo livre; com os 5 ocupados não há mais', () => {
    expect(emptyLevelTier([])!.minRank).toBe('COMPETIDOR');
    expect(emptyLevelTier([tier('COMPETIDOR'), tier('ELITE')])!.minRank).toBe('DESAFIANTE');
    const all = (['COMPETIDOR', 'DESAFIANTE', 'ELITE', 'MESTRE', 'LENDA'] as const).map((r) => tier(r));
    expect(emptyLevelTier(all)).toBeNull();
  });

  it('toggle da tabela não exige os cupons das faixas (moram no privado) e mantém as faixas', () => {
    const read = partnerFromDoc('fast-acai', partnerPayload(form({ levelTiers: [tier('ELITE')] })) as unknown as Record<string, unknown>);
    const toggled = payloadWith(read, { active: true });
    expect('error' in toggled).toBeFalse();
    expect((toggled as { levelTiers: unknown }).levelTiers).toEqual(read.levelTiers);
  });
});

describe('clube: gravação de partnerPrivate', () => {
  it('troca o mapa tierCoupons inteiro (mergeFields), sem tocar nos avisos do servidor', () => {
    const { data, options } = partnerPrivateSet({ couponCode: null, tierCoupons: { COMPETIDOR: 'NEXA12' } }, 'uid-1');
    // A faixa ELITE que havia antes não está no mapa novo e o campo inteiro é substituído.
    expect(data['tierCoupons']).toEqual({ COMPETIDOR: 'NEXA12' });
    expect(options.mergeFields.sort()).toEqual(['couponCode', 'tierCoupons', 'updatedAt', 'updatedBy']);
    expect('merge' in options).toBeFalse();
    expect(data['updatedBy']).toBe('uid-1');
    expect(Object.keys(data)).not.toContain('notifiedNewAt');
  });

  it('sem faixas no write, não mexe em tierCoupons', () => {
    const { data, options } = partnerPrivateSet({ couponCode: 'SQUAD20' }, 'uid-1');
    expect(data['couponCode']).toBe('SQUAD20');
    expect(options.mergeFields).not.toContain('tierCoupons');
    expect('tierCoupons' in data).toBeFalse();
  });
});
