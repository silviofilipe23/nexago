import {
  areaPreviewBox,
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
  nameStepTitle,
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
});
