# Controle de transmissão — Parte B (papel "Mídia") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** papel novo de equipe de torneio, **Mídia**, que loga no portal do organizador e
opera só a tela Transmissão (Parte A) — sem alcançar dinheiro, inscrições, chaves nem placar.

**Arquitetura:** `media` entra como quarto valor de `role` em `tournaments/{id}/staff/{uid}`. O
trigger de espelho já dá a role `organizer` a todo papel que não seja mesário; as rules liberam a
mídia **só** no doc `broadcast/control`. No portal, um guard em `eventos/:id/**` manda a mídia
para `transmissao`, e o menu do torneio mostra só esse item. No app Flutter, a mídia não opera
nada.

**Stack:** Cloud Functions (TypeScript, `node --test`), Firestore rules + emulador, Angular 20
(organizer), Flutter/Riverpod (app).

**Spec:** `docs/superpowers/specs/2026-10-01-controle-de-transmissao-design.md` (Parte B).

**Pré-requisito:** PR da Parte A mergeado. Começar de branch nova a partir da `origin/main`
atualizada (`git fetch origin && git switch -c claude/transmissao-papel-midia origin/main`) — branch
atrasada reverte a main no deploy.

## Restrições globais

- Valor gravado: `'media'`. Rótulo: "Mídia" (UI), "mídia" (frase da notificação).
- Mídia **não** entra em `canManageTournament`, `canScoreTournament`, `assertCanManageTournament`
  nem em nenhum caminho de carteira/caixa.
- Autorização é varrida **por área**, não por lista de botões: rota alcançável por URL direta
  conta como alcançável. Toda varredura entrega a tabela arquivo → ponto → estado.
- App Flutter: builds já publicados tratam papel desconhecido como gestor (`fromValue`). Risco
  aceito e documentado — rules e callables são a fronteira.
- `dart format` **não** roda em arquivo existente do app (reformata o arquivo inteiro);
  `flutter analyze` basta.
- Ordem de deploy: rules → functions → hosting do organizer → app.

## Foco de revisão

1. **Carteira do organizador:** `isActiveStaffManagerMirror` reaproveita
   `staffRoleGrantsOrganizerAccess` ("pode logar no portal"), então a mídia **ganharia** a
   carteira do dono. Task 1 fecha e testa.
2. **Mídia abrindo uma rota de operação por URL direta** (`/painel/eventos/:id/inscricoes`,
   `…/categorias/:catId/jogos`) precisa cair em `transmissao`, não numa tela que falha a cada
   leitura (Task 4 testa a função e confere a rota).
3. **Lista do guard ainda carregando:** a mídia não pode ver uma tela de operação nos primeiros
   frames; o guard espera a lista (Task 4).
4. **Papel da mídia recarregado na tela Equipe** não pode voltar como "Gestor" (`roleFromRaw`
   cai em `manager` no desconhecido — Task 3 testa).
5. **App novo** não pode listar torneio de mídia em "Torneios que eu opero" nem liberar rota de
   operação (Task 5 testa a função pura).

---

### Task 1: Backend — papel `media` e carteira fechada

**Files:**
- Modify: `functions/src/tournament-staff-sync.ts:15-42`
- Modify: `functions/src/tournament-staff-sync.test.ts`
- Modify: `functions/src/organizer-wallet-access.ts:30-35`
- Modify: `functions/src/organizer-wallet-access.test.ts`

**Interfaces:**
- Produces: `TOURNAMENT_STAFF_ROLES` com `"media"`; `staffRoleLabel("media") === "mídia"`;
  `isActiveStaffManagerMirror({role: "media"}) === false`.

- [ ] **Step 0: Preparar a worktree**

```bash
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules functions/node_modules
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules frontend/node_modules
```

(`functions/node_modules` aparece como `??` no git — nunca `git add -A`; apagar na Task 6.)

- [ ] **Step 1: Testes que falham**

Em `tournament-staff-sync.test.ts`, depois do `describe("papel eventAdmin", …)`:

```ts
describe("papel media", () => {
  it("tem rótulo próprio", () => {
    assert.equal(staffRoleLabel("media"), "mídia");
  });

  it("entra na lista de papéis aceitos", () => {
    assert.ok(TOURNAMENT_STAFF_ROLES.includes("media"));
  });

  it("ganha acesso ao portal do organizador — é lá que mora a tela Transmissão", () => {
    assert.equal(staffRoleGrantsOrganizerAccess("media"), true);
  });

  it("a notificação de adição usa o rótulo novo", () => {
    assert.equal(
      buildStaffAddedNotificationBody("media", "Copa Teste"),
      "Você agora é mídia de Copa Teste",
    );
  });
});
```

