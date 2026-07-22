# Histórico persistente de avisos (Comunicação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o histórico de "Avisos enviados" da tela Comunicação do painel do organizador sobreviver a reload/troca de aba, em vez de ser um `signal` local que reseta.

**Architecture:** `sendCategoryCommunicationCore` (Cloud Function) grava cada envio em `tournaments/{tournamentId}/categoryCommunications/{id}`. O painel Angular lê essa subcoleção direto do Firestore (sem callable dedicado), paginado com `orderBy('createdAt','desc').limit(20)` + `startAfter`, autorizado por uma regra nova em `firestore.rules` que reaproveita `canManageTournament(tournamentId)`.

**Tech Stack:** Firebase Cloud Functions (TypeScript, `firebase-admin/firestore`), Angular standalone components + signals, Firestore client SDK modular API (`firebase/firestore`), `node:test` para os testes de functions.

## Global Constraints

- Histórico cobre **só** `sendCategoryCommunication` — `postTournamentAnnouncement`/`communityFeed` ficam de fora (spec: `docs/superpowers/specs/2026-07-22-historico-comunicacao-categoria-design.md`).
- Não persistir os links de WhatsApp (dado pessoal + regenerável).
- Sem nome de categoria denormalizado no doc — resolvido no cliente via `categories()` já carregado.
- Paginação por cursor (`startAfter`), sem contagem total, "Carregar mais" aparece quando a página veio cheia (`items.length === pageSize`).
- Falha ao gravar o histórico não pode impedir o retorno normal da function (push já foi disparado nesse ponto).

---

### Task 1: Backend — persistir o envio + regra de leitura

**Files:**
- Modify: `functions/src/organizer-category-ops.ts:552-631` (função `sendCategoryCommunicationCore`)
- Modify: `firestore.rules:1517-1526` (bloco `match /tournaments/{tournamentId}`)
- Test: `functions/src/organizer-category-ops.send-communication.test.ts`

**Interfaces:**
- Consumes: `sendCategoryCommunicationCore(db: Firestore, uid: string, input: SendCategoryCommunicationInput, projectId?: string)` já existente (retorna `{pushCount, pushNoChannel, pushFailed, whatsappLinks}`).
- Produces: nenhuma interface nova exportada — só um efeito colateral (grava doc em `tournaments/{tournamentId}/categoryCommunications`). Tasks seguintes (frontend) dependem apenas do **formato do documento** gravado, listado abaixo.

Formato do documento gravado (consumido pela Task 2):
```ts
{
  categoryId: string;
  message: string;
  audience: string;        // 'all' | 'paid' | 'pending'
  sendPush: boolean;
  pushCount: number;
  pushNoChannel: number;
  pushFailed: number;
  createdAt: FirebaseFirestore.FieldValue; // serverTimestamp()
  createdBy: string;       // uid de quem enviou
}
```

- [ ] **Step 1: Escrever o teste que falha — persistência do histórico**

Abrir `functions/src/organizer-category-ops.send-communication.test.ts` e adicionar, dentro do `describe("sendCategoryCommunicationCore", ...)`, depois do último `it(...)` (linha 109, antes do `});` de fechamento do describe):

