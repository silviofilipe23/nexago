# Avaliação do torneio — Fase 5 (backoffice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin do backoffice acompanha as avaliações dos torneios numa tela "Avaliações de torneios", só de leitura:
- **Lista:** cada torneio com data, organizador, média, número de avaliações, taxa de resposta e janela. Ordena por mais recentes ou por pior média.
- **Detalhe:** cada avaliação do torneio, com o nome do atleta, a data, a nota, os aspectos e o comentário.

**Architecture:** Tudo aqui só lê dados:
- **Resumos:** `tournamentReviewSummaries`, públicos.
- **Avaliações privadas:** `tournamentReviews where tournamentId == tid`. A rule só libera para `admin`/`superAdmin`; é ela, e não o guard do cliente, quem protege os nomes.
- **Nomes:** `public_profiles`, lidos em lotes `documentId() in` de 30, em paralelo.

Sobre a leitura:
- **Uma leitura por abertura.** O backoffice não usa `onSnapshot` em lugar nenhum; há um botão "Atualizar".
- **Ordenação no cliente.** O conjunto de resumos é pequeno, e as duas ordens não justificam índice.

As regras puras (parse, formatação, ordenação, linhas) ficam num módulo testável. As leituras ficam numa classe `@Injectable` que os specs trocam por um falso.

**Tech Stack:** Angular 20 zoneless (signals, `input()`, `withComponentInputBinding`), firebase 12 web SDK, Karma + Jasmine.

**Spec:** `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md`:
- seção 4, "Backoffice";
- seção 1, docs `tournamentReviews` (privado) e `tournamentReviewSummaries`.

## Global Constraints

**Branch**
- `claude/tournament-reviews-fase-5` sai da `origin/main`, onde as fases 1–4 já estão mergeadas.
- O PR vai contra a `main`.

**Worktree**
- Edite sempre `<worktree> + <caminho relativo do repo>`.
- Antes de cada commit, rode `pwd && git branch --show-current` e confira a branch.
- Depois da primeira edição, rode `git -C /Users/silviodionizio/Documents/projects/volley/nexago status --short`. O checkout principal tem que continuar limpo.

**Frontend no worktree**
- `frontend/node_modules` é symlink para o checkout principal. Se sumir: `ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules <worktree>/frontend/node_modules`.
- Rode sempre com `cd <worktree>/frontend && …` no mesmo comando.
- Se a contagem de specs não subir depois de um spec novo, você está testando a árvore errada.

**Subagentes:** não use `haiku`. O piso é `sonnet`.

**Angular (backoffice)**
- **Zoneless:** spec de componente precisa de `provideZonelessChangeDetection()`, senão dá NG0908. Precisa também de `provideRouter([])` quando há `routerLink`.
- **`<bo-panel-shell>`** lê `AuthService.displayName()` e `AuthService.user()`. Nos specs, use o stub `{ displayName: signal(null), user: signal(null) }`. O `AuthService` real inicia o Firebase Auth no construtor.
- **Orçamento de CSS por componente:** 8 kB de aviso, 12 kB de erro. Os dois componentes novos usam as classes globais (`bo-detail-header`, `bo-filter-bar`, `bo-chip`, `bo-alert`, `bo-mini-btn`) e pouco CSS próprio.
- **Tabela:** uma grade só, com `grid-template-columns` igual no cabeçalho e nas linhas, como em `panel-torneios`.
- **Coluna sem fonte:** mostra `—`. Nunca invente número (memória `backoffice-real-data-screens`).

**Sem deploy** nem escrita em projeto Firebase.

**Textos exatos**

| Onde | Texto |
|---|---|
| menu lateral | `Avaliações`, com o ícone `star` |
| título da lista | `Avaliações de torneios` |
| ordenação | chips `Mais recentes` / `Pior média` |
| colunas da lista | `Torneio` (nome, com o organizador embaixo), `Data`, `Média`, `Avaliações`, `Resposta`, `Janela` |
| média | uma casa com vírgula (`4,6`); `—` com menos de 3 avaliações (o servidor grava `null`) |
| resposta | `{count} de {eligibleCount}`; `—` quando `eligibleCount` é 0 |
| janela | `Aberta até {dd/MM}` (pill verde) ou `Encerrada` (pill cinza) |
| datas | `dd/MM/yyyy` e `dd/MM/yyyy HH:mm`, no fuso de São Paulo |
| torneio sem nome | `Torneio sem nome` |
| pessoa sem nome em `public_profiles` | `Sem nome (…{6 últimos caracteres do uid})` |
| legenda de "Pior média" | `Pior média ordena só os torneios com 3 ou mais avaliações; os outros vêm depois, do mais recente ao mais antigo.` |
| lista vazia | `Nenhum torneio passou pela avaliação dos atletas ainda.` |
| detalhe: cabeçalho | título com o nome do torneio; subtítulo `Organizado por {nome} · {dd/MM/yyyy}` |
| detalhe: KPIs | `Média`, `Avaliações`, `Resposta`, `Janela` |
| detalhe: card | kicker `coleção tournamentReviews`, título `Avaliações dos atletas` |
| detalhe: data da avaliação | `Enviada em {dd/MM/yyyy HH:mm}`; se editada (`updatedAt` mais de 1 min depois de `createdAt`), acrescenta ` · editada em {dd/MM/yyyy HH:mm}` |
| detalhe: sem comentário | `Sem comentário.` |
| detalhe: vazio | `Nenhum atleta avaliou este torneio ainda.` |
| detalhe: não encontrado | `Este torneio não tem resumo de avaliação.` com o link `Voltar para Avaliações` |
| aspectos, nesta ordem | `organization` Organização geral, `schedule` Cumprimento dos horários, `refereeing` Arbitragem / mesa, `venue` Estrutura do local, `prizes` Premiação e kit |
| sem permissão | `Sem permissão para ler as avaliações. A tela precisa do papel admin.` |

**Regras**
- **Nome:** `fullName`, `name`, depois `nickname` (sem `@`), lidos de `public_profiles`. O admin precisa de identidade, não de apelido. `public_profiles` também não depende do claim `admin`.
- **Ordem "Mais recentes":** por `tournamentStartAt` (ou `opensAt`, quando não há data de início), do mais novo para o mais antigo. Sem data nenhuma, o torneio vai para o fim.
- **Ordem "Pior média":**
  - torneios com média pública (`count >= 3` e `average` presente) primeiro, da menor média para a maior;
  - no empate de média, o que tem mais avaliações vem antes;
  - os demais vêm depois, na ordem "Mais recentes".
- **Janela aberta** = `status == 'open'` **e** `closesAt > agora`.
- **Avaliações no detalhe:** da mais nova para a mais antiga, por `createdAt`.
- **Falhas:**
  - os nomes enriquecem a tela; se a leitura deles falhar, a tela fica com os uids encurtados;
  - falha nos resumos ou nas avaliações mostra o erro e o botão `Tentar de novo`.
- **Troca de id no detalhe:** uma resposta que chega depois de trocar de torneio é descartada.

**Rotas** (planas, com `canActivate: [authGuard]`, como as vizinhas)
- `painel/avaliacoes` → `PanelAvaliacoesComponent`;
- `painel/avaliacoes/:id` → `AvaliacaoTorneioComponent`, com `id` vindo de `input.required<string>()`.

## Review Focus

1. **Torneio com menos de 3 avaliações** (média `null`).
   - Média `—`, nunca `0,0`.
   - Em "Pior média", vai para depois dos que têm nota.
   
   Testes: 1 e 2.
2. **Resumo com `eligibleCount == 0`** (nasce `closed`). Resposta `—`, nunca `0 de 0`. Testes: 1 e 2.
3. **Atleta ou organizador sem nome em `public_profiles`, ou leitura de nomes que falha.** Nunca célula em branco, sempre `Sem nome (…uid)`, e a tela não vira erro. Testes: 1, 2 e 3.
4. **Avaliação sem comentário e sem aspectos.** O card mostra estrelas e `Sem comentário.`, sem bloco vazio. Testes: 1 e 3.
5. **Trocar de torneio no detalhe enquanto a leitura anterior não voltou.** A tela não pode mostrar as avaliações do torneio anterior. Teste: 3.

---

## Mapa de arquivos (`frontend/projects/backoffice/src/app/`)