Em `organizer-wallet-access.test.ts`, no `describe("listAccessibleOrganizerIds", …)`:

```ts
  it("mídia não enxerga carteira nenhuma — loga no portal só pra Transmissão", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {role: "media", status: "active"}],
      ["tournaments/t1", {managerId: OWNER}],
    ]);
    assert.deepEqual(await listAccessibleOrganizerIds(db, STAFF), [STAFF]);
  });
```

e no `describe("assertCanAccessOrganizerWallet", …)`:

```ts
  it("mídia é barrada", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {role: "media", status: "active"}],
      ["tournaments/t1", {managerId: OWNER}],
    ]);
    await assert.rejects(
      () => assertCanAccessOrganizerWallet(db, STAFF, OWNER),
      (err: unknown) => (err as {code?: string}).code === "permission-denied",
    );
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build && node --test lib/tournament-staff-sync.test.js lib/organizer-wallet-access.test.js`
Expected: FAIL — `staffRoleLabel("media")` devolve "gestor"; `includes("media")` não compila
(o `tsc` do build já reclama: `"media"` não é membro do tipo); mídia enxerga a carteira.

- [ ] **Step 3: Implementar**

`tournament-staff-sync.ts`:

```ts
export const TOURNAMENT_STAFF_ROLES = ["manager", "eventAdmin", "scorer", "media"] as const;
```

```ts
export function staffRoleLabel(role: string): string {
  if (role === "scorer") return "mesário";
  if (role === "eventAdmin") return "administrador";
  if (role === "media") return "mídia";
  return "gestor";
}
```

Troque o comentário de `staffRoleGrantsOrganizerAccess` (corpo igual):

```ts
/** Quem LOGA no portal do organizador: todo papel menos o mesário. A mídia entra de propósito
 *  (opera a tela Transmissão), não por cair no default. ATENÇÃO: isto é "pode logar", não
 *  "alcança dinheiro" — carteira e caixa têm regra própria e mais estreita
 *  (`isActiveStaffManagerMirror`, `isActiveWithdrawalStaffMirror`). Papel ausente/desconhecido
 *  cai em gestor, mesmo default de `buildStaffMirrorData` e `staffRoleLabel`. */
```

`organizer-wallet-access.ts`:

```ts
/** Mesma regra do espelho `users/{uid}/tournamentStaff/{tid}`: mesário fora,
 *  papel ausente conta como gestor, `status` ausente conta como ativo. A mídia
 *  loga no portal (opera a Transmissão) mas não alcança carteira nenhuma —
 *  "loga no portal" e "vê dinheiro" são perguntas diferentes. */
export function isActiveStaffManagerMirror(data: Record<string, unknown>): boolean {
  const status = (data["status"] as string | undefined) ?? "active";
  const role = data["role"];
  return status === "active" && staffRoleGrantsOrganizerAccess(role) && role !== "media";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/tournament-staff-sync.test.js lib/organizer-wallet-access.test.js`
Expected: PASS.

- [ ] **Step 5: Varredura das callables (por área)**

Run: `grep -rn "tournamentStaff\|/staff/\|staffRole\|\.role\b" functions/src --include=*.ts | grep -v "\.test\.ts" | grep -v "arena"`

Para cada ocorrência, registre na descrição do PR uma linha `arquivo:linha → regra → mídia
passa?`. Estado esperado (conferido em 01/10/2026): `tournament-acl.ts` exige
`role === "manager"` (`assertCanManageTournament`) ou `manager|scorer` (a de placar) — mídia fora;
`tournament-wallet-access.ts` exige `role === "manager"` — fora; `organizer-wallet-access.ts` —
fechado no Step 3. Qualquer ocorrência nova que aceite "qualquer staff ativo" é bug desta task:
corrija com lista explícita de papéis e teste.

**Achado fora de escopo (não corrigir aqui, avisar o dono):** `isActiveStaffManagerMirror` também
deixa o **administrador** (`eventAdmin`) ver a carteira do dono, o que contradiz a decisão de
16/09 ("administrador não vê dinheiro"). A Parte B só fecha para a mídia.

