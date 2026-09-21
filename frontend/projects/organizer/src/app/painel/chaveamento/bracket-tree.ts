import { bracketGroupKey, bracketGroupSortOrder, buildBracketColumns, type TournamentMatch } from '../data/matches-repository';

/** Geometria CONVERGENTE da chave de dupla eliminação — porte fiel do layout aprovado no app
 *  (`bracket_feed_tree.dart` + `double_elimination_bracket_layout.dart`, spec de 13/09,
 *  `2026-09-13-chave-convergente`): a WB cresce da esquerda pro centro, a LB espelhada da
 *  direita pro centro, e o desfecho (cruzamento WB×LB, Final, 3º Lugar) fica no meio — a
 *  leitura da tabela impressa que o dono usa. Os nomes dos tipos/funções abaixo
 *  (`BracketFeedNode`, `bracketConvergenceMatches`, `buildBracketFeedTree`,
 *  `assignFeedCenters`, `assignFeedDepths`) espelham o Dart de
 *  propósito, pra as duas árvores ficarem comparáveis linha a linha.
 *
 *  **Decisões que custaram uma rodada de correção cada no app (preservar aqui):**
 *  - A faixa central é a ÂNCORA; os dois lados caminham pra trás a partir dela. Espelhar e
 *    empilhar não funciona — as semifinais colidem.
 *  - Os pontos de cruzamento saem da FIAÇÃO (`winnerAdvance`), nunca do `matchType` nem do
 *    tamanho da chave — plantas 10, 12 e 32 cruzam, e a de 10 tipa uma partida de cruzamento
 *    como `LB` (ver `bracketConvergenceMatches`).
 *  - Uma partida de convergência alimentada por OUTRA partida de convergência não abre bloco
 *    — é o caso da Final nas três plantas que cruzam (ver `buildDoubleEliminationLayout`).
 *  - Todo lado sem alimentador desenhado vira LUGAR VAGO: RESERVA o lugar do bye e o da
 *    entrada do perdedor (empurrando o jogo pra altura certa) sem desenhar nada — nem card,
 *    nem traço (pedido do dono: sem linha sobrando onde não há partida).
 *  - A posição do pai é a média das posições REAIS dos filhos, não o meio geométrico do
 *    intervalo — as duas só coincidem em chave simétrica (ver `assignFeedCenters`).
 *  - Final e 3º lugar: Final à ESQUERDA, 3º lugar à DIREITA, mesma altura, SEM nenhuma aresta
 *    chegando nelas em dupla eliminação. Ocupam o vão da coluna vizinha quando cabe, senão
 *    coluna própria ADJACENTE ao centro (nunca anexada no fim da chave).
 *  - A coluna do cruzamento se chama `'SEMIFINAIS'`; Final e 3º lugar não sequestram o
 *    rótulo da coluna que os hospeda quando dividem coluna com uma rodada de verdade.
 *  - Caminho legado (colunas simples, ordem de `bracketGroupSortOrder`, Final antes do 3º
 *    lugar) quando: não há convergência, OU nenhuma partida tem fiação, OU falta partida de
 *    uma das duas chaves — cobre as chaves de dupla eliminação antigas, sem `winnerAdvance`
 *    gravado. Eliminatória simples (sem `wb`/`lb`) tem motor PRÓPRIO no portal
 *    (`buildKnockoutTreeLayout`, no fim do arquivo) e nunca chega a esta função — no app é a
 *    MESMA função que serve os dois formatos, mas aqui os dois já eram servidos por funções
 *    diferentes antes desta tarefa, e não havia motivo pra fundir.
 *  - Conector sabe o sentido: sai pela borda esquerda quando o destino está à esquerda (ver
 *    `pathFor`) — a LB corre da direita pro centro, o sentido não é fixo como antes. */

/** Largura/altura do card — precisam bater exatamente com `.og-bracket-match`/`.og-de-match`
 *  em styles.scss, senão os conectores desalinham. (app: 280×150 numa tela dedicada)
 *  Altura = head 28 + 2 lados de 48 (avatar 32) + rodapé de agendamento 28 = 152 de
 *  CONTEÚDO — mas o card renderiza 154: soma a borda de 1px do próprio `.og-bracket-match`
 *  (topo e base), que `box-sizing: border-box` não cobre porque o card não declara altura CSS
 *  própria (só os filhos têm altura explícita) — ele cresce pro conteúdo e a borda soma por
 *  FORA. */
export const BRACKET_MATCH_WIDTH = 280;
export const BRACKET_MATCH_HEIGHT = 154;

/** Proporções espelhadas de `BracketLayoutMetrics` do app (rowUnit 88 pra card 154 → gap 22). */
const ROW_UNIT = 88;
const COL_GAP = 56;
const COL_STEP = BRACKET_MATCH_WIDTH + COL_GAP;
const HEADER_H = 26;

/** Gap vertical entre jogos adjacentes de uma coluna (2·ROW_UNIT − BRACKET_MATCH_HEIGHT). */
const ADJACENT_GAP = 2 * ROW_UNIT - BRACKET_MATCH_HEIGHT;

export interface DeLayoutNode {
  match: TournamentMatch;
  left: number;
  top: number;
}

export interface DeLayoutLabel {
  key: string;
  label: string;
  left: number;
  top: number;
}

export interface DeLayoutEdge {
  d: string;
}

export interface DoubleEliminationLayout {
  nodes: DeLayoutNode[];
  labels: DeLayoutLabel[];
  edges: DeLayoutEdge[];
  width: number;
  height: number;
}

function typeOf(m: TournamentMatch): string {
  return m.matchType.trim().toLowerCase();
}

/** `Grand Final`/`grand_final` é sinônimo de `Final` no resto do código (`bracketGroupSortOrder`
 *  já reconhece o alias) — o motor de layout não pode ser o único lugar que não reconhece. */
function isFinalType(typeLower: string): boolean {
  return typeLower === 'final' || typeLower === 'grand final' || typeLower === 'grand_final';
}

