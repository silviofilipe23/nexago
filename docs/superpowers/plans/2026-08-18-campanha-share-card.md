# Card de campanha compartilhável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao atleta um card 1080×1920 da campanha dele num torneio — campeão, vice, terceiro ou eliminado — compartilhável pela folha nativa do celular.

**Architecture:** Uma pasta nova `tournaments/campaign/` com três camadas separadas, no mesmo molde dos outros três cards do portal: funções puras que derivam os dados (sem Angular, sem Firestore), um arquivo de arte em canvas puro, e um diálogo Angular que só orquestra. A regra de colocação decide por `matchType`, nunca por `round`.

**Tech Stack:** Angular 20 (standalone, signals, OnPush), TypeScript strict, Canvas 2D, Web Share API, Karma + Jasmine.

**Spec:** `docs/superpowers/specs/2026-08-17-campanha-share-card-design.md`

## Global Constraints

- **Português na UI, inglês no código.** Toda string visível ao atleta em pt-BR.
- **Nunca decidir colocação por `round`.** A disputa de 3º lugar recebe o mesmo `round` da final (`functions/src/category-bracket-builders.ts`). Decidir por round coroa um terceiro colocado como campeão. Sempre `matchType`.
- **Nunca afirmar o que não há partida encerrada para provar.** Sem prova, a colocação é `'none'` (CAMPANHA).
- **Canvas 1080×1920** — a mesma proporção 9:16 dos outros três cards.
- **`fitFont` sozinho não garante encaixe.** Ele encolhe até o piso e devolve o texto inteiro do jeito que estiver. Todo texto que possa vazar sai emparelhado: `fitFont` e depois `truncate`, medindo já com a fonte ajustada.
- **`share-canvas.ts` é infraestrutura, não desenho.** Só entra ali o que os quatro cards compartilham.
- **Categoria de equipe (`teamSize != null`) não recebe o botão** nesta entrega.
- **Comando de teste** (verificado nesta sessão, roda do diretório `frontend/`):
  ```bash
  npx ng test athlete --include='**/campaign-share.spec.ts' --watch=false --browsers=ChromeHeadless
  ```
- **Todos os caminhos de arquivo** abaixo são relativos a `frontend/projects/athlete/src/app/`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `tournaments/campaign/campaign-share.ts` (novo) | Funções puras: colocação, linhas da trajetória, transbordo, montagem de `CampaignShareData`. Sem Angular, sem Firestore. |
| `tournaments/campaign/campaign-share.spec.ts` (novo) | Specs das funções puras. Sem `TestBed`. |
| `tournaments/campaign/campaign-share-card.ts` (novo) | A arte em canvas. Sem Angular. |
| `tournaments/campaign/campaign-share-dialog.component.{ts,html,scss}` (novo) | Diálogo: preview, Web Share API, download. Recebe `CampaignShareData` pronta. |
| `tournaments/share-canvas.ts` (modificar) | `drawWordmark` ganha duas cores opcionais. |
| `tournaments/focus/focus-journey.ts` (modificar) | Exporta `isFinalMatchTypeOf`. |
| `tournaments/focus/journey/focus-journey.component.{ts,html,scss}` (modificar) | Entrada 1: botão na seção Trajetória. |
| `tournaments/tabs/registration-tab.component.{ts,html}` (modificar) | Entrada 2: CTA no card da categoria. |

A separação em três camadas é o que já existe nos outros cards e é o que permite testar a derivação sem navegador e sem `TestBed`. Não junte a arte com o cálculo.

---

### Task 1: A regra de colocação

**Files:**
- Create: `tournaments/campaign/campaign-share.ts`
- Create: `tournaments/campaign/campaign-share.spec.ts`
- Modify: `tournaments/focus/focus-journey.ts` (linha ~105: `function isFinalMatchTypeOf` → `export function`)

**Interfaces:**
- Consumes: `outcomeOf`, `sideOf` de `../tournament-live.selectors`; `isFinalMatchTypeOf` de `../focus/focus-journey`; `TournamentMatch` de `../../data/matches-repository`.
- Produces: `export type CampaignPlacement = 'champion' | 'runner-up' | 'third' | 'none'` e `export function campaignPlacementOf(matches: readonly TournamentMatch[], categoryId: string, myTeamIds: ReadonlySet<string>): CampaignPlacement`.

- [ ] **Step 1: Escreva o fixture e os testes que falham**

Crie `tournaments/campaign/campaign-share.spec.ts`. O fixture `match()` é copiado de `tournaments/focus/focus-journey.spec.ts` de propósito — os dois arquivos precisam do mesmo objeto completo, e o de lá já está calibrado com os campos reais de `TournamentMatch`.

```ts
import type { TournamentMatch } from '../../data/matches-repository';
import { campaignPlacementOf } from './campaign-share';

function match(partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'group',
    poolId: 'pool-a',
    teamAId: 'A',
    teamBId: 'B',
    teamADescription: null,
    teamBDescription: null,
    status: 'Scheduled',
    resultA: null,
    resultB: null,
    sets: [],
    winnerId: null,
    isGroupMatch: true,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    scheduleTime: null,
    courtName: null,
    liveScore: null,
    matchStartedAt: null,
    checkIn: { teamA: null, teamB: null },
    queueStatus: null,
    bestOf: 3,
    currentSetIndex: null,
    ...partial,
  };
}

const MINE = new Set(['mine']);

/** Partida de mata-mata encerrada com o atleta no lado A. */
function ko(id: string, matchType: string, round: number, winner: 'mine' | 'them', extra: Partial<TournamentMatch> = {}): TournamentMatch {
  return match({
    id,
    matchType,
    round,
    poolId: '',
    isGroupMatch: false,
    teamAId: 'mine',
    teamBId: 'them',
    status: 'Completed',
    winnerId: winner,
    sets: [
      { a: 21, b: 15 },
      { a: 21, b: 18 },
    ],
    ...extra,
  });
}

describe('campaignPlacementOf', () => {
  it('coroa quem venceu a final', () => {
    const matches = [ko('sf', 'knockout', 2, 'mine'), ko('f', 'Final', 3, 'mine')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('champion');
  });

  it('devolve vice para quem perdeu a final', () => {
    const matches = [ko('sf', 'knockout', 2, 'mine'), ko('f', 'Final', 3, 'them')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('runner-up');
  });

  it('devolve terceiro para quem venceu a disputa de 3º', () => {
    const matches = [ko('sf', 'knockout', 2, 'them'), ko('tp', 'Third Place', 3, 'mine')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('third');
  });

  it('devolve none para quem PERDEU a disputa de 3º (4º lugar não tem card próprio)', () => {
    const matches = [ko('sf', 'knockout', 2, 'them'), ko('tp', 'Third Place', 3, 'them')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('none');
  });

  it('devolve none para quem foi eliminado antes da decisão', () => {
    expect(campaignPlacementOf([ko('qf', 'knockout', 1, 'them')], 'c1', MINE)).toBe('none');
  });

  it('devolve none para quem só jogou a fase de grupos', () => {
    const groups = [match({ id: 'g1', teamAId: 'mine', status: 'Completed', winnerId: 'mine' })];
    expect(campaignPlacementOf(groups, 'c1', MINE)).toBe('none');
  });

  // A BLINDAGEM: a disputa de 3º recebe o MESMO round da final
  // (`category-bracket-builders.ts`: "3º lugar: perdedores das semifinais", round idêntico).
  // Uma implementação que decida por round coroa este atleta como campeão.
  it('não coroa como campeão quem venceu a disputa de 3º no mesmo round da final', () => {
    const matches = [
      ko('sf', 'knockout', 2, 'them'),
      ko('tp', 'Third Place', 3, 'mine'),
      // A final, entre outras duas duplas, no MESMO round da disputa de 3º.
      match({ id: 'f', matchType: 'Final', round: 3, poolId: '', isGroupMatch: false, teamAId: 'x', teamBId: 'y', status: 'Completed', winnerId: 'x' }),
    ];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('third');
  });

  it('ignora partida de outra categoria', () => {
    const matches = [ko('f', 'Final', 3, 'mine', { categoryId: 'outra' })];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('none');
  });

  it('não afirma nada com a final ainda pendente', () => {
    const matches = [match({ id: 'f', matchType: 'Final', round: 3, poolId: '', isGroupMatch: false, teamAId: 'mine', teamBId: 'them', status: 'Scheduled' })];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('none');
  });

  // Dupla eliminação: quem cai pra LB e volta pra vencer a grande final é campeão COM uma
  // derrota no currículo. A regra 1 roda antes de qualquer coisa, então isso já funciona.
  it('coroa o campeão da dupla eliminação que perdeu na WB', () => {
    const matches = [ko('wb2', 'WB', 2, 'them'), ko('lb3', 'LB', 3, 'mine'), ko('gf', 'Final', 1, 'mine')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('champion');
  });

  it('devolve terceiro na dupla eliminação (vice WB × vice LB)', () => {
    const matches = [ko('wbf', 'WB', 3, 'them'), ko('tp', 'Third Place', 1, 'mine')];
    expect(campaignPlacementOf(matches, 'c1', MINE)).toBe('third');
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

```bash
npx ng test athlete --include='**/campaign-share.spec.ts' --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL na compilação — `campaign-share.ts` não existe.

- [ ] **Step 3: Exporte `isFinalMatchTypeOf`**

Em `tournaments/focus/focus-journey.ts`, linha ~105, troque a declaração:

```ts
/** A final da categoria — em eliminação simples e a grande final da dupla eliminação, que o
 *  gerador grava com o mesmo `matchType: 'Final'` (`category-bracket-builders.ts`).
 *
 *  Exportada e compartilhada de propósito: é a mesma regra que `campaignPlacementOf`
 *  (`campaign/campaign-share.ts`) usa para coroar o campeão. Copiar essa checagem já deixou duas
 *  funções deste arquivo em desacordo entre rounds de review — não repita. */
export function isFinalMatchTypeOf(m: Pick<TournamentMatch, 'matchType'>): boolean {
  const t = m.matchType.trim().toLowerCase();
  return t === 'final' || t === 'grand final' || t === 'grand_final';
}
```