- [ ] **Step 6: Commit**

```bash
git add functions/src/tournament-staff-sync.ts functions/src/tournament-staff-sync.test.ts functions/src/organizer-wallet-access.ts functions/src/organizer-wallet-access.test.ts
git commit -m "feat(staff): papel mídia na equipe do torneio, sem alcance de carteira"
```

---

### Task 2: Rules — mídia grava só o controle da transmissão

**Files:**
- Modify: `firestore.rules` (allowlist de papel em `match /staff/{staffUserId}`; `match /broadcast/{docId}` da Parte A)
- Create: `functions/test/tournament-media-role.rules.test.mjs`

- [ ] **Step 1: Teste que falha**

```js
// functions/test/tournament-media-role.rules.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-media-role-test';
const DONO = 'dono-uid';
const MIDIA = 'midia-uid';
const NOVA_MIDIA = 'nova-midia-uid';
const TORNEIO = 'copa-midia';
const APP = 'app-id';

const testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TORNEIO), { managerId: DONO, name: 'Copa Mídia', listingStatus: 'open' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', MIDIA), { role: 'media', status: 'active' });
    await setDoc(doc(db, 'artifacts', APP, 'public', 'data', 'matches', 'm1'), {
      tournamentId: TORNEIO,
      status: 'scheduled',
    });
  });
});

after(() => testEnv.cleanup());

const as = (uid) => testEnv.authenticatedContext(uid, { roles: ['organizer'] }).firestore();
const controle = (db) => doc(db, 'tournaments', TORNEIO, 'broadcast', 'control');

test('dono adiciona alguém como mídia', async () => {
  await assertSucceeds(
    setDoc(doc(as(DONO), 'tournaments', TORNEIO, 'staff', NOVA_MIDIA), {
      role: 'media',
      status: 'active',
      displayName: 'Fulano',
      nickname: '',
      photoUrl: null,
      addedBy: DONO,
    }),
  );
});

test('mídia grava o controle da transmissão', async () => {
  await assertSucceeds(
    setDoc(controle(as(MIDIA)), { graphics: { scoreboard: false }, updatedAt: serverTimestamp(), updatedBy: MIDIA }, { merge: true }),
  );
});

test('mídia lê o próprio doc de equipe', async () => {
  await assertSucceeds(getDoc(doc(as(MIDIA), 'tournaments', TORNEIO, 'staff', MIDIA)));
});

test('mídia NÃO edita o torneio', async () => {
  await assertFails(updateDoc(doc(as(MIDIA), 'tournaments', TORNEIO), { name: 'Outro nome' }));
});

test('mídia NÃO mexe na equipe', async () => {
  await assertFails(
    setDoc(doc(as(MIDIA), 'tournaments', TORNEIO, 'staff', 'alguem'), { role: 'media', status: 'active' }),
  );
});

test('mídia NÃO lança placar', async () => {
  await assertFails(
    updateDoc(doc(as(MIDIA), 'artifacts', APP, 'public', 'data', 'matches', 'm1'), { status: 'in_progress' }),
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/tournament-media-role.rules.test.mjs"`
Expected: FAIL em "dono adiciona alguém como mídia" e "mídia grava o controle".

- [ ] **Step 3: Rules**

No `match /staff/{staffUserId}`, troque
`request.resource.data.role in ['manager', 'eventAdmin', 'scorer'] &&` por:

```
          request.resource.data.role in ['manager', 'eventAdmin', 'scorer', 'media'] &&
```

No `match /broadcast/{docId}`, troque a linha `canManageTournament(tournamentId) &&` por:

```
          (canManageTournament(tournamentId) || isTournamentStaff(tournamentId, ['media'])) &&
```

e acrescente ao comentário do bloco: `// Mídia (papel de equipe) grava AQUI e em nenhum outro lugar.`

- [ ] **Step 4: Rodar e ver passar (este + os da Parte A)**

Run: `cd functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/tournament-media-role.rules.test.mjs test/tournament-broadcast.rules.test.mjs test/tournament-staff.rules.test.mjs test/tournament-event-admin.rules.test.mjs"`
Expected: PASS.

- [ ] **Step 5: Varredura das rules**