| Arquivo | Responsabilidade |
|---|---|
| `painel/avaliacoes/data/tournament-reviews.ts` (criar) | regras puras: aspectos, parse, nomes, datas, rótulos, ordenação, linhas da lista e do detalhe, lotes de ids, mensagem de erro |
| `painel/avaliacoes/data/tournament-reviews.spec.ts` (criar) | specs das regras |
| `painel/avaliacoes/data/tournament-reviews.repository.ts` (criar) | `TournamentReviewsAdminRepository`: leituras com `getDocs`/`getDoc` |
| `painel/avaliacoes/panel-avaliacoes.component.ts` (criar) e `.spec.ts` | lista |
| `painel/avaliacoes/avaliacao-torneio.component.ts` (criar) e `.spec.ts` | detalhe |
| `app.routes.ts` (modificar) | duas rotas, depois de `painel/torneios` |
| `painel/ui/panel-shell.component.ts` (modificar) | item do menu e casamento de rota |
| `painel/ui/icon.component.ts` (modificar) | ícone `star` |

**Comandos** (`<worktree>` = `/Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422`)
- **Um spec:** `cd <worktree>/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='projects/backoffice/src/app/<caminho>.spec.ts'`
- **Suíte:** `cd <worktree>/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless`
- **Build:** `cd <worktree>/frontend && npx ng build backoffice --configuration production`. O "Output location" tem que conter `worktrees/`.

---

### Task 1: Regras puras e repositório

**Files:**
- Create: `frontend/projects/backoffice/src/app/painel/avaliacoes/data/tournament-reviews.ts`
- Test: `frontend/projects/backoffice/src/app/painel/avaliacoes/data/tournament-reviews.spec.ts`
- Create: `frontend/projects/backoffice/src/app/painel/avaliacoes/data/tournament-reviews.repository.ts`

**Interfaces:**
- Produces (em `tournament-reviews.ts`):
  - Constantes: `MIN_PUBLIC_REVIEWS = 3`, `TOURNAMENT_REVIEW_ASPECTS`.
  - Tipos: `ReviewAspectKey`, `StarValue`, `ReviewSummary`, `AdminReview`, `SummarySort = 'recent' | 'worst'`, `SummaryRow`, `AdminReviewRow`.
  - Parse: `summaryFromData(id, data)`, `adminReviewFromData(id, data)`, `profileNameFromData(data)`.
  - Nomes e datas: `fallbackName(uid)`, `formatRating(n)`, `reviewDate(d)`, `reviewDateTime(d)`.
  - Rótulos: `responseRateLabel(s)`, `isReviewWindowOpen(s, now)`, `reviewWindowLabel(s, now)`, `starsText(n)`.
  - Ordenação e linhas: `sortSummaries(list, mode)`, `summaryRows(list, names, now)`, `adminReviewRows(reviews, names)`.
  - Utilitários: `chunkIds(ids, size?)`, `reviewsErrorMessage(err)`.
- Produces (em `tournament-reviews.repository.ts`): `TournamentReviewsAdminRepository`, com os métodos
  - `listSummaries(): Promise<ReviewSummary[]>`;
  - `getSummary(tournamentId): Promise<ReviewSummary | null>`;
  - `listReviews(tournamentId): Promise<AdminReview[]>`;
  - `profileNames(uids): Promise<Map<string, string>>`.

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/backoffice/src/app/painel/avaliacoes/data/tournament-reviews.spec.ts`:

```ts
import {
  TOURNAMENT_REVIEW_ASPECTS,
  adminReviewFromData,
  adminReviewRows,
  chunkIds,
  fallbackName,
  formatRating,
  profileNameFromData,
  responseRateLabel,
  reviewWindowLabel,
  reviewsErrorMessage,
  sortSummaries,
  summaryFromData,
  summaryRows,
  type AdminReview,
  type ReviewSummary,
} from './tournament-reviews';

const ts = (d: Date) => ({ toDate: () => d });
const NOW = new Date('2026-10-06T15:00:00Z');

function summary(over: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    organizerId: 'organizer-uid-123456',
    tournamentStartAt: new Date('2026-09-26T12:00:00Z'),
    opensAt: null,
    closesAt: new Date('2026-10-15T13:00:00Z'),
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    ...over,
  };
}

function review(over: Partial<AdminReview> = {}): AdminReview {
  return {
    id: 't1_athlete-uid-000001',
    uid: 'athlete-uid-000001',
    overall: 4,
    aspects: {},
    comment: null,
    createdAt: new Date('2026-10-02T13:00:00Z'),
    updatedAt: new Date('2026-10-02T13:00:00Z'),
    ...over,
  };
}

