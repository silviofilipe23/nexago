/** O `styles.scss` global entra no bundle de teste (ver `styles` no alvo
 *  `arena:test` do angular.json), entao da pra inspecionar a cascata real aqui.
 *
 *  Estes testes existem por um motivo especifico: `@media` NAO soma
 *  especificidade. Duas regras que declaram a mesma propriedade empatam e ganha
 *  a ultima declarada. A camada de toque precisa vencer a de densidade, e isso
 *  depende exclusivamente da ordem no arquivo -- nada no build avisa se alguem
 *  inverter. */

/** So a folha GLOBAL interessa. Angular injeta os estilos de cada componente
 *  como <style> proprio quando o componente e criado, e outros specs da mesma
 *  rodada deixam os deles no documento -- varrer document.styleSheets inteiro
 *  compararia a ordem entre folhas diferentes e o teste ficaria flaky conforme
 *  a ordem de execucao dos specs. A folha global e a unica que declara
 *  --ar-nav-item-h em :root. */
function globalSheetRules(): CSSRule[] {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // folha de outra origem
    }
    const isGlobal = Array.from(rules).some(
      (rule) =>
        rule instanceof CSSStyleRule &&
        rule.selectorText.includes(':root') &&
        rule.style.getPropertyValue('--ar-nav-item-h').trim() !== '',
    );
    if (isGlobal) return Array.from(rules);
  }
  throw new Error('folha global do arena nao encontrada — --ar-nav-item-h nao esta em :root');
}

function allMediaRules(): CSSMediaRule[] {
  return globalSheetRules().filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule);
}

/** Valor DECLARADO na regra `:root` base, nao o cascateado.
 *
 *  Ler `getComputedStyle` aqui daria o valor ja resolvido para a janela do
 *  Karma — e o ChromeHeadless abre em 800x600, altura que dispara as duas
 *  faixas de densidade. `--ar-nav-item-h` viria 30px e o teste do valor base
 *  falharia por um motivo que nao e o que ele quer medir. */
function baseToken(prop: string): string {
  for (const rule of globalSheetRules()) {
    if (rule instanceof CSSStyleRule && rule.selectorText.includes(':root')) {
      const value = rule.style.getPropertyValue(prop).trim();
      if (value) return value;
    }
  }
  return '';
}

describe('cascata global do painel da arena', () => {
  it('expoe os tokens base em :root', () => {
    expect(baseToken('--ar-nav-item-h')).toBe('34px');
    expect(baseToken('--ar-pad-page-x')).toBe('32px');
    expect(baseToken('--ar-pad-page-y')).toBe('22px');
    expect(baseToken('--ar-tap')).toBe('44px');
    expect(baseToken('--ar-tap-gap')).toBe('8px');
  });

  it('expoe os breakpoints como custom property para o TypeScript ler', () => {
    // Estes dois nao mudam por faixa, entao o valor cascateado serve -- e e o
    // que a ViewportService de fato le em producao.
    const root = getComputedStyle(document.documentElement);
    expect(root.getPropertyValue('--ar-bp-md').trim()).toBe('900px');
    expect(root.getPropertyValue('--ar-bp-sm').trim()).toBe('720px');
  });

  it('declara a camada de toque DEPOIS de toda faixa por altura', () => {
    const media = allMediaRules();
    const lastHeight = media.reduce(
      (acc, rule, i) => (rule.conditionText.includes('max-height') ? i : acc),
      -1,
    );
    const firstCoarse = media.findIndex((rule) => rule.conditionText.includes('pointer: coarse'));

    expect(lastHeight).toBeGreaterThan(-1, 'nenhuma @media por altura encontrada');
    expect(firstCoarse).toBeGreaterThan(-1, 'nenhuma @media (pointer: coarse) encontrada');
    expect(firstCoarse).toBeGreaterThan(
      lastHeight,
      'a camada de toque precisa vir depois da densidade, senao o iPad paisagem ' +
        'recebe alvo de 32px em vez de 44px',
    );
  });

  it('declara a densidade por altura DEPOIS das faixas por largura', () => {
    const media = allMediaRules();
    const lastWidth = media.reduce(
      (acc, rule, i) => (rule.conditionText.includes('max-width') ? i : acc),
      -1,
    );
    const firstHeight = media.findIndex((rule) => rule.conditionText.includes('max-height'));

    expect(firstHeight).toBeGreaterThan(lastWidth);
  });

  /** Os dois testes acima provam a ordem ENTRE zonas (largura -> altura ->
   *  toque). Nenhum prova a ordem DENTRO de uma zona -- e e exatamente ai
   *  que mora o bug que os dois `@include` abaixo de cada bloco corrigem:
   *  `--ar-pad-page-x` sai tanto de `ar.below(md)` (900px, 24px) quanto de
   *  `ar.below(sm)` (720px, 16px), e `--ar-nav-item-h`/`--ar-header-py`/
   *  `--ar-pad-page-y` saem tanto de `ar.shorter-than(short)` (820px) quanto
   *  de `ar.shorter-than(xshort)` (680px). Abaixo de 720px (ou 680px) as
   *  duas @media casam ao mesmo tempo -- @media nao soma especificidade,
   *  entao SO a ordem no arquivo decide quem ganha. Se a faixa mais estreita
   *  (sm/xshort) viesse ANTES da mais larga (md/short), o valor cascateado
   *  abaixo do ponto de corte voltaria a ser o da faixa mais larga -- errado
   *  em silencio, sem nenhum erro de build. */
  it('declara a faixa de largura 720px (sm) DEPOIS da faixa de largura 900px (md)', () => {
    const media = allMediaRules();
    const idxMd = media.findIndex((rule) => rule.conditionText.includes('900px'));
    const idxSm = media.findIndex((rule) => rule.conditionText.includes('720px'));

    expect(idxMd).toBeGreaterThan(-1, 'nenhuma @media (max-width: 900px) encontrada');
    expect(idxSm).toBeGreaterThan(-1, 'nenhuma @media (max-width: 720px) encontrada');
    expect(idxSm).toBeGreaterThan(
      idxMd,
      '--ar-pad-page-x e definido por md (24px) E por sm (16px) -- abaixo de 720px as duas ' +
        'casam e so a ordem faz sm vencer; se sm vier antes de md, o valor abaixo de 720px ' +
        'volta a ser 24px',
    );
  });

  it('declara a faixa de altura 680px (xshort) DEPOIS da faixa de altura 820px (short)', () => {
    const media = allMediaRules();
    const idxShort = media.findIndex((rule) => rule.conditionText.includes('820px'));
    const idxXshort = media.findIndex((rule) => rule.conditionText.includes('680px'));

    expect(idxShort).toBeGreaterThan(-1, 'nenhuma @media (max-height: 820px) encontrada');
    expect(idxXshort).toBeGreaterThan(-1, 'nenhuma @media (max-height: 680px) encontrada');
    expect(idxXshort).toBeGreaterThan(
      idxShort,
      '--ar-nav-item-h/--ar-header-py/--ar-pad-page-y sao definidos por short E por xshort -- ' +
        'abaixo de 680px as duas casam e so a ordem faz xshort vencer; se xshort vier antes de ' +
        'short, o notebook 13 polegadas volta a receber os valores de short',
    );
  });
});