/** `third_place` não existe no Dart (só `'third place'`), mas já era tolerado em outros
 *  pontos deste arquivo web (`bracketGroupSortOrder`) — mantido aqui pela mesma razão. */
function isThirdPlaceType(typeLower: string): boolean {
  return typeLower === 'third place' || typeLower === 'third_place';
}

export function isDoubleElimination(matches: readonly TournamentMatch[]): boolean {
  return matches.some((m) => typeOf(m) === 'wb' || typeOf(m) === 'lb');
}

function colX(columnIndex: number): number {
  return columnIndex * COL_STEP;
}

// ── Árvore de alimentação (porte de `bracket_feed_tree.dart`) ────────────────────────────

/** Partidas da FAIXA CENTRAL da chave convergente: as que juntam um alimentador da WB com um
 *  da LB, mais a Final e a disputa de 3º lugar.
 *
 *  A identificação sai da FIAÇÃO, nunca do `matchType`: algumas plantas fecham com cruzamento
 *  WB×LB antes da Final, e nelas a partida de cruzamento pode estar tipada "WB" ou "LB".
 *  Exemplo: na planta de 10, a partida #15 é "WB" e a #16 é "LB", ambas alimentando a Final.
 *  Uma lista de tipos nunca funcionaria. Marcá-las incorretamente faria o resolvedor de
 *  colocação premiar o perdedor antes do 3º lugar.
 *
 *  Usa `isFinalType`/`isThirdPlaceType` (não comparação literal) pra reconhecer também os
 *  aliases `Grand Final`/`grand_final`: uma Final gravada assim ficava de fora daqui, não virava
 *  `finalRoot` mais abaixo, e sobrava como órfã numa coluna extra à direita de tudo — mesmo bug
 *  em Dart (`bracket_feed_tree.dart`). */
export function bracketConvergenceMatches(matches: readonly TournamentMatch[]): Set<number> {
  const typeByNumber = new Map<number, string>();
  for (const m of matches) typeByNumber.set(m.matchNumber, typeOf(m));

  const feeders = new Map<number, number[]>();
  for (const m of matches) {
    const dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    (feeders.get(dest) ?? feeders.set(dest, []).get(dest)!).push(m.matchNumber);
  }

  const result = new Set<number>();
  for (const m of matches) {
    const type = typeOf(m);
    if (isFinalType(type) || isThirdPlaceType(type)) {
      result.add(m.matchNumber);
      continue;
    }
    const sources = feeders.get(m.matchNumber) ?? [];
    const hasWb = sources.some((n) => typeByNumber.get(n) === 'wb');
    const hasLb = sources.some((n) => typeByNumber.get(n) === 'lb');
    if (hasWb && hasLb) result.add(m.matchNumber);
  }
  return result;
}

/** Um jogo e os LUGARES que a sua subárvore de alimentação ocupa.
 *
 *  `matchNumber: null` é LUGAR VAGO: o lado da partida que não tem alimentador desenhado — o
 *  bye na WB e a entrada do perdedor na LB. Ocupa espaço e não vira card; é ele que empurra o
 *  jogo para a altura certa, como na tabela impressa. */
export interface BracketFeedNode {
  readonly matchNumber: number | null;
  readonly children: readonly BracketFeedNode[];
  /** Lugares ocupados pela subárvore. Uma ponta (ou um vago) ocupa 1. */
  readonly span: number;
}

const EMPTY_SLOT: BracketFeedNode = { matchNumber: null, children: [], span: 1 };

function slotRank(m: TournamentMatch): number {
  if (m.winnerAdvanceSlot === 'A') return 0;
  if (m.winnerAdvanceSlot === 'B') return 1;
  return 2;
}

/** Árvore de alimentação que entra em `rootMatchNumber` pelo lado de `track` (`'wb'` ou
 *  `'lb'`), descendo só por jogos daquela chave. `null` quando a chave não alimenta aquela
 *  partida por exatamente UM lado.
 *
 *  Toda partida tem DOIS lados: o que não tem alimentador desenhado vira lugar vago. Sem
 *  isso o jogo se alinha em linha reta com o único alimentador e o lado vazio desaparece da
 *  leitura — some o bye e some a entrada do perdedor.
 *
 *  O invariante é "esta é a árvore que entra em `rootMatchNumber` por UM lado": exige
 *  exatamente um alimentador daquela chave na raiz. Zero alimentadores é o caso comum de
 *  `null` (a chave não alimenta ali — ex.: o 3º lugar, que só recebe perdedores). DOIS
 *  alimentadores da MESMA chave também devolvem `null`, e por um motivo diferente: nesse
 *  caso `rootMatchNumber` não é o ponto de encontro das duas chaves, é uma partida DEPOIS
 *  dele — a Final das plantas de 12 e 32, por exemplo, onde `#19` e `#20` (ambas WB)
 *  alimentam a Final `#22` pelos dois lados. Ali não existe "a árvore que entra por um
 *  lado"; cada alimentador é a raiz da sua própria árvore, chamada separadamente. Devolver
 *  metade da árvore em silêncio sobrescreveria posições que o outro lado já calculou — pior
 *  que `null`. */
export function buildBracketFeedTree(matches: readonly TournamentMatch[], rootMatchNumber: number, track: 'wb' | 'lb'): BracketFeedNode | null {
  const feeders = new Map<number, TournamentMatch[]>();
  for (const m of matches) {
    const dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    if (typeOf(m) !== track) continue;
    (feeders.get(dest) ?? feeders.set(dest, []).get(dest)!).push(m);
  }
  for (const list of feeders.values()) {
    list.sort((a, b) => slotRank(a) - slotRank(b) || a.matchNumber - b.matchNumber);
  }

  function build(number: number, seen: Set<number>): BracketFeedNode {
    if (seen.has(number)) return EMPTY_SLOT; // fiação cíclica: não trava
    seen.add(number);
    const sources = feeders.get(number) ?? [];
    if (sources.length === 0) {
      return { matchNumber: number, children: [], span: 1 };
    }
    const children: BracketFeedNode[] = sources.map((s) => build(s.matchNumber, seen));
    if (children.length < 2) {
      // O alimentador que entra pelo slot B fica EMBAIXO; o vago, em cima.
      if (sources[0]!.winnerAdvanceSlot === 'B') {
        children.unshift(EMPTY_SLOT);
      } else {
        children.push(EMPTY_SLOT);
      }
    }
    return {
      matchNumber: number,
      children,
      span: children.reduce((sum, c) => sum + c.span, 0),
    };
  }

  const entry = feeders.get(rootMatchNumber);
  // Exatamente um: zero é "a chave não alimenta aqui", dois é "isto não é o ponto de
  // encontro das chaves" — os dois casos devolvem null.
  if (entry == null || entry.length !== 1) return null;
  return build(entry[0]!.matchNumber, new Set<number>());
}