Run: `grep -n "isTournamentStaff(\|staff/\$(request.auth.uid)" firestore.rules`
Expected: toda chamada tem lista explícita; `'media'` aparece **só** no bloco `broadcast`.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules functions/test/tournament-media-role.rules.test.mjs
git commit -m "feat(rules): papel mídia grava só o controle da transmissão"
```

---

### Task 3: Portal — papel nos dados e na tela Equipe

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/staff-repository.ts:12-66`
- Modify: `frontend/projects/organizer/src/app/painel/data/staff-repository.spec.ts`
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament.model.ts:18`
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-role.ts`
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-role.spec.ts`
- Modify: `frontend/projects/organizer/src/app/painel/equipe/equipe.component.ts` (linhas 33-35, KPIs ~86-102, chips ~156-158 e ~217-219, `tabs` ~541, dica de papel ~160)

**Interfaces:**
- Produces: `TournamentStaffRole = 'manager' | 'eventAdmin' | 'scorer' | 'media'`;
  `TournamentRole = 'owner' | 'manager' | 'eventAdmin' | 'media'`;
  `roleFromStaffMirror({role:'media'}) === 'media'`; `roleFromRaw('media') === 'media'`.

- [ ] **Step 1: Testes que falham**

`tournament-role.spec.ts`, no `describe('roleFromStaffMirror', …)`:

```ts
  it('mídia é media — entra no portal só pra Transmissão', () => {
    expect(roleFromStaffMirror({ role: 'media', status: 'active' })).toBe('media');
  });

  it('mídia inativa não tem papel', () => {
    expect(roleFromStaffMirror({ role: 'media', status: 'removed' })).toBeNull();
  });
```

e no `describe` de `roleReachesMoney` (ou um novo):

```ts
  it('mídia não alcança dinheiro', () => {
    expect(roleReachesMoney('media')).toBeFalse();
  });
```

`staff-repository.spec.ts`:

```ts
describe('roleFromRaw — mídia', () => {
  it('mídia recarregada continua mídia, não volta como gestor', () => {
    expect(roleFromRaw('media')).toBe('media');
  });
});
```

(importe `roleFromRaw` de `./staff-repository` se o spec ainda não importa.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/tournament-role.spec.ts' --include='**/staff-repository.spec.ts'`
Expected: FAIL (e erro de tipo: `'media'` não é `TournamentRole`).

- [ ] **Step 3: Implementar**

`staff-repository.ts`:

```ts
export type TournamentStaffRole = 'manager' | 'eventAdmin' | 'scorer' | 'media';

export const TOURNAMENT_STAFF_ROLE_LABEL: Record<TournamentStaffRole, string> = {
  manager: 'Gestor',
  eventAdmin: 'Administrador',
  scorer: 'Mesário',
  media: 'Mídia',
};

export const TOURNAMENT_STAFF_ROLE_DESCRIPTION: Record<TournamentStaffRole, string> = {
  manager: 'Opera inscrições, chaves, agenda e placar.',
  eventAdmin: 'Organiza o torneio inteiro, mas não vê o caixa nem saca.',
  scorer: 'Lança placar das partidas.',
  media: 'Opera a transmissão (overlays do OBS).',
};
```

Em `roleFromRaw`, antes do `return 'manager';`: `if (raw === 'media') return 'media';`. Atualize o
comentário de topo do arquivo e o de `roleFromRaw` ("as rules só aceitam os quatro valores").

`tournament.model.ts`: `export type TournamentRole = 'owner' | 'manager' | 'eventAdmin' | 'media';`
e, no comentário acima, uma linha: "`media` (Mídia, 01/10/2026) entra no portal só para a tela
Transmissão — ver `media-access.ts`."

`tournament-role.ts`, em `roleFromStaffMirror`, depois da linha do `eventAdmin`:

```ts
  if (role === 'media') return 'media';
```

`equipe.component.ts`:
- `ROLE_TONE`: `media: 'green'` (o tipo de tom já aceita; não precisa de cor nova).
- `ROLE_TAB`: `media: 'mídia'`.
- `ROLE_REF`: acrescente `{ role: 'media' }`.
- `tabs`: `['todos', 'gestor', 'administrador', 'mesário', 'mídia']`.
- KPI: depois do card "Mesários", um card "Mídia" com `{{ countOf('media') }}`.
- Nos dois grupos de chips (adicionar e trocar papel), depois do chip "Mesário":