```ts
  it("persiste o envio em tournaments/{id}/categoryCommunications com as contagens reais", async () => {
    const fake = new FakeFirestore();
    seedScenario(fake);
    mockDeliverNotificationToUser({
      "atleta-com-push": {sent: 2, failed: 0},
      "atleta-sem-token": {sent: 0, failed: 0},
    });

    await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {
        tournamentId: TOURNAMENT_ID,
        categoryId: CATEGORY_ID,
        message: "Jogos remarcados",
        audience: "all",
        sendPush: true,
      },
      PROJECT_ID,
    );

    const persisted = [...fake.store.entries()].filter(([path]) =>
      path.startsWith(`tournaments/${TOURNAMENT_ID}/categoryCommunications/`),
    );
    assert.equal(persisted.length, 1, "esperava 1 doc de histórico persistido");
    const [, data] = persisted[0]!;
    assert.equal(data.categoryId, CATEGORY_ID);
    assert.equal(data.message, "Jogos remarcados");
    assert.equal(data.audience, "all");
    assert.equal(data.sendPush, true);
    assert.equal(data.pushCount, 1);
    assert.equal(data.pushNoChannel, 1);
    assert.equal(data.pushFailed, 0);
    assert.equal(data.createdBy, "owner-1");
    assert.ok("createdAt" in data, "esperava createdAt (server timestamp sentinel)");
  });

  it("falha ao gravar histórico não impede o retorno normal (best-effort)", async () => {
    const fake = new FakeFirestore();
    seedScenario(fake);
    mockDeliverNotificationToUser({
      "atleta-com-push": {sent: 2, failed: 0},
      "atleta-sem-token": {sent: 0, failed: 0},
    });
    const originalCollection = fake.collection.bind(fake);
    (fake as unknown as {collection: typeof fake.collection}).collection = (path: string) => {
      if (path === `tournaments/${TOURNAMENT_ID}/categoryCommunications`) {
        return {
          ...originalCollection(path),
          add: async () => {
            throw new Error("Firestore indisponível");
          },
        };
      }
      return originalCollection(path);
    };

    const result = await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {tournamentId: TOURNAMENT_ID, categoryId: CATEGORY_ID, message: "Jogos remarcados"},
      PROJECT_ID,
    );

    assert.equal(result.pushCount, 1);
    assert.equal(result.pushNoChannel, 1);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que os dois novos falham**

Run: `cd functions && npm test 2>&1 | grep -A 15 "persiste o envio\|falha ao gravar"`
Expected: os dois testes novos falham — o primeiro com `persisted.length` igual a `0` (nenhum doc gravado ainda), o segundo porque `result.pushCount`/`pushNoChannel` ainda vêm certos mas por acidente (a implementação atual não grava nada, então "falhar ao gravar" nem é exercitado) — o importante nesse momento é confirmar que o teste de persistência (Step 1, primeiro `it`) falha com "esperava 1 doc de histórico persistido" (`0 !== 1`).

- [ ] **Step 3: Implementar a gravação do histórico**

Em `functions/src/organizer-category-ops.ts`, localizar o fim de `sendCategoryCommunicationCore` (linha 630 hoje):

```ts
  return {pushCount: pushSent, pushNoChannel, pushFailed, whatsappLinks};
}
```

Substituir por:

```ts
  try {
    await db.collection(`tournaments/${tournamentId}/categoryCommunications`).add({
      categoryId,
      message,
      audience,
      sendPush,
      pushCount: pushSent,
      pushNoChannel,
      pushFailed,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });
  } catch (historyError) {
    logger.warn(
      `Histórico de comunicação falhou para tournament=${tournamentId}`,
      historyError,
    );
  }

  return {pushCount: pushSent, pushNoChannel, pushFailed, whatsappLinks};
}
```

(`FieldValue` e `logger` já estão importados no topo do arquivo — nenhum import novo necessário.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd functions && npm run build && npm test 2>&1 | tail -20`
Expected: `# fail 1` (a mesma falha pré-existente e não relacionada em `splitArenaBookingPaymentCore`, já documentada) — os dois testes novos aparecem como `ok`.

- [ ] **Step 5: Regra de leitura no Firestore**

Em `firestore.rules`, dentro de `match /tournaments/{tournamentId} { ... }`, logo depois do bloco `match /staff/{staffUserId} { ... }` (fecha na linha 1525) e antes do `}` que fecha o `match /tournaments/{tournamentId}` (linha 1526):

```
      match /categoryCommunications/{commId} {
        // Histórico de sendCategoryCommunication — só quem gerencia o
        // torneio lê; escrita só via Admin SDK (Cloud Function).
        allow read: if canManageTournament(tournamentId);
        allow write: if false;
      }
```

- [ ] **Step 6: Sanity check local das chaves (sem deploy — deploy fica pra Task 4/aprovação explícita)**

A validação real de sintaxe do `firestore.rules` só acontece no próprio `firebase deploy --only firestore:rules`, que este plano não executa (deploy exige aprovação explícita do usuário, fora deste plano). Por ora, confirmar só que as chaves `{`/`}` do arquivo continuam balanceadas depois da edição:

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago && node -e "const s=require('fs').readFileSync('firestore.rules','utf8'); let d=0; for(const c of s){ if(c==='{')d++; if(c==='}')d--; if(d<0){console.log('desbalanceado'); process.exit(1);} } console.log(d===0?'balanceado':'desbalanceado: '+d)"`
Expected: `balanceado`

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add functions/src/organizer-category-ops.ts functions/src/organizer-category-ops.send-communication.test.ts firestore.rules
git commit -m "$(cat <<'EOF'
feat: persistir histórico de sendCategoryCommunication no Firestore

Grava cada envio em tournaments/{id}/categoryCommunications (best-effort,
não derruba o envio se a gravação falhar), com regra de leitura restrita
a quem gerencia o torneio.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Frontend — repositório de leitura paginada

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/data/category-communications-repository.ts`