O parâmetro afrouxa de `TournamentMatch` para `Pick<TournamentMatch, 'matchType'>` — os dois chamadores existentes passam `TournamentMatch` e continuam compilando.

- [ ] **Step 4: Escreva `campaignPlacementOf`**

Crie `tournaments/campaign/campaign-share.ts`:

```ts
import type { TournamentMatch } from '../../data/matches-repository';
import { isFinalMatchTypeOf } from '../focus/focus-journey';
import { outcomeOf, sideOf } from '../tournament-live.selectors';

/**
 * Como a campanha do atleta terminou nesta categoria.
 *
 * `'none'` cobre tudo que não é pódio — eliminado em qualquer fase, 4º lugar, campanha ainda em
 * andamento — e é o card CAMPANHA dos protótipos, não um estado de erro.
 */
export type CampaignPlacement = 'champion' | 'runner-up' | 'third' | 'none';

/** A disputa de 3º lugar, com a grafia exata dos dois geradores
 *  (`functions/src/category-bracket-builders.ts`). */
function isThirdPlaceMatchTypeOf(m: Pick<TournamentMatch, 'matchType'>): boolean {
  const t = m.matchType.trim().toLowerCase();
  return t === 'third place' || t === 'third_place';
}

/**
 * A colocação final do atleta na categoria, decidida SEMPRE pelo `matchType` da partida, NUNCA
 * pelo `round`.
 *
 * O motivo é uma armadilha real desta base: a disputa de 3º lugar recebe o MESMO `round` da final
 * (`category-bracket-builders.ts` — "3º lugar: perdedores das semifinais", `round: roundStart +
 * totalRounds - 1`, idêntico ao da final). Qualquer versão que decida por round coroa como campeão
 * um atleta que venceu a disputa de 3º. `bracketWorstPlaceOf` e `winsToTitleOf`
 * (`focus/focus-journey*.ts`) já pagaram esse preço; a spec desta função existe pra não pagar de
 * novo.
 *
 * Só entra partida ENCERRADA com vencedor: a leitura é por `outcomeOf`, que exige
 * `matchIsCompleted` e `winnerId`. Sem prova, a resposta é `'none'` — nunca um pódio afirmado por
 * dedução.
 *
 * A mesma regra vale nos dois formatos, sem ramo especial. Verificado no gerador: a eliminação
 * simples e a dupla eliminação gravam ambas `'Final'` (grande final inclusive) e `'Third Place'`
 * (na DE, vice WB × vice LB), e a DE deste projeto NÃO tem bracket reset — o perdedor da final da
 * WB não volta pra LB. Logo não existem "duas grandes finais", e a regra 2 nunca afirma vice com a
 * decisão em aberto.
 *
 * NÃO deriva de `bracketWorstPlaceOf`: aquela responde "o que a premiação já garante" e é
 * conservadora de propósito (devolve 4º pra quem VENCEU a disputa de 3º). Aqui a campanha acabou e
 * o resultado é conhecido — encadear as duas traria a conservação pra um lugar onde ela estaria
 * simplesmente errada.
 */
export function campaignPlacementOf(
  matches: readonly TournamentMatch[],
  categoryId: string,
  myTeamIds: ReadonlySet<string>,
): CampaignPlacement {
  const mine = matches.filter((m) => m.categoryId === categoryId && sideOf(m, myTeamIds) !== null);

  const finals = mine.filter(isFinalMatchTypeOf);
  if (finals.some((m) => outcomeOf(m, myTeamIds) === 'win')) return 'champion';
  if (finals.some((m) => outcomeOf(m, myTeamIds) === 'loss')) return 'runner-up';

  if (mine.filter(isThirdPlaceMatchTypeOf).some((m) => outcomeOf(m, myTeamIds) === 'win')) return 'third';

  return 'none';
}
```

- [ ] **Step 5: Rode e veja passar**

```bash
npx ng test athlete --include='**/campaign-share.spec.ts' --watch=false --browsers=ChromeHeadless
```

Esperado: PASS, 12 specs.

- [ ] **Step 6: Confirme que não quebrou o vizinho**

```bash
npx ng test athlete --include='**/focus-journey.spec.ts' --watch=false --browsers=ChromeHeadless
```

Esperado: PASS (27 specs) — a mudança de `isFinalMatchTypeOf` para `export` e `Pick<>` não muda comportamento.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/campaign/campaign-share.ts \
        frontend/projects/athlete/src/app/tournaments/campaign/campaign-share.spec.ts \
        frontend/projects/athlete/src/app/tournaments/focus/focus-journey.ts
git commit -m "feat(atleta): regra de colocação da campanha por matchType"
```

---

### Task 2: As linhas da trajetória

**Files:**
- Modify: `tournaments/campaign/campaign-share.ts`
- Modify: `tournaments/campaign/campaign-share.spec.ts`

**Interfaces:**
- Consumes: `campaignPlacementOf` (Task 1); `matchClosedSets`, `matchIsCompleted`, `matchSetWins` de `../../data/matches-repository`; `byScheduleTime`, `groupLabelOf`, `knockoutLabelOf`, `outcomeOf`, `roundDisplayNumberOf`, `sideOf` de `../tournament-live.selectors`; `knockoutRounds` de `../focus/focus-journey`.
- Produces: `export type CampaignRow` (união discriminada) e `export function campaignRowsOf(matches, categoryId, myTeamIds, duoNameOf): CampaignRow[]`, onde `duoNameOf: (teamId: string, fallback: string | null) => string`.

- [ ] **Step 1: Escreva os testes que falham**

Acrescente ao fim de `campaign-share.spec.ts` (mantenha o `import` no topo do arquivo, junto dos que já existem):

```ts
import { campaignPlacementOf, campaignRowsOf } from './campaign-share';
```

```ts
const NAME_OF = (teamId: string, fallback: string | null) => (teamId ? `Dupla ${teamId}` : (fallback ?? 'A definir'));