/** Centro vertical de cada jogo, em LUGARES, a partir de `slotStart`.
 *
 *  Percorre a árvore dando um lugar a cada ponta e pondo cada jogo interno na MÉDIA das
 *  posições REAIS dos filhos — a posição já calculada para cada filho (`out.get(child.matchNumber)`),
 *  não o meio geométrico do intervalo que ele ocupa. As duas coisas só coincidem quando a
 *  subárvore do filho é simétrica; em plantas irregulares (entrada desigual na LB das plantas
 *  20 a 24) o filho fica deslocado dentro do próprio intervalo, e usar o meio geométrico ali
 *  gera um conector torto. O meio geométrico só é usado para o LUGAR VAGO, que é sempre uma
 *  ponta sem posição própria — é ele quem não vira entrada no mapa, o que reserva o espaço do
 *  bye sem criar card. Medir por extensão de subárvore (e não dobrar por rodada) é o que
 *  mantém as plantas irregulares de pé — play-ins e a entrada desigual na LB das plantas 20 a
 *  24. */
export function assignFeedCenters(node: BracketFeedNode, slotStart: number, out: Map<number, number>): void {
  if (node.children.length === 0) {
    if (node.matchNumber != null) out.set(node.matchNumber, slotStart + 0.5);
    return;
  }
  let cursor = slotStart;
  const childCenters: number[] = [];
  for (const child of node.children) {
    assignFeedCenters(child, cursor, out);
    const real = child.matchNumber != null ? out.get(child.matchNumber) : undefined;
    childCenters.push(real ?? cursor + child.span / 2);
    cursor += child.span;
  }
  if (node.matchNumber != null) {
    out.set(node.matchNumber, childCenters.reduce((a, b) => a + b, 0) / childCenters.length);
  }
}

/** Profundidade de cada jogo: `depth` na raiz da árvore (a coluna encostada na faixa
 *  central), crescendo ao se afastar do centro. */
export function assignFeedDepths(node: BracketFeedNode, depth: number, out: Map<number, number>): void {
  if (node.matchNumber != null) out.set(node.matchNumber, depth);
  for (const child of node.children) {
    assignFeedDepths(child, depth + 1, out);
  }
}

// ── Layout da chave (porte de `double_elimination_bracket_layout.dart`) ──────────────────

/** Mesmo formato de rótulo do app (`bracketColumnHeaderLabel` do layout DE) — fases
 *  eliminatórias pelo TAMANHO da rodada inteira, nunca por uma partida só. */
function bracketColumnHeaderLabel(columnMatches: readonly TournamentMatch[]): string {
  const first = columnMatches[0];
  if (!first) return '';
  const type = typeOf(first);
  if (type === 'wb' || type === 'lb') return `${type.toUpperCase()} · RODADA ${first.roundNumber}`;
  if (isFinalType(type)) return 'FINAL';
  if (isThirdPlaceType(type)) return '3º LUGAR';
  return (first.matchType.trim() || `RODADA ${first.roundNumber}`).toUpperCase();
}

/** Garante que cada coluna materializada tenha uma key única. Duas colunas (índices
 *  diferentes, portanto profundidades/posições diferentes) podem calcular o MESMO
 *  `bracketGroupKey` por coincidência de round — ex.: planta 25, onde o play-in `#10` (LB,
 *  round 2) e a coluna real "LB · RODADA 2" (`#19`…`#26`) são as duas round 2 — mas nunca
 *  podem reivindicar a mesma identidade visual. Sufixa a partir da segunda ocorrência
 *  (`+2`, `+3`, …). */