**Interfaces:**
- Consumes: documento gravado na Task 1 (`categoryId`, `message`, `audience`, `sendPush`, `pushCount`, `pushNoChannel`, `pushFailed`, `createdAt`, `createdBy`); `organizerFirestore()` de `./firestore.ts`.
- Produces (consumido pela Task 3):
  - `interface CategoryCommunicationEntry { id: string; categoryId: string; message: string; audience: 'all' | 'paid' | 'pending'; sendPush: boolean; pushCount: number; pushNoChannel: number; pushFailed: number; createdAt: Date; createdBy: string; }`
  - `interface CategoryCommunicationsPage { items: CategoryCommunicationEntry[]; lastCursor: QueryDocumentSnapshot | null; }`
  - `function listCategoryCommunicationsPage(tournamentId: string, pageSize: number, afterCursor?: QueryDocumentSnapshot): Promise<CategoryCommunicationsPage>`

- [ ] **Step 1: Criar o arquivo do repositório**

Criar `frontend/projects/organizer/src/app/painel/data/category-communications-repository.ts`:

```ts
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { organizerFirestore } from './firestore';

/** Histórico de `sendCategoryCommunication`, gravado pela Cloud Function em
 *  `tournaments/{tournamentId}/categoryCommunications` — leitura direta
 *  autorizada por `canManageTournament` no `firestore.rules`. */

export type CommunicationAudience = 'all' | 'paid' | 'pending';

export interface CategoryCommunicationEntry {
  id: string;
  categoryId: string;
  message: string;
  audience: CommunicationAudience;
  sendPush: boolean;
  pushCount: number;
  pushNoChannel: number;
  pushFailed: number;
  createdAt: Date;
  createdBy: string;
}

export interface CategoryCommunicationsPage {
  items: CategoryCommunicationEntry[];
  lastCursor: QueryDocumentSnapshot | null;
}

function toDate(v: unknown): Date {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : new Date();
}

export async function listCategoryCommunicationsPage(
  tournamentId: string,
  pageSize: number,
  afterCursor?: QueryDocumentSnapshot,
): Promise<CategoryCommunicationsPage> {
  const db = organizerFirestore();
  const base = collection(db, 'tournaments', tournamentId, 'categoryCommunications');

  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
  if (afterCursor) constraints.push(startAfter(afterCursor));
  constraints.push(limit(pageSize));

  const snap = await getDocs(query(base, ...constraints));
  const items: CategoryCommunicationEntry[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      categoryId: (data['categoryId'] as string) ?? '',
      message: (data['message'] as string) ?? '',
      audience: (data['audience'] as CommunicationAudience) ?? 'all',
      sendPush: data['sendPush'] !== false,
      pushCount: (data['pushCount'] as number) ?? 0,
      pushNoChannel: (data['pushNoChannel'] as number) ?? 0,
      pushFailed: (data['pushFailed'] as number) ?? 0,
      createdAt: toDate(data['createdAt']),
      createdBy: (data['createdBy'] as string) ?? '',
    };
  });

  const lastCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1]! : null;
  return { items, lastCursor };
}
```

- [ ] **Step 2: Build de tipos (sem suíte de testes automatizada no Angular deste projeto — mesmo padrão dos arquivos vizinhos em `painel/data/`)**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx tsc --noEmit -p projects/organizer/tsconfig.app.json 2>&1 | tail -30`
Expected: sem erros relacionados a `category-communications-repository.ts` (build limpo ou só avisos pré-existentes de outros arquivos, se houver).

- [ ] **Step 3: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/organizer/src/app/painel/data/category-communications-repository.ts
git commit -m "$(cat <<'EOF'
feat: repositório de leitura paginada do histórico de comunicação

Lê tournaments/{id}/categoryCommunications direto do Firestore
(orderBy createdAt desc + cursor startAfter), mesmo padrão de leitura
direta já usado pelos outros repositórios do painel do organizador.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Frontend — trocar o histórico de sessão pelo persistido + paginação na UI

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/comunicacao/comunicacao.component.ts`

