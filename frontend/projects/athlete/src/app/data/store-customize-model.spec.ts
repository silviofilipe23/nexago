import {
  areaPreviewBox,
  areaStepTitle,
  areaTextFont,
  areasKindLabel,
  stepAreas,
  clampTransform,
  contrastRatio,
  backNumberHint,
  backPreviewBox,
  backStepTitle,
  customExtraCents,
  hasCustomOptions,
  sanitizeBackNumber,
  defaultNameColor,
  effectiveDpi,
  finalizeName,
  fitTransform,
  formatsLabel,
  imageFileProblem,
  imageFormat,
  imageHeightFraction,
  imageQuality,
  imageQualityLabel,
  imageRulesLabel,
  nameFontFraction,
  nameHint,
  nameHintWarns,
  nameSide,
  nameStepTitle,
  namePreviewBox,
  previewPhoto,
  previewPhotoNote,
  priceBreakdown,
  productionNote,
  sanitizeNameInput,
  soloPriceLabel,
} from './store-customize-model';
import { cartItemsFromDoc, storeProductFromDoc, type StoreCustomization } from './store-showcase-model';
import { mergeCartItem } from './store-product-model';

const IMAGE: StoreCustomization['image'] = {
  enabled: true,
  formats: ['png', 'jpg', 'svg'],
  maxSizeMb: 10,
  minWidthPx: 1000,
  minHeightPx: 1000,
  areas: [],
};
const PEITO = { id: 'peito_esquerdo', name: 'Peito esquerdo', widthCm: 9, heightCm: 9 };
const CENTRO = { id: 'centro_frente', name: 'Centro da frente', widthCm: 25, heightCm: 30 };