```html
<button type="button" class="og-chip" [class.active]="pickedRole() === 'media'" (click)="pickedRole.set('media')">Mídia</button>
```

```html
<button type="button" class="og-chip" [class.active]="m.role === 'media'" [disabled]="busy()" (click)="changeRole(m, 'media')">Mídia</button>
```

- Dica de papel: troque o texto por
  "O administrador organiza o evento inteiro, mas não vê o caixa nem saca — quem mexe em dinheiro é o dono e os gestores. A mídia só opera a transmissão."

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/tournament-role.spec.ts' --include='**/staff-repository.spec.ts' --include='**/staff-permissions.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/staff-repository.ts frontend/projects/organizer/src/app/painel/data/staff-repository.spec.ts frontend/projects/organizer/src/app/painel/data/tournament.model.ts frontend/projects/organizer/src/app/painel/data/tournament-role.ts frontend/projects/organizer/src/app/painel/data/tournament-role.spec.ts frontend/projects/organizer/src/app/painel/equipe/equipe.component.ts
git commit -m "feat(organizer): papel Mídia na tela Equipe e no papel por torneio"
```

---

### Task 4: Portal — mídia só alcança a Transmissão

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/data/media-access.ts`
- Test: `frontend/projects/organizer/src/app/painel/data/media-access.spec.ts`
- Create: `frontend/projects/organizer/src/app/painel/shell/media-tournament.guard.ts`
- Modify: `frontend/projects/organizer/src/app/app.routes.ts` (rota `eventos/:id`: `canActivateChild`)
- Modify: `frontend/projects/organizer/src/app/app.routes.spec.ts`
- Modify: `frontend/projects/organizer/src/app/painel/shell/panel-context.service.ts` (sinal `myRole`)
- Modify: `frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts:418-431` (menu do torneio)

**Interfaces:**
- Consumes: `TournamentRole` (Task 3); `ChaveamentoContextService` (`ensureLoaded()`, `loadingTournaments`, `tournaments()` com `myRole`).
- Produces:
  - `mediaRedirectFor(role: TournamentRole | null, url: string, tournamentId: string): string | null`
  - `tournamentMenuFor(role: TournamentRole | null): 'completo' | 'transmissao'`
  - `mediaTournamentGuard: CanActivateChildFn`
  - `PanelContextService.myRole: Signal<TournamentRole | null>`

- [ ] **Step 1: Spec que falha**

```ts
// frontend/projects/organizer/src/app/painel/data/media-access.spec.ts
import { mediaRedirectFor, tournamentMenuFor } from './media-access';

describe('mediaRedirectFor', () => {
  it('quem não é mídia passa sem desvio', () => {
    expect(mediaRedirectFor('manager', '/painel/eventos/t1/inscricoes', 't1')).toBeNull();
    expect(mediaRedirectFor(null, '/painel/eventos/t1', 't1')).toBeNull();
  });

  it('mídia na Transmissão fica', () => {
    expect(mediaRedirectFor('media', '/painel/eventos/t1/transmissao', 't1')).toBeNull();
    expect(mediaRedirectFor('media', '/painel/eventos/t1/transmissao?x=1', 't1')).toBeNull();
  });

  it('mídia em qualquer outra tela do torneio vai pra Transmissão — inclusive por URL direta', () => {
    for (const url of [
      '/painel/eventos/t1',
      '/painel/eventos/t1/inscricoes',
      '/painel/eventos/t1/equipe',
      '/painel/eventos/t1/categorias/c1/jogos',
      '/painel/eventos/t1/categorias/c1/ao-vivo/m1',
    ]) {
      expect(mediaRedirectFor('media', url, 't1')).toBe('/painel/eventos/t1/transmissao');
    }
  });
});

describe('tournamentMenuFor', () => {
  it('mídia vê só a Transmissão; o resto, o menu completo', () => {
    expect(tournamentMenuFor('media')).toBe('transmissao');
    expect(tournamentMenuFor('eventAdmin')).toBe('completo');
    expect(tournamentMenuFor(null)).toBe('completo');
  });
});
```

Em `app.routes.spec.ts`:

```ts
  it('rotas do torneio passam pelo guard da mídia', () => {
    const torneio = findRoute(routes, ['painel', 'eventos/:id']);
    expect(torneio?.canActivateChild?.length ?? 0).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/media-access.spec.ts' --include='**/app.routes.spec.ts'`
