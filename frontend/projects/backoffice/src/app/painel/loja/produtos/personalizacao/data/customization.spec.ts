import {
  DEFAULT_CUSTOMIZATION,
  MAX_AREAS,
  addOnCents,
  addOnLines,
  areaDraftError,
  newAreaId,
  backKindLabel,
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

  it('acréscimo segue o que está ligado, com as costas em linha própria', () => {
    expect(addOnCents(config())).toBe(2490);
    expect(addOnLines(config()).map((l) => l.label)).toEqual(['Nome + imagem']);
    expect(addOnCents(config((c) => (c.image.enabled = false)))).toBe(1490);
    expect(addOnCents(config((c) => (c.name.enabled = false)))).toBe(1990);
    const withBack = config((c) => (c.back.enabled = true));
    expect(addOnLines(withBack)).toEqual([
      { label: 'Nome + imagem', cents: 2490 },
      { label: 'Costas: imagem ou número', cents: 990 },
    ]);
    expect(addOnCents(withBack)).toBe(3480);
  });

  it('costas: o que está liberado e as regras', () => {
    expect(backKindLabel(config((c) => (c.back.allowImage = false)))).toBe('número');
    expect(customizationErrors(config((c) => {
      c.back.enabled = true;
      c.back.allowImage = false;
      c.back.allowNumber = false;
    })).back).toContain('Libere');
    // Só costas já basta para a personalização estar ativa.
    expect(customizationErrors(config((c) => {
      c.name.enabled = false;
      c.image.enabled = false;
      c.back.enabled = true;
    }))).toEqual({});
  });

  it('doc antigo com número junto do nome vira costas só com número', () => {
    const c = customizationFromDoc({ active: true, name: { allowNumber: true } });
    expect([c.back.enabled, c.back.allowImage, c.back.allowNumber]).toEqual([true, false, true]);
    expect('allowNumber' in c.name).toBeFalse();
    // `back: null` (seed antigo) é o mesmo caso — senão a tela mostrava as costas desligadas.
    const nulo = customizationFromDoc({ active: true, name: { allowNumber: true }, back: null });
    expect([nulo.back.enabled, nulo.back.allowNumber]).toEqual([true, true]);
  });

  it('nome de exemplo respeita o limite', () => {
    expect(sampleName(12)).toBe('ANTUNES');
    expect(sampleName(4)).toBe('ANTU');
  });

  describe('áreas criadas no backoffice', () => {
    const areas = DEFAULT_CUSTOMIZATION.image.areas;

    it('id = nome sem acento + sufixo; nunca repete um id existente', () => {
      expect(newAreaId('Manga Direita', [], () => 0)).toBe('manga_direita_0000');
      expect(newAreaId('Nuca (bordado)', [], () => 0.5)).toMatch(/^nuca_bordado_[a-z0-9]{4}$/);
      expect(newAreaId('  ', [], () => 0)).toBe('area_0000');
      const seq = [0, 0, 0.5];
      expect(newAreaId('Nuca', ['nuca_0000'], () => seq.shift()!)).not.toBe('nuca_0000');
      expect(newAreaId('x'.repeat(60), []).length).toBeLessThanOrEqual(40);
    });

    it('nome obrigatório e sem repetir; medidas de 1 a 100 cm; até o limite', () => {
      const ok = { name: 'Nuca', widthCm: 8, heightCm: 4 };
      expect(areaDraftError(ok, areas, null)).toBeNull();
      expect(areaDraftError({ ...ok, name: ' ' }, areas, null)).toBe('Dê um nome à área.');
      expect(areaDraftError({ ...ok, name: 'peito ESQUERDO' }, areas, null)).toBe('Já existe uma área com esse nome.');
      // Editando a própria área, o nome dela não conta como repetido.
      expect(areaDraftError({ ...ok, name: 'Peito esquerdo' }, areas, 'peito_esquerdo')).toBeNull();
      expect(areaDraftError({ ...ok, widthCm: 0 }, areas, null)).toBe('Largura e altura vão de 1 a 100 cm.');
      const full = Array.from({ length: MAX_AREAS }, (_, i) => ({ ...areas[0]!, id: `a${i}`, name: `A${i}` }));
      expect(areaDraftError(ok, full, null)).toBe('Cada produto tem até 10 áreas.');
      expect(areaDraftError(ok, full, 'a0')).toBeNull();
    });
  });
});