describe('store-customize-model', () => {
  describe('nome', () => {
    it('maiúsculas, sem espaço no começo nem duplo, até o máximo', () => {
      expect(sanitizeNameInput('  antunes  jr', 12)).toEqual({ value: 'ANTUNES JR', rejected: false });
      expect(sanitizeNameInput('joão-pedro 10', 20)).toEqual({ value: 'JOÃO-PEDRO 10', rejected: false });
      expect(sanitizeNameInput('antunes silva', 12).value).toBe('ANTUNES SILV');
      // O espaço do fim fica enquanto digita (é o da próxima palavra).
      expect(sanitizeNameInput('ana ', 12).value).toBe('ANA ');
      expect(finalizeName('ANA ')).toBe('ANA');
    });

    it('caractere inválido não entra e marca a recusa', () => {
      expect(sanitizeNameInput('ana!', 12)).toEqual({ value: 'ANA', rejected: true });
      expect(sanitizeNameInput('a😀b', 12)).toEqual({ value: 'AB', rejected: true });
    });

    it('hint com contagem, laranja a partir de max − 2 e título pelo lugar', () => {
      expect(nameHint(7, 12)).toBe('7 de 12 caracteres · letras, números e espaço');
      expect(nameHint(7, 12, 'app')).toBe('7 de 12 · letras, números e espaço');
      expect(nameHintWarns(9, 12)).toBeFalse();
      expect(nameHintWarns(10, 12)).toBeTrue();
      expect(nameStepTitle('costas_inferior')).toBe('Nome nas costas');
      expect(nameStepTitle('frente')).toBe('Nome na frente');
      expect(nameStepTitle('manga')).toBe('Nome na manga');
      expect(nameStepTitle('barra')).toBe('Nome na barra');
      expect(nameSide('barra')).toBe('frente');
      expect(namePreviewBox('barra')).toEqual({ cx: 0.5, cy: 0.8, w: 0.6, h: 0.15 });
    });

    it('cor padrão = a de maior contraste com a peça; sem cor, a primeira', () => {
      const colors = ['#f4f4f5', '#17171a', '#ff6a1a'];
      expect(defaultNameColor(colors, '#17171a')).toBe('#f4f4f5');
      expect(defaultNameColor(colors, '#ede6da')).toBe('#17171a');
      expect(defaultNameColor(colors, null)).toBe('#f4f4f5');
      expect(defaultNameColor([], '#000000')).toBeNull();
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    });
  });

  describe('preço', () => {
    const price = { nameOnlyCents: 1490, imageOnlyCents: 1990, bothCents: 2490, backCents: 990 };
    it('juntos saem pelo preço de ambos; cada passo mostra o sozinho', () => {
      expect(customExtraCents(price, true, true)).toBe(2490);
      expect(customExtraCents(price, true, false)).toBe(1490);
      expect(customExtraCents(price, false, true)).toBe(1990);
      expect(customExtraCents(price, false, false)).toBe(0);
      // Costas somam por cima, como no servidor.
      expect(customExtraCents(price, true, true, true)).toBe(3480);
      expect(customExtraCents(price, false, false, true)).toBe(990);
      expect(soloPriceLabel(1490, 'm')).toBe('+ R$ 14,90 sozinho');
      expect(soloPriceLabel(1990, 'f')).toBe('+ R$ 19,90 sozinha');
      expect(priceBreakdown(12990, 2490)).toBe('R$ 129,90 + R$ 24,90 de personalização');
      expect(priceBreakdown(12990, 0)).toBe('');
    });
  });

  describe('imagem', () => {
    it('formato pelo tipo; sem tipo, pela extensão', () => {
      expect(imageFormat({ type: 'image/jpeg', name: 'a.png' })).toBe('jpg');
      expect(imageFormat({ type: '', name: 'logo.SVG' })).toBe('svg');
      expect(imageFormat({ type: 'image/gif', name: 'a.png' })).toBeNull();
      expect(formatsLabel(['png', 'jpg', 'svg'])).toBe('PNG, JPG ou SVG');
      expect(imageRulesLabel(IMAGE)).toBe(
        'PNG, JPG ou SVG até 10 MB · mínimo 1000 × 1000 px · use só imagens suas ou com autorização',
      );
    });

    it('recusa formato, peso e resolução; SVG não tem mínimo', () => {
      const file = (type: string, size: number, name = 'a') => ({ type, size, name });
      const big = { widthPx: 2400, heightPx: 2400 };
      expect(imageFileProblem(file('image/png', 1_000_000), big, IMAGE)).toBeNull();
      expect(imageFileProblem(file('image/gif', 1_000_000), big, IMAGE)).toContain('Formato não aceito');
      expect(imageFileProblem(file('image/png', 11 * 1024 * 1024), big, IMAGE)).toBe('Arquivo maior que 10 MB');
      expect(imageFileProblem(file('image/png', 1000), { widthPx: 800, heightPx: 800 }, IMAGE)).toBe(
        'Imagem pequena demais · mínimo 1000 × 1000 px',
      );
      expect(imageFileProblem(file('image/svg+xml', 1000), null, IMAGE)).toBeNull();
      expect(imageFileProblem(file('image/png', 1000), null, IMAGE)).toContain('Não deu pra ler');
    });

    it('qualidade pelo dpi efetivo da área (300 = boa)', () => {
      const dims = { widthPx: 2400, heightPx: 2400 };
      expect(imageQuality(effectiveDpi(dims, PEITO))).toBe('good');
      expect(imageQuality(effectiveDpi({ widthPx: 1200, heightPx: 1200 }, CENTRO))).toBe('warn');
      expect(imageQualityLabel('good', dims, PEITO)).toBe('Boa qualidade · 2400 × 2400 px');
      expect(imageQualityLabel('warn', dims, CENTRO)).toBe('Pode ficar levemente borrada no tamanho Centro da frente');
      expect(effectiveDpi(null, PEITO)).toBe(Number.POSITIVE_INFINITY);
    });

    it('ajuste fino fica dentro da área com a proporção travada', () => {
      // Imagem 2:1 numa área quadrada: no máximo a largura toda, metade da altura.
      expect(fitTransform(2, PEITO)).toEqual({ x: 0.5, y: 0.5, scale: 1 });
      expect(imageHeightFraction(1, 2, PEITO)).toBe(0.5);
      // Imagem em pé (1:2): o que cabe é a altura → metade da largura.
      expect(fitTransform(0.5, PEITO).scale).toBe(0.5);
      const t = clampTransform({ x: 1.2, y: -1, scale: 0.4 }, 1, PEITO);
      expect(t).toEqual({ x: 0.8, y: 0.2, scale: 0.4 });
      expect(clampTransform({ x: 0.5, y: 0.5, scale: 0.01 }, 1, PEITO).scale).toBe(0.1);
    });
  });

  describe('prévia e nota', () => {
    it('caixa da área sobre a peça de 60 × 70 e fonte que cabe na faixa', () => {
      const box = areaPreviewBox(PEITO);
      expect(box.cx).toBe(0.68);
      expect(box.w).toBeCloseTo(9 / 60, 5);
      expect(box.h).toBeCloseTo(9 / 70, 5);
      expect(areaPreviewBox({ ...PEITO, id: 'outra' }).cy).toBe(0.4);
      expect(nameFontFraction(7, 0.6)).toBeCloseTo(0.088, 5);
      expect(nameFontFraction(12, 0.6)).toBeLessThan(0.088);
    });

    it('foto do lado na cor; senão a do lado sem cor; senão a do lado em outra cor; sem nenhuma do lado, mockup', () => {
      const p = storeProductFromDoc('cam', {
        name: 'Camiseta',
        priceCents: 12990,
        axes: [
          {
            id: 'cor',
            label: 'Cor',
            values: [
              { id: 'branco', label: 'Branco areia', hex: '#f1ece2' },
              { id: 'preto', label: 'Preto', hex: '#111111' },
            ],
          },
        ],
        photos: [
          { url: 'frente-preto', colorValueId: 'preto', view: 'frente' },
          { url: 'costas-geral', colorValueId: null, view: 'costas' },
          { url: 'sem-lado', colorValueId: 'preto' },
        ],
      })!;
      expect(previewPhoto(p, 'preto', 'frente')?.url).toBe('frente-preto');
      expect(previewPhoto(p, 'preto', 'costas')?.url).toBe('costas-geral');
      // Branco sem foto (o caso do DEV: só o preto tem frente e costas): mostra a peça, avisando a cor.
      expect(previewPhoto(p, 'branco', 'frente')?.url).toBe('frente-preto');
      expect(previewPhotoNote(p, 'branco', 'frente')).toBe('Foto em Preto · a sua sai em Branco areia');
      expect(previewPhotoNote(p, 'preto', 'frente')).toBeNull();
      expect(previewPhotoNote(p, 'branco', 'costas')).toBeNull(); // foto sem cor vale pra qualquer cor
      const semFoto = storeProductFromDoc('cam2', { name: 'Camiseta', priceCents: 12990, photos: [{ url: 'x', colorValueId: 'preto' }] })!;
      expect(previewPhoto(semFoto, 'branco', 'frente')).toBeNull();
    });

    it('nota de produção; a troca só por defeito só quando vale', () => {
      const n = productionNote({ leadDays: 5, defectOnlyReturns: true });
      expect(n.before + n.days + n.after).toBe(
        'Feito sob demanda: fica pronto em 5 dias úteis depois que a arte é aprovada. Personalizados só têm troca em caso de defeito.',
      );
      expect(productionNote({ leadDays: 1, defectOnlyReturns: false }).days).toBe('1 dia útil');
      expect(productionNote({ leadDays: 1, defectOnlyReturns: false }).after).toBe(' depois que a arte é aprovada.');
    });
  });

  describe('costas', () => {
    const back = { enabled: true, allowNumber: true, allowImage: true, numberMaxDigits: 2, widthCm: 25, heightCm: 25 };

    it('número: só dígitos, até o máximo; hint pelo máximo', () => {
      expect(sanitizeBackNumber('1a0', 2)).toEqual({ value: '10', rejected: true });
      expect(sanitizeBackNumber('123', 2)).toEqual({ value: '12', rejected: true });
      expect(sanitizeBackNumber('7', 2)).toEqual({ value: '7', rejected: false });
      expect(backNumberHint(2)).toBe('Até 2 dígitos · 0 a 99');
      expect(backNumberHint(1)).toBe('Até 1 dígito · 0 a 9');
      expect(backNumberHint(3)).toBe('Até 3 dígitos · 0 a 999');
    });

    it('título e caixa da prévia: abaixo do nome, acima com o nome embaixo, centrada sem nome', () => {
      expect(backStepTitle('costas_superior')).toBe('Costas · abaixo do nome');
      expect(backStepTitle('costas_inferior')).toBe('Costas · acima do nome');
      expect(backStepTitle(null)).toBe('Costas');
      const h = 25 / 70;
      const below = backPreviewBox(back, 'costas_superior');
      expect(below.cx).toBe(0.5);
      expect(below.w).toBeCloseTo(25 / 60, 5);
      expect(below.cy).toBeCloseTo(0.24 + 0.075 + 0.03 + h / 2, 5);
      expect(backPreviewBox(back, 'costas_inferior').cy).toBeCloseTo(0.62 - 0.075 - 0.03 - h / 2, 5);
      expect(backPreviewBox(back, 'frente').cy).toBe(0.45);
      // Área enorme nunca sai do quadro.
      const big = backPreviewBox({ ...back, heightCm: 60 }, 'costas_superior');
      expect(big.cy + big.h / 2).toBeLessThanOrEqual(1);
    });

    it('posição arrastada no backoffice: nome, área e costas no lugar dela; costas seguem o nome arrastado', () => {
      expect(namePreviewBox('frente', { x: 0.3, y: 0.2 })).toEqual({ cx: 0.3, cy: 0.2, w: 0.6, h: 0.15 });
      expect(namePreviewBox('frente', null)).toEqual({ cx: 0.5, cy: 0.3, w: 0.6, h: 0.15 });
      const moved = areaPreviewBox({ ...PEITO, position: { x: 0.32, y: 0.3 } });
      expect([moved.cx, moved.cy]).toEqual([0.32, 0.3]);
      // Caixa nunca sai da peça (área maior depois do arrasto).
      const edge = areaPreviewBox({ ...PEITO, position: { x: 1, y: 0 } });
      expect(edge.cx + edge.w / 2).toBeLessThanOrEqual(1);
      expect(edge.cy - edge.h / 2).toBeGreaterThanOrEqual(0);
      const h = 25 / 70;
      expect(backPreviewBox(back, 'costas_superior', { x: 0.5, y: 0.1 }).cy).toBeCloseTo(0.1 + 0.075 + 0.03 + h / 2, 5);
      expect(backPreviewBox({ ...back, position: { x: 0.5, y: 0.7 } }, 'costas_superior').cy).toBe(0.7);
      const doc = storeProductFromDoc('cam', {
        name: 'Camiseta',
        priceCents: 12990,
        customizable: true,
        customization: {
          name: { enabled: true, fonts: ['bloco'], colors: ['#fff'], position: { x: 0.3, y: 0.2 } },
          image: {
            enabled: true,
            formats: ['png'],
            areas: [
              { id: 'peito_esquerdo', name: 'Peito', widthCm: 9, heightCm: 9, position: { x: 0.32, y: 0.3 } },
              { id: 'centro_frente', name: 'Centro', widthCm: 25, heightCm: 30 },
            ],
          },
          back: { enabled: true, allowNumber: true, position: { x: 2, y: 0.5 } },
        },
      })!;
      expect(doc.customization!.name.position).toEqual({ x: 0.3, y: 0.2 });
      expect(doc.customization!.image.areas.map((a) => a.position)).toEqual([{ x: 0.32, y: 0.3 }, null]);
      // Fora da peça (doc mexido à mão) = lugar padrão.
      expect(doc.customization!.back.position).toBeNull();
    });

    it('espelho antigo sem `back` chega com as costas desligadas; só costas já abre o Personalizar', () => {
      const old = storeProductFromDoc('cam', {
        name: 'Camiseta',
        priceCents: 12990,
        customizable: true,
        customization: { fromCents: 990, leadDays: 5, image: { formats: ['png'] } },
      })!;
      expect(old.customization!.back.enabled).toBeFalse();
      const onlyBack = storeProductFromDoc('cam', {
        name: 'Camiseta',
        priceCents: 12990,
        customizable: true,
        customization: { fromCents: 990, leadDays: 5, image: { formats: ['png'] }, back: { ...back, allowImage: false }, price: { backCents: 990 } },
      })!;
      expect(onlyBack.customization!.back.enabled).toBeTrue();
      expect(onlyBack.customization!.back.allowImage).toBeFalse();
      expect(onlyBack.customization!.price.backCents).toBe(990);
      expect(hasCustomOptions(onlyBack.customization)).toBeTrue();
    });
  });

  describe('config e carrinho', () => {
    it('doc antigo (sem nome/imagem no espelho) chega com as duas opções desligadas', () => {
      const p = storeProductFromDoc('cam', {
        name: 'Camiseta',
        priceCents: 12990,
        customizable: true,
        customization: { fromCents: 1490, leadDays: 5, defectOnlyReturns: true },
      })!;
      expect(p.customization!.name.enabled).toBeFalse();
      expect(p.customization!.image.enabled).toBeFalse();
    });

    it('linha personalizada sobrevive à reescrita e nunca recebe a soma', () => {
      const custom = { configVersion: 1, extraPriceCents: 2490, name: { text: 'ANA' } };
      const items = cartItemsFromDoc({
        items: [
          { productId: 'cam', skuId: 'preto_m', qty: 1, lineId: 'l1', customization: custom },
          { productId: 'bola', skuId: 'u', qty: 1 },
        ],
      });
      expect(items[0]).toEqual({ productId: 'cam', skuId: 'preto_m', qty: 1, lineId: 'l1', customization: custom });
      expect('lineId' in items[1]!).toBeFalse();

      const merged = mergeCartItem(items, { productId: 'cam', skuId: 'preto_m', qty: 2, maxQty: 5 })!;
      expect(merged.items.length).toBe(3);
      expect(merged.items[0]).toBe(items[0]!);
      expect(merged.items[2]).toEqual({ productId: 'cam', skuId: 'preto_m', qty: 2 });
    });
  });

  describe('texto na área', () => {
    const area = { id: 'nuca', name: 'Nuca', widthCm: 8, heightCm: 4, image: false, text: true, textMaxChars: 10 };

    it('áreas do passo: as do espelho novo; espelho antigo = image.areas como só imagem', () => {
      const novo = storeProductFromDoc('cam', {
        name: 'Camiseta', priceCents: 12990, customizable: true,
        customization: { image: { enabled: false, formats: [] }, areas: [{ ...area, position: { x: 0.5, y: 0.1 } }, { id: 'x', name: 'X', widthCm: 5, heightCm: 5, image: true }] },
      })!.customization!;
      // Sem formato, a área "só imagem" não serve: fica só a de texto.
      expect(stepAreas(novo).map((a) => a.id)).toEqual(['nuca']);
      expect(hasCustomOptions(novo)).toBeTrue();
      const antigo = storeProductFromDoc('cam', {
        name: 'Camiseta', priceCents: 12990, customizable: true,
        customization: { image: { enabled: true, formats: ['png'], areas: [{ id: 'peito_esquerdo', name: 'Peito', widthCm: 9, heightCm: 9 }] } },
      })!.customization!;
      expect(stepAreas(antigo)).toEqual([jasmine.objectContaining({ id: 'peito_esquerdo', image: true, text: false, textMaxChars: 20 })]);
    });

    it('título, rótulo do que o passo oferece e fonte que cabe na caixa', () => {
      expect(areaStepTitle({ ...area, position: null })).toBe('Texto na frente');
      expect(areaStepTitle({ ...area, image: true, position: null })).toBe('Imagem ou texto');
      expect(areaStepTitle({ ...area, id: 'manga', image: true, text: false, position: null })).toBe('Imagem na manga');
      expect(areasKindLabel([{ ...area, position: null }])).toBe('texto');
      // Faixa larga e baixa (30 × 4 cm): a altura manda; caixa estreita (8 × 4): a largura.
      expect(areaTextFont(3, { cx: 0.5, cy: 0.1, w: 30 / 60, h: 4 / 70 })).toBeCloseTo((4 / 70) * (7 / 6) * 100 * 0.7, 5);
      expect(areaTextFont(3, { cx: 0.5, cy: 0.1, w: 8 / 60, h: 4 / 70 })).toBeCloseTo(0.088 * (8 / 60 / 0.6) * 100, 5);
    });
  });
});