**Interfaces:**
- Consumes: `listCategoryCommunicationsPage`, `CategoryCommunicationEntry`, `CategoryCommunicationsPage` da Task 2; `sendCategoryCommunication` (já existente) de `../data/organizer-ops.service`.
- Produces: nenhuma interface nova — mudança interna do componente.

- [ ] **Step 1: Trocar imports e remover `SentLogEntry`**

Em `frontend/projects/organizer/src/app/painel/comunicacao/comunicacao.component.ts`, linha 1-10, adicionar o import do repositório logo após o import de `sendCategoryCommunication` (linha 2):

```ts
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { sendCategoryCommunication } from '../data/organizer-ops.service';
import {
  listCategoryCommunicationsPage,
  type CategoryCommunicationEntry,
} from '../data/category-communications-repository';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { OrganizerTournament } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
```

Remover a interface `SentLogEntry` (linhas 27-35 do arquivo original):

```ts
interface SentLogEntry {
  at: Date;
  categoryName: string;
  audience: Audience;
  message: string;
  pushCount: number;
  pushNoChannel: number;
  pushFailed: number;
}
```

(nada entra no lugar — `CategoryCommunicationEntry` importada na Task 2 assume esse papel.)

- [ ] **Step 2: Atualizar o comentário de docstring do componente**

Substituir (linhas 39-45):

```ts
/** Comunicação real com os atletas — espelha `organizer_category_communicate_page.dart`
 *  (Flutter): broadcast por categoria via `sendCategoryCommunication` (push pros dois atletas
 *  de cada dupla + links de WhatsApp prontos, que o servidor monta a partir dos telefones).
 *  Na cascata o torneio vem da rota (`/painel/eventos/:id/comunicacao`); no nível categoria
 *  (`…/categorias/:catId/comunicacao`) a categoria também vem travada da rota. O backend não
 *  persiste histórico de avisos (o retorno é só pushCount/links), então o histórico aqui é da
 *  sessão. */
```

por:

```ts
/** Comunicação real com os atletas — espelha `organizer_category_communicate_page.dart`
 *  (Flutter): broadcast por categoria via `sendCategoryCommunication` (push pros dois atletas
 *  de cada dupla + links de WhatsApp prontos, que o servidor monta a partir dos telefones).
 *  Na cascata o torneio vem da rota (`/painel/eventos/:id/comunicacao`); no nível categoria
 *  (`…/categorias/:catId/comunicacao`) a categoria também vem travada da rota. O histórico de
 *  avisos é persistido pela function em `tournaments/{id}/categoryCommunications` e lido
 *  paginado (`listCategoryCommunicationsPage`); o envio mais recente entra otimista na lista
 *  antes do próximo reload confirmar. */
```

- [ ] **Step 3: Atualizar o template — bloco "Avisos enviados"**

Substituir o bloco (linhas 138-156 do arquivo original):

```ts
        <og-card kicker="Sessão" title="Avisos enviados">
          @for (s of sentLog(); track s.at.getTime()) {
            <div class="og-comm-aviso">
              <div class="og-comm-aviso-top">
                <div class="og-comm-aviso-title">{{ s.categoryName }}</div>
                <span class="og-comm-aviso-date">{{ timeOf(s.at) }}</span>
              </div>
              <div class="og-comm-aviso-body">{{ s.message }}</div>
              <div class="og-comm-aviso-footer">
                <span class="og-comm-aviso-alcance">{{ audienceLabel[s.audience] }} · {{ s.pushCount }} push entregues</span>
                @if (s.pushNoChannel + s.pushFailed > 0) {
                  <span class="og-comm-aviso-alcance og-comm-aviso-alert">{{ s.pushNoChannel + s.pushFailed }} sem notificação</span>
                }
              </div>
            </div>
          } @empty {
            <p class="og-comm-empty">Nenhum aviso enviado nesta sessão.</p>
          }
        </og-card>
```

por:

```ts
        <og-card kicker="Histórico" title="Avisos enviados">
          @for (s of sentLog(); track s.id) {
            <div class="og-comm-aviso">
              <div class="og-comm-aviso-top">
                <div class="og-comm-aviso-title">{{ categoryNameOf(s.categoryId) }}</div>
                <span class="og-comm-aviso-date">{{ timeOf(s.createdAt) }}</span>
              </div>
              <div class="og-comm-aviso-body">{{ s.message }}</div>
              <div class="og-comm-aviso-footer">
                @if (s.sendPush) {
                  <span class="og-comm-aviso-alcance">{{ audienceLabel[s.audience] }} · {{ s.pushCount }} push entregues</span>
                  @if (s.pushNoChannel + s.pushFailed > 0) {
                    <span class="og-comm-aviso-alcance og-comm-aviso-alert">{{ s.pushNoChannel + s.pushFailed }} sem notificação</span>
                  }
                } @else {
                  <span class="og-comm-aviso-alcance">{{ audienceLabel[s.audience] }} · Só WhatsApp</span>
                }
              </div>
            </div>
          } @empty {
            <p class="og-comm-empty">Nenhum aviso enviado ainda.</p>
          }
          @if (historyHasMore()) {
            <div style="margin-top:12px;display:flex;justify-content:center">
              <button type="button" class="og-mini-btn" [disabled]="historyLoading()" (click)="loadMoreHistory()">
                {{ historyLoading() ? 'Carregando…' : 'Carregar mais' }}
              </button>
            </div>
          }
        </og-card>
```

- [ ] **Step 4: Trocar o tipo e adicionar estado de paginação nos signals do componente**

Substituir (linha 286 do arquivo original):

```ts
  protected readonly sentLog = signal<SentLogEntry[]>([]);
```

por:

```ts
  protected readonly sentLog = signal<CategoryCommunicationEntry[]>([]);
  private readonly historyCursor = signal<QueryDocumentSnapshot | null>(null);
  protected readonly historyHasMore = signal(false);
  protected readonly historyLoading = signal(false);
  private static readonly HISTORY_PAGE_SIZE = 20;
```

- [ ] **Step 5: Carregar a primeira página junto com o torneio**

Substituir o método `load` (linhas 320-331 do arquivo original):

```ts
  private async load(tid: string): Promise<void> {
    try {
      const tournament = await getTournament(tid);
      this.tournament.set(tournament);
      const cid = this.catId();
      const categories = tournament?.categories ?? [];
      const initial = (cid && categories.some((c) => c.id === cid) ? cid : null) ?? categories[0]?.id ?? null;
      this.selectedCategoryId.set(initial);
    } finally {
      this.loading.set(false);
    }
  }
```

por:

```ts
  private async load(tid: string): Promise<void> {
    try {
      const tournament = await getTournament(tid);
      this.tournament.set(tournament);
      const cid = this.catId();
      const categories = tournament?.categories ?? [];
      const initial = (cid && categories.some((c) => c.id === cid) ? cid : null) ?? categories[0]?.id ?? null;
      this.selectedCategoryId.set(initial);
    } finally {
      this.loading.set(false);
    }
    await this.loadHistoryFirstPage(tid);
  }

  private async loadHistoryFirstPage(tid: string): Promise<void> {
    const page = await listCategoryCommunicationsPage(tid, ComunicacaoComponent.HISTORY_PAGE_SIZE);
    this.sentLog.set(page.items);
    this.historyCursor.set(page.lastCursor);
    this.historyHasMore.set(page.items.length === ComunicacaoComponent.HISTORY_PAGE_SIZE);
  }

  protected async loadMoreHistory(): Promise<void> {
    const tid = this.id();
    const cursor = this.historyCursor();
    if (!tid || !cursor || this.historyLoading()) return;
    this.historyLoading.set(true);
    try {
      const page = await listCategoryCommunicationsPage(tid, ComunicacaoComponent.HISTORY_PAGE_SIZE, cursor);
      this.sentLog.update((log) => [...log, ...page.items]);
      this.historyCursor.set(page.lastCursor);
      this.historyHasMore.set(page.items.length === ComunicacaoComponent.HISTORY_PAGE_SIZE);
    } finally {
      this.historyLoading.set(false);
    }
  }
```

- [ ] **Step 6: Prepend otimista no formato novo + resolver nome de categoria**

Substituir o corpo do `try` em `send()` (linhas 343-374 do arquivo original):