describe('campaignRowsOf', () => {
  it('monta uma linha por partida encerrada, em ordem cronológica', () => {
    const matches = [
      match({ id: 'g2', teamAId: 'mine', teamBId: 'b', status: 'Completed', winnerId: 'mine', round: 1, scheduleTime: new Date('2026-04-25T13:00:00Z'), sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }] }),
      match({ id: 'g1', teamAId: 'mine', teamBId: 'a', status: 'Completed', winnerId: 'mine', round: 0, scheduleTime: new Date('2026-04-25T12:00:00Z'), sets: [{ a: 21, b: 10 }, { a: 21, b: 12 }] }),
    ];
    const rows = campaignRowsOf(matches, 'c1', MINE, NAME_OF);
    expect(rows.map((r) => r.kind)).toEqual(['match', 'match']);
    expect(rows.map((r) => (r.kind === 'match' ? r.opponentName : ''))).toEqual(['Dupla a', 'Dupla b']);
  });

  it('deixa de fora pendente, ao vivo e cancelada', () => {
    const matches = [
      match({ id: 'ok', teamAId: 'mine', status: 'Completed', winnerId: 'mine', sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }] }),
      match({ id: 'pend', teamAId: 'mine', status: 'Scheduled' }),
      match({ id: 'live', teamAId: 'mine', status: 'In Progress', sets: [{ a: 11, b: 9 }] }),
      match({ id: 'canc', teamAId: 'mine', status: 'Canceled' }),
    ];
    expect(campaignRowsOf(matches, 'c1', MINE, NAME_OF).length).toBe(1);
  });

  it('deixa de fora partida encerrada sem vencedor gravado', () => {
    const matches = [match({ id: 'x', teamAId: 'mine', status: 'Completed', winnerId: null, sets: [{ a: 21, b: 15 }] })];
    expect(campaignRowsOf(matches, 'c1', MINE, NAME_OF)).toEqual([]);
  });

  // A ÓTICA DO ATLETA: `sets` é sempre cru (lado A primeiro). Lido direto, o atleta do lado B
  // pareceria ter perdido o set que venceu — é a lição que `mySetsLabelOf` já carrega.
  it('inverte placar e parciais quando o atleta é o lado B', () => {
    const asA = match({ id: 'a', teamAId: 'mine', teamBId: 'them', status: 'Completed', winnerId: 'mine', sets: [{ a: 21, b: 15 }, { a: 18, b: 21 }, { a: 15, b: 12 }] });
    const asB = match({ id: 'b', teamAId: 'them', teamBId: 'mine', status: 'Completed', winnerId: 'mine', sets: [{ a: 15, b: 21 }, { a: 21, b: 18 }, { a: 12, b: 15 }] });

    const rowA = campaignRowsOf([asA], 'c1', MINE, NAME_OF)[0]!;
    const rowB = campaignRowsOf([asB], 'c1', MINE, NAME_OF)[0]!;
    if (rowA.kind !== 'match' || rowB.kind !== 'match') throw new Error('esperava linhas de partida');

    expect(rowA.setScore).toBe('2–1');
    expect(rowA.partials).toEqual(['21-15', '18-21', '15-12']);
    expect(rowB.setScore).toBe('2–1');
    expect(rowB.partials).toEqual(['21-15', '18-21', '15-12']);
    expect(rowB.opponentName).toBe('Dupla them');
  });

  // O prefixo do grupo VOLTA no card: a tela do Focus corta "Grupo A ·" porque a seção já se
  // intitula assim, mas numa imagem solta esse contexto não existe.
  it('rotula fase de grupo com grupo e jogo', () => {
    const matches = [
      match({ id: 'g1', poolId: 'pool-a', teamAId: 'mine', status: 'Completed', winnerId: 'mine', round: 0, sets: [{ a: 21, b: 15 }] }),
      match({ id: 'g2', poolId: 'pool-a', teamAId: 'x', teamBId: 'y', round: 1 }),
    ];
    const row = campaignRowsOf(matches, 'c1', MINE, NAME_OF)[0]!;
    expect(row.phaseLabel).toBe('Grupo A · J1');
    expect(row.kind === 'match' && row.isGroup).toBe(true);
  });

  it('rotula mata-mata pela fase', () => {
    const matches = [ko('sf', 'knockout', 1, 'mine'), ko('f', 'Final', 2, 'mine')];
    const rows = campaignRowsOf(matches, 'c1', MINE, NAME_OF);
    expect(rows.map((r) => r.phaseLabel)).toEqual(['Semifinal', 'Final']);
  });

  // Decisão do dono: o card usa o rótulo do app, não "Repescagem" do protótipo — o card nunca
  // discorda da tela.
  it('mantém o rótulo do app na chave dos perdedores', () => {
    const rows = campaignRowsOf([ko('lb', 'LB', 2, 'mine')], 'c1', MINE, NAME_OF);
    expect(rows[0]!.phaseLabel).toBe('LB · Rodada 2');
  });

  it('marca derrota', () => {
    const rows = campaignRowsOf([ko('qf', 'knockout', 1, 'them')], 'c1', MINE, NAME_OF);
    expect(rows[0]!.kind === 'match' && rows[0]!.outcome).toBe('loss');
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

```bash
npx ng test athlete --include='**/campaign-share.spec.ts' --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL — `campaignRowsOf` não existe.

- [ ] **Step 3: Escreva `campaignRowsOf`**

Acrescente a `campaign-share.ts` (e amplie o bloco de `import` do topo):

```ts
import { matchClosedSets, matchIsCompleted, matchSetWins, type TournamentMatch } from '../../data/matches-repository';
import { isFinalMatchTypeOf, knockoutRounds } from '../focus/focus-journey';
import { byScheduleTime, groupLabelOf, knockoutLabelOf, outcomeOf, roundDisplayNumberOf, sideOf } from '../tournament-live.selectors';
```

```ts
/**
 * Uma linha do painel de trajetória.
 *
 * União discriminada porque o painel desenha duas coisas diferentes: a partida (selo V/D, fase,
 * adversário, placar em sets, parciais) e o resumo do grupo, que só existe quando a campanha é
 * longa demais pro painel (ver `fitCampaignRows`). Um tipo único com campos anuláveis faria a
 * arte adivinhar qual desenho usar.
 */
export type CampaignRow =
  | {
      kind: 'match';
      outcome: 'win' | 'loss';
      /** Partida da fase de grupos. Campo próprio, e não farejado do `phaseLabel`: é por ele que
       *  `fitCampaignRows` sabe o que pode colapsar, e um rótulo é texto de exibição — muda de
       *  redação sem aviso e levaria o colapso junto. */
      isGroup: boolean;
      /** "Grupo A · J1", "Quartas", "LB · Rodada 2", "Final". */
      phaseLabel: string;
      opponentName: string;
      /** "2–0", em SETS, na ótica do atleta. */
      setScore: string;
      /** ["21-15", "21-18"] — parciais na mesma ótica. */
      partials: string[];
    }
  | {
      kind: 'group-summary';
      /** "Grupo A". */
      phaseLabel: string;
      games: number;
      wins: number;
      losses: number;
    };

/**
 * A fase, do jeito que ela precisa ser lida numa imagem SOLTA.
 *
 * Difere de `phaseLabelOf` (`focus/journey/focus-journey.component.ts`) num ponto de propósito: lá
 * a fase de grupos vira só "Rodada N", porque a seção da tela já se intitula "Grupo A ·
 * Classificação parcial" e repetir roubaria largura no celular. Aqui não existe seção nenhuma em
 * volta — quem recebe a imagem no WhatsApp precisa do grupo escrito.
 *
 * `groupLabelOf` e `roundDisplayNumberOf` recebem as partidas da CATEGORIA, nunca as do torneio:
 * `poolId` só é único dentro da categoria, e "Grupo A" existe em todas elas.
 */
function campaignPhaseLabelOf(
  categoryMatches: readonly TournamentMatch[],
  m: TournamentMatch,
  knockoutRoundsOfCategory: readonly number[],
): string {
  if (m.poolId) return `${groupLabelOf(m.poolId, categoryMatches)} · J${roundDisplayNumberOf(categoryMatches, m.poolId, m.round)}`;
  // WB e LB numeram rodadas por conta própria, então o rótulo carrega a chave junto — a mesma
  // convenção de `knockoutStepLabelOf` na Trajetória e das colunas da aba Chave.
  const type = m.matchType.trim().toUpperCase();
  return type === 'WB' || type === 'LB' ? `${type} · Rodada ${m.round}` : knockoutLabelOf(m, knockoutRoundsOfCategory);
}

/**
 * As partidas ENCERRADAS do atleta na categoria, em ordem cronológica, já na ótica dele.
 *
 * Partida pendente, ao vivo ou cancelada não entra: o card conta o que aconteceu, não o que pode
 * acontecer. Encerrada sem `winnerId` também fica de fora — `outcomeOf` devolve `null` ali, e
 * inventar 'loss' seria pior que omitir a linha.
 */
export function campaignRowsOf(
  matches: readonly TournamentMatch[],
  categoryId: string,
  myTeamIds: ReadonlySet<string>,
  duoNameOf: (teamId: string, fallback: string | null) => string,
): CampaignRow[] {
  const categoryMatches = matches.filter((m) => m.categoryId === categoryId);
  const knockoutRoundsOfCategory = knockoutRounds(matches, categoryId);

  return categoryMatches
    .filter((m) => sideOf(m, myTeamIds) !== null && matchIsCompleted(m) && outcomeOf(m, myTeamIds) !== null)
    .sort(byScheduleTime)
    .map<CampaignRow>((m) => {
      // Garantido pelo filtro acima; a asserção só documenta isso.
      const side = sideOf(m, myTeamIds)!;
      const opponentId = side === 'A' ? m.teamBId : m.teamAId;
      const opponentDescription = side === 'A' ? m.teamBDescription : m.teamADescription;
      const [setsA, setsB] = matchSetWins(m);
      const [mySets, theirSets] = side === 'A' ? [setsA, setsB] : [setsB, setsA];
      return {
        kind: 'match',
        outcome: outcomeOf(m, myTeamIds) === 'win' ? 'win' : 'loss',
        isGroup: m.poolId.length > 0,
        phaseLabel: campaignPhaseLabelOf(categoryMatches, m, knockoutRoundsOfCategory),
        opponentName: duoNameOf(opponentId, opponentDescription),
        setScore: `${mySets}–${theirSets}`,
        partials: matchClosedSets(m).map((s) => (side === 'A' ? `${s.a}-${s.b}` : `${s.b}-${s.a}`)),
      };
    });
}
```

O travessão de `setScore` é `–` (en dash, U+2013), igual ao da Trajetória.

- [ ] **Step 4: Rode e veja passar**

```bash
npx ng test athlete --include='**/campaign-share.spec.ts' --watch=false --browsers=ChromeHeadless
```

Esperado: PASS, 20 specs.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/campaign/
git commit -m "feat(atleta): linhas da trajetória da campanha na ótica do atleta"
```

---

### Task 3: Transbordo do painel

**Files:**
- Modify: `tournaments/campaign/campaign-share.ts`
- Modify: `tournaments/campaign/campaign-share.spec.ts`

**Interfaces:**
- Consumes: `CampaignRow` (Task 2).
- Produces: `export const CAMPAIGN_ROWS_COMFORT = 7`, `export const CAMPAIGN_ROWS_MAX = 9`, `export interface CampaignTrajectory { rows: CampaignRow[]; hiddenCount: number }` e `export function fitCampaignRows(rows: readonly CampaignRow[], maxRows?: number): CampaignTrajectory`.

Divisão de responsabilidade: esta função decide **o que aparece** (colapsar o grupo, cortar o excesso). A arte decide **quão apertado** desenhar — até `CAMPAIGN_ROWS_COMFORT` no passo do protótipo, acima disso encolhendo até o piso. São dois degraus diferentes do transbordo e vivem em camadas diferentes.

- [ ] **Step 1: Escreva os testes que falham**

```ts
function winRow(phase: string, isGroup = false): CampaignRow {
  return { kind: 'match', outcome: 'win', isGroup, phaseLabel: phase, opponentName: 'Dupla x', setScore: '2–0', partials: ['21-15', '21-18'] };
}

function lossRow(phase: string, isGroup = false): CampaignRow {
  return { kind: 'match', outcome: 'loss', isGroup, phaseLabel: phase, opponentName: 'Dupla y', setScore: '0–2', partials: ['15-21', '18-21'] };
}

describe('fitCampaignRows', () => {
  it('não mexe numa campanha que cabe', () => {
    const rows = [winRow('Grupo A · J1', true), winRow('Quartas'), winRow('Semifinal'), winRow('Final')];
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows).toEqual(rows);
    expect(fitted.hiddenCount).toBe(0);
  });

  it('colapsa a fase de grupos quando passa do teto', () => {
    const rows = [
      winRow('Grupo A · J1', true),
      lossRow('Grupo A · J2', true),
      winRow('Grupo A · J3', true),
      winRow('Oitavas'),
      winRow('Quartas'),
      winRow('Semifinal'),
      winRow('Final'),
      winRow('LB · Rodada 1'),
      winRow('LB · Rodada 2'),
      winRow('LB · Rodada 3'),
    ];
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows.length).toBe(8);
    expect(fitted.rows[0]).toEqual({ kind: 'group-summary', phaseLabel: 'Grupo A', games: 3, wins: 2, losses: 1 });
    expect(fitted.hiddenCount).toBe(0);
  });

  it('não colapsa um grupo de uma partida só (não economiza linha)', () => {
    const rows = [winRow('Grupo A · J1', true), ...Array.from({ length: 9 }, (_, i) => winRow(`KO ${i}`))];
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows[0]!.kind).toBe('match');
  });

  it('corta as mais antigas e reporta quantas ficaram de fora', () => {
    const rows = Array.from({ length: 13 }, (_, i) => winRow(`KO ${i + 1}`));
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows.length).toBe(9);
    expect(fitted.hiddenCount).toBe(4);
    // Corta pelo começo: o fim da campanha é a parte que conta a história.
    expect(fitted.rows[0]!.kind === 'match' && fitted.rows[0]!.phaseLabel).toBe('KO 5');
    expect(fitted.rows[8]!.kind === 'match' && fitted.rows[8]!.phaseLabel).toBe('KO 13');
  });

  it('colapsa o grupo ANTES de cortar', () => {
    const rows = [
      winRow('Grupo A · J1', true),
      winRow('Grupo A · J2', true),
      winRow('Grupo A · J3', true),
      ...Array.from({ length: 8 }, (_, i) => winRow(`KO ${i + 1}`)),
    ];
    const fitted = fitCampaignRows(rows);
    expect(fitted.rows[0]!.kind).toBe('group-summary');
    expect(fitted.rows.length).toBe(9);
    expect(fitted.hiddenCount).toBe(0);
  });

  it('respeita um teto passado à mão', () => {
    const rows = Array.from({ length: 5 }, (_, i) => winRow(`KO ${i + 1}`));
    expect(fitCampaignRows(rows, 3).rows.length).toBe(3);
    expect(fitCampaignRows(rows, 3).hiddenCount).toBe(2);
  });
});
```

Some `type CampaignRow` e `fitCampaignRows` ao `import` do topo do spec.

- [ ] **Step 2: Rode e veja falhar**

```bash
npx ng test athlete --include='**/campaign-share.spec.ts' --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL — `fitCampaignRows` não existe.

- [ ] **Step 3: Escreva `fitCampaignRows`**

```ts
/** Quantas linhas o painel comporta no passo do protótipo. Acima disso a arte encolhe o passo. */
export const CAMPAIGN_ROWS_COMFORT = 7;

/** O teto absoluto: quantas linhas cabem com o passo já no piso. Passar daqui exige cortar. */
export const CAMPAIGN_ROWS_MAX = 9;

export interface CampaignTrajectory {
  rows: CampaignRow[];
  /** Jogos que não couberam no painel. `0` quando tudo coube — o cabeçalho só declara o corte
   *  quando ele existe. */
  hiddenCount: number;
}

/**
 * Encaixa a campanha no painel, em dois degraus, nesta ordem.
 *
 * 1. **Colapsa a fase de grupos numa linha só** ("Grupo A", "3 jogos · 2V 1D"). O mata-mata é a
 *    parte que conta a história; o grupo vira contexto. Só colapsa com 2+ partidas de grupo — com
 *    uma só, a troca não economiza linha nenhuma e apagaria um adversário à toa.
 * 2. **Corta as mais ANTIGAS** e devolve `hiddenCount`, pra que o cabeçalho do painel declare
 *    "+N JOGOS".
 *
 * O corte é declarado de propósito. `fitFont` encolhe até o piso e devolve o texto inteiro do
 * jeito que estiver — encolher nunca garantiu encaixe nesta base, e um corte silencioso faria o
 * card mentir sobre o tamanho da campanha.
 *
 * O degrau intermediário do desenho — encolher o passo entre linhas — NÃO mora aqui: é decisão da
 * arte, que compara o total com `CAMPAIGN_ROWS_COMFORT`.
 */
export function fitCampaignRows(rows: readonly CampaignRow[], maxRows = CAMPAIGN_ROWS_MAX): CampaignTrajectory {
  if (rows.length <= maxRows) return { rows: [...rows], hiddenCount: 0 };

  const groupRows = rows.filter((r) => r.kind === 'match' && r.isGroup);
  let working: CampaignRow[] = [...rows];

  if (groupRows.length >= 2) {
    const wins = groupRows.filter((r) => r.kind === 'match' && r.outcome === 'win').length;
    const first = groupRows[0]!;
    const summary: CampaignRow = {
      kind: 'group-summary',
      // O rótulo da linha é "Grupo A · J1"; o resumo fica com o grupo, sem o jogo.
      phaseLabel: (first.kind === 'match' ? first.phaseLabel.split(' · ')[0] : null) ?? 'Grupo',
      games: groupRows.length,
      wins,
      losses: groupRows.length - wins,
    };
    working = [summary, ...rows.filter((r) => !(r.kind === 'match' && r.isGroup))];
  }

  if (working.length <= maxRows) return { rows: working, hiddenCount: 0 };

  const hiddenCount = working.length - maxRows;
  return { rows: working.slice(hiddenCount), hiddenCount };
}
```

- [ ] **Step 4: Rode e veja passar**

```bash
npx ng test athlete --include='**/campaign-share.spec.ts' --watch=false --browsers=ChromeHeadless
```

Esperado: PASS, 26 specs.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/campaign/
git commit -m "feat(atleta): transbordo do painel de trajetória com corte declarado"
```

---

### Task 4: Montagem do `CampaignShareData`

**Files:**
- Modify: `tournaments/campaign/campaign-share.ts`
- Modify: `tournaments/campaign/campaign-share.spec.ts`

**Interfaces:**
- Consumes: `campaignPlacementOf` (Task 1), `campaignRowsOf` (Task 2), `fitCampaignRows` (Task 3); `tournamentNumbersOf` de `../focus/focus-journey`.
- Produces: `export interface CampaignPlayer`, `export interface CampaignShareData`, `export interface CampaignShareInput` e `export function campaignShareDataOf(input: CampaignShareInput): CampaignShareData`.

A função recebe parâmetros crus, nunca o `TournamentLiveStore` — é o que permite testá-la sem `TestBed`, o mesmo motivo pelo qual `journeyPathOf` e `journeyStepsOf` existem soltas.

- [ ] **Step 1: Escreva os testes que falham**

```ts
const PLAYERS: [CampaignPlayer, CampaignPlayer] = [
  { initial: 'BR', photo: null },
  { initial: 'DB', photo: null },
];

function input(partial: Partial<CampaignShareInput> = {}): CampaignShareInput {
  return {
    matches: [],
    categoryId: 'c1',
    myTeamIds: MINE,
    duoNameOf: NAME_OF,
    teamName: 'Bruninho / Diego Barros',
    players: PLAYERS,
    categoryName: 'Masculino B',
    teamSize: null,
    tournamentName: 'Circuito NexaGO · Etapa Goiânia',
    locationName: 'Arena Vila Nova',
    startAt: new Date('2026-04-25T12:00:00Z'),
    endAt: new Date('2026-04-26T22:00:00Z'),
    ...partial,
  };
}

describe('campaignShareDataOf', () => {
  it('monta o card do campeão com números e trajetória', () => {
    const matches = [
      match({ id: 'g1', teamAId: 'mine', teamBId: 'a', status: 'Completed', winnerId: 'mine', round: 0, sets: [{ a: 21, b: 15 }, { a: 21, b: 18 }] }),
      ko('f', 'Final', 3, 'mine'),
    ];
    const data = campaignShareDataOf(input({ matches }));
    expect(data.placement).toBe('champion');
    expect(data.categoryLine).toBe('Masculino B · Duplas');
    expect(data.teamName).toBe('Bruninho / Diego Barros');
    expect(data.wins).toBe(2);
    expect(data.losses).toBe(0);
    expect(data.setsWon).toBe(4);
    expect(data.setsLost).toBe(0);
    expect(data.trajectory.rows.length).toBe(2);
    expect(data.trajectory.hiddenCount).toBe(0);
  });

  it('conta derrotas e calcula o aproveitamento', () => {
    const matches = [
      ko('g1', 'knockout', 1, 'mine'),
      ko('g2', 'knockout', 2, 'mine'),
      ko('g3', 'knockout', 3, 'them'),
    ];
    const data = campaignShareDataOf(input({ matches }));
    expect(data.wins).toBe(2);
    expect(data.losses).toBe(1);
    expect(data.winRateLabel).toBe('Aprov. 67%');
  });

  it('devolve null de aproveitamento sem partida encerrada', () => {
    expect(campaignShareDataOf(input()).winRateLabel).toBeNull();
  });

  // O mês abreviado sai de tabela própria, NUNCA de `toLocaleDateString`: o pt-BR do navegador
  // devolve "abr." COM ponto, e o protótipo escreve "ABR". É a mesma divergência já registrada
  // entre o app (Dart) e a web.
  it('formata intervalo de datas dentro do mesmo mês', () => {
    expect(campaignShareDataOf(input()).dateRangeLabel).toBe('25–26 ABR 2026');
  });

  it('formata evento de um dia só', () => {
    const data = campaignShareDataOf(input({ endAt: null }));
    expect(data.dateRangeLabel).toBe('25 ABR 2026');
  });

  it('formata intervalo que cruza o mês', () => {
    const data = campaignShareDataOf(input({ startAt: new Date('2026-04-30T12:00:00Z'), endAt: new Date('2026-05-02T22:00:00Z') }));
    expect(data.dateRangeLabel).toBe('30 ABR – 02 MAI 2026');
  });

  it('omite a data sem início declarado', () => {
    expect(campaignShareDataOf(input({ startAt: null })).dateRangeLabel).toBeNull();
  });

  it('conta só as partidas da categoria pedida', () => {
    const matches = [ko('f', 'Final', 3, 'mine'), ko('outra', 'Final', 3, 'mine', { categoryId: 'c2' })];
    const data = campaignShareDataOf(input({ matches }));
    expect(data.wins).toBe(1);
  });
});
```

Some `CampaignPlayer`, `CampaignShareInput` e `campaignShareDataOf` ao `import` do topo do spec.

- [ ] **Step 2: Rode e veja falhar**

```bash
npx ng test athlete --include='**/campaign-share.spec.ts' --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL — `campaignShareDataOf` não existe.

- [ ] **Step 3: Escreva a montagem**

Acrescente `tournamentNumbersOf` ao `import` de `../focus/focus-journey` e escreva:

```ts
/** Declarado aqui, não importado de `match-share-card.ts`: as duas artes não se acoplam. É o
 *  princípio que `share-canvas.ts` enuncia — infraestrutura é compartilhada, desenho não. */
export interface CampaignPlayer {
  initial: string;
  photo: string | null;
}

export interface CampaignShareData {
  placement: CampaignPlacement;
  /** "Masculino B · Duplas". */
  categoryLine: string;
  teamName: string;
  players: [CampaignPlayer, CampaignPlayer];
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  /** "Aprov. 83%"; `null` sem partida encerrada — estado que o portão das entradas já impede,
   *  mas que a função não tem por que inventar. */
  winRateLabel: string | null;
  trajectory: CampaignTrajectory;
  tournamentName: string;
  locationName: string | null;
  /** "25–26 ABR 2026"; `null` sem `startAt`. */
  dateRangeLabel: string | null;
}

export interface CampaignShareInput {
  matches: readonly TournamentMatch[];
  categoryId: string;
  myTeamIds: ReadonlySet<string>;
  duoNameOf: (teamId: string, fallback: string | null) => string;
  teamName: string;
  players: [CampaignPlayer, CampaignPlayer];
  categoryName: string;
  /** `null` = dupla clássica. Categoria de equipe não recebe o botão nesta entrega. */
  teamSize: number | null;
  tournamentName: string;
  locationName: string | null;
  startAt: Date | null;
  endAt: Date | null;
}

/**
 * Meses em tabela própria, NUNCA `toLocaleDateString('pt-BR', { month: 'short' })`.
 *
 * O motivo é concreto: o short do pt-BR devolve "abr." COM ponto, e o protótipo escreve "ABR".
 * É a mesma divergência que já separa o app (Dart, com ponto) da web neste projeto. Tabela fixa
 * também blinda contra mudança de ICU entre versões de navegador.
 */
const MONTHS_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** Data em São Paulo, decomposta. O torneio é do fuso do evento, não do navegador de quem abre. */
const SP_DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

function saoPauloParts(d: Date): { day: string; month: number; year: string } {
  const parts = SP_DATE.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: get('day'), month: Number(get('month')), year: get('year') };
}

/** "25–26 ABR 2026", "30 ABR – 02 MAI 2026", "25 ABR 2026". `null` sem `startAt`: o cabeçalho
 *  omite a data em vez de afirmar uma errada. */
export function campaignDateRangeLabelOf(startAt: Date | null, endAt: Date | null): string | null {
  if (!startAt) return null;
  const from = saoPauloParts(startAt);
  const fromMonth = MONTHS_ABBR[from.month - 1] ?? '';
  if (!endAt) return `${from.day} ${fromMonth} ${from.year}`;

  const to = saoPauloParts(endAt);
  const toMonth = MONTHS_ABBR[to.month - 1] ?? '';
  if (from.day === to.day && from.month === to.month && from.year === to.year) {
    return `${from.day} ${fromMonth} ${from.year}`;
  }
  if (from.month === to.month && from.year === to.year) {
    return `${from.day}–${to.day} ${fromMonth} ${from.year}`;
  }
  if (from.year === to.year) {
    return `${from.day} ${fromMonth} – ${to.day} ${toMonth} ${from.year}`;
  }
  return `${from.day} ${fromMonth} ${from.year} – ${to.day} ${toMonth} ${to.year}`;
}

/** Tudo que a arte precisa, derivado de uma vez. Parâmetros crus, nunca o store: é o que deixa
 *  esta função testável sem `TestBed` — mesma escolha de `journeyStepsOf`. */
export function campaignShareDataOf(input: CampaignShareInput): CampaignShareData {
  const categoryMatches = input.matches.filter((m) => m.categoryId === input.categoryId);
  const rows = campaignRowsOf(input.matches, input.categoryId, input.myTeamIds, input.duoNameOf);

  // Vitórias e derrotas saem das linhas ANTES do encaixe: colapsar o grupo não pode mudar o
  // cartel do atleta, só o que aparece no painel.
  const wins = rows.filter((r) => r.kind === 'match' && r.outcome === 'win').length;
  const losses = rows.length - wins;

  // `tournamentNumbersOf` recebe as partidas da CATEGORIA. Na Trajetória ela recebe o torneio
  // inteiro de propósito (os números de lá são do atleta no evento); aqui o card é de uma
  // campanha só, e somar outra categoria inflaria os sets.
  const numbers = tournamentNumbersOf(categoryMatches, input.myTeamIds);

  return {
    placement: campaignPlacementOf(input.matches, input.categoryId, input.myTeamIds),
    categoryLine: `${input.categoryName} · ${input.teamSize == null ? 'Duplas' : 'Equipes'}`,
    teamName: input.teamName,
    players: input.players,
    wins,
    losses,
    setsWon: numbers.setsWon,
    setsLost: numbers.setsLost,
    winRateLabel: rows.length > 0 ? `Aprov. ${Math.round((wins / rows.length) * 100)}%` : null,
    trajectory: fitCampaignRows(rows),
    tournamentName: input.tournamentName,
    locationName: input.locationName,
    dateRangeLabel: campaignDateRangeLabelOf(input.startAt, input.endAt),
  };
}
```

- [ ] **Step 4: Rode e veja passar**

```bash
npx ng test athlete --include='**/campaign-share.spec.ts' --watch=false --browsers=ChromeHeadless
```

Esperado: PASS, 34 specs.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/campaign/
git commit -m "feat(atleta): montagem dos dados do card de campanha"
```

---

### Task 5: A arte em canvas

**Files:**
- Modify: `tournaments/share-canvas.ts` (`drawWordmark`)
- Create: `tournaments/campaign/campaign-share-card.ts`

**Interfaces:**
- Consumes: `CampaignShareData`, `CampaignRow`, `CAMPAIGN_ROWS_COMFORT` (Tasks 2–4); de `../share-canvas`: `DIM`, `INK`, `MUTE`, `ORANGE`, `drawWordmark`, `fitFont`, `hexA`, `inter`, `loadImage`, `loadShareFonts`, `mono`, `sora`, `tracked`, `truncate`.
- Produces: `export const CAMPAIGN_CARD_WIDTH = 1080`, `export const CAMPAIGN_CARD_HEIGHT = 1920`, `export async function drawCampaignShareCard(ctx: CanvasRenderingContext2D, data: CampaignShareData): Promise<void>`.

Sem teste automatizado: canvas é verificado a olho, como os outros três cards do portal. A verificação desta task é o build compilar; a visual acontece na Task 6, quando o diálogo existir para renderizar.

- [ ] **Step 1: Dê cores opcionais ao `drawWordmark`**

Em `tournaments/share-canvas.ts`, substitua a função inteira:

```ts
/** "nexaGO" com o GO laranja; devolve o X onde o texto terminou.
 *
 *  As cores são parametrizadas porque o card de campanha do CAMPEÃO tem fundo laranja — ali o
 *  "GO" laranja sobre laranja simplesmente sumia. Os padrões são exatamente o que sempre foi
 *  desenhado, então nenhum chamador existente muda. */
export function drawWordmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseline: number,
  size: number,
  nexaColor: string = INK,
  goColor: string = ORANGE,
): number {
  ctx.font = sora(800, size);
  ctx.textAlign = 'left';
  ctx.fillStyle = nexaColor;
  ctx.fillText('nexa', x, baseline);
  const nexaW = ctx.measureText('nexa').width;
  ctx.fillStyle = goColor;
  ctx.fillText('GO', x + nexaW, baseline);
  return x + nexaW + ctx.measureText('GO').width;
}
```

- [ ] **Step 2: Crie o arquivo com paletas e medidas**

Crie `tournaments/campaign/campaign-share-card.ts`:

```ts
import {
  DIM,
  INK,
  MUTE,
  ORANGE,
  drawWordmark,
  fitFont,
  hexA,
  inter,
  loadImage,
  loadShareFonts,
  mono,
  sora,
  tracked,
  truncate,
} from '../share-canvas';
import { CAMPAIGN_ROWS_COMFORT, type CampaignPlacement, type CampaignRow, type CampaignShareData } from './campaign-share';

/**
 * Desenho do card de CAMPANHA — a campanha inteira do atleta num torneio, nas quatro variantes
 * dos protótipos: campeão, vice, terceiro e eliminado.
 *
 * Arquivo próprio, como os outros três cards do portal: medir, cortar, carregar foto e a paleta
 * base vêm de `../share-canvas.ts`; o desenho abaixo é só desta arte. Juntar os desenhos faria
 * uma mudança de layout aqui respingar no pôster de partida.
 *
 * 1080×1920 (9:16) — Instagram Stories e status do WhatsApp, os destinos reais da folha nativa.
 * Sem link e sem QR: o compartilhamento é só a imagem.
 *
 * O CAMPEÃO inverte o card: fundo laranja, tinta preta. Os outros três são quase-preto com o
 * título na cor da colocação. O painel da trajetória é escuro nas quatro.
 */

export const CAMPAIGN_CARD_WIDTH = 1080;
export const CAMPAIGN_CARD_HEIGHT = 1920;

const W = CAMPAIGN_CARD_WIDTH;
const H = CAMPAIGN_CARD_HEIGHT;
/** Margem lateral, a mesma do pôster de partida. */
const M = 72;

const LOGO_SRC = '/brand/logo.png';
const LOGO_SIZE = 60;
const LOGO_TOP = 85;
const LOGO_GAP = 18;

const WIN_GREEN = '#2bd17e';
const LOSS_RED = '#ff3b30';

interface CampaignSkin {
  bg: string;
  /** Tinta do bloco de cima (fora do painel). */
  ink: string;
  mute: string;
  dim: string;
  /** Cor do título gigante. */
  title: string;
  /** Halo radial no canto superior direito. */
  halo: string;
  /** Selo de colocação; `null` quando o próprio título já diz tudo. */
  badge: string | null;
  badgeBg: string;
  badgeInk: string;
  wordmarkNexa: string;
  wordmarkGo: string;
  /** Aro das fotos. */
  ring: string;
}

const SKINS: Record<CampaignPlacement, CampaignSkin> = {
  champion: {
    bg: ORANGE,
    ink: '#0a0a0a',
    mute: 'rgba(10, 10, 10, 0.66)',
    dim: 'rgba(10, 10, 10, 0.5)',
    title: '#0a0a0a',
    halo: 'rgba(255, 255, 255, 0.16)',
    badge: null,
    badgeBg: '#0a0a0a',
    badgeInk: ORANGE,
    wordmarkNexa: '#0a0a0a',
    wordmarkGo: '#0a0a0a',
    ring: 'rgba(10, 10, 10, 0.28)',
  },
  'runner-up': {
    bg: '#0a0a0a',
    ink: INK,
    mute: MUTE,
    dim: DIM,
    title: '#c8cdd4',
    halo: 'rgba(200, 205, 212, 0.14)',
    badge: '2º LUGAR',
    badgeBg: 'rgba(200, 205, 212, 0.16)',
    badgeInk: '#e6eaef',
    wordmarkNexa: INK,
    wordmarkGo: ORANGE,
    ring: 'rgba(255, 255, 255, 0.18)',
  },
  third: {
    bg: '#0a0a0a',
    ink: INK,
    mute: MUTE,
    dim: DIM,
    title: '#c88a4f',
    halo: 'rgba(200, 138, 79, 0.16)',
    badge: '3º LUGAR',
    badgeBg: 'rgba(200, 138, 79, 0.18)',
    badgeInk: '#e8b98a',
    wordmarkNexa: INK,
    wordmarkGo: ORANGE,
    ring: 'rgba(255, 255, 255, 0.18)',
  },
  none: {
    bg: '#0a0a0a',
    ink: INK,
    mute: MUTE,
    dim: DIM,
    title: ORANGE,
    halo: 'rgba(255, 106, 26, 0.16)',
    badge: null,
    badgeBg: 'rgba(255, 106, 26, 0.18)',
    badgeInk: '#ffb184',
    wordmarkNexa: INK,
    wordmarkGo: ORANGE,
    ring: 'rgba(255, 255, 255, 0.18)',
  },
};

const TITLES: Record<CampaignPlacement, string> = {
  champion: 'CAMPEÃO',
  'runner-up': 'VICE-CAMPEÃO',
  third: 'TERCEIRO',
  none: 'CAMPANHA',
};

// ——— Painel da trajetória ———
// O painel é ancorado no RODAPÉ e cresce pra cima: é o que faz os quatro protótipos funcionarem
// com número diferente de jogos — com 4 linhas sobra respiro no meio, com 6 ele encosta no bloco
// de cima.
const PANEL_BOTTOM = 1672;
const PANEL_PAD_X = 34;
const PANEL_HEAD_H = 96;
const PANEL_PAD_BOTTOM = 26;
const ROW_PITCH_COMFORT = 130;
/** O piso do degrau 2 do transbordo: acima de `CAMPAIGN_ROWS_COMFORT` linhas o passo aperta. */
const ROW_PITCH_TIGHT = 104;

// Mesmos gradientes dos avatares dos cards do portal.
const AVATAR_GRAD: [string, string][] = [
  ['#ff6a1a', '#c2185b'],
  ['#2bd17e', '#1e7a4d'],
];
```

- [ ] **Step 3: Escreva os blocos de desenho**

Acrescente ao mesmo arquivo:

```ts
/** Foto circular com aro; sem foto, iniciais sobre o gradiente do avatar dos cards. */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  initial: string,
  index: number,
  x: number,
  y: number,
  r: number,
  skin: CampaignSkin,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 9, 0, Math.PI * 2);
  ctx.fillStyle = skin.bg;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = skin.ring;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  } else {
    const [c1, c2] = AVATAR_GRAD[index % 2]!;
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.font = sora(700, r * 0.62);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, x, y + r * 0.04);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

/** Pill arredondada com texto centrado. Devolve a largura ocupada. */
function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  left: number,
  cy: number,
  padX: number,
  h: number,
  bg: string,
  fg: string,
): number {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.beginPath();
  ctx.roundRect(left, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + padX, cy + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

function drawBackdrop(ctx: CanvasRenderingContext2D, skin: CampaignSkin): void {
  ctx.fillStyle = skin.bg;
  ctx.fillRect(0, 0, W, H);

  // Halo no canto superior direito — o disco claro dos protótipos.
  const glow = ctx.createRadialGradient(W - 60, 200, 60, W - 60, 200, 640);
  glow.addColorStop(0, skin.halo);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 900);
}

/** Marca + wordmark à esquerda, intervalo de datas à direita. Sem a marca (asset que falhou), o
 *  wordmark volta pra margem em vez de deixar o buraco dela — mesma regra do pôster de partida. */
function drawHeader(ctx: CanvasRenderingContext2D, data: CampaignShareData, logo: HTMLImageElement | null, skin: CampaignSkin): void {
  if (logo) ctx.drawImage(logo, M, LOGO_TOP, LOGO_SIZE, LOGO_SIZE);
  drawWordmark(ctx, logo ? M + LOGO_SIZE + LOGO_GAP : M, 138, 60, skin.wordmarkNexa, skin.wordmarkGo);

  if (data.dateRangeLabel) {
    ctx.font = mono(500, 24);
    ctx.fillStyle = skin.dim;
    const text = data.dateRangeLabel.toUpperCase();
    const spacing = 6;
    const width = ctx.measureText(text).width + spacing * ([...text].length - 1);
    tracked(ctx, text, W - M - width, 128, spacing, 'left');
  }
}

/** Kicker, título gigante, nome da dupla, fotos e cartel. */
function drawHero(ctx: CanvasRenderingContext2D, data: CampaignShareData, photos: Map<string, HTMLImageElement | null>, skin: CampaignSkin): void {
  // Kicker + selo de colocação
  ctx.font = mono(500, 26);
  ctx.fillStyle = skin.mute;
  const kicker = data.categoryLine.toUpperCase();
  const kickerSpacing = 8;
  tracked(ctx, truncate(ctx, kicker, W - M * 2 - 220), M, 212, kickerSpacing, 'left');
  if (skin.badge) {
    const kickerW = ctx.measureText(kicker).width + kickerSpacing * ([...kicker].length - 1);
    drawPill(ctx, skin.badge, mono(700, 22), M + kickerW + 26, 203, 20, 44, skin.badgeBg, skin.badgeInk);
  }

  // Título: o maior elemento do card. `fitFont` encolhe, `truncate` garante o encaixe — sozinho
  // o `fitFont` para no piso e devolve o texto inteiro, vazando a margem.
  fitFont(ctx, TITLES[data.placement], W - M * 2, 168, 96, (s) => sora(800, s), 4);
  ctx.fillStyle = skin.title;
  ctx.textAlign = 'left';
  ctx.fillText(truncate(ctx, TITLES[data.placement], W - M * 2), M, 334);

  // Nome da dupla
  fitFont(ctx, data.teamName, W - M * 2, 58, 34, (s) => sora(800, s), 2);
  ctx.fillStyle = skin.ink;
  ctx.fillText(truncate(ctx, data.teamName, W - M * 2), M, 424);

  // Fotos sobrepostas + cartel
  const r = 86;
  const cy = 556;
  const cx1 = M + r;
  const cx2 = cx1 + r * 1.5;
  // O segundo desenha por cima: é a sobreposição dos protótipos.
  data.players.forEach((p, i) => {
    const img = p.photo ? (photos.get(p.photo) ?? null) : null;
    drawAvatar(ctx, img, p.initial, i, i === 0 ? cx1 : cx2, cy, r, skin);
  });

  ctx.font = mono(700, 34);
  ctx.fillStyle = skin.mute;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${data.wins}V · ${data.losses}D`, cx2 + r + 44, cy + 2);
  ctx.textBaseline = 'alphabetic';
}
```

- [ ] **Step 4: Escreva o painel, o rodapé e a função exportada**

```ts
function drawRow(ctx: CanvasRenderingContext2D, row: CampaignRow, cy: number, left: number, right: number): void {
  // Selo V/D — quadrado arredondado, o marcador dos protótipos.
  const badgeSize = 46;
  const badgeX = left;
  if (row.kind === 'match') {
    ctx.beginPath();
    ctx.roundRect(badgeX, cy - badgeSize / 2, badgeSize, badgeSize, 13);
    ctx.fillStyle = row.outcome === 'win' ? WIN_GREEN : LOSS_RED;
    ctx.fill();
    ctx.font = sora(800, 24);
    ctx.fillStyle = row.outcome === 'win' ? '#08331f' : '#3a0906';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.outcome === 'win' ? 'V' : 'D', badgeX + badgeSize / 2, cy + 1);
    ctx.textBaseline = 'alphabetic';
  } else {
    ctx.beginPath();
    ctx.roundRect(badgeX, cy - badgeSize / 2, badgeSize, badgeSize, 13);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fill();
  }

  const textLeft = badgeX + badgeSize + 26;
  // A coluna da direita é medida primeiro: é ela que limita a largura do nome do adversário.
  const rightText = row.kind === 'match' ? row.setScore : `${row.wins}V ${row.losses}D`;
  ctx.font = row.kind === 'match' ? mono(800, 46) : mono(700, 32);
  const rightW = ctx.measureText(rightText).width;
  const subText = row.kind === 'match' ? row.partials.join('  ') : `${row.games} jogos`;
  ctx.font = mono(500, 22);
  const subW = ctx.measureText(subText).width;
  const textRight = right - Math.max(rightW, subW) - 30;

  ctx.textAlign = 'left';
  ctx.font = mono(500, 20);
  ctx.fillStyle = DIM;
  tracked(ctx, row.phaseLabel.toUpperCase(), textLeft, cy - 14, 4, 'left');

  ctx.font = sora(700, 32);
  ctx.fillStyle = INK;
  const name = row.kind === 'match' ? row.opponentName : 'Fase de grupos';
  ctx.fillText(truncate(ctx, name, Math.max(120, textRight - textLeft)), textLeft, cy + 26);

  ctx.textAlign = 'right';
  ctx.font = row.kind === 'match' ? mono(800, 46) : mono(700, 32);
  ctx.fillStyle = INK;
  ctx.fillText(rightText, right, cy + 2);
  ctx.font = mono(500, 22);
  ctx.fillStyle = DIM;
  ctx.fillText(subText, right, cy + 34);
  ctx.textAlign = 'left';
}