describe('tournament-reviews (backoffice)', () => {
  it('aspectos na mesma ordem e com os mesmos rótulos de functions/src/tournament-review-constants.ts', () => {
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key)).toEqual(['organization', 'schedule', 'refereeing', 'venue', 'prizes']);
    expect(TOURNAMENT_REVIEW_ASPECTS.map((a) => a.label)).toEqual([
      'Organização geral',
      'Cumprimento dos horários',
      'Arbitragem / mesa',
      'Estrutura do local',
      'Premiação e kit',
    ]);
  });

  it('summaryFromData lê o resumo do servidor, inclusive o organizador; doc ausente vira null', () => {
    const s = summaryFromData('t1', {
      tournamentId: 't1',
      organizerId: ' organizer-uid-123456 ',
      tournamentName: ' Copa Aurora ',
      tournamentStartAt: ts(new Date('2026-09-26T12:00:00Z')),
      opensAt: ts(new Date('2026-09-28T13:00:00Z')),
      closesAt: ts(new Date('2026-10-12T13:00:00Z')),
      status: 'open',
      eligibleCount: 42,
      count: 2,
      average: null,
    })!;
    expect(s.organizerId).toBe('organizer-uid-123456');
    expect(s.tournamentName).toBe('Copa Aurora');
    expect(s.count).toBe(2);
    expect(s.average).toBeNull();
    expect(s.opensAt).toEqual(new Date('2026-09-28T13:00:00Z'));
    expect(summaryFromData('t1', undefined)).toBeNull();
  });

  it('adminReviewFromData exige uid e nota geral válida; comentário vazio vira null; aspecto desconhecido some', () => {
    const r = adminReviewFromData('t1_u1', {
      tournamentId: 't1',
      uid: 'u1',
      overall: 2,
      aspects: { schedule: 1, bogus: 3, venue: 9 },
      comment: '   ',
      createdAt: ts(new Date('2026-10-02T13:00:00Z')),
      updatedAt: ts(new Date('2026-10-03T12:30:00Z')),
    })!;
    expect(r.uid).toBe('u1');
    expect(r.overall).toBe(2);
    expect(r.aspects).toEqual({ schedule: 1 });
    expect(r.comment).toBeNull();
    expect(adminReviewFromData('x', { overall: 4 })).toBeNull();
    expect(adminReviewFromData('x', { uid: 'u1', overall: 0 })).toBeNull();
  });

  it('nome: nome completo, nome, apelido sem @; sem nada, uid encurtado', () => {
    expect(profileNameFromData({ fullName: ' Ana Paula Souza ', nickname: '@ana' })).toBe('Ana Paula Souza');
    expect(profileNameFromData({ name: 'Ana', nickname: '@ana' })).toBe('Ana');
    expect(profileNameFromData({ nickname: '@ana' })).toBe('ana');
    expect(profileNameFromData({})).toBeNull();
    expect(fallbackName('athlete-uid-000001')).toBe('Sem nome (…000001)');
  });

  it('média com vírgula; resposta sem "0 de 0"; janela pelo prazo, não só pelo status', () => {
    expect(formatRating(4.62)).toBe('4,6');
    expect(responseRateLabel(summary())).toBe('23 de 42');
    expect(responseRateLabel(summary({ count: 0, eligibleCount: 0 }))).toBe('—');
    expect(reviewWindowLabel(summary(), NOW)).toBe('Aberta até 15/10');
    expect(reviewWindowLabel(summary({ closesAt: new Date(NOW.getTime() - 60_000) }), NOW)).toBe('Encerrada');
    expect(reviewWindowLabel(summary({ status: 'closed' }), NOW)).toBe('Encerrada');
  });

  it('mais recentes: pela data de início, ou pela abertura da janela; sem data vai para o fim', () => {
    const list = [
      summary({ tournamentId: 'antigo', tournamentStartAt: new Date('2026-08-01T12:00:00Z') }),
      summary({ tournamentId: 'sem-data', tournamentStartAt: null, opensAt: null }),
      summary({ tournamentId: 'novo', tournamentStartAt: new Date('2026-09-30T12:00:00Z') }),
      summary({ tournamentId: 'so-abertura', tournamentStartAt: null, opensAt: new Date('2026-09-10T13:00:00Z') }),
      summary({ tournamentId: 'sem-data-2', tournamentStartAt: null, opensAt: null }),
    ];
    expect(sortSummaries(list, 'recent').map((s) => s.tournamentId)).toEqual(['novo', 'so-abertura', 'antigo', 'sem-data', 'sem-data-2']);
  });

  it('pior média: só quem tem nota pública na frente, da menor para a maior; empate, mais avaliações antes', () => {
    const list = [
      summary({ tournamentId: 'bom', average: 4.6, count: 23 }),
      summary({ tournamentId: 'ruim-poucas', average: 3.1, count: 10 }),
      summary({ tournamentId: 'sem-nota', average: null, count: 2, tournamentStartAt: new Date('2026-09-30T12:00:00Z') }),
      summary({ tournamentId: 'ruim-muitas', average: 3.1, count: 30 }),
    ];
    expect(sortSummaries(list, 'worst').map((s) => s.tournamentId)).toEqual(['ruim-muitas', 'ruim-poucas', 'bom', 'sem-nota']);
  });

  it('summaryRows monta as células, com — onde não há número e nome de reserva', () => {
    const [row, semNota] = summaryRows(
      [summary(), summary({ tournamentId: 't2', tournamentName: '', organizerId: 'other-org-999999', count: 2, average: null, eligibleCount: 0, status: 'closed' })],
      new Map([['organizer-uid-123456', 'Arena Garden Eventos']]),
      NOW,
    );
    expect(row).toEqual({
      id: 't1',
      name: 'Copa Aurora',
      organizer: 'Arena Garden Eventos',
      date: '26/09/2026',
      average: '4,6',
      reviews: '23',
      response: '23 de 42',
      windowLabel: 'Aberta até 15/10',
      windowOpen: true,
    });
    expect(semNota.name).toBe('Torneio sem nome');
    expect(semNota.organizer).toBe('Sem nome (…999999)');
    expect(semNota.average).toBe('—');
    expect(semNota.response).toBe('—');
    expect(semNota.windowLabel).toBe('Encerrada');
    expect(semNota.windowOpen).toBeFalse();
  });

  it('adminReviewRows: mais nova primeiro, nome do atleta, estrelas, aspectos e marca de edição', () => {
    const rows = adminReviewRows(
      [
        review(),
        review({
          id: 't1_athlete-uid-000002',
          uid: 'athlete-uid-000002',
          overall: 2,
          aspects: { prizes: 1, organization: 3 },
          comment: 'Premiação não foi entregue.',
          createdAt: new Date('2026-10-03T12:00:00Z'),
          updatedAt: new Date('2026-10-04T12:30:00Z'),
        }),
      ],
      new Map([['athlete-uid-000002', 'Bruna Lima']]),
    );
    expect(rows.map((r) => r.athlete)).toEqual(['Bruna Lima', 'Sem nome (…000001)']);
    expect(rows[0]).toEqual({
      id: 't1_athlete-uid-000002',
      athlete: 'Bruna Lima',
      overall: 2,
      stars: '★★☆☆☆',
      aspects: ['Organização geral 3★', 'Premiação e kit 1★'],
      comment: 'Premiação não foi entregue.',
      sentAt: 'Enviada em 03/10/2026 09:00 · editada em 04/10/2026 09:30',
    });
    expect(rows[1].sentAt).toBe('Enviada em 02/10/2026 10:00');
    expect(rows[1].aspects).toEqual([]);
    expect(rows[1].comment).toBeNull();
  });

  it('chunkIds: sem repetidos nem vazios, em lotes de 30', () => {
    const ids = Array.from({ length: 61 }, (_, i) => `u${i}`);
    expect(chunkIds([...ids, 'u0', '', ' ']).map((c) => c.length)).toEqual([30, 30, 1]);
  });

  it('mensagem de erro: sem permissão explica o papel admin', () => {
    expect(reviewsErrorMessage({ code: 'permission-denied' })).toBe('Sem permissão para ler as avaliações. A tela precisa do papel admin.');
    expect(reviewsErrorMessage(new Error('offline'))).toBe('offline');
    expect(reviewsErrorMessage('x')).toBe('Falha ao ler as avaliações.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='projects/backoffice/src/app/painel/avaliacoes/data/tournament-reviews.spec.ts'`

Expected: erro de compilação, `Cannot find module './tournament-reviews'`.

- [ ] **Step 3: Implementar as regras puras**

`frontend/projects/backoffice/src/app/painel/avaliacoes/data/tournament-reviews.ts`:

```ts
/**
 * Avaliação do torneio pelos atletas — leitura do backoffice (spec §4 "Backoffice"). Regras puras:
 * as leituras moram em `tournament-reviews.repository.ts`. Diferente do painel do organizador,
 * aqui o admin vê cada avaliação com o nome do atleta (`tournamentReviews` é liberado só a
 * `admin`/`superAdmin` pela rule).
 */

/** Abaixo disso o servidor grava `average: null` (e o organizador não vê comentários). */
export const MIN_PUBLIC_REVIEWS = 3;

/** MESMA lista e ordem de `functions/src/tournament-review-constants.ts`. */
export const TOURNAMENT_REVIEW_ASPECTS = [
  { key: 'organization', label: 'Organização geral' },
  { key: 'schedule', label: 'Cumprimento dos horários' },
  { key: 'refereeing', label: 'Arbitragem / mesa' },
  { key: 'venue', label: 'Estrutura do local' },
  { key: 'prizes', label: 'Premiação e kit' },
] as const;

export type ReviewAspectKey = (typeof TOURNAMENT_REVIEW_ASPECTS)[number]['key'];
export type StarValue = 1 | 2 | 3 | 4 | 5;
export type SummarySort = 'recent' | 'worst';

/** `tournamentReviewSummaries/{tournamentId}`, só o que o backoffice usa. */
export interface ReviewSummary {
  tournamentId: string;
  tournamentName: string;
  organizerId: string;
  tournamentStartAt: Date | null;
  opensAt: Date | null;
  closesAt: Date | null;
  status: 'open' | 'closed';
  eligibleCount: number;
  count: number;
  average: number | null;
}

/** `tournamentReviews/{tournamentId}_{uid}` — o doc privado, com o autor. */
export interface AdminReview {
  id: string;
  uid: string;
  overall: StarValue;
  aspects: Partial<Record<ReviewAspectKey, StarValue>>;
  comment: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface SummaryRow {
  id: string;
  name: string;
  organizer: string;
  date: string;
  average: string;
  reviews: string;
  response: string;
  windowLabel: string;
  windowOpen: boolean;
}

export interface AdminReviewRow {
  id: string;
  athlete: string;
  overall: StarValue;
  stars: string;
  aspects: string[];
  comment: string | null;
  sentAt: string;
}

type Data = Record<string, unknown> | undefined;

const ASPECT_KEYS: readonly string[] = TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key);
const EDIT_THRESHOLD_MS = 60_000;
const IN_QUERY_LIMIT = 30;

const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function decimal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function star(value: unknown): StarValue | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: unknown } | null;
  return maybe && typeof maybe.toDate === 'function' ? (maybe as { toDate(): Date }).toDate() : null;
}

export function summaryFromData(id: string, data: Data): ReviewSummary | null {
  if (!data) return null;
  return {
    tournamentId: text(data['tournamentId']) || id,
    tournamentName: text(data['tournamentName']),
    organizerId: text(data['organizerId']),
    tournamentStartAt: dateOf(data['tournamentStartAt']),
    opensAt: dateOf(data['opensAt']),
    closesAt: dateOf(data['closesAt']),
    status: data['status'] === 'open' ? 'open' : 'closed',
    eligibleCount: count(data['eligibleCount']),
    count: count(data['count']),
    average: decimal(data['average']),
  };
}

export function adminReviewFromData(id: string, data: Data): AdminReview | null {
  const uid = text(data?.['uid']);
  const overall = star(data?.['overall']);
  if (!data || !uid || overall == null) return null;
  const aspects: AdminReview['aspects'] = {};
  const raw = data['aspects'];
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const stars = star(value);
      if (ASPECT_KEYS.includes(key) && stars != null) aspects[key as ReviewAspectKey] = stars;
    }
  }
  const comment = text(data['comment']);
  return {
    id,
    uid,
    overall,
    aspects,
    comment: comment || null,
    createdAt: dateOf(data['createdAt']),
    updatedAt: dateOf(data['updatedAt']),
  };
}

/** Nome em `public_profiles/{uid}`: o admin precisa de identidade, então nome completo antes do apelido. */
export function profileNameFromData(data: Data): string | null {
  if (!data) return null;
  return text(data['fullName']) || text(data['name']) || text(data['nickname']).replace(/^@/, '') || null;
}

/** Nunca célula em branco: o uid encurtado deixa o admin achar a pessoa. */
export function fallbackName(uid: string): string {
  return `Sem nome (…${uid.slice(-6)})`;
}

/** Uma casa, vírgula — a mesma regra do app e dos portais. */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function reviewDate(date: Date | null): string {
  return date ? DATE.format(date) : '—';
}

export function reviewDateTime(date: Date | null): string {
  return date ? `${DATE.format(date)} ${TIME.format(date)}` : '—';
}

/** "23 de 42"; sem atletas aptos não há taxa — `—`, nunca "0 de 0". */
export function responseRateLabel(s: ReviewSummary): string {
  return s.eligibleCount === 0 ? '—' : `${s.count} de ${s.eligibleCount}`;
}

/** `status` sozinho não basta: o job que fecha pode atrasar. */
export function isReviewWindowOpen(s: ReviewSummary, now: Date): boolean {
  return s.status === 'open' && s.closesAt != null && s.closesAt.getTime() > now.getTime();
}

export function reviewWindowLabel(s: ReviewSummary, now: Date): string {
  return isReviewWindowOpen(s, now) ? `Aberta até ${DAY_MONTH.format(s.closesAt!)}` : 'Encerrada';
}

export function starsText(n: StarValue): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function hasPublicAverage(s: ReviewSummary): boolean {
  return s.count >= MIN_PUBLIC_REVIEWS && s.average != null;
}

function whenOf(s: ReviewSummary): number {
  return (s.tournamentStartAt ?? s.opensAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

/** Comparação explícita: dois torneios sem data dariam `-Infinity - -Infinity = NaN`. */
function byRecent(a: ReviewSummary, b: ReviewSummary): number {
  const wa = whenOf(a);
  const wb = whenOf(b);
  return wa === wb ? 0 : wb > wa ? 1 : -1;
}

export function sortSummaries(list: readonly ReviewSummary[], mode: SummarySort): ReviewSummary[] {
  if (mode === 'recent') return [...list].sort(byRecent);
  const rated = list.filter(hasPublicAverage).sort((a, b) => a.average! - b.average! || b.count - a.count);
  const rest = list.filter((s) => !hasPublicAverage(s)).sort(byRecent);
  return [...rated, ...rest];
}

/** Mantém a ordem recebida (a ordenação é decisão de quem chama). */
export function summaryRows(list: readonly ReviewSummary[], names: ReadonlyMap<string, string>, now: Date): SummaryRow[] {
  return list.map((s) => ({
    id: s.tournamentId,
    name: s.tournamentName || 'Torneio sem nome',
    organizer: names.get(s.organizerId) ?? fallbackName(s.organizerId),
    date: reviewDate(s.tournamentStartAt ?? s.opensAt),
    average: hasPublicAverage(s) ? formatRating(s.average!) : '—',
    reviews: String(s.count),
    response: responseRateLabel(s),
    windowLabel: reviewWindowLabel(s, now),
    windowOpen: isReviewWindowOpen(s, now),
  }));
}

function sentLabel(r: AdminReview): string {
  const sent = `Enviada em ${reviewDateTime(r.createdAt)}`;
  const edited =
    r.createdAt != null && r.updatedAt != null && r.updatedAt.getTime() - r.createdAt.getTime() > EDIT_THRESHOLD_MS;
  return edited ? `${sent} · editada em ${reviewDateTime(r.updatedAt)}` : sent;
}

/** Da mais nova para a mais antiga, com o nome do atleta (ou o uid encurtado). */
export function adminReviewRows(reviews: readonly AdminReview[], names: ReadonlyMap<string, string>): AdminReviewRow[] {
  return [...reviews]
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .map((r) => ({
      id: r.id,
      athlete: names.get(r.uid) ?? fallbackName(r.uid),
      overall: r.overall,
      stars: starsText(r.overall),
      aspects: TOURNAMENT_REVIEW_ASPECTS.flatMap((a) => {
        const value = r.aspects[a.key];
        return value ? [`${a.label} ${value}★`] : [];
      }),
      comment: r.comment,
      sentAt: sentLabel(r),
    }));
}

/** Lotes para `documentId() in` (até 30 por consulta), sem repetidos nem vazios. */
export function chunkIds(ids: readonly string[], size = IN_QUERY_LIMIT): string[][] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

export function reviewsErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code.includes('permission-denied')) {
    return 'Sem permissão para ler as avaliações. A tela precisa do papel admin.';
  }
  return err instanceof Error ? err.message : 'Falha ao ler as avaliações.';
}
```

- [ ] **Step 4: Repositório**

O repositório não tem spec próprio: são leituras sem lógica, e `chunkIds` está coberto. A Task 2 e a Task 3 trocam a classe por um falso; o build de produção (F) compila tudo.

`frontend/projects/backoffice/src/app/painel/avaliacoes/data/tournament-reviews.repository.ts`:

```ts
import { Injectable } from '@angular/core';
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { backofficeDb } from '../../data/firebase';
import {
  adminReviewFromData,
  chunkIds,
  profileNameFromData,
  summaryFromData,
  type AdminReview,
  type ReviewSummary,
} from './tournament-reviews';

/** Leituras da tela de Avaliações. Uma leitura por abertura (o backoffice não usa listener).
 *  `tournamentReviews` só é liberado a `admin`/`superAdmin` pela rule — não o guard do cliente. */
@Injectable({ providedIn: 'root' })
export class TournamentReviewsAdminRepository {
  /** Todos os resumos. Conjunto pequeno: ordena no cliente, sem índice. */
  async listSummaries(): Promise<ReviewSummary[]> {
    const snap = await getDocs(collection(backofficeDb(), 'tournamentReviewSummaries'));
    return snap.docs.flatMap((d) => {
      const summary = summaryFromData(d.id, d.data());
      return summary ? [summary] : [];
    });
  }

  async getSummary(tournamentId: string): Promise<ReviewSummary | null> {
    const snap = await getDoc(doc(backofficeDb(), 'tournamentReviewSummaries', tournamentId));
    return snap.exists() ? summaryFromData(snap.id, snap.data()) : null;
  }

  /** Igualdade num campo só: índice automático. */
  async listReviews(tournamentId: string): Promise<AdminReview[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'tournamentReviews'), where('tournamentId', '==', tournamentId)));
    return snap.docs.flatMap((d) => {
      const review = adminReviewFromData(d.id, d.data());
      return review ? [review] : [];
    });
  }

  /** Nomes em `public_profiles`, em lotes paralelos (memória firestore-chunked-in-serial-latency).
   *  Quem não tem nome fica fora do mapa: quem chama usa `fallbackName`. */
  async profileNames(uids: readonly string[]): Promise<Map<string, string>> {
    const db = backofficeDb();
    const snaps = await Promise.all(
      chunkIds(uids).map((chunk) => getDocs(query(collection(db, 'public_profiles'), where(documentId(), 'in', chunk)))),
    );
    const names = new Map<string, string>();
    for (const snap of snaps) {
      for (const d of snap.docs) {
        const name = profileNameFromData(d.data());
        if (name) names.set(d.id, name);
      }
    }
    return names;
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: o mesmo comando do Step 2.

Expected: `TOTAL: N SUCCESS`, sem `FAILED`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/backoffice/src/app/painel/avaliacoes/data
git commit -m "feat(backoffice): regras e leitura das avaliações de torneios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lista "Avaliações de torneios", rota e menu

**Files:**
- Create: `frontend/projects/backoffice/src/app/painel/avaliacoes/panel-avaliacoes.component.ts`
- Test: `frontend/projects/backoffice/src/app/painel/avaliacoes/panel-avaliacoes.component.spec.ts`
- Modify: `frontend/projects/backoffice/src/app/app.routes.ts` (depois do bloco `path: 'painel/torneios'`)
- Modify: `frontend/projects/backoffice/src/app/painel/ui/icon.component.ts` (união `PanelIconName` e `@switch`)
- Modify: `frontend/projects/backoffice/src/app/painel/ui/panel-shell.component.ts` (`NAV_ITEMS` e `activeId`)

**Interfaces:**
- Consumes: tudo da Task 1, mais `PanelShellComponent`, `PageHeaderComponent`, `PanelCardComponent`, `PillComponent` e `IconComponent`.
- Produces: `PanelAvaliacoesComponent` (seletor `bo-panel-avaliacoes`), a rota `painel/avaliacoes`, o item `Avaliações` no menu e o ícone `star`.

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/backoffice/src/app/painel/avaliacoes/panel-avaliacoes.component.spec.ts`:

```ts
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { ReviewSummary } from './data/tournament-reviews';
import { TournamentReviewsAdminRepository } from './data/tournament-reviews.repository';
import { PanelAvaliacoesComponent } from './panel-avaliacoes.component';

function summary(over: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    organizerId: 'organizer-uid-123456',
    tournamentStartAt: new Date('2026-09-26T12:00:00Z'),
    opensAt: null,
    closesAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    status: 'open',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    ...over,
  };
}

const LIST = [
  summary(),
  summary({ tournamentId: 't2', tournamentName: 'Etapa Setembro', tournamentStartAt: new Date('2026-09-30T12:00:00Z'), average: 3.1, count: 12 }),
  summary({
    tournamentId: 't3',
    tournamentName: 'Teste sem atletas',
    tournamentStartAt: new Date('2026-10-01T12:00:00Z'),
    organizerId: 'other-org-999999',
    count: 0,
    eligibleCount: 0,
    average: null,
    status: 'closed',
  }),
];

describe('PanelAvaliacoesComponent', () => {
  let fixture: ComponentFixture<PanelAvaliacoesComponent>;

  async function mount(repo: Partial<TournamentReviewsAdminRepository>): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [PanelAvaliacoesComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal(null), user: signal(null) } },
        { provide: TournamentReviewsAdminRepository, useValue: repo },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PanelAvaliacoesComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  /** As leituras são promises fora do controle do TestBed: deixa elas resolverem e re-renderiza. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  const names = (host: HTMLElement) => [...host.querySelectorAll('.cell-name')].map((e) => e.textContent!.trim());

  it('mais recentes primeiro, com organizador, média, resposta, janela e link para o detalhe', async () => {
    const host = await mount({
      listSummaries: () => Promise.resolve(LIST),
      profileNames: () => Promise.resolve(new Map([['organizer-uid-123456', 'Arena Garden Eventos']])),
    });
    expect(names(host)).toEqual(['Teste sem atletas', 'Etapa Setembro', 'Copa Aurora']);
    const copa = [...host.querySelectorAll<HTMLAnchorElement>('a.table-row')][2];
    expect(copa.getAttribute('href')).toBe('/painel/avaliacoes/t1');
    const text = copa.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Arena Garden Eventos');
    expect(text).toContain('26/09/2026');
    expect(text).toContain('4,6');
    expect(text).toContain('23 de 42');
    expect(text).toContain('Aberta até');
  });

  it('pior média: os com nota na frente, do pior para o melhor; sem nota depois', async () => {
    const host = await mount({ listSummaries: () => Promise.resolve(LIST), profileNames: () => Promise.resolve(new Map()) });
    const worst = [...host.querySelectorAll<HTMLButtonElement>('.bo-chip')].find((b) => b.textContent!.includes('Pior média'))!;
    worst.click();
    await settle();
    expect(names(host)).toEqual(['Etapa Setembro', 'Copa Aurora', 'Teste sem atletas']);
    expect(host.textContent).toContain('Pior média ordena só os torneios com 3 ou mais avaliações');
  });

  it('sem atletas aptos e sem nota: — no lugar de "0 de 0" e da média; organizador sem nome vira uid encurtado', async () => {
    const host = await mount({ listSummaries: () => Promise.resolve(LIST), profileNames: () => Promise.resolve(new Map()) });
    const teste = [...host.querySelectorAll<HTMLAnchorElement>('a.table-row')][0];
    const text = teste.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Sem nome (…999999)');
    expect(text).not.toContain('0 de 0');
    expect(teste.querySelector('.cell-avg')!.textContent!.trim()).toBe('—');
    expect(teste.querySelector('.cell-resp')!.textContent!.trim()).toBe('—');
    expect(text).toContain('Encerrada');
  });

  it('nomes que não carregam não derrubam a tela', async () => {
    const host = await mount({ listSummaries: () => Promise.resolve(LIST), profileNames: () => Promise.reject(new Error('offline')) });
    expect(names(host).length).toBe(3);
    expect(host.querySelector('.bo-alert')).toBeNull();
    expect(host.textContent).toContain('Sem nome (…123456)');
  });

  it('sem permissão: mensagem clara e Tentar de novo', async () => {
    const host = await mount({ listSummaries: () => Promise.reject({ code: 'permission-denied' }), profileNames: () => Promise.resolve(new Map()) });
    expect(host.querySelector('.bo-alert')!.textContent).toContain('A tela precisa do papel admin.');
    expect([...host.querySelectorAll('button')].some((b) => b.textContent!.includes('Tentar de novo'))).toBeTrue();
  });

  it('lista vazia explica que nenhum torneio passou pela avaliação', async () => {
    const host = await mount({ listSummaries: () => Promise.resolve([]), profileNames: () => Promise.resolve(new Map()) });
    expect(host.textContent).toContain('Nenhum torneio passou pela avaliação dos atletas ainda.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='projects/backoffice/src/app/painel/avaliacoes/panel-avaliacoes.component.spec.ts'`

Expected: erro de compilação, `Cannot find module './panel-avaliacoes.component'`.

- [ ] **Step 3: Ícone `star`**

Em `frontend/projects/backoffice/src/app/painel/ui/icon.component.ts`:
- troque o fim da união `PanelIconName`, de `  | 'trash';` para `  | 'trash'\n  | 'star';`;
- acrescente dentro do `@switch (name())`, logo depois do bloco `@case ('trophy') { … }`:

```html
        @case ('star') {
          <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9z" />
        }
```

- [ ] **Step 4: Componente da lista**

`frontend/projects/backoffice/src/app/painel/avaliacoes/panel-avaliacoes.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { reviewsErrorMessage, sortSummaries, summaryRows, type ReviewSummary, type SummarySort } from './data/tournament-reviews';
import { TournamentReviewsAdminRepository } from './data/tournament-reviews.repository';

type LoadState = 'loading' | 'ok' | 'error';

const SORTS: readonly { id: SummarySort; label: string }[] = [
  { id: 'recent', label: 'Mais recentes' },
  { id: 'worst', label: 'Pior média' },
];

/** Avaliações de torneios (spec §4 "Backoffice"): um resumo por torneio, ordenável, com link para
 *  as avaliações de cada um. Só leitura. */
@Component({
  selector: 'bo-panel-avaliacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Avaliações de torneios" [subtitle]="subtitle()">
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="reload()">
          <bo-icon name="swap" [size]="13" />
          Atualizar
        </button>
      </bo-page-header>

      <div class="bo-filter-bar">
        @for (s of sorts; track s.id) {
          <button type="button" class="bo-chip" [class.active]="sort() === s.id" (click)="sort.set(s.id)">{{ s.label }}</button>
        }
      </div>

      <div class="body">
        <bo-panel-card pad="sm" kicker="coleção tournamentReviewSummaries" title="Torneios avaliados">
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else {
            <div class="table-head">
              <span>Torneio</span>
              <span class="right">Data</span>
              <span class="right">Média</span>
              <span class="right">Avaliações</span>
              <span class="right">Resposta</span>
              <span>Janela</span>
            </div>
            <div>
              @for (row of rows(); track row.id) {
                <a class="table-row" [routerLink]="['/painel/avaliacoes', row.id]">
                  <div class="cell-main">
                    <div class="cell-name">{{ row.name }}</div>
                    <div class="cell-sub">{{ row.organizer }}</div>
                  </div>
                  <div class="right cell-num">{{ row.date }}</div>
                  <div class="right cell-num cell-avg">{{ row.average }}</div>
                  <div class="right cell-num">{{ row.reviews }}</div>
                  <div class="right cell-num cell-resp">{{ row.response }}</div>
                  <div>
                    <bo-pill [tone]="row.windowOpen ? 'green' : 'dim'">{{ row.windowLabel }}</bo-pill>
                  </div>
                </a>
              } @empty {
                @if (state() === 'loading') {
                  <p class="status">Carregando avaliações…</p>
                } @else {
                  <p class="status">Nenhum torneio passou pela avaliação dos atletas ainda.</p>
                }
              }
            </div>
            @if (sort() === 'worst') {
              <p class="legend">
                Pior média ordena só os torneios com 3 ou mais avaliações; os outros vêm depois, do mais recente ao mais
                antigo.
              </p>
            }
          }
        </bo-panel-card>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .status,
    .legend {
      margin: 14px 0 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .retry {
      align-self: flex-start;
      margin-top: 14px;
    }
    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: minmax(0, 2.4fr) 92px 64px 92px 92px 150px;
      gap: 8px;
      align-items: center;
    }
    .table-head {
      padding: 0 4px 10px;
      border-bottom: 1px solid var(--nx-line-strong);
    }
    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .right {
      text-align: right;
    }
    .table-row {
      padding: 11px 4px;
      border-bottom: 1px solid var(--nx-line);
      color: inherit;
      text-decoration: none;
    }
    .table-row:hover {
      background: var(--nx-surface-1);
    }
    .cell-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cell-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cell-sub {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cell-num {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text);
    }
  `,
})
export class PanelAvaliacoesComponent {
  private readonly repository = inject(TournamentReviewsAdminRepository);

  protected readonly sorts = SORTS;
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly summaries = signal<readonly ReviewSummary[]>([]);
  protected readonly names = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly sort = signal<SummarySort>('recent');
  protected readonly now = signal(new Date());

  protected readonly rows = computed(() => summaryRows(sortSummaries(this.summaries(), this.sort()), this.names(), this.now()));

  protected readonly subtitle = computed(() => {
    if (this.state() === 'loading') return 'Carregando…';
    if (this.state() === 'error') return 'Não foi possível carregar as avaliações';
    const n = this.summaries().length;
    return n === 1 ? '1 torneio com avaliação aberta ou encerrada' : `${n} torneios com avaliação aberta ou encerrada`;
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    this.errorMessage.set('');
    let summaries: ReviewSummary[];
    try {
      summaries = await this.repository.listSummaries();
    } catch (err) {
      this.errorMessage.set(reviewsErrorMessage(err));
      this.state.set('error');
      return;
    }
    this.now.set(new Date());
    this.summaries.set(summaries);
    this.state.set('ok');
    // Os nomes só enriquecem a tabela: se a leitura falhar, ficam os uids encurtados.
    const names = await this.repository
      .profileNames(summaries.map((s) => s.organizerId))
      .catch(() => new Map<string, string>());
    this.names.set(names);
  }
}
```

- [ ] **Step 5: Rota e menu**

Em `frontend/projects/backoffice/src/app/app.routes.ts`, logo depois do objeto de `path: 'painel/torneios'`:

```ts
  {
    path: 'painel/avaliacoes',
    title: 'Avaliações de torneios — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/avaliacoes/panel-avaliacoes.component').then((m) => m.PanelAvaliacoesComponent),
  },
```

Em `frontend/projects/backoffice/src/app/painel/ui/panel-shell.component.ts`:
- em `NAV_ITEMS`, logo depois do item de `torneios`:

```ts
  { id: 'avaliacoes', label: 'Avaliações', icon: 'star', route: '/painel/avaliacoes' },
```

- em `activeId`, logo depois do bloco `if (path.startsWith('/painel/torneios')) { return 'torneios'; }`:

```ts
    if (path.startsWith('/painel/avaliacoes')) {
      return 'avaliacoes';
    }
```

- [ ] **Step 6: Rodar e ver passar**

Run: o mesmo comando do Step 2.

Expected: `TOTAL: N SUCCESS`, sem `FAILED`. Se o `<bo-panel-shell>` pedir outro membro do `AuthService` além de `displayName` e `user`, acrescente ao stub e registre um `Ruling:`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/backoffice/src/app/painel/avaliacoes/panel-avaliacoes.component.ts frontend/projects/backoffice/src/app/painel/avaliacoes/panel-avaliacoes.component.spec.ts frontend/projects/backoffice/src/app/app.routes.ts frontend/projects/backoffice/src/app/painel/ui/icon.component.ts frontend/projects/backoffice/src/app/painel/ui/panel-shell.component.ts
git commit -m "feat(backoffice): lista Avaliações de torneios com ordenação por pior média

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Detalhe — cada avaliação com o nome do atleta

**Files:**
- Create: `frontend/projects/backoffice/src/app/painel/avaliacoes/avaliacao-torneio.component.ts`
- Test: `frontend/projects/backoffice/src/app/painel/avaliacoes/avaliacao-torneio.component.spec.ts`
- Modify: `frontend/projects/backoffice/src/app/app.routes.ts` (depois da rota `painel/avaliacoes`)

**Interfaces:**
- Consumes:
  - da Task 1: `getSummary`, `listReviews`, `profileNames`, `adminReviewRows`, `formatRating`, `responseRateLabel`, `reviewWindowLabel`, `isReviewWindowOpen`, `reviewDate`, `fallbackName`, `reviewsErrorMessage` e `MIN_PUBLIC_REVIEWS`;
  - `KpiMiniComponent` (`painel/ui/kpi-mini.component.ts`).
- Produces: `AvaliacaoTorneioComponent` (seletor `bo-avaliacao-torneio`), com `readonly id = input.required<string>()`, e a rota `painel/avaliacoes/:id`.

- [ ] **Step 1: Escrever o spec que falha**

`frontend/projects/backoffice/src/app/painel/avaliacoes/avaliacao-torneio.component.spec.ts`:

```ts
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { AdminReview, ReviewSummary } from './data/tournament-reviews';
import { TournamentReviewsAdminRepository } from './data/tournament-reviews.repository';
import { AvaliacaoTorneioComponent } from './avaliacao-torneio.component';

function summary(over: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    organizerId: 'organizer-uid-123456',
    tournamentStartAt: new Date('2026-09-26T12:00:00Z'),
    opensAt: null,
    closesAt: new Date('2026-09-30T13:00:00Z'),
    status: 'closed',
    eligibleCount: 42,
    count: 2,
    average: null,
    ...over,
  };
}