Expected: FAIL.

- [ ] **Step 3: Implementar a regra pura**

```ts
// frontend/projects/organizer/src/app/painel/data/media-access.ts
import type { TournamentRole } from './tournament.model';

/** Para onde mandar a mídia que tentou abrir `url` dentro do torneio. A mídia (papel de equipe,
 *  01/10/2026) entra no portal SÓ pra tela Transmissão: qualquer outra rota do torneio — mesmo
 *  digitada à mão — volta pra ela, em vez de abrir uma tela cujas leituras as rules recusam.
 *  `null` = pode seguir. */
export function mediaRedirectFor(role: TournamentRole | null, url: string, tournamentId: string): string | null {
  if (role !== 'media') return null;
  const alvo = `/painel/eventos/${tournamentId}/transmissao`;
  const path = url.split('?')[0]!.split('#')[0]!;
  return path === alvo ? null : alvo;
}

/** Menu lateral do nível torneio. */
export function tournamentMenuFor(role: TournamentRole | null): 'completo' | 'transmissao' {
  return role === 'media' ? 'transmissao' : 'completo';
}
```

- [ ] **Step 4: Guard**

```ts
// frontend/projects/organizer/src/app/painel/shell/media-tournament.guard.ts
import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateChildFn } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { ChaveamentoContextService } from '../chaveamento/chaveamento-context.service';
import { mediaRedirectFor } from '../data/media-access';

/** `eventos/:id/**`: a mídia só alcança a Transmissão. Espera a lista de torneios do usuário
 *  (é ela que traz `myRole`) — decidir antes disso deixaria a mídia ver uma tela de operação nos
 *  primeiros frames. Quem não é mídia passa sem custo extra além dessa espera, que as telas do
 *  torneio já fazem. */
export const mediaTournamentGuard: CanActivateChildFn = (route, state) => {
  const ctx = inject(ChaveamentoContextService);
  const router = inject(Router);
  // `canActivateChild` roda também pros NETOS (`categorias/:catId/jogos`), cujo pai direto não
  // tem `:id` — e o app não liga `paramsInheritanceStrategy: 'always'`. Sobe a árvore inteira.
  const tournamentId = route.pathFromRoot.map((r) => r.paramMap.get('id')).find((id) => !!id) ?? '';
  ctx.ensureLoaded();
  return toObservable(ctx.loadingTournaments).pipe(
    filter((loading) => !loading),
    take(1),
    map(() => {
      const role = ctx.tournaments().find((t) => t.id === tournamentId)?.myRole ?? null;
      const alvo = mediaRedirectFor(role, state.url, tournamentId);
      return alvo ? router.parseUrl(alvo) : true;
    }),
  );
};
```

> `toObservable` exige contexto de injeção — o guard funcional roda nele. Se o `ng test` acusar
> `NG0203`, troque por `toObservable(ctx.loadingTournaments, { injector: inject(Injector) })`.

- [ ] **Step 5: Ligar o guard e o menu**

`app.routes.ts`, no objeto `path: 'eventos/:id'` (o que tem `children`), acrescente
`canActivateChild: [mediaTournamentGuard],` e o import
`import { mediaTournamentGuard } from './painel/shell/media-tournament.guard';`.

`panel-context.service.ts`, junto dos outros `computed` (o serviço já injeta
`ChaveamentoContextService` como `chav`):

```ts
  /** Papel de quem está logado no torneio do contexto (`listMyTournaments`). `null` enquanto a
   *  lista carrega ou para torneio fora dela (super admin). */
  readonly myRole = computed(() => {
    const id = this.tournamentId();
    return id ? (this.chav.tournaments().find((t) => t.id === id)?.myRole ?? null) : null;
  });