/** O painel escuro, ancorado no rodapé e crescendo pra cima. Devolve o topo dele — o desenho de
 *  cima não pode invadir esse espaço. */
function drawPanel(ctx: CanvasRenderingContext2D, data: CampaignShareData): number {
  const rows = data.trajectory.rows;
  const pitch = rows.length <= CAMPAIGN_ROWS_COMFORT ? ROW_PITCH_COMFORT : ROW_PITCH_TIGHT;
  const height = PANEL_HEAD_H + rows.length * pitch + PANEL_PAD_BOTTOM;
  const top = PANEL_BOTTOM - height;
  const left = M + PANEL_PAD_X;
  const right = W - M - PANEL_PAD_X;

  ctx.beginPath();
  ctx.roundRect(M, top, W - M * 2, height, 34);
  ctx.fillStyle = 'rgba(13, 13, 13, 0.96)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cabeçalho do painel: total de jogos à esquerda, saldo de sets à direita. O corte, quando
  // existe, é declarado aqui — nunca silencioso.
  const games = data.wins + data.losses;
  const headLeft = data.trajectory.hiddenCount > 0
    ? `TRAJETÓRIA · ${games} JOGOS · +${data.trajectory.hiddenCount} FORA`
    : `TRAJETÓRIA · ${games} JOGOS`;
  ctx.font = mono(700, 24);
  ctx.fillStyle = ORANGE;
  tracked(ctx, headLeft, left, top + 58, 5, 'left');

  const headRight = `SETS ${data.setsWon}–${data.setsLost}`;
  ctx.font = mono(500, 24);
  ctx.fillStyle = DIM;
  const spacing = 5;
  const rightW = ctx.measureText(headRight).width + spacing * ([...headRight].length - 1);
  tracked(ctx, headRight, right - rightW, top + 58, spacing, 'left');

  rows.forEach((row, i) => {
    const cy = top + PANEL_HEAD_H + pitch * i + pitch / 2;
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(left, cy - pitch / 2);
      ctx.lineTo(right, cy - pitch / 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    drawRow(ctx, row, cy, left, right);
  });

  return top;
}

function drawFooter(ctx: CanvasRenderingContext2D, data: CampaignShareData, skin: CampaignSkin): void {
  ctx.beginPath();
  ctx.moveTo(M, 1742);
  ctx.lineTo(W - M, 1742);
  ctx.strokeStyle = hexA('#ffffff', 0.1);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'left';
  fitFont(ctx, data.tournamentName, W - M * 2 - 260, 34, 24, (s) => sora(700, s), 2);
  ctx.fillStyle = skin.ink;
  ctx.fillText(truncate(ctx, data.tournamentName, W - M * 2 - 260), M, 1806);

  const sub = [data.locationName, data.winRateLabel].filter((p): p is string => p != null && p.length > 0).join(' · ');
  if (sub) {
    ctx.font = inter(400, 26);
    ctx.fillStyle = skin.mute;
    ctx.fillText(truncate(ctx, sub, W - M * 2 - 260), M, 1850);
  }

  ctx.font = mono(500, 22);
  ctx.fillStyle = skin.dim;
  const cta = 'BAIXE O APP';
  const spacing = 5;
  const ctaW = ctx.measureText(cta).width + spacing * ([...cta].length - 1);
  tracked(ctx, cta, W - M - ctaW, 1802, spacing, 'left');

  ctx.font = sora(800, 30);
  const siteW = ctx.measureText('nexago.app').width;
  ctx.fillStyle = skin.ink;
  ctx.fillText('nexago.app', W - M - siteW, 1850);
}

/** Desenha o card completo. Assíncrono porque espera fontes e fotos antes do primeiro traço —
 *  depois disso o desenho é síncrono e atômico. */
export async function drawCampaignShareCard(ctx: CanvasRenderingContext2D, data: CampaignShareData): Promise<void> {
  await loadShareFonts([
    sora(800, 168),
    sora(800, 60),
    sora(800, 58),
    sora(700, 34),
    sora(700, 32),
    mono(800, 46),
    mono(700, 34),
    mono(500, 24),
    inter(400, 26),
  ]);

  const urls = [...new Set(data.players.map((p) => p.photo).filter((p): p is string => p != null))];
  const photos = new Map<string, HTMLImageElement | null>();
  const pending = Promise.all(urls.map(async (url) => photos.set(url, await loadImage(url))));
  const logo = await loadImage(LOGO_SRC);
  await pending;

  const skin = SKINS[data.placement];

  ctx.clearRect(0, 0, W, H);
  drawBackdrop(ctx, skin);
  drawHeader(ctx, data, logo, skin);
  drawHero(ctx, data, photos, skin);
  drawPanel(ctx, data);
  drawFooter(ctx, data, skin);
}
```

- [ ] **Step 5: Confirme que compila**

```bash
npx ng build athlete --configuration development
```

Esperado: build sem erro de TypeScript. A conferência visual acontece na Task 6.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/campaign/campaign-share-card.ts \
        frontend/projects/athlete/src/app/tournaments/share-canvas.ts
git commit -m "feat(atleta): arte do card de campanha nas quatro variantes"
```

---

### Task 6: O diálogo

**Files:**
- Create: `tournaments/campaign/campaign-share-dialog.component.ts`
- Create: `tournaments/campaign/campaign-share-dialog.component.html`
- Create: `tournaments/campaign/campaign-share-dialog.component.scss`

**Interfaces:**
- Consumes: `CampaignShareData` (Task 4); `CAMPAIGN_CARD_WIDTH`, `CAMPAIGN_CARD_HEIGHT`, `drawCampaignShareCard` (Task 5); `NxToastService` de `../../shared/feedback`.
- Produces: `export class CampaignShareDialogComponent` com `input.required<CampaignShareData>()` chamado `data` e `output<void>()` chamado `closed`.

Recebe os dados prontos, como o diálogo de inscrição: quem monta é a tela. Isso deixa o diálogo idêntico nas duas entradas e mantém a montagem em função pura.

- [ ] **Step 1: Copie o estilo do diálogo de partida**

```bash
sed 's/msd/csd/g' \
  frontend/projects/athlete/src/app/tournaments/match/match-share-dialog.component.scss \
  > frontend/projects/athlete/src/app/tournaments/campaign/campaign-share-dialog.component.scss
```

O layout do modal (scrim, preview, botões) é idêntico ao de partida — copiar com o prefixo trocado é mais honesto que criar uma terceira variante de um modal que já está resolvido duas vezes.

- [ ] **Step 2: Escreva o template**

Crie `campaign-share-dialog.component.html`:

```html
<div class="csd-scrim" (click)="close()"></div>

<div class="csd" role="dialog" aria-modal="true" aria-labelledby="csd-title">
  <header class="csd-head">
    <div>
      <h2 class="csd-title" id="csd-title">Compartilhar campanha</h2>
      <p class="csd-sub">Sua trajetória no torneio, pronta para os stories.</p>
    </div>
    <button type="button" class="csd-close" (click)="close()" aria-label="Fechar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </header>

  <div class="csd-body">
    <div class="csd-preview">
      <canvas #canvas [width]="canvasWidth" [height]="canvasHeight" role="img" aria-label="Prévia da imagem da campanha"></canvas>
    </div>

    <div class="csd-actions">
      <button type="button" class="csd-btn csd-btn--primary" [disabled]="busy()" (click)="share()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
        {{ canShareFiles() ? 'Compartilhar imagem' : 'Baixar imagem' }}
      </button>

      @if (canShareFiles()) {
        <button type="button" class="csd-btn" [disabled]="busy()" (click)="download()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M5 19h14" /></svg>
          Baixar imagem
        </button>
      }

      <p class="csd-hint">
        @if (canShareFiles()) {
          Compartilhar abre as opções do seu celular — Instagram, WhatsApp e o que mais estiver instalado.
        } @else {
          Neste navegador o compartilhamento direto não está disponível: baixe a imagem e poste pelo seu app.
        }
      </p>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Escreva o componente**

Crie `campaign-share-dialog.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { NxToastService } from '../../shared/feedback';
import { CAMPAIGN_CARD_HEIGHT, CAMPAIGN_CARD_WIDTH, drawCampaignShareCard } from './campaign-share-card';
import type { CampaignShareData } from './campaign-share';

/**
 * Compartilhar a campanha do atleta como imagem.
 *
 * Sem link público: como nos outros cards do portal, o compartilhamento é só a imagem. No celular
 * a Web Share API entrega o arquivo e a folha nativa é quem oferece Instagram Stories, WhatsApp e
 * o resto. No desktop, onde compartilhar arquivo raramente é suportado, sobra o download.
 *
 * Recebe `CampaignShareData` PRONTA — quem monta é a tela (`campaignShareDataOf`). As duas
 * entradas (Trajetória do Focus e aba Minha inscrição) usam este mesmo diálogo sem diferença.
 */
@Component({
  selector: 'app-campaign-share-dialog',
  imports: [],
  templateUrl: './campaign-share-dialog.component.html',
  styleUrl: './campaign-share-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class CampaignShareDialogComponent {
  private readonly toast = inject(NxToastService);

  readonly data = input.required<CampaignShareData>();
  readonly closed = output<void>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly busy = signal(false);
  protected readonly canvasWidth = CAMPAIGN_CARD_WIDTH;
  protected readonly canvasHeight = CAMPAIGN_CARD_HEIGHT;

  /** `navigator.share` com arquivos não existe em boa parte dos desktops — o rótulo do botão
   *  precisa dizer a verdade sobre o que vai acontecer. */
  protected readonly canShareFiles = computed(() => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function');

  constructor() {
    // Encadeado numa fila porque o desenho é assíncrono (fontes + fotos): dois redraws em paralelo
    // intercalariam traços de estados diferentes. Mesmo padrão do diálogo de partida.
    effect(() => {
      const data = this.data();
      this.drawChain = this.drawChain.then(() => this.draw(data)).catch(() => undefined);
    });
  }

  private drawChain: Promise<void> = Promise.resolve();

  private async draw(data: CampaignShareData): Promise<void> {
    const ctx = this.canvasRef().nativeElement.getContext('2d');
    if (!ctx) return;
    await drawCampaignShareCard(ctx, data);
  }

  private async toBlob(): Promise<Blob | null> {
    const canvas = this.canvasRef().nativeElement;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  private fileName(): string {
    const slug = this.data()
      .teamName.toLowerCase()
      .normalize('NFD')
      // Remove os diacríticos decompostos pelo NFD. Escrito com escapes de propósito: o range
      // literal são caracteres combinantes e gruda no caractere anterior do código-fonte.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `nexago-campanha-${slug || 'atleta'}.png`;
  }

  protected async share(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const blob = await this.toBlob();
      if (!blob) {
        this.toast.error('Não foi possível gerar a imagem.');
        return;
      }
      const file = new File([blob], this.fileName(), { type: 'image/png' });
      const data = this.data();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: data.teamName, text: `${data.teamName} — ${data.tournamentName}` });
        this.close();
        return;
      }
      this.saveBlob(blob);
      this.toast.success('Imagem baixada', 'Compartilhe direto do seu app de fotos.');
      this.close();
    } catch (error) {
      // Cancelar a folha nativa dispara AbortError — não é falha, não vira toast de erro.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.toast.error('Não foi possível compartilhar agora.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async download(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const blob = await this.toBlob();
      if (!blob) {
        this.toast.error('Não foi possível gerar a imagem.');
        return;
      }
      this.saveBlob(blob);
      this.toast.success('Imagem baixada', 'Pronta para postar nos stories.');
      this.close();
    } finally {
      this.busy.set(false);
    }
  }

  private saveBlob(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.fileName();
    a.click();
    URL.revokeObjectURL(url);
  }

  protected close(): void {
    this.closed.emit();
  }
}
```

- [ ] **Step 4: Confirme que compila**

```bash
npx ng build athlete --configuration development
```

Esperado: build sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/campaign/
git commit -m "feat(atleta): diálogo de compartilhamento da campanha"
```

