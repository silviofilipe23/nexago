import { STORE_PRODUCTS } from './products.mock';
import {
  EMPTY_CRITERIA,
  criteriaFromParams,
  filterProducts,
  paramsFromCriteria,
  searchMatches,
  stockState,
  tabCounts,
} from './product-filters';
import type { StoreProduct } from './products.repository';

const bySku = (sku: string) => STORE_PRODUCTS.find((p) => p.sku === sku)!;
const skus = (rows: StoreProduct[]) => rows.map((r) => r.sku);

describe('stockState', () => {
  it('zero é esgotado', () => {
    expect(stockState(bySku('NX-MOC'))).toBe('esgotado');
  });

  it('abaixo do limite é baixo', () => {
    expect(stockState(bySku('NX-VIS'))).toBe('baixo'); // 9 de 12
  });

  it('exatamente no limite ainda é baixo', () => {
    expect(stockState({ ...bySku('NX-VIS'), stock: 12 })).toBe('baixo');
  });

  it('um acima do limite é ok', () => {
    expect(stockState({ ...bySku('NX-VIS'), stock: 13 })).toBe('ok');
  });

  it('estoque alto é ok', () => {
    expect(stockState(bySku('NX-BOL'))).toBe('ok'); // 86 de 10
  });
});

describe('searchMatches', () => {
  it('acha por nome ignorando acento e caixa', () => {
    expect(searchMatches(bySku('NX-OCU'), 'oculos')).toBeTrue();
    expect(searchMatches(bySku('NX-OCU'), 'ÓCULOS')).toBeTrue();
  });

  it('acha por SKU em minúscula e por pedaço do SKU', () => {
    expect(searchMatches(bySku('NX-BOL'), 'nx-bol')).toBeTrue();
    expect(searchMatches(bySku('NX-BOL'), 'bol')).toBeTrue();
  });

  it('acha por código de barras de qualquer variação', () => {
    expect(searchMatches(bySku('NX-BOL'), '7891000100028')).toBeTrue();
  });

  it('não acha o que não existe', () => {
    expect(searchMatches(bySku('NX-BOL'), 'chuteira')).toBeFalse();
  });

  it('busca vazia casa com tudo', () => {
    expect(searchMatches(bySku('NX-BOL'), '   ')).toBeTrue();
  });
});

describe('filterProducts', () => {
  const rows = [...STORE_PRODUCTS];

  it('sem filtro devolve tudo', () => {
    expect(filterProducts(rows, EMPTY_CRITERIA).length).toBe(8);
  });

  it('aba ativos tira o produto desligado', () => {
    const out = filterProducts(rows, { ...EMPTY_CRITERIA, tab: 'ativos' });
    expect(skus(out)).not.toContain('NX-MOC');
    expect(out.length).toBe(7);
  });

  it('aba esgotados devolve só o estoque zero', () => {
    expect(skus(filterProducts(rows, { ...EMPTY_CRITERIA, tab: 'esgotados' }))).toEqual(['NX-MOC']);
  });

  it('aba estoque baixo devolve os dois do desenho', () => {
    expect(skus(filterProducts(rows, { ...EMPTY_CRITERIA, tab: 'baixo' })).sort()).toEqual([
      'NX-KIT',
      'NX-VIS',
    ]);
  });

  it('aba rascunhos devolve vazio no exemplo', () => {
    expect(filterProducts(rows, { ...EMPTY_CRITERIA, tab: 'rascunhos' })).toEqual([]);
  });

  it('filtra por categoria', () => {
    expect(filterProducts(rows, { ...EMPTY_CRITERIA, category: 'rede-quadra' }).length).toBe(2);
  });

  it('categoria sem produto devolve vazio', () => {
    expect(filterProducts(rows, { ...EMPTY_CRITERIA, category: 'kits' })).toEqual([]);
  });

  it('filtra por coleção e o produto sem coleção fica de fora', () => {
    const out = filterProducts(rows, { ...EMPTY_CRITERIA, collection: 'linha-pro' });
    expect(skus(out).sort()).toEqual(['NX-BOL', 'NX-KIT', 'NX-RED']);
    expect(skus(out)).not.toContain('NX-MOC');
  });

  it('o produto sem coleção continua na lista quando não há filtro de coleção', () => {
    expect(skus(filterProducts(rows, EMPTY_CRITERIA))).toContain('NX-MOC');
  });

  it('combina aba, busca e categoria', () => {
    const out = filterProducts(rows, {
      ...EMPTY_CRITERIA,
      tab: 'ativos',
      q: 'dry',
      category: 'acessorios',
    });
    expect(skus(out)).toEqual(['NX-VIS']);
  });
});

describe('tabCounts', () => {
  it('conta cada aba sobre a lista inteira', () => {
    const counts = tabCounts([...STORE_PRODUCTS], EMPTY_CRITERIA);
    expect(counts).toEqual({ todos: 8, ativos: 7, rascunhos: 0, esgotados: 1, baixo: 2 });
  });

  it('respeita os outros filtros, mas ignora a aba escolhida', () => {
    const counts = tabCounts([...STORE_PRODUCTS], {
      ...EMPTY_CRITERIA,
      tab: 'esgotados',
      category: 'rede-quadra',
    });
    // rede-quadra: NX-RED 14 contra limite 6 é ok; só NX-KIT (11 de 12) é baixo.
    expect(counts).toEqual({ todos: 2, ativos: 2, rascunhos: 0, esgotados: 0, baixo: 1 });
  });
});

describe('ida e volta pela URL', () => {
  it('query string vazia vira o critério padrão', () => {
    expect(criteriaFromParams({})).toEqual(EMPTY_CRITERIA);
  });

  it('lê os valores válidos', () => {
    expect(criteriaFromParams({ aba: 'baixo', q: 'bola', categoria: 'bolas', canal: 'app' })).toEqual({
      ...EMPTY_CRITERIA,
      tab: 'baixo',
      q: 'bola',
      category: 'bolas',
      channel: 'app',
    });
  });

  it('aba inválida cai em todos, em vez de lista vazia', () => {
    expect(criteriaFromParams({ aba: 'xpto' }).tab).toBe('todos');
  });

  it('categoria e canal inválidos viram nulo', () => {
    const c = criteriaFromParams({ categoria: 'foo', canal: 'fax' });
    expect(c.category).toBeNull();
    expect(c.channel).toBeNull();
  });

  it('o padrão não vai para a URL', () => {
    expect(paramsFromCriteria(EMPTY_CRITERIA)).toEqual({
      aba: null,
      q: null,
      categoria: null,
      canal: null,
      colecao: null,
    });
  });

  it('o que não é padrão vai', () => {
    expect(paramsFromCriteria({ ...EMPTY_CRITERIA, tab: 'ativos', q: ' bola ' })).toEqual({
      aba: 'ativos',
      q: 'bola',
      categoria: null,
      canal: null,
      colecao: null,
    });
  });
});