function review(over: Partial<AdminReview> = {}): AdminReview {
  return {
    id: 't1_athlete-uid-000001',
    uid: 'athlete-uid-000001',
    overall: 4,
    aspects: {},
    comment: null,
    createdAt: new Date('2026-10-02T13:00:00Z'),
    updatedAt: new Date('2026-10-02T13:00:00Z'),
    ...over,
  };
}

describe('AvaliacaoTorneioComponent', () => {
  let fixture: ComponentFixture<AvaliacaoTorneioComponent>;

  async function mount(repo: Partial<TournamentReviewsAdminRepository>, id = 't1'): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [AvaliacaoTorneioComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal(null), user: signal(null) } },
        { provide: TournamentReviewsAdminRepository, useValue: repo },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AvaliacaoTorneioComponent);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  const textOf = (host: HTMLElement) => host.textContent!.replace(/\s+/g, ' ');

  it('lista cada avaliação com o nome do atleta, a data, as estrelas, os aspectos e o comentário', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(summary()),
      listReviews: () =>
        Promise.resolve([
          review(),
          review({
            id: 't1_athlete-uid-000002',
            uid: 'athlete-uid-000002',
            overall: 2,
            aspects: { prizes: 1 },
            comment: 'Premiação não foi entregue.',
            createdAt: new Date('2026-10-03T12:00:00Z'),
            updatedAt: new Date('2026-10-04T12:30:00Z'),
          }),
        ]),
      profileNames: () =>
        Promise.resolve(new Map([['athlete-uid-000002', 'Bruna Lima'], ['organizer-uid-123456', 'Arena Garden Eventos']])),
    });
    const text = textOf(host);
    expect(host.querySelector('.bo-detail-header h1')!.textContent).toContain('Copa Aurora');
    expect(text).toContain('Organizado por Arena Garden Eventos · 26/09/2026');
    const athletes = [...host.querySelectorAll('.rv-athlete')].map((e) => e.textContent!.trim());
    expect(athletes).toEqual(['Bruna Lima', 'Sem nome (…000001)']);
    expect(text).toContain('Enviada em 03/10/2026 09:00 · editada em 04/10/2026 09:30');
    expect(text).toContain('Premiação e kit 1★');
    expect(text).toContain('Premiação não foi entregue.');
    expect(text).toContain('Sem comentário.');
  });

  it('KPIs: média — abaixo de 3, contagem, resposta e janela', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(summary()),
      listReviews: () => Promise.resolve([review()]),
      profileNames: () => Promise.resolve(new Map()),
    });
    const kpis = [...host.querySelectorAll('bo-kpi-mini')].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());
    expect(kpis[0]).toContain('—');
    expect(kpis[1]).toContain('2');
    expect(kpis[2]).toContain('2 de 42');
    expect(kpis[3]).toContain('Encerrada');
  });

  it('sem resumo nem avaliações: não encontrado, com volta para a lista', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(null),
      listReviews: () => Promise.resolve([]),
      profileNames: () => Promise.resolve(new Map()),
    });
    expect(textOf(host)).toContain('Este torneio não tem resumo de avaliação.');
    expect(host.querySelector('a[href="/painel/avaliacoes"]')).not.toBeNull();
  });

  it('com resumo e sem avaliações: diz que ninguém avaliou', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(summary({ count: 0 })),
      listReviews: () => Promise.resolve([]),
      profileNames: () => Promise.resolve(new Map()),
    });
    expect(textOf(host)).toContain('Nenhum atleta avaliou este torneio ainda.');
  });

  it('trocar de torneio descarta a resposta atrasada do anterior', async () => {
    let resolveOld!: (reviews: AdminReview[]) => void;
    const host = await mount({
      getSummary: (id: string) => Promise.resolve(summary({ tournamentId: id, tournamentName: id === 't1' ? 'Copa Aurora' : 'Etapa Setembro' })),
      listReviews: (id: string) =>
        id === 't1'
          ? new Promise<AdminReview[]>((resolve) => (resolveOld = resolve))
          : Promise.resolve([review({ id: 't2_athlete-uid-000009', uid: 'athlete-uid-000009', comment: 'Da etapa nova.' })]),
      profileNames: () => Promise.resolve(new Map()),
    });
    fixture.componentRef.setInput('id', 't2');
    fixture.detectChanges();
    await settle();
    resolveOld([review({ comment: 'Do torneio antigo.' })]);
    await settle();
    const text = textOf(host);
    expect(text).toContain('Da etapa nova.');
    expect(text).not.toContain('Do torneio antigo.');
    expect(host.querySelector('.bo-detail-header h1')!.textContent).toContain('Etapa Setembro');
  });

  it('sem permissão: mensagem clara', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(summary()),
      listReviews: () => Promise.reject({ code: 'permission-denied' }),
      profileNames: () => Promise.resolve(new Map()),
    });
    expect(host.querySelector('.bo-alert')!.textContent).toContain('A tela precisa do papel admin.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='projects/backoffice/src/app/painel/avaliacoes/avaliacao-torneio.component.spec.ts'`

Expected: erro de compilação, `Cannot find module './avaliacao-torneio.component'`.

- [ ] **Step 3: Componente do detalhe**

`frontend/projects/backoffice/src/app/painel/avaliacoes/avaliacao-torneio.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import {
  MIN_PUBLIC_REVIEWS,
  adminReviewRows,
  fallbackName,
  formatRating,
  isReviewWindowOpen,
  responseRateLabel,
  reviewDate,
  reviewWindowLabel,
  reviewsErrorMessage,
  type AdminReview,
  type ReviewSummary,
} from './data/tournament-reviews';
import { TournamentReviewsAdminRepository } from './data/tournament-reviews.repository';

type LoadState = 'loading' | 'ok' | 'error';

/** Avaliações de um torneio, com o nome de cada atleta (spec §4 "Backoffice"). O organizador
 *  nunca vê isto: a rule só libera `tournamentReviews` a admin/superAdmin. */
@Component({
  selector: 'bo-avaliacao-torneio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PanelCardComponent, KpiMiniComponent, IconComponent],
  template: `
    <bo-panel-shell>
      <header class="bo-detail-header">
        <a class="bo-back-btn" routerLink="/painel/avaliacoes" aria-label="Voltar para Avaliações">
          <bo-icon name="chevron-left" [size]="18" />
        </a>
        <div class="titles">
          <h1>{{ title() }}</h1>
          <p>{{ headerLine() }}</p>
        </div>
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="reload()">
          <bo-icon name="swap" [size]="13" />
          Atualizar
        </button>
      </header>

      <div class="bo-detail-body">
        @if (state() === 'error') {
          <div class="bo-alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ errorMessage() }}</span>
          </div>
          <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
        } @else if (state() === 'loading') {
          <p class="status">Carregando avaliações…</p>
        } @else if (notFound()) {
          <bo-panel-card title="Avaliações do torneio">
            <p class="status">Este torneio não tem resumo de avaliação.</p>
            <a class="bo-mini-btn" routerLink="/painel/avaliacoes">Voltar para Avaliações</a>
          </bo-panel-card>
        } @else {
          <div class="kpis">
            <bo-kpi-mini label="Média" [value]="average()" />
            <bo-kpi-mini label="Avaliações" [value]="countLabel()" />
            <bo-kpi-mini label="Resposta" [value]="response()" />
            <bo-kpi-mini label="Janela" [value]="windowLabel()" [tone]="windowOpen() ? 'green' : 'neutral'" />
          </div>

          <bo-panel-card pad="sm" kicker="coleção tournamentReviews" title="Avaliações dos atletas">
            @for (row of rows(); track row.id) {
              <article class="rv">
                <div class="rv-head">
                  <span class="rv-athlete">{{ row.athlete }}</span>
                  <span class="rv-stars" [attr.aria-label]="row.overall + ' de 5 estrelas'">{{ row.stars }}</span>
                </div>
                <div class="rv-date">{{ row.sentAt }}</div>
                @if (row.aspects.length) {
                  <div class="rv-chips">
                    @for (chip of row.aspects; track chip) {
                      <span class="rv-chip">{{ chip }}</span>
                    }
                  </div>
                }
                <p class="rv-comment" [class.rv-empty]="!row.comment">{{ row.comment ?? 'Sem comentário.' }}</p>
              </article>
            } @empty {
              <p class="status">Nenhum atleta avaliou este torneio ainda.</p>
            }
          </bo-panel-card>
        }
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .status {
      margin: 0 0 12px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .retry {
      margin-top: 14px;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .rv {
      padding: 12px 4px;
      border-bottom: 1px solid var(--nx-line);
    }
    .rv:last-child {
      border-bottom: none;
    }
    .rv-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .rv-athlete {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .rv-stars {
      color: var(--nx-orange-500);
      letter-spacing: 1px;
    }
    .rv-date {
      margin-top: 2px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .rv-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .rv-chip {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-mute);
      background: var(--nx-surface-1);
      border-radius: var(--nx-r-pill);
      padding: 2px 8px;
    }
    .rv-comment {
      margin: 8px 0 0;
      font-size: 13.5px;
      line-height: 1.5;
      color: var(--nx-text);
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .rv-empty {
      color: var(--nx-text-dim);
    }
    @media (max-width: 720px) {
      .kpis {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class AvaliacaoTorneioComponent {
  /** Vem do parâmetro de rota :id (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly repository = inject(TournamentReviewsAdminRepository);
  private loadToken = 0;

  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly summary = signal<ReviewSummary | null>(null);
  protected readonly reviews = signal<readonly AdminReview[]>([]);
  protected readonly names = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly now = signal(new Date());

  protected readonly notFound = computed(() => this.summary() == null && this.reviews().length === 0);
  protected readonly rows = computed(() => adminReviewRows(this.reviews(), this.names()));
  protected readonly title = computed(() => this.summary()?.tournamentName || 'Avaliações do torneio');
  protected readonly headerLine = computed(() => {
    const s = this.summary();
    if (!s) return 'Avaliações de torneios';
    const organizer = this.names().get(s.organizerId) ?? fallbackName(s.organizerId);
    return `Organizado por ${organizer} · ${reviewDate(s.tournamentStartAt ?? s.opensAt)}`;
  });
  protected readonly average = computed(() => {
    const s = this.summary();
    return s && s.count >= MIN_PUBLIC_REVIEWS && s.average != null ? formatRating(s.average) : '—';
  });
  protected readonly countLabel = computed(() => String(this.summary()?.count ?? this.reviews().length));
  protected readonly response = computed(() => {
    const s = this.summary();
    return s ? responseRateLabel(s) : '—';
  });
  protected readonly windowLabel = computed(() => {
    const s = this.summary();
    return s ? reviewWindowLabel(s, this.now()) : '—';
  });
  protected readonly windowOpen = computed(() => {
    const s = this.summary();
    return s != null && isReviewWindowOpen(s, this.now());
  });

  constructor() {
    effect(() => {
      const tournamentId = this.id();
      untracked(() => void this.load(tournamentId));
    });
  }

  protected reload(): void {
    void this.load(this.id());
  }

  /** O token descarta a resposta que chegar depois de trocar de torneio. */
  private async load(tournamentId: string): Promise<void> {
    const token = ++this.loadToken;
    this.state.set('loading');
    this.errorMessage.set('');
    this.summary.set(null);
    this.reviews.set([]);
    this.names.set(new Map());
    let summary: ReviewSummary | null;
    let reviews: AdminReview[];
    try {
      [summary, reviews] = await Promise.all([this.repository.getSummary(tournamentId), this.repository.listReviews(tournamentId)]);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.errorMessage.set(reviewsErrorMessage(err));
      this.state.set('error');
      return;
    }
    if (token !== this.loadToken) return;
    this.now.set(new Date());
    this.summary.set(summary);
    this.reviews.set(reviews);
    this.state.set('ok');
    // Os nomes só enriquecem: se a leitura falhar, ficam os uids encurtados.
    const uids = [...reviews.map((r) => r.uid), ...(summary ? [summary.organizerId] : [])];
    const names = await this.repository.profileNames(uids).catch(() => new Map<string, string>());
    if (token !== this.loadToken) return;
    this.names.set(names);
  }
}
```

- [ ] **Step 4: Rota**

Em `frontend/projects/backoffice/src/app/app.routes.ts`, logo depois do objeto de `path: 'painel/avaliacoes'` criado na Task 2:

```ts
  {
    path: 'painel/avaliacoes/:id',
    title: 'Avaliações do torneio — NexaGO Backoffice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/avaliacoes/avaliacao-torneio.component').then((m) => m.AvaliacaoTorneioComponent),
  },
```

- [ ] **Step 5: Rodar e ver passar**

Run: o mesmo comando do Step 2.

Expected: `TOTAL: N SUCCESS`, sem `FAILED`.

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && pwd && git branch --show-current
git add frontend/projects/backoffice/src/app/painel/avaliacoes/avaliacao-torneio.component.ts frontend/projects/backoffice/src/app/painel/avaliacoes/avaliacao-torneio.component.spec.ts frontend/projects/backoffice/src/app/app.routes.ts
git commit -m "feat(backoffice): avaliações de um torneio com o nome de cada atleta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task F: Verificação final, checagem visual e PR

- [ ] **Step 1: Suíte e build**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422/frontend && npx ng test backoffice --watch=false --browsers=ChromeHeadless && npx ng build backoffice --configuration production`

Expected:
- `TOTAL: N SUCCESS`, sem `FAILED`.
- Build sem erro, e o "Output location" com `worktrees/`.
- Nenhum aviso de `anyComponentStyle` para `panel-avaliacoes` ou `avaliacao-torneio`. O orçamento de aviso é 8 kB, e o Karma não aplica orçamento: só o build prova.

- [ ] **Step 2: Checagem visual com rota temporária (NÃO commitar)**

O backoffice não tem atalho para pular o login, e as avaliações privadas pedem o claim `admin`. Use dados fictícios.

**Criar** `frontend/projects/backoffice/src/app/painel/avaliacoes/__qa-avaliacoes.component.ts`. Ele:
- renderiza `<bo-panel-avaliacoes>` com `?v=list` ou `<bo-avaliacao-torneio id="t1">` com `?v=detail`;
- usa no próprio `providers` um `TournamentReviewsAdminRepository` falso, com os fixtures dos specs:
  - um torneio com nota, um sem nota e um sem atletas aptos;
  - três avaliações: uma sem comentário, uma editada e uma com comentário de três linhas.

**Registrar** `{ path: '__qa-avaliacoes', loadComponent: () => import('./painel/avaliacoes/__qa-avaliacoes.component').then((m) => m.QaAvaliacoesComponent) }` no **topo** de `app.routes.ts`, sem guard.

**Subir** `preview_start` com `name: "backoffice"` (porta 4213).

**Conferir em 1280px e em 768px:**
- **Lista:**
  - a grade da tabela alinhada;
  - as duas ordenações;
  - o pill da janela;
  - nome comprido cortado com reticências;
  - o link de cada linha.
- **Detalhe:**
  - os KPIs;
  - o nome do atleta;
  - a marca de edição;
  - `Sem comentário.`;
  - comentário longo quebrando linha.

Se o pane estiver escondido, meça pelo DOM com `javascript_tool`.

**Apagar** o componente e a rota. `git diff` de `app.routes.ts` em relação ao último commit tem que vir vazio.

- [ ] **Step 3: Nada fora do worktree e branch limpa**

Run:

```bash
git -C /Users/silviodionizio/Documents/projects/volley/nexago status --short | head
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422 && git status --short && git log --oneline origin/main..HEAD
```

Expected:
- O checkout principal não ganhou nenhum arquivo.
- O worktree está limpo.
- Aparecem os commits do plano e das Tasks 1–3.

- [ ] **Step 4: PR**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/tournament-athlete-rating-361422
git push -u origin claude/tournament-reviews-fase-5
gh pr create --base main --title "Avaliação do torneio pelos atletas — fase 5 (backoffice)" --body "$(cat <<'EOF'
## O que entra

Tela **Avaliações de torneios** no backoffice (`/painel/avaliacoes`), só leitura. Novo item **Avaliações** no menu.
- **Lista:** um resumo por torneio, com data, organizador, média, avaliações, taxa de resposta e janela. Ordena por **mais recentes** ou por **pior média**; os torneios com menos de 3 avaliações vêm depois na pior média.
- **Detalhe** (`/painel/avaliacoes/:id`): cada avaliação com o **nome do atleta**, a data de envio (e de edição), as estrelas, os aspectos e o comentário. No topo, a média, a contagem, a taxa de resposta e a janela.

Os nomes vêm de `public_profiles`, em lotes paralelos. As avaliações privadas (`tournamentReviews`) só são liberadas a `admin`/`superAdmin` pela rule. Nenhuma rule, índice ou function nova; a ordenação é feita no cliente.

## Testes
- Regras puras:
  - parse do resumo e da avaliação privada;
  - nome de reserva;
  - média, resposta e janela;
  - as duas ordenações;
  - linhas da lista e do detalhe;
  - lotes de ids;
  - mensagem de sem permissão.
- **Lista:** ordem, pior média, `—` sem nota ou sem atletas aptos, nomes que falham, sem permissão, lista vazia.
- **Detalhe:** nomes, marca de edição, `Sem comentário.`, KPIs, não encontrado, troca de torneio com resposta atrasada, sem permissão.
- Suíte do backoffice e build de produção passam. Checagem visual com rota temporária que não foi commitada.

## Fica para depois
- Fase 6: ligar a flag `appConfig/tournamentReviews` quando o build do app estiver na loja.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