---

### Task 7: Entrada na Trajetória do Focus

**Files:**
- Modify: `tournaments/focus/journey/focus-journey.component.ts`
- Modify: `tournaments/focus/journey/focus-journey.component.html`
- Modify: `tournaments/focus/journey/focus-journey.component.scss`

**Interfaces:**
- Consumes: `campaignShareDataOf`, `CampaignShareData` (Task 4); `CampaignShareDialogComponent` (Task 6); o `TournamentLiveStore` já injetado no componente.
- Produces: nada para tasks seguintes.

É o botão que o comentário de abertura do componente registra como "trabalho futuro deliberado" — apague essa ressalva da doc ao entregar.

- [ ] **Step 1: Monte os dados e o portão no componente**

Em `focus-journey.component.ts`, acrescente aos imports:

```ts
import { CampaignShareDialogComponent } from '../../campaign/campaign-share-dialog.component';
import { campaignShareDataOf, type CampaignShareData } from '../../campaign/campaign-share';
```

Acrescente `CampaignShareDialogComponent` ao array `imports` do `@Component`, e ao corpo da classe:

```ts
  protected readonly shareOpen = signal(false);

  /**
   * O card de campanha só é oferecido com pelo menos uma partida ENCERRADA na categoria — antes
   * disso não há campanha nenhuma para contar — e nunca em categoria de EQUIPE (trio+): o
   * desenho tem lugar para dois atletas, e `duoPlayersOf` devolve exatamente dois. Melhor não
   * oferecer do que sair com o elenco pela metade.
   */
  protected readonly canShareCampaign = computed(() => {
    const category = this.store.focusCategory();
    if (!category || category.teamSize != null) return false;
    return (this.campaignData()?.trajectory.rows.length ?? 0) > 0;
  });

  protected readonly campaignData = computed<CampaignShareData | null>(() => {
    const tournament = this.store.tournament();
    const category = this.store.focusCategory();
    const categoryId = this.store.focusCategoryId();
    const teamId = this.store.myTeamIdInFocus();
    if (!tournament || !category || !categoryId || !teamId) return null;
    return campaignShareDataOf({
      matches: this.store.matches(),
      categoryId,
      myTeamIds: this.store.myTeamIds(),
      duoNameOf: (id, fallback) => this.store.duoNameOf(id, fallback),
      teamName: this.store.duoNameOf(teamId),
      players: this.store.duoPlayersOf(teamId),
      categoryName: category.categoryName,
      teamSize: category.teamSize,
      tournamentName: tournament.name,
      locationName: tournament.location || null,
      startAt: tournament.startAt,
      endAt: tournament.endAt,
    });
  });
```