```

`panel-shell.component.ts`, no ramo `if (level === 'torneio') {`, logo depois de
`const base = this.ctx.tournamentBase()!;`:

```ts
      // Mídia só opera a transmissão — o guard já desvia as outras rotas; o menu não as oferece.
      if (tournamentMenuFor(this.ctx.myRole()) === 'transmissao') {
        return [{ label: 'Transmissão', icon: 'broadcast', link: `${base}/transmissao` }];
      }
```

com `import { tournamentMenuFor } from '../data/media-access';`.

- [ ] **Step 6: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/media-access.spec.ts' --include='**/app.routes.spec.ts' --include='**/panel-shell*.spec.ts'`
Expected: PASS.

- [ ] **Step 7: Varredura por área (registrar no PR)**

Liste TODAS as rotas filhas de `eventos/:id` em `app.routes.ts` e confirme que cada uma passa
pelo guard (o `canActivateChild` do pai cobre filhos e netos). Depois, para as telas GLOBAIS que a
mídia alcança por ter a role `organizer` (Início, Meus eventos, Criar evento, Financeiro), abra
cada componente e anote: lê algo que a mídia não pode ler? A tela trata o erro sem quebrar? Tabela
esperada no PR:

| Área | Rota | Mídia | Estado |
|---|---|---|---|
| Torneio | `eventos/:id` e todos os filhos | desviada p/ `transmissao` | guard |
| Torneio | `eventos/:id/transmissao` | opera | rules: `broadcast` |
| Global | `inicio`, `eventos` | vê seus torneios | anotar o que cada KPI lê |
| Global | Financeiro | sem item de menu | `roleReachesMoney('media') === false` |

Qualquer tela global que quebre com a mídia (erro não tratado de permissão) vira correção nesta
task, com spec.

- [ ] **Step 7b: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/media-access.ts frontend/projects/organizer/src/app/painel/data/media-access.spec.ts frontend/projects/organizer/src/app/painel/shell/media-tournament.guard.ts frontend/projects/organizer/src/app/app.routes.ts frontend/projects/organizer/src/app/app.routes.spec.ts frontend/projects/organizer/src/app/painel/shell/panel-context.service.ts frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts
git commit -m "feat(organizer): mídia entra no torneio só pela tela Transmissão"
```

---

### Task 5: App Flutter — mídia reconhecida e sem operação

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/tournament_staff/tournament_staff_models.dart:11-38`
- Modify: `nexago_app/lib/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart:53-75`
- Modify: `nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_staff_page.dart:84-90`
- Modify: `nexago_app/test/features/organizer/tournament_staff_models_test.dart`

**Interfaces:**
- Produces: `TournamentStaffRole.media` (`'media'`, `'Mídia'`); `List<MyTournamentStaffEntry> operableStaffEntries(Iterable<MyTournamentStaffEntry> entries)`.

- [ ] **Step 1: Testes que falham**

Em `tournament_staff_models_test.dart`, dentro de `group('TournamentStaffRole', …)`:

```dart
    test('reconhece mídia em vez de cair em gestor', () {
      expect(TournamentStaffRole.fromValue('media'), TournamentStaffRole.media);
      expect(TournamentStaffRole.media.label, 'Mídia');
      expect(TournamentStaffRole.media.value, 'media');
      expect(TournamentStaffRole.media.description, contains('transmissão'));
    });

    test('mídia não vê dinheiro', () {
      expect(
        tournamentStaffSeesMoney(isOwner: false, roleLoaded: true, role: TournamentStaffRole.media),
        isFalse,
      );
    });
```

e, no fim do `main()`:

```dart
  group('operableStaffEntries', () {
    MyTournamentStaffEntry entry(TournamentStaffRole role, {String status = 'active'}) =>
        MyTournamentStaffEntry(
          tournamentId: 't-${role.value}',
          role: role,
          status: status,
          tournamentName: 'Copa',
          startAt: null,
          endAt: null,
        );

    test('mídia não opera nada no app — a transmissão é só no portal', () {
      final out = operableStaffEntries([
        entry(TournamentStaffRole.manager),
        entry(TournamentStaffRole.media),
        entry(TournamentStaffRole.scorer, status: 'removed'),
      ]);
      expect(out.map((e) => e.role), [TournamentStaffRole.manager]);
    });
  });
```

(importe `my_tournament_staff_providers.dart`; confira os parâmetros do construtor de
`MyTournamentStaffEntry` nas linhas 14-30 do arquivo e ajuste os nomes se diferirem.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/organizer/tournament_staff_models_test.dart`
Expected: FAIL — `media` não existe.

- [ ] **Step 3: Implementar**

`tournament_staff_models.dart`, no enum:

```dart
  scorer('scorer', 'Mesário'),
  media('media', 'Mídia');
```

e no `description`:

```dart
        TournamentStaffRole.media =>
          'Opera a transmissão (overlays do OBS) no portal web',
```

Atualize o comentário de `fromValue`: "Papel desconhecido conta como gestor — builds anteriores ao
papel `media` caem aqui e mostram a mídia como gestora; rules e callables recusam as escritas."

`my_tournament_staff_providers.dart`, antes de `myTournamentStaffEntriesProvider`:

```dart
/// Entradas que dão operação de torneio NO APP: ativas e não-mídia. A mídia
/// (01/10/2026) opera só a tela Transmissão do portal web; aqui ela não tem
/// rota nenhuma — e por isso também não aparece em "Torneios que eu opero".
List<MyTournamentStaffEntry> operableStaffEntries(
  Iterable<MyTournamentStaffEntry> entries,
) {
  return entries
      .where((e) => e.isActive && e.role != TournamentStaffRole.media)
      .toList();
}
```

e no provider troque

```dart
    final entries = snap.docs
        .map(MyTournamentStaffEntry.fromFirestore)
        .where((entry) => entry.isActive)
        .toList();
```

por

```dart
    final entries = operableStaffEntries(
      snap.docs.map(MyTournamentStaffEntry.fromFirestore),
    );
```

`organizer_tournament_staff_page.dart`, no ícone da lista de papéis:

```dart
                leading: Icon(
                  switch (role) {
                    TournamentStaffRole.scorer => Icons.scoreboard_rounded,
                    TournamentStaffRole.media => Icons.videocam_rounded,
                    _ => Icons.manage_accounts_rounded,
                  },
                  color: AppColors.brand,
                ),
```

- [ ] **Step 4: Rodar e ver passar + analyze**

Run: `cd nexago_app && flutter test test/features/organizer/tournament_staff_models_test.dart test/features/organizer/my_ongoing_tournament_staff_entries_provider_test.dart test/features/organizer/organizer_tournament_financial_page_gate_test.dart && flutter analyze lib/features/organizer`
Expected: PASS; analyze sem issues novas. Se algum `switch` exaustivo sobre `TournamentStaffRole`
em outro arquivo acusar caso faltando, trate a mídia como "sem operação" (mesmo ramo do mesário
onde a pergunta é "opera?") e anote o arquivo no PR.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/organizer/domain/tournament_staff/tournament_staff_models.dart nexago_app/lib/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart nexago_app/lib/features/organizer/presentation/category_ops/organizer_tournament_staff_page.dart nexago_app/test/features/organizer/tournament_staff_models_test.dart
git commit -m "feat(app): papel Mídia reconhecido na equipe e sem operação no app"
```

---

### Task 6: Verificação e PR

- [ ] **Step 1: Suítes**

```bash
cd functions && npm run build && npm test
```

```bash
cd functions && npm run test:rules
```

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless
```

```bash
cd frontend && npx ng build organizer --configuration production
```

Expected: tudo verde (exceto falhas pré-existentes conhecidas, conferidas contra a `main`).

- [ ] **Step 2: Limpar a worktree**

```bash
rm functions/node_modules
git status --short
```

Expected: árvore limpa.

- [ ] **Step 3: PR**

```bash
git fetch origin main
git rev-list --count HEAD..origin/main
git push -u origin claude/transmissao-papel-midia
gh pr create --base main --title "feat: papel Mídia opera a transmissão do torneio" --body "$(cat <<'EOF'
## O que muda
- Papel de equipe **Mídia** (`role: 'media'`): loga no portal do organizador e opera **só** a tela Transmissão.
- Rules: mídia grava apenas `tournaments/{id}/broadcast/control`.
- Portal: guard em `eventos/:id/**` desvia a mídia para `transmissao`; menu do torneio mostra só esse item; chip "Mídia" na tela Equipe.
- Carteira do organizador fechada para a mídia (`isActiveStaffManagerMirror`).
- App: enum `media`; a mídia não opera nada no app.

## Varreduras
(SUBSTITUIR esta linha, antes de rodar o comando, pelas três tabelas produzidas na Task 1 Step 5,
Task 2 Step 5 e Task 4 Step 7.)

## Risco aceito
Apps já publicados mostram a mídia como **gestor** (`fromValue` cai no default). As rules e callables recusam as escritas.

## Achado fora de escopo
`isActiveStaffManagerMirror` deixa o **administrador** ver a carteira do dono — contradiz a decisão de 16/09. Não corrigido aqui.

## Deploy
rules → functions → hosting do organizer → app.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