```ts
    try {
      const result = await sendCategoryCommunication({
        tournamentId: tid,
        categoryId: cid,
        message: this.message(),
        audience: this.audience(),
        sendPush: this.sendPush(),
      });
      const pushCount = result.pushCount ?? 0;
      const pushNoChannel = result.pushNoChannel ?? 0;
      const pushFailed = result.pushFailed ?? 0;
      const links = result.whatsappLinks ?? [];
      this.lastResult.set({ pushCount, pushNoChannel, pushFailed, whatsappLinks: links });
      const missed = pushNoChannel + pushFailed;
      const missedNote = missed > 0 ? ` · ${missed} sem notificação (avise por WhatsApp)` : '';
      this.feedback.set({
        ok: true,
        message: `Aviso enviado — ${pushCount} push entregue${pushCount === 1 ? '' : 's'}${missedNote}${links.length ? ` · ${links.length} duplas com WhatsApp` : ''}.`,
      });
      this.sentLog.update((log) => [
        {
          at: new Date(),
          categoryName: this.categories().find((c) => c.id === cid)?.name ?? cid,
          audience: this.audience(),
          message: this.message().trim(),
          pushCount,
          pushNoChannel,
          pushFailed,
        },
        ...log,
      ]);
      this.message.set('');
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao enviar o aviso.' });
    } finally {
      this.sending.set(false);
    }
```

por:

```ts
    try {
      const sentAudience = this.audience();
      const sentPush = this.sendPush();
      const sentMessage = this.message().trim();
      const result = await sendCategoryCommunication({
        tournamentId: tid,
        categoryId: cid,
        message: this.message(),
        audience: sentAudience,
        sendPush: sentPush,
      });
      const pushCount = result.pushCount ?? 0;
      const pushNoChannel = result.pushNoChannel ?? 0;
      const pushFailed = result.pushFailed ?? 0;
      const links = result.whatsappLinks ?? [];
      this.lastResult.set({ pushCount, pushNoChannel, pushFailed, whatsappLinks: links });
      const missed = pushNoChannel + pushFailed;
      const missedNote = missed > 0 ? ` · ${missed} sem notificação (avise por WhatsApp)` : '';
      this.feedback.set({
        ok: true,
        message: `Aviso enviado — ${pushCount} push entregue${pushCount === 1 ? '' : 's'}${missedNote}${links.length ? ` · ${links.length} duplas com WhatsApp` : ''}.`,
      });
      this.sentLog.update((log) => [
        {
          id: `optimistic-${Date.now()}`,
          categoryId: cid,
          message: sentMessage,
          audience: sentAudience,
          sendPush: sentPush,
          pushCount,
          pushNoChannel,
          pushFailed,
          createdAt: new Date(),
          createdBy: '',
        },
        ...log,
      ]);
      this.message.set('');
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao enviar o aviso.' });
    } finally {
      this.sending.set(false);
    }
```

- [ ] **Step 7: Adicionar o resolvedor de nome de categoria**

Adicionar um novo método logo depois de `timeOf` (linha 382-384 do arquivo original), antes do `}` que fecha a classe:

```ts
  protected timeOf(d: Date): string {
    return TIME.format(d);
  }

  protected categoryNameOf(categoryId: string): string {
    return this.categories().find((c) => c.id === categoryId)?.name ?? categoryId;
  }
}
```

- [ ] **Step 8: Build de produção do organizer**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npm run build:organizer 2>&1 | tail -30`
Expected: `Application bundle generation complete.` sem erros de tipo (nenhuma referência a `SentLogEntry`/`s.at`/`s.categoryName` deve sobrar).

- [ ] **Step 9: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/organizer/src/app/painel/comunicacao/comunicacao.component.ts
git commit -m "$(cat <<'EOF'
feat: histórico de avisos persistente na tela Comunicação

Troca o signal local (que resetava a cada reload) pela leitura paginada
de tournaments/{id}/categoryCommunications, com prepend otimista no
envio e botão "Carregar mais".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: QA manual no dev (sem deploy automático)

**Files:** nenhum (só verificação).

- [ ] **Step 1: Confirmar que a suíte de functions ainda passa por completo**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm test 2>&1 | tail -15`
Expected: `# fail 1` (só `splitArenaBookingPaymentCore`, pré-existente e não relacionado).

- [ ] **Step 2: Parar aqui — deploy fica pra depois, com aprovação explícita**

Este plano **não inclui** `firebase deploy`. Antes de qualquer deploy (functions, firestore:rules, hosting:organizer), voltar ao usuário e confirmar ambiente (dev/prod) e escopo exato — mesmo padrão já seguido no resto desta sessão.