Acrescente `signal` ao `import` de `@angular/core` (o arquivo já importa `computed` e `inject`).

- [ ] **Step 2: Ponha o botão no template**

Em `focus-journey.component.html`, dentro da `<section class="jr-card">` de "Caminho até a final", troque o `<h2>` solto pelo cabeçalho com ação:

```html
    <header class="jr-card__head">
      <h2 class="jr-card__title">Caminho até a final</h2>
      @if (canShareCampaign()) {
        <button type="button" class="jr-share" (click)="shareOpen.set(true)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
          Compartilhar campanha
        </button>
      }
    </header>
```

E, no fim do arquivo, antes do `</div>` que fecha `.jr`:

```html
  @if (shareOpen() && campaignData(); as data) {
    <app-campaign-share-dialog [data]="data" (closed)="shareOpen.set(false)" />
  }
```

- [ ] **Step 3: Dê estilo ao cabeçalho e ao botão**

Em `focus-journey.component.scss`, ao lado das regras de `.jr-card__title`:

```scss
.jr-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.jr-share {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid rgb(255 255 255 / 0.14);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.04);
  color: var(--nx-text, #f4f4f5);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: rgb(255 255 255 / 0.08);
  }
}
```

- [ ] **Step 4: Limpe a ressalva na doc do componente**

