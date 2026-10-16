import {
  DEFAULT_CUSTOMIZATION,
  addOnCents,
  addOnLabel,
  customizationErrors,
  customizationFromDoc,
  sampleName,
  type CustomizationConfig,
} from './customization';

function config(over: (c: CustomizationConfig) => void = () => undefined): CustomizationConfig {
  const c = structuredClone(DEFAULT_CUSTOMIZATION);
  c.active = true;
  over(c);
  return c;
}

describe('customization', () => {
  it('sem doc vem o padrão, desativado', () => {
    const c = customizationFromDoc(undefined);
    expect(c.active).toBeFalse();
    expect(c.name.maxChars).toBe(12);
    expect(c.image.areas.map((a) => a.enabled)).toEqual([true, true, false]);
  });

  it('doc salvo manda, bloco a bloco', () => {
    const c = customizationFromDoc({ active: true, name: { maxChars: 8 } });
    expect(c.active).toBeTrue();
    expect(c.name.maxChars).toBe(8);
    expect(c.name.fonts.length).toBe(3);
  });

  it('o padrão ativado não tem erro', () => {
    expect(customizationErrors(config())).toEqual({});
  });

  it('erro no card certo', () => {
    expect(Object.keys(customizationErrors(config((c) => {
      c.name.fonts = c.name.fonts.map((f) => ({ ...f, enabled: false }));
      c.image.areas = c.image.areas.map((a) => ({ ...a, enabled: false }));
      c.production.leadDays = 0;
    }))).sort()).toEqual(['image', 'name', 'production']);
  });

  it('ativa sem nome nem imagem pede para desativar', () => {
    const e = customizationErrors(config((c) => {
      c.name.enabled = false;
      c.image.enabled = false;
    }));
    expect(e.active).toContain('desative');
  });

  it('acréscimo segue o que está ligado', () => {
    expect(addOnCents(config())).toBe(2490);
    expect(addOnLabel(config())).toBe('Nome + imagem');
    expect(addOnCents(config((c) => (c.image.enabled = false)))).toBe(1490);
    expect(addOnCents(config((c) => (c.name.enabled = false)))).toBe(1990);
  });

  it('nome de exemplo respeita o limite', () => {
    expect(sampleName(12)).toBe('ANTUNES');
    expect(sampleName(4)).toBe('ANTU');
  });
});
