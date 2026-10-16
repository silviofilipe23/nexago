import { DEFAULT_CUSTOMIZATION } from '../../produtos/personalizacao/data/customization';
import {
  batchCsv,
  checklist,
  customItemFromDoc,
  customKpis,
  effectiveDpi,
  itemsForTab,
  nameCell,
  slaOverdue,
  tabCounts,
  type CustomItem,
} from './custom-item';

const NOW = new Date('2026-10-16T18:00:00Z');
const H = 3_600_000;
const DAY = 24 * H;

function item(over: Record<string, unknown> = {}, id = 'i1'): CustomItem {
  return customItemFromDoc(id, {
    orderCode: 'NX-4835', productId: 'p1', productName: 'Camiseta', variantLabel: 'Preta · M',
    customer: { name: 'Marcelo Antunes' }, name: 'Antunes', font: 'bloco', nameColor: '#ffffff',
    namePlacement: 'costas_superior', status: 'aprovar', version: 1,
    image: { url: null, widthPx: 2400, heightPx: 2400, format: 'png', sizeBytes: 1_800_000, backgroundRemoved: false },
    imageArea: 'peito_esquerdo', createdAt: new Date(NOW.getTime() - 2 * H), slaDueAt: new Date(NOW.getTime() + 2 * H),
    ...over,
  });
}

describe('custom-item', () => {
  it('coluna nome: texto, kit ou traço', () => {
    expect(nameCell(item())).toBe('ANTUNES');
    expect(nameCell(item({ units: [{ name: 'a' }, { name: 'b' }] }))).toBe('2 nomes');
    expect(nameCell(item({ name: null }))).toBe('—');
  });

  it('SLA estourado só em "aprovar"', () => {
    expect(slaOverdue(item({ slaDueAt: new Date(NOW.getTime() - H) }), NOW)).toBeTrue();
    expect(slaOverdue(item({ slaDueAt: new Date(NOW.getTime() - H), status: 'producao' }), NOW)).toBeFalse();
    expect(slaOverdue(item(), NOW)).toBeFalse();
  });

  it('aprovar: mais antigo primeiro; outras abas: mais recente primeiro', () => {
    const items = [
      item({ createdAt: new Date(NOW.getTime() - H) }, 'novo'),
      item({ createdAt: new Date(NOW.getTime() - 5 * H) }, 'velho'),
      item({ status: 'pronto', updatedAt: new Date(NOW.getTime() - 5 * H) }, 'p-velho'),
      item({ status: 'pronto', updatedAt: new Date(NOW.getTime() - H) }, 'p-novo'),
    ];
    expect(itemsForTab(items, 'aprovar').map((i) => i.id)).toEqual(['velho', 'novo']);
    expect(itemsForTab(items, 'pronto').map((i) => i.id)).toEqual(['p-novo', 'p-velho']);
    expect(tabCounts(items)).toEqual({ aprovar: 2, nova_imagem: 0, producao: 0, pronto: 2, reprovado: 0 });
  });

  it('dpi efetivo pelo lado que mais estica', () => {
    // 9 cm = 3,54 pol → 2400 px dão 677 dpi.
    expect(effectiveDpi(2400, 2400, 9, 9)).toBe(677);
    expect(effectiveDpi(1000, 3000, 25, 30)).toBe(101);
  });

  describe('checklist', () => {
    const config = structuredClone(DEFAULT_CUSTOMIZATION);

    it('tudo certo: resolução, formato e nome ok; conteúdo sempre a conferir', () => {
      const rows = checklist(item(), config, []);
      expect(rows.map((r) => [r.id, r.level])).toEqual([
        ['resolucao', 'ok'], ['formato', 'ok'], ['nome', 'ok'], ['conteudo', 'warn'],
      ]);
      expect(rows[0]!.detail).toBe('2400 × 2400 px · 677 dpi no tamanho de impressão');
      expect(rows[2]!.detail).toBe('7 caracteres · sem palavras bloqueadas');
    });

    it('abaixo do mínimo é erro; acima do mínimo mas < 300 dpi é conferir', () => {
      expect(checklist(item({ image: { widthPx: 800, heightPx: 800, format: 'jpg', sizeBytes: 1 } }), config, [])[0]!.level).toBe('erro');
      expect(checklist(item({ imageArea: 'centro_frente', image: { widthPx: 1200, heightPx: 1200, format: 'png', sizeBytes: 1 } }), config, [])[0]!.level).toBe('warn');
    });

    it('formato fora da lista ou arquivo grande é erro', () => {
      const svgOff = { ...config, image: { ...config.image, formats: ['png' as const] } };
      expect(checklist(item({ image: { widthPx: 2400, heightPx: 2400, format: 'svg', sizeBytes: 1 } }), svgOff, [])[1]!.level).toBe('erro');
      expect(checklist(item({ image: { widthPx: 2400, heightPx: 2400, format: 'png', sizeBytes: 20_000_000 } }), config, [])[1]!.level).toBe('erro');
    });

    it('nome com palavra bloqueada (sem acento/caixa) ou longo demais é erro', () => {
      expect(checklist(item({ name: 'PALÁVRÃO' }), config, ['palavrao']).find((r) => r.id === 'nome')!.level).toBe('erro');
      expect(checklist(item({ name: 'NOMEMUITOCOMPRIDO' }), config, []).find((r) => r.id === 'nome')!.level).toBe('erro');
      // Com o bloqueio desligado, a lista não vale.
      const off = { ...config, name: { ...config.name, blockOffensive: false } };
      expect(checklist(item({ name: 'PALAVRAO' }), off, ['palavrao']).find((r) => r.id === 'nome')!.level).toBe('ok');
    });

    it('sem imagem não há checagem de imagem', () => {
      expect(checklist(item({ image: null }), config, []).map((r) => r.id)).toEqual(['nome']);
    });
  });

  it('KPIs: contagens, unidades de kit, sem lote e prazo médio com variação', () => {
    const k = customKpis([
      item(),
      item({ status: 'nova_imagem' }),
      item({ status: 'producao', units: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }),
      item({ status: 'producao', batchId: 'b1' }),
      item({ status: 'pronto', approvedAt: new Date(NOW.getTime() - 6 * DAY), readyAt: new Date(NOW.getTime() - 2 * DAY) }),
      item({ status: 'pronto', approvedAt: new Date(NOW.getTime() - 45 * DAY), readyAt: new Date(NOW.getTime() - 40 * DAY) }),
    ], NOW);
    expect(k.toApprove).toBe(1);
    expect(k.waitingCustomer).toBe(1);
    expect(k.inProductionUnits).toBe(4);
    expect(k.withoutBatch).toBe(1);
    expect(k.avgDays).toBeCloseTo(4);
    expect(k.avgDeltaDays).toBeCloseTo(-1);
  });

  it('planilha: uma linha por nome, com BOM e ; como separador', () => {
    const csv = batchCsv([{ item: item({ units: [{ name: 'ana' }, { name: 'bia' }] }), areaLabel: 'Peito esquerdo 9×9 cm' }]);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(csv.startsWith('﻿')).toBeTrue();
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain('#NX-4835;Camiseta;Preta · M;ANA;bloco');
    expect(lines[2]).toContain(';BIA;');
  });
});