Na doc de abertura de `FocusJourneyComponent`, o trecho `e botão de compartilhar (trabalho futuro deliberado)` deixou de ser verdade. Remova só ele da lista de "fora do escopo" — o resto da lista continua valendo.

- [ ] **Step 5: Verifique no navegador**

Suba o preview e abra a Trajetória de um torneio em que o atleta tenha partida encerrada. Confira nas quatro variantes que o título, o painel e o rodapé batem com os protótipos, e que campanha longa colapsa o grupo.

```bash
npx ng serve athlete
```

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/focus/journey/
git commit -m "feat(atleta): compartilhar campanha na Trajetória do Focus"
```

---

### Task 8: Entrada na aba Minha inscrição

**Files:**
- Modify: `tournaments/tabs/registration-tab.component.ts`
- Modify: `tournaments/tabs/registration-tab.component.html`

**Interfaces:**
- Consumes: `campaignShareDataOf`, `CampaignShareData` (Task 4); `CampaignShareDialogComponent` (Task 6); `RegistrationCard` do próprio arquivo.
- Produces: nada.

Esta é a entrada que sobrevive ao fim do torneio: o link para o Focus só aparece enquanto `hasMyMatchToday()` for verdadeiro, e é justamente no dia seguinte que o atleta quer postar.

- [ ] **Step 1: Acrescente o campo ao `RegistrationCard`**

Em `registration-tab.component.ts`, na interface `RegistrationCard`, ao lado de `canShare`:

```ts
  /** A campanha desta categoria pode virar imagem: há partida encerrada e não é categoria de
   *  equipe. Diferente de `canShare`, que é do card de INSCRIÇÃO. */
  canShareCampaign: boolean;