function uniqueColumnKey(base: string, used: Set<string>): string {
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base}+${n}`;
    n++;
  }
  used.add(key);
  return key;
}

/** Caminho legado, sem geometria convergente: uma coluna por `bracketGroupKey`, colunas
 *  ordenadas por `bracketGroupSortOrder` da esquerda para a direita — com UMA exceção: a
 *  Final vem antes do 3º lugar (`bracketGroupSortOrder` continua intacta, com o 3º lugar em
 *  8900 e a Final em 9000 — é compartilhada com outras telas; a inversão vale só aqui, na
 *  ordenação das colunas). Duas razões: é a ordem da folha impressa (Final à esquerda, 3º
 *  lugar à direita — mesmo critério da faixa central convergente) e evita que a aresta
 *  semi→final pule por cima do card do 3º lugar quando os dois saem do mesmo bloco de semis.
 *  Jogos de cada coluna em slots fixos `i + 0.5` (LUGAR) na ordem de `matchNumber`. Usado
 *  quando a chave de dupla eliminação não tem convergência alcançável (sem fiação, ou sem
 *  as duas chaves), e para as partidas órfãs que sobrarem fora da árvore convergente. */
function placeLegacyGroups(matches: readonly TournamentMatch[], startColumn: number, columnOf: Map<number, number>, centerSlot: Map<number, number>): void {
  const byGroup = new Map<string, TournamentMatch[]>();
  for (const m of matches) {
    const key = bracketGroupKey(m);
    (byGroup.get(key) ?? byGroup.set(key, []).get(key)!).push(m);
  }
  const keys = [...byGroup.keys()].sort((a, b) => {
    const typeA = typeOf(byGroup.get(a)![0]!);
    const typeB = typeOf(byGroup.get(b)![0]!);
    if (isFinalType(typeA) && isThirdPlaceType(typeB)) return -1;
    if (isThirdPlaceType(typeA) && isFinalType(typeB)) return 1;
    const cmp = bracketGroupSortOrder(byGroup.get(a)![0]!) - bracketGroupSortOrder(byGroup.get(b)![0]!);
    if (cmp !== 0) return cmp;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  let col = startColumn;
  for (const key of keys) {
    const columnMatches = [...byGroup.get(key)!].sort((a, b) => a.matchNumber - b.matchNumber);
    columnMatches.forEach((m, i) => {
      columnOf.set(m.matchNumber, col);
      centerSlot.set(m.matchNumber, i + 0.5);
    });
    col++;
  }
}

/** Monta a chave de dupla eliminação na forma CONVERGENTE da tabela impressa: a faixa
 *  central é o desfecho (cruzamento WB×LB, Final e 3º lugar), e os dois lados caminham para
 *  trás dela — WB da esquerda, LB da direita espelhada. Ver o comentário no topo do arquivo
 *  para as decisões que este porte precisa preservar; a autoridade sobre o algoritmo é
 *  `double_elimination_bracket_layout.dart` (Task 9), não este comentário. */
export function buildDoubleEliminationLayout(matches: readonly TournamentMatch[]): DoubleEliminationLayout | null {
  if (!isDoubleElimination(matches)) return null;

  const byNumber = new Map<number, TournamentMatch>();
  for (const m of matches) byNumber.set(m.matchNumber, m);

  const convergence = bracketConvergenceMatches(matches);
  const hasAnyWiring = matches.some((m) => m.winnerAdvanceMatchNumber != null);
  const hasWb = matches.some((m) => typeOf(m) === 'wb');
  const hasLb = matches.some((m) => typeOf(m) === 'lb');

  // Centros (em lugares) e colunas de cada jogo, montados bloco a bloco.
  const centerSlot = new Map<number, number>();
  const columnOf = new Map<number, number>();

  /** Partidas de convergência SEM árvore de alimentação própria (Final e 3º lugar que não
   *  convergem direto — plantas 10, 12 e 32, onde quem cruza são as partidas de cruzamento,
   *  não elas). O centro delas é só um palpite em volta do meio do bloco: a materialização
   *  nunca deixa uma partida desta lista empurrar uma partida com centro próprio calculado. */
  const semArvore = new Set<number>();

  /** Partidas de CRUZAMENTO de verdade: abrem bloco de convergência (não são alimentadas
   *  por outra partida de convergência) e têm árvore própria dos dois lados — mas NÃO são a
   *  Final. É essa propriedade (não o número da planta, não o tamanho da chave) que decide
   *  o rótulo `'SEMIFINAIS'` da coluna onde moram. */
  const cruzamentoRoots = new Set<number>();
  let centerColumn = 0;

  if (convergence.size === 0 || !hasAnyWiring || !hasWb || !hasLb) {
    // Sem ponto de encontro alcançável: chave sem fiação nenhuma (legado anterior à
    // migração que passou a gravar `winnerAdvance`), fiação que nunca cruza WB×LB nem chega
    // numa Final/3º lugar, OU falta uma das duas chaves. A geometria convergente não tem
    // onde se ancorar. Cai no agrupamento simples, sem coluna central.
    placeLegacyGroups(matches, 0, columnOf, centerSlot);
  } else {
    // Uma partida de convergência alimentada por OUTRA partida de convergência não abre
    // bloco: o encontro das duas chaves aconteceu antes dela. É o caso da Final nas plantas
    // 10, 12 e 32 — ela vem DEPOIS do cruzamento, não é o cruzamento. Sem este filtro,
    // montar a árvore da Final remontaria subárvores já posicionadas e sobrescreveria os
    // centros que o bloco anterior calculou.
    const feedersDe = new Map<number, TournamentMatch[]>();
    for (const m of matches) {
      const dest = m.winnerAdvanceMatchNumber;
      if (dest == null) continue;
      (feedersDe.get(dest) ?? feedersDe.set(dest, []).get(dest)!).push(m);
    }
    const blocos = [...convergence]
      .filter((n) => {
        const fontes = feedersDe.get(n) ?? [];
        return !fontes.some((f) => convergence.has(f.matchNumber));
      })
      .sort((a, b) => a - b);

    // Profundidade máxima da WB decide onde fica o centro: a WB começa na coluna 0 e a
    // faixa central fica logo depois da coluna mais funda dela.
    let wbDepth = 0;
    const trees = new Map<number, { wb: BracketFeedNode | null; lb: BracketFeedNode | null }>();
    for (const root of blocos) {
      const wb = buildBracketFeedTree(matches, root, 'wb');
      const lb = buildBracketFeedTree(matches, root, 'lb');
      trees.set(root, { wb, lb });
      if (wb != null) {
        const depths = new Map<number, number>();
        assignFeedDepths(wb, 1, depths);
        for (const d of depths.values()) {
          if (d > wbDepth) wbDepth = d;
        }
      }
    }
    centerColumn = wbDepth;

    // Cada bloco ocupa uma faixa vertical própria, empilhadas de cima para baixo — sem
    // folga entre elas: a Final e o 3º lugar não moram mais nesta faixa (ver abaixo), então
    // não sobra nada pra reservar aqui.
    let slotCursor = 0;
    for (const root of blocos) {
      const { wb, lb } = trees.get(root)!;
      if (wb == null && lb == null) continue; // 3º lugar: posicionado depois

      // Abre bloco com árvore própria e não é a Final: é uma partida de CRUZAMENTO de
      // verdade (o encontro das duas chaves), não o desfecho de uma delas.
      if (!isFinalType(typeOf(byNumber.get(root)!))) {
        cruzamentoRoots.add(root);
      }

      const span = Math.max(wb?.span ?? 0, lb?.span ?? 0);
      const tracks: readonly ['wb' | 'lb', BracketFeedNode | null][] = [
        ['wb', wb],
        ['lb', lb],
      ];
      for (const [trackName, tree] of tracks) {
        if (tree == null) continue;
        // Blocos de spans diferentes ficam centralizados um sobre o outro.
        const inicio = slotCursor + (span - tree.span) / 2;
        const centers = new Map<number, number>();
        assignFeedCenters(tree, inicio, centers);
        for (const [k, v] of centers) centerSlot.set(k, v);
        const depths = new Map<number, number>();
        assignFeedDepths(tree, 1, depths);
        for (const [number, d] of depths) {
          columnOf.set(number, trackName === 'wb' ? centerColumn - d : centerColumn + d);
        }
      }

      const wbCenter = wb?.matchNumber != null ? centerSlot.get(wb.matchNumber) : undefined;
      const lbCenter = lb?.matchNumber != null ? centerSlot.get(lb.matchNumber) : undefined;
      const both = [wbCenter, lbCenter].filter((x): x is number => x != null);
      centerSlot.set(root, both.reduce((a, b) => a + b, 0) / both.length);
      columnOf.set(root, centerColumn);
      slotCursor += span;
    }

    // Final e 3º lugar lado a lado, na mesma linha horizontal — pedido do dono: nada de
    // empilhar as duas na coluna central. Ordem da folha impressa do Goiânia Open ("22 -
    // FINAL" à esquerda, "21 - 3º Lugar" à direita): a Final vai pro lado WB
    // (`centerColumn - 1`), o 3º lugar pro lado LB (`centerColumn + 1`). O 3º lugar nunca
    // tem árvore própria (só recebe perdedores, e `loserAdvance` não é rastreado por
    // `buildBracketFeedTree`); a Final só fica sem árvore quando ela mesma é o desfecho de
    // um cruzamento (plantas 10, 12, 32 — as duas partidas de cruzamento é que convergem,
    // não ela).
    //
    // Em vez de dar coluna própria a cada uma (o que empurraria a LB pra longe), TENTA
    // aproveitar o vão vertical das colunas VIZINHAS ao centro primeiro. Nas plantas que
    // cruzam (10, 12, 32) isso sempre cabe: a vizinha ali é a quarta que alimenta a partida
    // de CRUZAMENTO, dois níveis afastada da Final, com folga de sobra. Na maioria das
    // plantas (Final converge direto) a vizinha da Final é sua PRÓPRIA quarta — sempre à
    // mesma altura (é dela que a média da Final sai) — então nunca cabe ali: cai na coluna
    // própria ADJACENTE ao centro (empurrando o que vier depois pro lado de fora, nunca
    // anexando no fim da chave), preservando a altura-alvo.
    //
    // Altura-alvo: quando a Final já converge direto, o 3º lugar mira nela — é a "mesma
    // linha horizontal" de verdade. Só quando a Final também não converge direto (10, 12,
    // 32) é que as duas miram o meio do bloco.
    const middle = slotCursor / 2;
    const finalRoot = firstConvergenceOfType(convergence, byNumber, isFinalType);
    const thirdPlaceRoot = firstConvergenceOfType(convergence, byNumber, isThirdPlaceType);
    const targetSlot = finalRoot !== -1 && centerSlot.has(finalRoot) ? centerSlot.get(finalRoot)! : middle;

    // Só cabe no vizinho se não colidir com nenhum jogo que a árvore daquele lado já
    // colocou ali — a mesma régua de 1 LUGAR que separa qualquer par de jogos adjacentes no
    // resto do desenho.
    const cabeNaColuna = (coluna: number, alvo: number): boolean => {
      for (const [num, col] of columnOf) {
        if (col !== coluna) continue;
        const outro = centerSlot.get(num);
        if (outro != null && Math.abs(outro - alvo) < 1) return false;
      }
      return true;
    };

    const posicionaAoLado = (root: number, coluna: number, marcaSemArvore = true): void => {
      columnOf.set(root, coluna);
      centerSlot.set(root, targetSlot);
      if (marcaSemArvore) semArvore.add(root);
    };

    // Insere uma coluna nova, exclusiva, ADJACENTE a `centerColumn` do lado indicado —
    // empurra pra fora o que já estava lá (e além de lá), nunca anexa no fim da chave.
    const inserirColunaAdjacente = (aEsquerda: boolean): number => {
      if (aEsquerda) {
        for (const k of [...columnOf.keys()]) {
          if (columnOf.get(k)! < centerColumn) columnOf.set(k, columnOf.get(k)! - 1);
        }
        return centerColumn - 1;
      }
      for (const k of [...columnOf.keys()]) {
        if (columnOf.get(k)! > centerColumn) columnOf.set(k, columnOf.get(k)! + 1);
      }
      return centerColumn + 1;
    };

    // Não entra em `semArvore`: sozinha na própria coluna, não tem quem a guarda de
    // colisão precise proteger.
    const posicionaEmColunaPropria = (root: number, aEsquerda: boolean): void => {
      const novaColuna = inserirColunaAdjacente(aEsquerda);
      posicionaAoLado(root, novaColuna, false);
    };

    if (finalRoot !== -1 && !centerSlot.has(finalRoot)) {
      const coluna = centerColumn - 1;
      if (cabeNaColuna(coluna, targetSlot)) {
        posicionaAoLado(finalRoot, coluna);
      } else {
        posicionaEmColunaPropria(finalRoot, true);
      }
    }
    if (thirdPlaceRoot !== -1 && !centerSlot.has(thirdPlaceRoot)) {
      const coluna = centerColumn + 1;
      if (cabeNaColuna(coluna, targetSlot)) {
        posicionaAoLado(thirdPlaceRoot, coluna);
      } else {
        posicionaEmColunaPropria(thirdPlaceRoot, false);
      }
    }

    // Rede de segurança: qualquer OUTRA partida de convergência que sobre sem árvore (não
    // deveria acontecer nas 29 plantas reais — só Final e 3º lugar ficam sem árvore
    // própria) cai no comportamento antigo, empilhada na coluna central.
    for (const root of [...convergence].sort((a, b) => a - b)) {
      if (centerSlot.has(root)) continue;
      if (root === finalRoot || root === thirdPlaceRoot) continue;
      centerSlot.set(root, middle);
      columnOf.set(root, centerColumn);
      semArvore.add(root);
    }

    // Órfãs: partidas que sobraram sem coluna mesmo numa chave COM convergência — não
    // ocorre nas 29 plantas reais, mas é possível numa chave editada à mão (ex.: um jogo
    // com `winnerAdvance` apontando pra fora de qualquer árvore alcançada). Melhor aparecer
    // fora de lugar do que sumir da tela: mesmo agrupamento do caminho legado, em colunas
    // extras à direita de tudo.
    const orphans = matches.filter((m) => !columnOf.has(m.matchNumber));
    if (orphans.length > 0) {
      const maxCol = Math.max(...columnOf.values());
      placeLegacyGroups(orphans, maxCol + 1, columnOf, centerSlot);
    }

    // Normaliza os índices de coluna pra sempre começar em 0 — inserir uma coluna
    // adjacente à ESQUERDA do centro (`inserirColunaAdjacente`, acima) empurra as colunas
    // da WB pra índices negativos. Devolve tudo pro zero somando a MESMA constante em todo
    // mundo — não muda a ordem relativa de nada — e atualiza `centerColumn` junto.
    if (columnOf.size > 0) {
      const minCol = Math.min(...columnOf.values());
      if (minCol < 0) {
        const offset = -minCol;
        for (const k of [...columnOf.keys()]) columnOf.set(k, columnOf.get(k)! + offset);
        centerColumn += offset;
      }
    }
  }

  // Materializa nós e colunas.
  const nodes: DeLayoutNode[] = [];
  const labels: DeLayoutLabel[] = [];
  const nodeByMatchNumber = new Map<number, DeLayoutNode>();

  const byColumnIndex = new Map<number, TournamentMatch[]>();
  for (const m of matches) {
    const col = columnOf.get(m.matchNumber);
    if (col == null) continue;
    (byColumnIndex.get(col) ?? byColumnIndex.set(col, []).get(col)!).push(m);
  }

  const columnKeys = [...byColumnIndex.keys()].sort((a, b) => a - b);
  const usedColumnKeys = new Set<string>();
  for (const col of columnKeys) {
    const columnMatches = byColumnIndex.get(col)!.sort((a, b) => centerSlot.get(a.matchNumber)! - centerSlot.get(b.matchNumber)!);
    const x = colX(col);

    // Final e 3º lugar são PASSAGEIROS quando dividem coluna com uma rodada de verdade (a
    // quarta da WB, a rodada da LB): não sequestram o rótulo dela. O rótulo (e a key) saem
    // das partidas HOST (tudo que não está em `semArvore`); só quando a coluna não tem
    // NENHUM host (a Final ou o 3º lugar sozinhos, de coluna própria) é que o rótulo vem
    // delas mesmas.
    //
    // A coluna de CRUZAMENTO de verdade (`cruzamentoRoots`) se identifica como o encontro
    // das duas chaves: `'SEMIFINAIS'`, nunca o rótulo por tipo/round da partida.
    const hasCruzamento = columnMatches.some((m) => cruzamentoRoots.has(m.matchNumber));
    const hostMatches = columnMatches.filter((m) => !semArvore.has(m.matchNumber));
    const referencia = hostMatches.length > 0 ? hostMatches : columnMatches;
    const hostGroupKeys = new Set(referencia.map((m) => bracketGroupKey(m)));
    let baseKey: string;
    let label: string;
    if (hasCruzamento) {
      baseKey = 'SEMIFINAIS';
      label = 'SEMIFINAIS';
    } else if (hostGroupKeys.size > 1) {
      // Mistura inesperada entre hosts de verdade (não deveria ocorrer nas 29 plantas
      // reais) — mantém o aviso genérico de antes.
      baseKey = 'DESFECHO';
      label = 'DESFECHO';
    } else {
      baseKey = bracketGroupKey(referencia[0]!);
      label = bracketColumnHeaderLabel(referencia);
    }
    const columnKey = uniqueColumnKey(baseKey, usedColumnKeys);
    labels.push({ key: columnKey, label, left: x, top: 0 });

    // Guarda de colisão em DUAS passadas. 1ª: só as partidas com centro PRÓPRIO (tudo que
    // não está em `semArvore`), na ordem de sempre. 2ª: cada BLOCO de partidas SEM árvore
    // consecutivas (ex.: Final+3º lugar juntas, planta 10) é distribuído por igual dentro
    // da janela livre entre o jogo real anterior e o seguinte — nunca reabrindo uma posição
    // já fixada na 1ª passada. Quando a janela é curta demais pra caber todo mundo com o
    // espaçamento padrão, o espaçamento ENCOLHE em vez de estourar pra fora da janela.
    const centerYByNumber = new Map<number, number>();
    let prevComArvore = -Infinity;
    for (const match of columnMatches) {
      if (semArvore.has(match.matchNumber)) continue;
      const wanted = HEADER_H + centerSlot.get(match.matchNumber)! * 2 * ROW_UNIT;
      const minCenter = prevComArvore + BRACKET_MATCH_HEIGHT + ADJACENT_GAP;
      const centerY = Math.max(wanted, minCenter);
      prevComArvore = centerY;
      centerYByNumber.set(match.matchNumber, centerY);
    }

    const passo = BRACKET_MATCH_HEIGHT + ADJACENT_GAP;
    let idx = 0;
    while (idx < columnMatches.length) {
      if (!semArvore.has(columnMatches[idx]!.matchNumber)) {
        idx++;
        continue;
      }
      let fim = idx;
      while (fim < columnMatches.length && semArvore.has(columnMatches[fim]!.matchNumber)) {
        fim++;
      }
      // Bloco de partidas sem árvore em [idx, fim).
      const n = fim - idx;
      const piso = idx === 0 ? -Infinity : centerYByNumber.get(columnMatches[idx - 1]!.matchNumber)! + passo;
      const teto = fim === columnMatches.length ? Infinity : centerYByNumber.get(columnMatches[fim]!.matchNumber)! - passo;
      const disponivel = Number.isFinite(piso) && Number.isFinite(teto) ? teto - piso : null;

      if (n === 1) {
        const wanted = HEADER_H + centerSlot.get(columnMatches[idx]!.matchNumber)! * 2 * ROW_UNIT;
        let pos: number;
        if (disponivel != null && disponivel < 0) {
          pos = (piso + teto) / 2; // sem espaço algum — meio do conflito
        } else {
          pos = wanted;
          if (Number.isFinite(piso)) pos = Math.max(pos, piso);
          if (Number.isFinite(teto)) pos = Math.min(pos, teto);
        }
        centerYByNumber.set(columnMatches[idx]!.matchNumber, pos);
      } else {
        const espacamentoIdeal = passo * (n - 1);
        const espacamento = disponivel == null ? passo : disponivel >= espacamentoIdeal ? passo : disponivel / (n - 1);
        const vao = espacamento * (n - 1);
        let inicio: number;
        if (Number.isFinite(piso) && Number.isFinite(teto)) {
          inicio = piso + Math.max(0, (disponivel! - vao) / 2);
        } else if (Number.isFinite(piso)) {
          inicio = piso;
        } else if (Number.isFinite(teto)) {
          inicio = teto - vao;
        } else {
          inicio = HEADER_H + centerSlot.get(columnMatches[idx]!.matchNumber)! * 2 * ROW_UNIT;
        }
        for (let k = 0; k < n; k++) {
          centerYByNumber.set(columnMatches[idx + k]!.matchNumber, inicio + k * espacamento);
        }
      }
      idx = fim;
    }

    for (const match of columnMatches) {
      const centerY = centerYByNumber.get(match.matchNumber)!;
      const node: DeLayoutNode = { match, left: x, top: centerY - BRACKET_MATCH_HEIGHT / 2 };
      nodes.push(node);
      nodeByMatchNumber.set(match.matchNumber, node);
    }
  }

  const edges = buildAdvanceEdges(matches, nodeByMatchNumber);

  let width = 0;
  let height = 0;
  for (const node of nodes) {
    width = Math.max(width, node.left + BRACKET_MATCH_WIDTH);
    height = Math.max(height, node.top + BRACKET_MATCH_HEIGHT);
  }
  for (const label of labels) width = Math.max(width, label.left + BRACKET_MATCH_WIDTH);

  return { nodes, labels, edges, width, height };
}

function firstConvergenceOfType(convergence: Set<number>, byNumber: Map<number, TournamentMatch>, predicate: (typeLower: string) => boolean): number {
  for (const n of convergence) {
    const m = byNumber.get(n);
    if (m && predicate(typeOf(m))) return n;
  }
  return -1;
}

/** Ponto de saída/entrada da linha: borda DIREITA quando o destino está à direita, borda
 *  ESQUERDA quando está à esquerda. Na forma convergente a LB corre da direita para o
 *  centro, então o sentido não pode ser fixo (ver `BracketConnectorPainter.debugStartFor`/
 *  `debugEndFor` no app). */
function pathFor(from: DeLayoutNode, to: DeLayoutNode): string {
  const paraDireita = to.left >= from.left;
  const x1 = paraDireita ? from.left + BRACKET_MATCH_WIDTH : from.left;
  const y1 = from.top + BRACKET_MATCH_HEIGHT / 2;
  const x2 = paraDireita ? to.left : to.left + BRACKET_MATCH_WIDTH;
  const y2 = to.top + BRACKET_MATCH_HEIGHT / 2;
  const midX = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
}

/** Conectores pelos ponteiros reais de avanço (`winnerAdvance`), em qualquer direção —
 *  inclusive LB→faixa central, que na forma convergente é o que faz os dois lados se
 *  encontrarem. `loserAdvance` NÃO gera aresta: a queda do perdedor não se desenha (decisão
 *  do dono), do mesmo jeito que a tabela impressa escreve "P 15" em vez de puxar uma linha.
 *
 *  Em chave de DUPLA ELIMINAÇÃO (tem partidas `wb` E `lb`), a Final e o 3º lugar também não
 *  recebem linha — pedido do dono: elas moram lado a lado sem precisar de seta indicando
 *  quem alimentou quem. */
function buildAdvanceEdges(matches: readonly TournamentMatch[], nodeByMatchNumber: Map<number, DeLayoutNode>): DeLayoutEdge[] {
  const byNumber = new Map<number, TournamentMatch>();
  for (const m of matches) byNumber.set(m.matchNumber, m);
  const isDe = matches.some((m) => typeOf(m) === 'wb') && matches.some((m) => typeOf(m) === 'lb');

  const edges: DeLayoutEdge[] = [];
  for (const m of matches) {
    const dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    const target = byNumber.get(dest);
    if (!target) continue;
    if (isDe) {
      const targetType = typeOf(target);
      if (isFinalType(targetType) || isThirdPlaceType(targetType)) continue;
    }
    const from = nodeByMatchNumber.get(m.matchNumber);
    const to = nodeByMatchNumber.get(dest);
    if (!from || !to) continue;
    edges.push({ d: pathFor(from, to) });
  }
  return edges;
}

/** Árvore do mata-mata SIMPLES (eliminatória simples / fase final de grupos+mata-mata) —
 *  mesmo visual da árvore DE, num track único: colunas canônicas de `buildBracketColumns`
 *  (Quartas → Semifinais → …), a Final logo em seguida à corrente — centralizada na altura da
 *  coluna que a alimenta — e o 3º Lugar por último, como coluna sem conector (paridade com a
 *  DE, que não desenha linha de perdedor). Essa ordem (Final antes do 3º lugar) é paridade com
 *  o app (`_placeLegacyGroups`): a aresta semi→Final liga a última coluna da corrente direto em
 *  `finals[0]`, e se o 3º lugar ficasse entre as duas o cotovelo de `pathFor` passaria por cima
 *  do card dele. Ligações pelos ponteiros reais (`winnerAdvance`, que o builder SE grava com
 *  numeração global) com fallback posicional `i → i÷2` — a regra de avanço do servidor — pra
 *  chaves geradas antes da fiação explícita.
 *
 *  Não usa a geometria convergente: sem `wb`/`lb`, não existe ponto de encontro de duas
 *  chaves a ancorar (`buildDoubleEliminationLayout` recusa essas partidas de propósito — ver
 *  `isDoubleElimination` — e cairia no caminho legado de qualquer forma). No app a MESMA
 *  função serve os dois formatos; aqui os dois já eram servidos por motores diferentes antes
 *  desta tarefa, e não havia motivo pra fundir só para bater 1:1 com o Dart. */
export function buildKnockoutTreeLayout(matches: readonly TournamentMatch[]): DoubleEliminationLayout | null {
  const columns = buildBracketColumns(matches);
  if (columns.length === 0) return null;

  const colTypeOf = (c: { matches: TournamentMatch[] }): string => typeOf(c.matches[0]!);
  const chain = columns.filter((c) => {
    const t = colTypeOf(c);
    return t !== 'final' && t !== 'grand final' && t !== 'grand_final' && t !== 'third place' && t !== 'third_place';
  });
  const thirds = columns.filter((c) => colTypeOf(c) === 'third place' || colTypeOf(c) === 'third_place');
  const finals = columns.filter((c) => colTypeOf(c) === 'final' || colTypeOf(c) === 'grand final' || colTypeOf(c) === 'grand_final');

  const nodes: DeLayoutNode[] = [];
  const labels: DeLayoutLabel[] = [];
  const edges: DeLayoutEdge[] = [];
  const nodeByMatchNumber = new Map<number, DeLayoutNode>();
  const centersByColumn: number[][] = [];

  const trackTop = 0;

  const placeAt = (match: TournamentMatch, left: number, centerY: number): void => {
    const node: DeLayoutNode = { match, left, top: centerY - BRACKET_MATCH_HEIGHT / 2 };
    nodes.push(node);
    nodeByMatchNumber.set(match.matchNumber, node);
  };

  chain.forEach((column, col) => {
    const left = colX(col);
    labels.push({ key: column.key, label: column.label, left, top: trackTop });
    const centers: number[] = [];
    column.matches.forEach((match, i) => {
      let centerY: number;
      if (col === 0) {
        centerY = trackTop + HEADER_H + (2 * i + 1) * ROW_UNIT;
      } else {
        // Alimentadores posicionais da rodada anterior (i*2, i*2+1) — mesma regra do avanço.
        const prev = centersByColumn[col - 1]!;
        const feederCenters = [prev[i * 2], prev[i * 2 + 1]].filter((y): y is number => y != null);
        centerY = feederCenters.length > 0 ? feederCenters.reduce((a, b) => a + b, 0) / feederCenters.length : trackTop + HEADER_H + (2 * i + 1) * ROW_UNIT;
      }
      centers.push(centerY);
      placeAt(match, left, centerY);
    });
    centersByColumn.push(centers);
  });

  // Final antes do 3º lugar (paridade com o app — ver dartdoc acima): a corrente termina e a
  // Final já vem na sequência, com o 3º lugar por último, fora do caminho da aresta semi→Final.
  let nextColumnIndex = chain.length;
  for (const column of finals) {
    const left = colX(nextColumnIndex);
    labels.push({ key: column.key, label: column.label, left, top: trackTop });
    const lastChainCenters = centersByColumn[centersByColumn.length - 1] ?? [];
    const anchor = lastChainCenters.length > 0 ? lastChainCenters.reduce((a, b) => a + b, 0) / lastChainCenters.length : trackTop + HEADER_H + ROW_UNIT;
    column.matches.forEach((match, i) => placeAt(match, left, anchor + i * 2 * ROW_UNIT));
    nextColumnIndex++;
  }

  for (const column of thirds) {
    const left = colX(nextColumnIndex);
    labels.push({ key: column.key, label: column.label, left, top: trackTop });
    column.matches.forEach((match, i) => placeAt(match, left, trackTop + HEADER_H + (2 * i + 1) * ROW_UNIT));
    nextColumnIndex++;
  }

  // Ligações: ponteiro real quando existir; senão posicional i→i÷2 (inclui semis → Final).
  const drawEdge = (from: DeLayoutNode, to: DeLayoutNode): void => {
    edges.push({ d: pathFor(from, to) });
  };

  const nextOf = (col: number): { matches: TournamentMatch[] } | null => (col + 1 < chain.length ? chain[col + 1]! : (finals[0] ?? null));
  chain.forEach((column, col) => {
    const next = nextOf(col);
    if (!next) return;
    column.matches.forEach((match, i) => {
      const target = match.winnerAdvanceMatchNumber != null ? nodeByMatchNumber.get(match.winnerAdvanceMatchNumber) : nodeByMatchNumber.get(next.matches[Math.floor(i / 2)]?.matchNumber ?? -1);
      const from = nodeByMatchNumber.get(match.matchNumber);
      // Só liga se o destino for mesmo da fase seguinte/Final (ponteiro pra 3º lugar não gera linha).
      if (from && target && next.matches.some((m) => m.matchNumber === target.match.matchNumber)) drawEdge(from, target);
    });
  });

  let width = 0;
  let height = 0;
  for (const node of nodes) {
    width = Math.max(width, node.left + BRACKET_MATCH_WIDTH);
    height = Math.max(height, node.top + BRACKET_MATCH_HEIGHT);
  }
  for (const label of labels) width = Math.max(width, label.left + BRACKET_MATCH_WIDTH);

  return { nodes, labels, edges, width, height };
}