```

Em `cardOf`, no objeto devolvido, ao lado de `canShare: registrationShareable(r)`:

```ts
      canShareCampaign: !isTeam && this.campaignDataOf(r.categoryId, r.teamId) != null,
```

- [ ] **Step 2: Monte os dados por categoria**

Acrescente aos imports:

```ts
import { CampaignShareDialogComponent } from '../campaign/campaign-share-dialog.component';
import { campaignShareDataOf, type CampaignShareData } from '../campaign/campaign-share';
```

Acrescente `CampaignShareDialogComponent` ao array `imports` do `@Component`, e ao corpo da classe:

```ts
  protected readonly campaignTargetId = signal<string | null>(null);

  /** Os dados do card da categoria, ou `null` quando não há campanha para contar (nenhuma
   *  partida encerrada) ou falta o time da inscrição. */
  private campaignDataOf(categoryId: string, teamId: string | null): CampaignShareData | null {
    const tournament = this.store.tournament();
    const category = tournament?.categories.find((c) => c.id === categoryId) ?? null;
    if (!tournament || !category || !teamId) return null;
    const data = campaignShareDataOf({
      matches: this.store.matches(),
      categoryId,
      myTeamIds: this.store.myTeamIds(),
      duoNameOf: (id, fallback) => this.store.duoNameOf(id, fallback),
      teamName: this.store.duoNameOf(teamId),
      players: this.store.duoPlayersOf(teamId),
      categoryName: category.categoryName,
      teamSize: category.teamSize,
      tournamentName: tournament.name,
      locationName: tournament.location || null,
      startAt: tournament.startAt,
      endAt: tournament.endAt,
    });
    return data.trajectory.rows.length > 0 ? data : null;
  }

  protected readonly campaignData = computed<CampaignShareData | null>(() => {
    const id = this.campaignTargetId();
    if (!id) return null;
    const registration = this.store.myRegistrations().find((r) => r.id === id);
    return registration ? this.campaignDataOf(registration.categoryId, registration.teamId) : null;
  });

  protected openCampaignShare(card: RegistrationCard): void {
    this.campaignTargetId.set(card.id);
  }

  protected closeCampaignShare(): void {
    this.campaignTargetId.set(null);
  }
```

- [ ] **Step 3: Ponha o CTA no template**

Em `registration-tab.component.html`, logo depois do bloco `@if (card.canShare) { … }`:

```html
      @if (card.canShareCampaign) {
        <button type="button" class="reg-cta reg-cta--share" (click)="openCampaignShare(card)">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          Compartilhar campanha
        </button>
      }
```

E, ao lado do `@if (shareData(); as share) { … }` do fim do arquivo:

```html
  @if (campaignData(); as campaign) {
    <app-campaign-share-dialog [data]="campaign" (closed)="closeCampaignShare()" />
  }
```

- [ ] **Step 4: Verifique no navegador**

Com o preview de pé, abra `/torneios/:id/minha-inscricao` de um torneio já encerrado. O CTA precisa aparecer, e a categoria de equipe (trio+) precisa NÃO mostrá-lo.

- [ ] **Step 5: Rode a suíte inteira do portal**

```bash
npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASS. Nenhum spec existente deveria ter sido tocado por estas mudanças.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/tabs/
git commit -m "feat(atleta): compartilhar campanha na aba Minha inscrição"
```
