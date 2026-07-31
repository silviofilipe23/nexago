# Equipe da arena e RBAC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o dono da arena convide membros com cargos fixos, e que o cargo limite de verdade o que cada um alcança — no menu do portal e nas rules do Firestore.

**Architecture:** Vínculo em `arenas/{arenaId}/staff/{uid}` (espelhado em `users/{uid}/arenaStaff/{arenaId}` para o portal descobrir a arena) e convites pendentes em `arenaStaffInvites/{inviteId}`. Uma matriz cargo→área é replicada em três camadas (portal TS, functions TS, mapa literal nas rules); as rules são a autoridade, a UI só antecipa o resultado. Escrita nas coleções de equipe é fechada ao cliente — tudo passa por callables que validam plano e assentos.

**Tech Stack:** Angular 20 (standalone, signals, OnPush) · Firebase JS SDK v12 · Cloud Functions v2 (Node 22, TypeScript) · Firestore rules · testes: `node --test` (functions), `@firebase/rules-unit-testing` + emulador (rules), Karma/Jasmine (`ng test arena`).

**Spec:** `docs/superpowers/specs/2026-07-31-arena-equipe-rbac-design.md`

## Global Constraints

- **Idioma:** strings de UI e mensagens de erro em português; código, identificadores e nomes de arquivo em inglês.
- **Angular:** standalone components (nunca `standalone: true` explícito), `ChangeDetectionStrategy.OnPush`, `input()`/`output()` em vez de decorators, `inject()` em vez de constructor injection, signals para estado, `@if`/`@for` (nunca `*ngIf`/`*ngFor`), bindings `class`/`style` (nunca `ngClass`/`ngStyle`).
- **TypeScript:** strict; proibido `any` (usar `unknown`).
- **Cargos (ids canônicos, nunca traduzidos no dado):** `'gestor' | 'recepcao' | 'financeiro' | 'manutencao'`.
- **Áreas (ids canônicos):** `'agenda' | 'comandas' | 'estoque' | 'financeiro' | 'promocoes' | 'site' | 'quadras' | 'perfil' | 'torneios' | 'comunidade'`.
- **Tiers com titularidade que permitem equipe:** `['pro', 'elite', 'parceiro']` — `parceiro` é id legado de `elite` e precisa estar em toda lista de tiers, como as rules existentes já fazem.
- **Assentos:** sem plano/`starter` = 0 · `pro` = 5 · `elite`/`parceiro` = ilimitado.
- **Retrocompatibilidade:** o dono (`arenas/{id}.managerUserId`) nunca perde nenhum acesso que tem hoje. Toda rule alterada tem de manter `isArenaOwner(arenaId)` como primeiro ramo do OR.
- **Prettier:** `printWidth: 100`, `singleQuote: true` (configurado em `frontend/package.json`).
- **Todos os comandos** deste plano rodam a partir da **raiz do worktree** (onde estão `firebase.json` e `firestore.rules`), salvo quando o comando traz `--prefix`.

---

## File Structure

**Criados:**

| arquivo | responsabilidade |
|---|---|
| `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts` | matriz cargo→área do portal (fonte da UI) |
| `frontend/projects/arena/src/app/painel/data/arena-roles.model.spec.ts` | testes da matriz |
| `frontend/projects/arena/src/app/painel/data/arena-access.service.ts` | papel efetivo + `canRead`/`canWrite`/`isOwner` |
| `frontend/projects/arena/src/app/painel/data/arena-access.service.spec.ts` | testes do serviço |
| `frontend/projects/arena/src/app/painel/data/arena-staff.model.ts` | tipos de membro/convite + parsers de doc |
| `frontend/projects/arena/src/app/painel/data/arena-staff.service.ts` | leitura ao vivo de staff/convites + chamadas dos callables |
| `frontend/projects/arena/src/app/auth/arena-area.guard.ts` | `arenaAreaGuard(area)` e `arenaOwnerGuard` |
| `frontend/projects/arena/src/app/auth/accept-invite.component.ts` | rota `/convite/:inviteId` |
| `functions/src/arena-staff-roles.ts` | matriz + assentos (lógica pura, testável) |
| `functions/src/arena-staff-roles.test.ts` | testes da lógica pura |
| `functions/src/arena-staff-ops.ts` | os 4 callables |
| `functions/src/arena-staff-ops.test.ts` | testes dos callables (lógica extraída) |
| `functions/src/arena-staff-sync.ts` | trigger de espelho, cleanup e sweeper |
| `functions/src/arena-staff-sync.test.ts` | testes do espelho |
| `functions/test/arena-staff-rbac.rules.test.mjs` | testes de rules da matriz |

**Modificados:**

| arquivo | mudança |
|---|---|
| `firestore.rules` | helpers de staff + ~30 blocos de arena + 3 blocos novos |
| `functions/src/index.ts` | exports das funções novas |
| `frontend/projects/arena/src/app/painel/data/arena-plan.model.ts` | capability `equipe` |
| `frontend/projects/arena/src/app/painel/data/arena-context.service.ts` | une dono + espelho de staff |
| `frontend/projects/arena/src/app/app.routes.ts` | guards por área + rota `/convite/:inviteId` |
| `frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts` | `area` em cada nav item + filtro |
| `frontend/projects/arena/src/app/painel/team/panel-team.component.ts` | mock → dados reais |
| `frontend/projects/arena/src/app/painel/home/panel-home.component.ts` | KPI financeiro condicional |

---

## Task 1: Matriz de papéis do portal

**Files:**
- Create: `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts`
- Test: `frontend/projects/arena/src/app/painel/data/arena-roles.model.spec.ts`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: `ArenaStaffRole`, `ArenaArea`, `ARENA_STAFF_ROLES`, `ARENA_AREAS`, `arenaRoleCanRead(role, area): boolean`, `arenaRoleCanWrite(role, area): boolean`, `ARENA_ROLE_LABEL: Record<ArenaStaffRole, string>`, `ARENA_ROLE_DESCRIPTION: Record<ArenaStaffRole, string>`, `ARENA_ROLE_AREA_LABELS: Record<ArenaStaffRole, string[]>`

- [ ] **Step 1: Write the failing test**

Criar `frontend/projects/arena/src/app/painel/data/arena-roles.model.spec.ts`:

```ts
import {
  ARENA_AREAS,
  ARENA_ROLE_LABEL,
  ARENA_STAFF_ROLES,
  arenaRoleCanRead,
  arenaRoleCanWrite,
} from './arena-roles.model';

describe('arena-roles.model', () => {
  it('gestor escreve em tudo menos financeiro e torneios', () => {
    expect(arenaRoleCanWrite('gestor', 'agenda')).toBe(true);
    expect(arenaRoleCanWrite('gestor', 'perfil')).toBe(true);
    expect(arenaRoleCanWrite('gestor', 'site')).toBe(true);
    expect(arenaRoleCanWrite('gestor', 'financeiro')).toBe(false);
    expect(arenaRoleCanWrite('gestor', 'torneios')).toBe(false);
  });

  it('gestor le financeiro e torneios', () => {
    expect(arenaRoleCanRead('gestor', 'financeiro')).toBe(true);
    expect(arenaRoleCanRead('gestor', 'torneios')).toBe(true);
  });

  it('recepcao escreve agenda e comandas, le estoque, nao ve financeiro', () => {
    expect(arenaRoleCanWrite('recepcao', 'agenda')).toBe(true);
    expect(arenaRoleCanWrite('recepcao', 'comandas')).toBe(true);
    expect(arenaRoleCanWrite('recepcao', 'estoque')).toBe(false);
    expect(arenaRoleCanRead('recepcao', 'estoque')).toBe(true);
    expect(arenaRoleCanRead('recepcao', 'financeiro')).toBe(false);
  });

  it('financeiro nao alcanca agenda nem perfil', () => {
    expect(arenaRoleCanWrite('financeiro', 'financeiro')).toBe(true);
    expect(arenaRoleCanWrite('financeiro', 'promocoes')).toBe(true);
    expect(arenaRoleCanRead('financeiro', 'comandas')).toBe(true);
    expect(arenaRoleCanWrite('financeiro', 'comandas')).toBe(false);
    expect(arenaRoleCanRead('financeiro', 'agenda')).toBe(false);
    expect(arenaRoleCanRead('financeiro', 'perfil')).toBe(false);
  });

  it('manutencao escreve quadras e estoque, le agenda', () => {
    expect(arenaRoleCanWrite('manutencao', 'quadras')).toBe(true);
    expect(arenaRoleCanWrite('manutencao', 'estoque')).toBe(true);
    expect(arenaRoleCanRead('manutencao', 'agenda')).toBe(true);
    expect(arenaRoleCanWrite('manutencao', 'agenda')).toBe(false);
    expect(arenaRoleCanRead('manutencao', 'financeiro')).toBe(false);
    expect(arenaRoleCanRead('manutencao', 'comandas')).toBe(false);
  });

  it('escrita sempre implica leitura', () => {
    for (const role of ARENA_STAFF_ROLES) {
      for (const area of ARENA_AREAS) {
        if (arenaRoleCanWrite(role, area)) {
          expect(arenaRoleCanRead(role, area))
            .withContext(`${role} escreve ${area} mas nao le`)
            .toBe(true);
        }
      }
    }
  });

  it('cargo desconhecido nao alcanca nada', () => {
    for (const area of ARENA_AREAS) {
      expect(arenaRoleCanRead('sindico' as never, area)).toBe(false);
      expect(arenaRoleCanWrite('sindico' as never, area)).toBe(false);
    }
  });

  it('todo cargo tem rotulo', () => {
    for (const role of ARENA_STAFF_ROLES) {
      expect(ARENA_ROLE_LABEL[role].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `Cannot find module './arena-roles.model'`

- [ ] **Step 3: Write minimal implementation**

Criar `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts`:

```ts
/** Matriz de acesso por cargo da equipe da arena.
 *
 *  ESPELHO MANUAL — esta matriz existe em três lugares e os três precisam andar juntos:
 *   1. este arquivo (UI: menu, guards, telas);
 *   2. `functions/src/arena-staff-roles.ts` (validação server-side dos callables);
 *   3. o mapa literal em `firestore.rules` (a autoridade de verdade).
 *  `functions/test/arena-staff-rbac.rules.test.mjs` quebra se 1 e 3 divergirem. */

export const ARENA_STAFF_ROLES = ['gestor', 'recepcao', 'financeiro', 'manutencao'] as const;
export type ArenaStaffRole = (typeof ARENA_STAFF_ROLES)[number];

export const ARENA_AREAS = [
  'agenda',
  'comandas',
  'estoque',
  'financeiro',
  'promocoes',
  'site',
  'quadras',
  'perfil',
  'torneios',
  'comunidade',
] as const;
export type ArenaArea = (typeof ARENA_AREAS)[number];

/** Áreas em que o cargo pode escrever. Escrita implica leitura (ver ARENA_READ_AREAS). */
const ARENA_WRITE_AREAS: Record<ArenaStaffRole, readonly ArenaArea[]> = {
  gestor: ['agenda', 'comandas', 'estoque', 'promocoes', 'site', 'quadras', 'perfil', 'comunidade'],
  recepcao: ['agenda', 'comandas'],
  financeiro: ['financeiro', 'promocoes'],
  manutencao: ['quadras', 'estoque'],
};

/** Áreas só de leitura, somadas às de escrita. */
const ARENA_READ_ONLY_AREAS: Record<ArenaStaffRole, readonly ArenaArea[]> = {
  gestor: ['financeiro', 'torneios'],
  recepcao: ['estoque', 'comunidade'],
  financeiro: ['comandas', 'comunidade'],
  manutencao: ['agenda'],
};

export function arenaRoleCanWrite(role: ArenaStaffRole, area: ArenaArea): boolean {
  return (ARENA_WRITE_AREAS[role] ?? []).includes(area);
}

export function arenaRoleCanRead(role: ArenaStaffRole, area: ArenaArea): boolean {
  return arenaRoleCanWrite(role, area) || (ARENA_READ_ONLY_AREAS[role] ?? []).includes(area);
}

export const ARENA_ROLE_LABEL: Record<ArenaStaffRole, string> = {
  gestor: 'Gestor',
  recepcao: 'Recepção',
  financeiro: 'Financeiro',
  manutencao: 'Manutenção',
};

export const ARENA_ROLE_DESCRIPTION: Record<ArenaStaffRole, string> = {
  gestor: 'Opera a arena inteira; vê o financeiro sem poder alterá-lo',
  recepcao: 'Agenda, reservas e comandas do balcão',
  financeiro: 'Financeiro, relatórios, cupons e promoções',
  manutencao: 'Quadras e estoque, sem acesso a dinheiro',
};

/** Frases exibidas no modal de convite ("Este cargo terá acesso a"). */
export const ARENA_ROLE_AREA_LABELS: Record<ArenaStaffRole, readonly string[]> = {
  gestor: [
    'Agenda, reservas e horários fixos',
    'Comandas, estoque e promoções',
    'Quadras, perfil e site da arena',
    'Financeiro (somente leitura)',
  ],
  recepcao: ['Agenda, reservas e horários fixos', 'Comandas e clubinho', 'Estoque (consulta)'],
  financeiro: ['Financeiro e relatórios', 'Ocupação', 'Cupons e promoções'],
  manutencao: ['Quadras', 'Estoque', 'Agenda (consulta)'],
};

export function isArenaStaffRole(value: unknown): value is ArenaStaffRole {
  return typeof value === 'string' && (ARENA_STAFF_ROLES as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS — todos os specs de `arena-roles.model`

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/data/arena-roles.model.ts frontend/projects/arena/src/app/painel/data/arena-roles.model.spec.ts
git commit -m "feat(arena-web): matriz de acesso por cargo da equipe"
```

---

## Task 2: Matriz e assentos nas Cloud Functions

**Files:**
- Create: `functions/src/arena-staff-roles.ts`
- Test: `functions/src/arena-staff-roles.test.ts`

**Interfaces:**
- Consumes: `arenaEntitledTier(arena, nowMs)` de `functions/src/arena-entitlement.ts` (já existe; devolve `'starter' | 'pro' | 'elite' | null`, normalizando `parceiro` → `elite`)
- Produces: `ARENA_STAFF_ROLES`, `ArenaStaffRole`, `isArenaStaffRole(v): v is ArenaStaffRole`, `maxArenaStaffSeats(arena, nowMs): number` (`Infinity` = ilimitado), `normalizeInviteEmail(raw): string`

- [ ] **Step 1: Write the failing test**

Criar `functions/src/arena-staff-roles.test.ts`:

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {
  isArenaStaffRole,
  maxArenaStaffSeats,
  normalizeInviteEmail,
} from "./arena-staff-roles";

const NOW = Date.UTC(2026, 6, 31);

test("isArenaStaffRole aceita so os quatro cargos", () => {
  assert.equal(isArenaStaffRole("gestor"), true);
  assert.equal(isArenaStaffRole("recepcao"), true);
  assert.equal(isArenaStaffRole("financeiro"), true);
  assert.equal(isArenaStaffRole("manutencao"), true);
  assert.equal(isArenaStaffRole("dono"), false);
  assert.equal(isArenaStaffRole(""), false);
  assert.equal(isArenaStaffRole(undefined), false);
});

test("sem plano nao tem assento", () => {
  assert.equal(maxArenaStaffSeats({}, NOW), 0);
});

test("starter ativo nao tem assento", () => {
  assert.equal(
    maxArenaStaffSeats({planTier: "starter", planStatus: "active"}, NOW),
    0,
  );
});

test("pro ativo tem 5 assentos", () => {
  assert.equal(maxArenaStaffSeats({planTier: "pro", planStatus: "active"}, NOW), 5);
});

test("elite ativo e ilimitado", () => {
  assert.equal(
    maxArenaStaffSeats({planTier: "elite", planStatus: "active"}, NOW),
    Infinity,
  );
});

test("parceiro (id legado) e tratado como elite", () => {
  assert.equal(
    maxArenaStaffSeats({planTier: "parceiro", planStatus: "active"}, NOW),
    Infinity,
  );
});

test("pro vencido fora da carencia perde os assentos", () => {
  const venceuHa30Dias = {
    planTier: "pro",
    planStatus: "overdue",
    planActiveUntil: {toMillis: () => NOW - 30 * 24 * 60 * 60 * 1000},
  };
  assert.equal(maxArenaStaffSeats(venceuHa30Dias, NOW), 0);
});

test("pro vencido dentro da carencia mantem os assentos", () => {
  const venceuOntem = {
    planTier: "pro",
    planStatus: "overdue",
    planActiveUntil: {toMillis: () => NOW - 24 * 60 * 60 * 1000},
  };
  assert.equal(maxArenaStaffSeats(venceuOntem, NOW), 5);
});

test("normalizeInviteEmail apara e minusculiza", () => {
  assert.equal(normalizeInviteEmail("  Rafael@Arena.COM "), "rafael@arena.com");
  assert.equal(normalizeInviteEmail(""), "");
  assert.equal(normalizeInviteEmail(undefined), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix functions test`
Expected: FAIL na compilação — `Cannot find module './arena-staff-roles'`

- [ ] **Step 3: Write minimal implementation**

Criar `functions/src/arena-staff-roles.ts`:

```ts
import {arenaEntitledTier, type ArenaPlanFields} from "./arena-entitlement";

/** ESPELHO MANUAL da matriz de acesso — ver o cabeçalho de
 *  `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts`. Aqui só vivem
 *  os cargos e o limite de assentos; a matriz de áreas é aplicada pelas rules. */

export const ARENA_STAFF_ROLES = [
  "gestor",
  "recepcao",
  "financeiro",
  "manutencao",
] as const;
export type ArenaStaffRole = (typeof ARENA_STAFF_ROLES)[number];

export function isArenaStaffRole(value: unknown): value is ArenaStaffRole {
  return typeof value === "string" &&
    (ARENA_STAFF_ROLES as readonly string[]).includes(value);
}

/** Assentos de equipe por titularidade de plano. Sem plano e Starter não têm
 *  equipe (o catálogo vende Starter como "1 admin"); Pro tem 5; Elite é
 *  ilimitado. `parceiro` já chega aqui normalizado como `elite`. */
export function maxArenaStaffSeats(
  arena: ArenaPlanFields,
  nowMs: number,
): number {
  switch (arenaEntitledTier(arena, nowMs)) {
  case "elite":
    return Infinity;
  case "pro":
    return 5;
  default:
    return 0;
  }
}

/** Chave de casamento do convite: sempre aparada e em minúsculas. */
export function normalizeInviteEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix functions test`
Expected: PASS — os 9 testes de `arena-staff-roles`

Se `arenaEntitledTier` não aceitar o formato `{toMillis}` do teste, abrir `functions/src/arena-entitlement.ts` e usar exatamente o mesmo shape de `ArenaPlanFields` que ele já declara — o teste deve refletir o tipo real, não o contrário.

- [ ] **Step 5: Commit**

```bash
git add functions/src/arena-staff-roles.ts functions/src/arena-staff-roles.test.ts
git commit -m "feat(functions): cargos da equipe de arena e limite de assentos por plano"
```

---

## Task 3: Capability `equipe` no portal

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/data/arena-plan.model.ts:10-17` (tipo) e `:73-98` (função)
- Test: `frontend/projects/arena/src/app/painel/data/arena-plan.model.spec.ts` (criar se não existir)

**Interfaces:**
- Consumes: nada
- Produces: `ArenaCapability` passa a incluir `'equipe'`; `arenaCapabilitiesFor` devolve `'equipe'` para `pro` e `elite` com titularidade

- [ ] **Step 1: Write the failing test**

Criar (ou acrescentar a) `frontend/projects/arena/src/app/painel/data/arena-plan.model.spec.ts`:

```ts
import { arenaCapabilitiesFor } from './arena-plan.model';

describe('arenaCapabilitiesFor — capability equipe', () => {
  it('pro com titularidade tem equipe', () => {
    expect(arenaCapabilitiesFor('pro', true).has('equipe')).toBe(true);
  });

  it('elite com titularidade tem equipe', () => {
    expect(arenaCapabilitiesFor('elite', true).has('equipe')).toBe(true);
  });

  it('starter nao tem equipe', () => {
    expect(arenaCapabilitiesFor('starter', true).has('equipe')).toBe(false);
  });

  it('sem titularidade nao tem equipe mesmo em elite', () => {
    expect(arenaCapabilitiesFor('elite', false).has('equipe')).toBe(false);
  });

  it('sem plano nao tem equipe', () => {
    expect(arenaCapabilitiesFor(null, false).has('equipe')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: FAIL — os dois primeiros casos retornam `false`

- [ ] **Step 3: Write minimal implementation**

Em `arena-plan.model.ts`, acrescentar `'equipe'` ao tipo:

```ts
export type ArenaCapability =
  | 'pdvComandas'
  | 'estoque'
  | 'promocoes'
  | 'clubinho'
  | 'metricasCompletas'
  | 'receberTorneios'
  | 'multiUnidade'
  | 'equipe';
```

E incluir `'equipe'` nos dois `Set` de `arenaCapabilitiesFor` — no caso `'elite'` e no caso `'pro'`. O caso `default` continua devolvendo `Set` vazio.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/data/arena-plan.model.ts frontend/projects/arena/src/app/painel/data/arena-plan.model.spec.ts
git commit -m "feat(arena-web): capability equipe nos planos Pro e Elite"
```

---

## Task 4: Rules — coleções da equipe

Esta task cria só os três blocos novos (staff, convites, espelho) e os helpers. Os ~30 blocos existentes ficam para a Task 5, para que um revisor possa aprovar a base sem engolir a reescrita inteira.

**Files:**
- Modify: `firestore.rules` (helpers perto de `isArenaManagerByArenaId`, linha ~360; blocos novos depois de `match /arenas/{arenaId}` , linha ~721)
- Test: `functions/test/arena-staff-rbac.rules.test.mjs` (criar)

**Interfaces:**
- Consumes: `arenaEntitled(arenaId, tiers)` (já existe em `firestore.rules:379`)
- Produces (usados na Task 5): `isArenaOwner(arenaId)`, `arenaCanRead(arenaId, area)`, `arenaCanWrite(arenaId, area)`

**Orçamento de `get()`:** o Firestore permite **10 acessos a documento por avaliação de rule**. Os helpers abaixo leem sempre os mesmos dois caminhos — `arenas/{id}` (usado por `isArenaOwner` e `arenaEntitled`) e `arenas/{id}/staff/{uid}` — e chamadas idênticas dentro da mesma avaliação contam uma vez só, o que deixa o total em ~4. **Não** introduzir um terceiro caminho de `get()` nesses helpers sem refazer a conta.

- [ ] **Step 1: Write the failing test**

Criar `functions/test/arena-staff-rbac.rules.test.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-staff-rbac-test';
const OWNER = 'owner-uid';
const GESTOR = 'gestor-uid';
const RECEPCAO = 'recepcao-uid';
const FINANCEIRO = 'financeiro-uid';
const MANUTENCAO = 'manutencao-uid';
const ESTRANHO = 'estranho-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

/** Arena Pro ativa, com um membro de cada cargo. */
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-pro'), {
      managerUserId: OWNER,
      name: 'Arena Pro',
      planTier: 'pro',
      planStatus: 'active',
      courtsCount: 3,
    });
    // Arena sem plano: os mesmos membros existem, mas o gate de titularidade derruba.
    await setDoc(doc(db, 'arenas', 'arena-sem-plano'), {
      managerUserId: OWNER,
      name: 'Arena Sem Plano',
      courtsCount: 1,
    });
    const membros = [
      [GESTOR, 'gestor'],
      [RECEPCAO, 'recepcao'],
      [FINANCEIRO, 'financeiro'],
      [MANUTENCAO, 'manutencao'],
    ];
    for (const [uid, role] of membros) {
      for (const arenaId of ['arena-pro', 'arena-sem-plano']) {
        await setDoc(doc(db, 'arenas', arenaId, 'staff', uid), {
          role,
          status: 'active',
          email: `${role}@arena.com`,
          displayName: role,
          addedBy: OWNER,
        });
      }
    }
    await setDoc(doc(db, 'arenaStaffInvites', 'convite-1'), {
      arenaId: 'arena-pro',
      arenaName: 'Arena Pro',
      emailLower: 'novo@arena.com',
      role: 'recepcao',
      status: 'pending',
      invitedBy: OWNER,
    });
    await setDoc(doc(db, 'users', GESTOR, 'arenaStaff', 'arena-pro'), {
      role: 'gestor',
      status: 'active',
      arenaName: 'Arena Pro',
    });
  });
}

before(async () => {
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

function ctx(uid, extra = {}) {
  return testEnv.authenticatedContext(uid, { roles: ['arena'], ...extra }).firestore();
}

test('dono le a subcolecao staff', async () => {
  await assertSucceeds(getDoc(doc(ctx(OWNER), 'arenas/arena-pro/staff/' + GESTOR)));
});

test('membro le o proprio doc de staff', async () => {
  await assertSucceeds(getDoc(doc(ctx(GESTOR), 'arenas/arena-pro/staff/' + GESTOR)));
});

test('membro nao le o doc de staff de outro', async () => {
  await assertFails(getDoc(doc(ctx(RECEPCAO), 'arenas/arena-pro/staff/' + GESTOR)));
});

test('ninguem escreve direto na subcolecao staff, nem o dono', async () => {
  await assertFails(
    setDoc(doc(ctx(OWNER), 'arenas/arena-pro/staff/' + ESTRANHO), {
      role: 'gestor',
      status: 'active',
    }),
  );
});

test('gestor nao se promove trocando o proprio cargo', async () => {
  await assertFails(
    setDoc(doc(ctx(GESTOR), 'arenas/arena-pro/staff/' + GESTOR), {
      role: 'gestor',
      status: 'active',
    }),
  );
});

test('dono le convites da propria arena', async () => {
  await assertSucceeds(getDoc(doc(ctx(OWNER), 'arenaStaffInvites/convite-1')));
});

test('convidado le o convite pelo proprio email', async () => {
  const db = testEnv
    .authenticatedContext('novo-uid', { email: 'novo@arena.com' })
    .firestore();
  await assertSucceeds(getDoc(doc(db, 'arenaStaffInvites/convite-1')));
});

test('terceiro nao le convite alheio', async () => {
  const db = testEnv
    .authenticatedContext(ESTRANHO, { email: 'outro@arena.com' })
    .firestore();
  await assertFails(getDoc(doc(db, 'arenaStaffInvites/convite-1')));
});

test('cliente nao escreve convite', async () => {
  await assertFails(
    setDoc(doc(ctx(OWNER), 'arenaStaffInvites/convite-2'), {
      arenaId: 'arena-pro',
      emailLower: 'x@y.com',
      role: 'gestor',
      status: 'pending',
    }),
  );
});

test('usuario le o proprio espelho de arenaStaff', async () => {
  await assertSucceeds(getDoc(doc(ctx(GESTOR), `users/${GESTOR}/arenaStaff/arena-pro`)));
});

test('usuario nao le o espelho de outro', async () => {
  await assertFails(getDoc(doc(ctx(RECEPCAO), `users/${GESTOR}/arenaStaff/arena-pro`)));
});

test('cliente nao escreve no espelho', async () => {
  await assertFails(
    setDoc(doc(ctx(GESTOR), `users/${GESTOR}/arenaStaff/arena-pro`), { role: 'gestor' }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx firebase emulators:exec --only firestore "node --test functions/test/arena-staff-rbac.rules.test.mjs"`
Expected: FAIL — as leituras de `staff`/`arenaStaffInvites`/`arenaStaff` caem no catch-all deny

- [ ] **Step 3: Write minimal implementation**

Em `firestore.rules`, logo abaixo de `isArenaManagerByArenaId` (linha ~364), acrescentar:

```
    // ---- Equipe da arena (RBAC) ----------------------------------------
    // A matriz abaixo é ESPELHO MANUAL de
    // `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts`.
    // `functions/test/arena-staff-rbac.rules.test.mjs` falha se divergirem.
    function isArenaOwner(arenaId) {
      return isArenaManagerByArenaId(arenaId);
    }
    function arenaStaffDoc(arenaId) {
      return get(/databases/$(database)/documents/arenas/$(arenaId)/staff/$(request.auth.uid)).data;
    }
    // Membro ativo E arena com titularidade de plano pago: plano vencido fora
    // da carência corta o acesso do membro no mesmo instante, sem sweeper.
    function isActiveArenaStaff(arenaId) {
      return request.auth != null &&
        exists(/databases/$(database)/documents/arenas/$(arenaId)/staff/$(request.auth.uid)) &&
        arenaStaffDoc(arenaId).get('status', '') == 'active' &&
        arenaEntitled(arenaId, ['pro', 'elite', 'parceiro']);
    }
    function arenaWriteAreas(role) {
      return {
        'gestor': ['agenda', 'comandas', 'estoque', 'promocoes', 'site', 'quadras', 'perfil', 'comunidade'],
        'recepcao': ['agenda', 'comandas'],
        'financeiro': ['financeiro', 'promocoes'],
        'manutencao': ['quadras', 'estoque']
      }.get(role, []);
    }
    function arenaReadAreas(role) {
      return {
        'gestor': ['agenda', 'comandas', 'estoque', 'promocoes', 'site', 'quadras', 'perfil', 'comunidade', 'financeiro'],
        'recepcao': ['agenda', 'comandas', 'comunidade', 'estoque'],
        'financeiro': ['financeiro', 'promocoes', 'comandas', 'comunidade'],
        'manutencao': ['quadras', 'estoque', 'agenda']
      }.get(role, []);
    }
    function arenaCanWrite(arenaId, area) {
      return isArenaOwner(arenaId) || (
        isActiveArenaStaff(arenaId) &&
        arenaWriteAreas(arenaStaffDoc(arenaId).get('role', '')).hasAny([area])
      );
    }
    function arenaCanRead(arenaId, area) {
      return isArenaOwner(arenaId) || (
        isActiveArenaStaff(arenaId) &&
        arenaReadAreas(arenaStaffDoc(arenaId).get('role', '')).hasAny([area])
      );
    }
```

Depois do bloco `match /arenas/{arenaId} { ... }` (fecha na linha ~721), acrescentar:

```
    // Equipe da arena. Escrita SEMPRE via Cloud Function: criar vínculo exige
    // contar assentos e conferir plano, coisas que rules não fazem.
    match /arenas/{arenaId}/staff/{staffUserId} {
      allow read: if request.auth != null && (
        isArenaOwner(arenaId) ||
        request.auth.uid == staffUserId ||
        isAdmin() ||
        isSuperAdmin()
      );
      allow write: if false;
    }
```

E, junto dos demais blocos de coleção raiz (por exemplo depois de `match /arenaWithdrawals/{withdrawalId}`, linha ~862):

```
    // Convites de equipe. Lidos pelo dono e por quem tem o e-mail convidado
    // (a rota /convite precisa ler antes de aceitar). Escrita só via function.
    match /arenaStaffInvites/{inviteId} {
      allow read: if request.auth != null && (
        isArenaOwner(resource.data.arenaId) ||
        request.auth.token.get('email', '').lower() == resource.data.get('emailLower', '') ||
        isAdmin() ||
        isSuperAdmin()
      );
      allow write: if false;
    }
```

E, junto dos blocos `match /users/{userId}/...` (por exemplo depois de `users/{userId}/tournamentStaff/{tournamentId}`, linha ~1412):

```
    // Espelho de `arenas/{arenaId}/staff/{uid}` — é por ele que o portal
    // descobre de quais arenas o usuário é equipe (a query por managerUserId
    // nunca o traria). Mantido pela Cloud Function de sync.
    match /users/{userId}/arenaStaff/{arenaId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx firebase emulators:exec --only firestore "node --test functions/test/arena-staff-rbac.rules.test.mjs"`
Expected: PASS — os 12 testes

Se `request.auth.token.get('email', '')` falhar na compilação, trocar por `(('email' in request.auth.token) && request.auth.token.email.lower() == resource.data.emailLower)`.

- [ ] **Step 5: Verificar que nada existente quebrou**

Run: `npx firebase emulators:exec --only firestore "node --test functions/test/plan-tier-gates.rules.test.mjs functions/test/comanda-add-items.rules.test.mjs"`
Expected: PASS — nenhuma regressão (esta task só acrescentou blocos e helpers)

- [ ] **Step 6: Commit**

```bash
git add firestore.rules functions/test/arena-staff-rbac.rules.test.mjs
git commit -m "feat(rules): colecoes de equipe da arena e helpers de acesso por cargo"
```

---

## Task 5: Rules — reescrita dos blocos de arena por área

**Files:**
- Modify: `firestore.rules` (~30 blocos, listados abaixo)
- Test: `functions/test/arena-staff-rbac.rules.test.mjs` (acrescentar casos)

**Interfaces:**
- Consumes: `arenaCanRead(arenaId, area)` / `arenaCanWrite(arenaId, area)` / `isArenaOwner(arenaId)` da Task 4
- Produces: nada de novo — só troca de autorização

**Mapa de bloco → área.** Em cada um, a condição `get(/databases/$(database)/documents/arenas/$(arenaId)).data.managerUserId == request.auth.uid` (ou a chamada a `isArenaManagerByArenaId(arenaId)`) vira `arenaCanWrite(arenaId, '<área>')`. Onde a arena é referenciada por campo (`resource.data.arenaId`), usar `arenaCanWrite(resource.data.arenaId, '<área>')`.

| linha aprox. | bloco | área |
|---|---|---|
| 696 | `arenas/{arenaId}` **update** | `perfil` |
| 703, 716 | `arenas/{arenaId}` **create/delete** | **manter só dono** |
| 723, 731 | `billing`, `asaas` | **manter só dono** |
| 739 | `courts` | `quadras` |
| 761 | `promotions` | `promocoes` |
| 775 | `coupons` | `promocoes` |
| 795 | `arenaWallets` (read) | `financeiro` (via `arenaCanRead`) |
| 839 | `arenaWithdrawals` **create** | **manter só dono** |
| 864 | `products` | `estoque` |
| 888 | `sales` | `comandas` |
| 892 | `stockMovements` | `estoque` |
| 901 | `metadata` | `perfil` |
| 928 | `arenaComandas` + itens/pagamentos | `comandas` |
| 487 | **dentro** de `isValidArenaComandaCreate` | `comandas` — a checagem de identidade mora dentro do validador (`isArenaManagerByArenaId(data.arenaId)`, linha 487), não no bloco `match`. Trocar por `arenaCanWrite(data.arenaId, 'comandas')` **ali**, senão a comanda continua exigindo o dono por mais que o `match` mude |
| 986 | `arenaSlots` | `agenda` |
| 1006 | `bookings` | `agenda` |
| 1016 | `arenaSlotLocks` | `agenda` |
| 1030 | `arenaBookingInvites` | `agenda` |
| 1056 | `arenaBookings` | `agenda` |
| 1101 | `arenaBookingWaitlist` | `agenda` |
| 1135 | `arenaRecurringBookings` | `agenda` |
| 1149 | `arenaClubs` | `agenda` |
| 1153 | `arenaClubSessions` + `clubParticipants` | `agenda` |
| 1171 | `arena_blocks` | `agenda` |
| 1462 | `arena_reviews` (resposta da arena) | `comunidade` |
| 1559 | `arena_reputation` | `comunidade` |
| 2123 | `linkPages` | `site` |
| 2159 | `arenaSites`, `arenaSiteSlugs` | `site` |
| 365 | helper `canManageArenaProducts` | `estoque` |

`arenas/{arenaId}/followers` (753) **não muda** — é escrita do atleta que segue, não da arena.

- [ ] **Step 1: Write the failing tests**

Acrescentar ao fim de `functions/test/arena-staff-rbac.rules.test.mjs`:

```js
// ---- matriz cargo x area -------------------------------------------------

// `isValidArenaComandaCreate` (firestore.rules:468) exige 15 campos e
// `type == 'individual'`; este helper monta um payload que passa em tudo,
// para que o único fator sob teste seja a identidade de quem escreve.
function comandaPayload(uid, arenaId, displayNumber) {
  const agora = new Date();
  return {
    arenaId,
    displayNumber,
    type: 'individual',
    status: 'open',
    customerName: 'Cliente Teste',
    allowAppOrders: false,
    rentalCents: 0,
    itemsTotalCents: 0,
    totalCents: 0,
    itemsCount: 0,
    openedByUid: uid,
    openedAt: agora,
    createdAt: agora,
    updatedAt: agora,
  };
}

test('recepcao cria comanda; manutencao nao', async () => {
  await assertSucceeds(
    setDoc(
      doc(ctx(RECEPCAO), 'arenaComandas/comanda-recepcao'),
      comandaPayload(RECEPCAO, 'arena-pro', 101),
    ),
  );
  await assertFails(
    setDoc(
      doc(ctx(MANUTENCAO), 'arenaComandas/comanda-manutencao'),
      comandaPayload(MANUTENCAO, 'arena-pro', 102),
    ),
  );
});

test('manutencao edita quadra; recepcao nao', async () => {
  await assertSucceeds(
    setDoc(doc(ctx(MANUTENCAO), 'arenas/arena-pro/courts/quadra-1'), { name: 'Quadra 1' }),
  );
  await assertFails(
    setDoc(doc(ctx(RECEPCAO), 'arenas/arena-pro/courts/quadra-2'), { name: 'Quadra 2' }),
  );
});

test('financeiro le a carteira; recepcao nao', async () => {
  await assertSucceeds(getDoc(doc(ctx(FINANCEIRO), 'arenaWallets/arena-pro')));
  await assertFails(getDoc(doc(ctx(RECEPCAO), 'arenaWallets/arena-pro')));
});

test('gestor le a carteira mas nao saca', async () => {
  await assertSucceeds(getDoc(doc(ctx(GESTOR), 'arenaWallets/arena-pro')));
  await assertFails(
    setDoc(doc(ctx(GESTOR), 'arenaWithdrawals/saque-1'), {
      arenaId: 'arena-pro',
      amountCents: 1000,
      status: 'pending',
    }),
  );
});

test('nenhum cargo cria saque; so o dono', async () => {
  for (const uid of [GESTOR, RECEPCAO, FINANCEIRO, MANUTENCAO]) {
    await assertFails(
      setDoc(doc(ctx(uid), 'arenaWithdrawals/saque-' + uid), {
        arenaId: 'arena-pro',
        amountCents: 1000,
        status: 'pending',
      }),
    );
  }
});

test('gestor edita o perfil da arena; financeiro nao', async () => {
  await assertSucceeds(
    setDoc(
      doc(ctx(GESTOR), 'arenas/arena-pro'),
      { managerUserId: OWNER, name: 'Arena Pro Editada', courtsCount: 3 },
      { merge: true },
    ),
  );
  await assertFails(
    setDoc(
      doc(ctx(FINANCEIRO), 'arenas/arena-pro'),
      { managerUserId: OWNER, name: 'Nao Deveria', courtsCount: 3 },
      { merge: true },
    ),
  );
});

test('nenhum cargo se auto-promove mexendo em planTier', async () => {
  await assertFails(
    setDoc(
      doc(ctx(GESTOR), 'arenas/arena-pro'),
      { managerUserId: OWNER, planTier: 'elite', courtsCount: 3 },
      { merge: true },
    ),
  );
});

test('membro de arena sem plano perde tudo', async () => {
  await assertFails(
    setDoc(
      doc(ctx(RECEPCAO), 'arenaComandas/comanda-sem-plano'),
      comandaPayload(RECEPCAO, 'arena-sem-plano', 103),
    ),
  );
  await assertFails(
    setDoc(doc(ctx(MANUTENCAO), 'arenas/arena-sem-plano/courts/q1'), { name: 'Q1' }),
  );
});

test('dono de arena sem plano continua podendo tudo que ja podia', async () => {
  await assertSucceeds(
    setDoc(doc(ctx(OWNER), 'arenas/arena-sem-plano/courts/q1'), { name: 'Q1' }),
  );
});

test('membro de uma arena nao alcanca outra arena', async () => {
  await testEnv.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'arenas', 'arena-alheia'), {
      managerUserId: 'outro-dono',
      name: 'Alheia',
      planTier: 'pro',
      planStatus: 'active',
      courtsCount: 1,
    });
  });
  await assertFails(
    setDoc(doc(ctx(GESTOR), 'arenas/arena-alheia/courts/q1'), { name: 'Q1' }),
  );
});

test('membro removido perde o acesso na hora', async () => {
  await testEnv.withSecurityRulesDisabled(async (c) => {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(c.firestore(), 'arenas/arena-pro/staff/' + MANUTENCAO));
  });
  await assertFails(
    setDoc(doc(ctx(MANUTENCAO), 'arenas/arena-pro/courts/quadra-3'), { name: 'Quadra 3' }),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec --only firestore "node --test functions/test/arena-staff-rbac.rules.test.mjs"`
Expected: FAIL — todos os `assertSucceeds` de membro falham (as rules ainda só aceitam o dono)

- [ ] **Step 3: Rewrite the rule blocks**

Percorrer a tabela de mapeamento acima, bloco a bloco. Regras da reescrita:

1. `isArenaOwner(arenaId)` continua sendo o **primeiro** ramo do OR — o dono não pode perder nada.
2. `isAdmin()` / `isSuperAdmin()` onde já existiam **permanecem**.
3. Leitura pública (`allow read: if true`) **não muda** — `courts`, `promotions`, `arenas` seguem públicos.
4. Validações de conteúdo já existentes (`isValidArenaProductData`, `arenaCanAddCourt`, gates de plano) ficam intactas; só a checagem de identidade muda.

Exemplo, `arenas/{arenaId}/courts/{courtId}` (linha ~739) antes:

```
      allow create: if request.auth != null && (
        (
          get(/databases/$(database)/documents/arenas/$(arenaId)).data.managerUserId == request.auth.uid &&
          arenaCanAddCourt(arenaId)
        ) ||
        isSuperAdmin()
      );
      allow update, delete: if request.auth != null && (
        get(/databases/$(database)/documents/arenas/$(arenaId)).data.managerUserId == request.auth.uid ||
        isSuperAdmin()
      );
```

depois:

```
      allow create: if request.auth != null && (
        (arenaCanWrite(arenaId, 'quadras') && arenaCanAddCourt(arenaId)) ||
        isSuperAdmin()
      );
      allow update, delete: if request.auth != null && (
        arenaCanWrite(arenaId, 'quadras') ||
        isSuperAdmin()
      );
```

Para `arenas/{arenaId}` **update** (linha ~708), o ramo do gestor vira `arenaCanWrite(arenaId, 'perfil')`, **mantendo as três comparações de campos de plano** que já impedem auto-promoção:

```
      allow update: if request.auth != null && (
        isAdmin() || isSuperAdmin() || (
          arenaCanWrite(arenaId, 'perfil') &&
          request.resource.data.get('planTier', null) == resource.data.get('planTier', null) &&
          request.resource.data.get('planStatus', null) == resource.data.get('planStatus', null) &&
          request.resource.data.get('planActiveUntil', null) == resource.data.get('planActiveUntil', null) &&
          request.resource.data.get('managerUserId', '') == resource.data.get('managerUserId', '')
        )
      );
```

A comparação de `managerUserId` é **nova** e obrigatória: sem ela um gestor se tornaria dono da arena com um único update.

Para `arenaWallets/{arenaId}` (linha ~795), a leitura vira `arenaCanRead(arenaId, 'financeiro')`.

Para `canManageArenaProducts(arenaId)` (linha ~365), o corpo vira:

```
    function canManageArenaProducts(arenaId) {
      return request.auth != null && (
        arenaCanWrite(arenaId, 'estoque') ||
        isSuperAdmin()
      );
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec --only firestore "node --test functions/test/arena-staff-rbac.rules.test.mjs"`
Expected: PASS — os 12 da Task 4 mais os 11 novos

- [ ] **Step 5: Verificar que os testes de rules existentes não regrediram**

Run: `npx firebase emulators:exec --only firestore "node --test functions/test/plan-tier-gates.rules.test.mjs functions/test/comanda-add-items.rules.test.mjs functions/test/athlete-level-rules.test.mjs"`
Expected: PASS — nenhuma regressão. Se algum falhar, o ramo do dono foi perdido em algum bloco: comparar o bloco com o `git diff` e restaurar `isArenaOwner` como primeiro ramo.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules functions/test/arena-staff-rbac.rules.test.mjs
git commit -m "feat(rules): acesso por cargo nos blocos de arena"
```

---

## Task 6: Callables de equipe

**Files:**
- Create: `functions/src/arena-staff-ops.ts`
- Test: `functions/src/arena-staff-ops.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `isArenaStaffRole`, `maxArenaStaffSeats`, `normalizeInviteEmail` (Task 2); `withArenaRole` de `./arena-signup`; `applyRolesToClaims`, `firestoreRolesPayload`, `rolesFromClaims` de `./auth-roles`
- Produces (usados pelo portal na Task 10/11):
  - `inviteArenaStaff({arenaId, email, role}) → {inviteId: string | null, status: 'active'|'pending'}` — o link **não** vem do servidor; o portal o monta com `arenaInviteLink(location.origin, inviteId)` (Task 10), porque só o cliente conhece a origem em que está rodando
  - `acceptArenaStaffInvite({inviteId}) → {arenaId, role}`
  - `revokeArenaStaffInvite({inviteId}) → {ok: true}`
  - `updateArenaStaffRole({arenaId, staffUserId, role}) → {ok: true}`
  - lógica pura exportada: `assertSeatAvailable(seats, used)`, `inviteIsClaimable(invite, emailLower, nowMs)`

- [ ] **Step 1: Write the failing test**

Criar `functions/src/arena-staff-ops.test.ts`:

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {assertSeatAvailable, inviteIsClaimable} from "./arena-staff-ops";

const NOW = Date.UTC(2026, 6, 31);
const AMANHA = {toMillis: () => NOW + 24 * 60 * 60 * 1000};
const ONTEM = {toMillis: () => NOW - 24 * 60 * 60 * 1000};

test("assertSeatAvailable passa quando ha vaga", () => {
  assert.doesNotThrow(() => assertSeatAvailable(5, 4));
  assert.doesNotThrow(() => assertSeatAvailable(Infinity, 900));
});

test("assertSeatAvailable barra quando lotou", () => {
  assert.throws(() => assertSeatAvailable(5, 5), /limite/i);
});

test("assertSeatAvailable barra plano sem assentos", () => {
  assert.throws(() => assertSeatAvailable(0, 0), /plano/i);
});

test("convite valido e reivindicavel pelo email certo", () => {
  const invite = {status: "pending", emailLower: "a@b.com", expiresAt: AMANHA};
  assert.equal(inviteIsClaimable(invite, "a@b.com", NOW), true);
});

test("convite de outro email nao e reivindicavel", () => {
  const invite = {status: "pending", emailLower: "a@b.com", expiresAt: AMANHA};
  assert.equal(inviteIsClaimable(invite, "z@b.com", NOW), false);
});

test("convite expirado nao e reivindicavel", () => {
  const invite = {status: "pending", emailLower: "a@b.com", expiresAt: ONTEM};
  assert.equal(inviteIsClaimable(invite, "a@b.com", NOW), false);
});

test("convite ja aceito ou revogado nao e reivindicavel", () => {
  for (const status of ["accepted", "revoked", "expired"]) {
    const invite = {status, emailLower: "a@b.com", expiresAt: AMANHA};
    assert.equal(inviteIsClaimable(invite, "a@b.com", NOW), false);
  }
});

test("convite sem expiresAt e tratado como valido", () => {
  const invite = {status: "pending", emailLower: "a@b.com"};
  assert.equal(inviteIsClaimable(invite, "a@b.com", NOW), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix functions test`
Expected: FAIL — `Cannot find module './arena-staff-ops'`

- [ ] **Step 3: Write the implementation**

Criar `functions/src/arena-staff-ops.ts`:

```ts
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
} from "./auth-roles";
import {withArenaRole} from "./arena-signup";
import {
  isArenaStaffRole,
  maxArenaStaffSeats,
  normalizeInviteEmail,
  type ArenaStaffRole,
} from "./arena-staff-roles";

const INVITES = "arenaStaffInvites";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Barra o convite quando o plano não dá assento ou a equipe está cheia. */
export function assertSeatAvailable(seats: number, used: number): void {
  if (seats <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "O plano atual não inclui equipe. Assine o Pro ou o Elite para convidar membros.",
    );
  }
  if (used >= seats) {
    throw new HttpsError(
      "failed-precondition",
      `Limite de ${seats} membros do seu plano atingido. Remova alguém ou assine o Elite.`,
    );
  }
}

/** Convite pendente, não vencido e do e-mail de quem está reivindicando. */
export function inviteIsClaimable(
  invite: {status?: unknown; emailLower?: unknown; expiresAt?: {toMillis(): number}},
  emailLower: string,
  nowMs: number,
): boolean {
  if (invite.status !== "pending") return false;
  if (invite.emailLower !== emailLower || emailLower === "") return false;
  const expiresAt = invite.expiresAt?.toMillis?.();
  return expiresAt == null || expiresAt > nowMs;
}

/** Concede a role `arena` de forma SÍNCRONA. Não pode ficar só no trigger de
 *  espelho: quem acabou de aceitar o convite é mandado direto ao portal, e
 *  `AuthService.assertArenaRole` leria `users/{uid}` antes do trigger gravar. */
async function ensureArenaRole(uid: string): Promise<void> {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const roles = rolesFromClaims(user.customClaims);
  const next = withArenaRole(roles);
  if (next.length === roles.length) return;

  await auth.setCustomUserClaims(
    uid,
    applyRolesToClaims((user.customClaims || {}) as Record<string, unknown>, next),
  );
  await getFirestore().doc(`users/${uid}`).set(firestoreRolesPayload(next), {merge: true});
  logger.info("arenaStaff: role arena concedida", {uid});
}

/** Carrega a arena e confere que quem chamou é o dono. */
async function loadOwnedArena(arenaId: string, uid: string) {
  const snap = await getFirestore().doc(`arenas/${arenaId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  if (snap.data()?.managerUserId !== uid) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o dono da arena gerencia a equipe.",
    );
  }
  return snap;
}

/** Membros ativos + convites pendentes ocupam assento. */
async function countUsedSeats(arenaId: string): Promise<number> {
  const db = getFirestore();
  const [staff, invites] = await Promise.all([
    db.collection(`arenas/${arenaId}/staff`).count().get(),
    db
      .collection(INVITES)
      .where("arenaId", "==", arenaId)
      .where("status", "==", "pending")
      .count()
      .get(),
  ]);
  return staff.data().count + invites.data().count;
}

async function createStaffDoc(
  arenaId: string,
  uid: string,
  role: ArenaStaffRole,
  addedBy: string,
  email: string,
  displayName: string,
  photoUrl: string | null,
): Promise<void> {
  await getFirestore().doc(`arenas/${arenaId}/staff/${uid}`).set({
    role,
    status: "active",
    email,
    displayName,
    photoUrl,
    addedBy,
    addedAt: FieldValue.serverTimestamp(),
  });
  await ensureArenaRole(uid);
}

export const inviteArenaStaff = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const arenaId = String(request.data?.arenaId ?? "").trim();
  const email = normalizeInviteEmail(request.data?.email);
  const role = request.data?.role;

  if (!arenaId) throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
  if (!email.includes("@")) {
    throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
  }
  if (!isArenaStaffRole(role)) {
    throw new HttpsError("invalid-argument", "Cargo inválido.");
  }

  const arenaSnap = await loadOwnedArena(arenaId, uid);
  const arenaData = arenaSnap.data() ?? {};
  const seats = maxArenaStaffSeats(arenaData, Date.now());
  assertSeatAvailable(seats, await countUsedSeats(arenaId));

  const db = getFirestore();
  const arenaName = typeof arenaData.name === "string" ? arenaData.name : "";

  // Caminho direto: o e-mail já tem conta → vínculo ativo na hora.
  let existing: {uid: string; displayName?: string; photoURL?: string} | null = null;
  try {
    const found = await getAuth().getUserByEmail(email);
    existing = {uid: found.uid, displayName: found.displayName, photoURL: found.photoURL};
  } catch {
    existing = null; // sem conta ainda — segue para convite pendente
  }

  if (existing) {
    if (existing.uid === uid) {
      throw new HttpsError(
        "invalid-argument",
        "Você já é o dono desta arena; não precisa se convidar.",
      );
    }
    const already = await db.doc(`arenas/${arenaId}/staff/${existing.uid}`).get();
    if (already.exists) {
      throw new HttpsError("already-exists", "Esta pessoa já está na equipe.");
    }
    await createStaffDoc(
      arenaId,
      existing.uid,
      role,
      uid,
      email,
      existing.displayName || email.split("@")[0],
      existing.photoURL ?? null,
    );
    logger.info("arenaStaff: vinculo criado direto", {arenaId, staffUid: existing.uid, role});
    return {inviteId: null, status: "active" as const};
  }

  const duplicate = await db
    .collection(INVITES)
    .where("arenaId", "==", arenaId)
    .where("emailLower", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!duplicate.empty) {
    throw new HttpsError("already-exists", "Já existe um convite pendente para este e-mail.");
  }

  const ref = db.collection(INVITES).doc();
  await ref.set({
    arenaId,
    arenaName,
    emailLower: email,
    role,
    status: "pending",
    invitedBy: uid,
    acceptedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
  });
  logger.info("arenaStaff: convite pendente criado", {arenaId, inviteId: ref.id, role});
  return {inviteId: ref.id, status: "pending" as const};
});

export const acceptArenaStaffInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const inviteId = String(request.data?.inviteId ?? "").trim();
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId é obrigatório.");

  // E-mail NÃO verificado de propósito: não há infra de envio de e-mail para
  // disparar a verificação (ver spec). O Firebase Auth já impede duas contas
  // com o mesmo e-mail, e o convite é sempre nominal.
  const email = normalizeInviteEmail(request.auth?.token?.email);
  const db = getFirestore();
  const ref = db.doc(`${INVITES}/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");

  const invite = snap.data() ?? {};
  if (!inviteIsClaimable(invite, email, Date.now())) {
    throw new HttpsError(
      "failed-precondition",
      "Este convite não é mais válido ou foi enviado para outro e-mail.",
    );
  }

  const arenaId = String(invite.arenaId ?? "");
  const role = invite.role;
  if (!isArenaStaffRole(role)) {
    throw new HttpsError("failed-precondition", "Convite com cargo inválido.");
  }

  const arenaSnap = await db.doc(`arenas/${arenaId}`).get();
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  const seats = maxArenaStaffSeats(arenaSnap.data() ?? {}, Date.now());
  const used = (await db.collection(`arenas/${arenaId}/staff`).count().get()).data().count;
  assertSeatAvailable(seats, used);

  const user = await getAuth().getUser(uid);
  await createStaffDoc(
    arenaId,
    uid,
    role,
    String(invite.invitedBy ?? ""),
    email,
    user.displayName || email.split("@")[0],
    user.photoURL ?? null,
  );
  await ref.set(
    {status: "accepted", acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  logger.info("arenaStaff: convite aceito", {arenaId, inviteId, uid, role});
  return {arenaId, role};
});

export const revokeArenaStaffInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const inviteId = String(request.data?.inviteId ?? "").trim();
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId é obrigatório.");

  const db = getFirestore();
  const ref = db.doc(`${INVITES}/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");

  await loadOwnedArena(String(snap.data()?.arenaId ?? ""), uid);
  await ref.set({status: "revoked", revokedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {ok: true as const};
});

export const updateArenaStaffRole = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const arenaId = String(request.data?.arenaId ?? "").trim();
  const staffUserId = String(request.data?.staffUserId ?? "").trim();
  const role = request.data?.role;
  if (!arenaId || !staffUserId) {
    throw new HttpsError("invalid-argument", "arenaId e staffUserId são obrigatórios.");
  }
  if (!isArenaStaffRole(role)) throw new HttpsError("invalid-argument", "Cargo inválido.");

  await loadOwnedArena(arenaId, uid);
  const ref = getFirestore().doc(`arenas/${arenaId}/staff/${staffUserId}`);
  if (!(await ref.get()).exists) {
    throw new HttpsError("not-found", "Membro não encontrado nesta arena.");
  }
  await ref.set({role, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {ok: true as const};
});

export const removeArenaStaff = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const arenaId = String(request.data?.arenaId ?? "").trim();
  const staffUserId = String(request.data?.staffUserId ?? "").trim();
  if (!arenaId || !staffUserId) {
    throw new HttpsError("invalid-argument", "arenaId e staffUserId são obrigatórios.");
  }

  await loadOwnedArena(arenaId, uid);
  await getFirestore().doc(`arenas/${arenaId}/staff/${staffUserId}`).delete();
  logger.info("arenaStaff: membro removido", {arenaId, staffUserId});
  return {ok: true as const};
});
```

- [ ] **Step 4: Export in index.ts**

Em `functions/src/index.ts`, junto dos demais exports de arena (perto da linha 311, onde está `completeArenaSignup`):

```ts
export {
  inviteArenaStaff,
  acceptArenaStaffInvite,
  revokeArenaStaffInvite,
  updateArenaStaffRole,
  removeArenaStaff,
} from "./arena-staff-ops";
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm --prefix functions test`
Expected: PASS — os 8 testes de `arena-staff-ops` e os 9 de `arena-staff-roles`

Run: `npm --prefix functions run lint`
Expected: sem erros de tipo

- [ ] **Step 6: Commit**

```bash
git add functions/src/arena-staff-ops.ts functions/src/arena-staff-ops.test.ts functions/src/index.ts
git commit -m "feat(functions): callables de convite e gestao da equipe da arena"
```

---

## Task 7: Espelho, limpeza e sweeper

**Files:**
- Create: `functions/src/arena-staff-sync.ts`
- Test: `functions/src/arena-staff-sync.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `deliverNotificationToUser({userId, title, body, type, data})` de `./notification-delivery`; `ARENA_STAFF_ROLES` da Task 2
- Produces: `buildArenaStaffMirrorData(staffData, arenaData)`, `arenaStaffRoleLabel(role)`, `buildArenaStaffAddedBody(role, arenaName)`, e os triggers `onArenaStaffWrittenSyncMirror`, `onArenaDeletedCleanupStaff`, `sweepExpiredArenaStaffInvites`

- [ ] **Step 1: Write the failing test**

Criar `functions/src/arena-staff-sync.test.ts`:

```ts
import {strict as assert} from "node:assert";
import {test} from "node:test";
import {
  arenaStaffRoleLabel,
  buildArenaStaffAddedBody,
  buildArenaStaffMirrorData,
} from "./arena-staff-sync";

test("rotulo em pt-BR de cada cargo", () => {
  assert.equal(arenaStaffRoleLabel("gestor"), "gestor");
  assert.equal(arenaStaffRoleLabel("recepcao"), "recepção");
  assert.equal(arenaStaffRoleLabel("financeiro"), "financeiro");
  assert.equal(arenaStaffRoleLabel("manutencao"), "manutenção");
});

test("cargo desconhecido cai em membro", () => {
  assert.equal(arenaStaffRoleLabel("sindico"), "membro");
});

test("corpo da notificacao usa o nome da arena", () => {
  assert.equal(
    buildArenaStaffAddedBody("recepcao", "Arena CFC"),
    "Você agora é recepção da Arena CFC",
  );
});

test("corpo da notificacao sem nome tem fallback", () => {
  assert.equal(
    buildArenaStaffAddedBody("gestor", "   "),
    "Você agora é gestor de uma arena",
  );
});

test("espelho carrega cargo, status e marca da arena", () => {
  const mirror = buildArenaStaffMirrorData(
    {role: "financeiro", status: "active"},
    {name: "Arena CFC", logoUrl: "https://x/y.png"},
  );
  assert.equal(mirror.role, "financeiro");
  assert.equal(mirror.status, "active");
  assert.equal(mirror.arenaName, "Arena CFC");
  assert.equal(mirror.arenaLogoUrl, "https://x/y.png");
});

test("espelho tem defaults quando o doc esta incompleto", () => {
  const mirror = buildArenaStaffMirrorData({}, {});
  assert.equal(mirror.role, "recepcao");
  assert.equal(mirror.status, "active");
  assert.equal(mirror.arenaName, "");
  assert.equal(mirror.arenaLogoUrl, null);
});

test("espelho aceita logo em logo ou coverUrl, na mesma ordem do portal", () => {
  assert.equal(
    buildArenaStaffMirrorData({}, {logo: "https://x/logo.png"}).arenaLogoUrl,
    "https://x/logo.png",
  );
  assert.equal(
    buildArenaStaffMirrorData({}, {coverUrl: "https://x/capa.png"}).arenaLogoUrl,
    "https://x/capa.png",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix functions test`
Expected: FAIL — `Cannot find module './arena-staff-sync'`

- [ ] **Step 3: Write the implementation**

Criar `functions/src/arena-staff-sync.ts`:

```ts
import {
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";

const ROLE_LABELS: Record<string, string> = {
  gestor: "gestor",
  recepcao: "recepção",
  financeiro: "financeiro",
  manutencao: "manutenção",
};

export function arenaStaffRoleLabel(role: unknown): string {
  return ROLE_LABELS[String(role)] ?? "membro";
}

export function buildArenaStaffAddedBody(role: unknown, arenaName: unknown): string {
  const name = typeof arenaName === "string" ? arenaName.trim() : "";
  const label = arenaStaffRoleLabel(role);
  return name.length > 0 ?
    `Você agora é ${label} da ${name}` :
    `Você agora é ${label} de uma arena`;
}

/** Mesma precedência de marca que `arenaLogoOf` no portal: logoUrl → logo → coverUrl. */
function arenaLogoOf(arenaData: Record<string, unknown>): string | null {
  for (const key of ["logoUrl", "logo", "coverUrl"]) {
    const value = arenaData[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export function buildArenaStaffMirrorData(
  staffData: Record<string, unknown>,
  arenaData: Record<string, unknown>,
): {role: string; status: string; arenaName: string; arenaLogoUrl: string | null} {
  return {
    role: typeof staffData.role === "string" ? staffData.role : "recepcao",
    status: typeof staffData.status === "string" ? staffData.status : "active",
    arenaName: typeof arenaData.name === "string" ? arenaData.name : "",
    arenaLogoUrl: arenaLogoOf(arenaData),
  };
}

/** Mantém `users/{uid}/arenaStaff/{arenaId}` em sincronia com o vínculo e
 *  notifica na criação. A role `arena` é concedida pelos callables de forma
 *  síncrona (ver `arena-staff-ops.ts`); aqui não há concessão, para não
 *  duplicar escrita de claims a cada update de cargo. */
export const onArenaStaffWrittenSyncMirror = onDocumentWritten(
  "arenas/{arenaId}/staff/{staffUserId}",
  async (event) => {
    const {arenaId, staffUserId} = event.params;
    const db = getFirestore();
    const mirrorRef = db.doc(`users/${staffUserId}/arenaStaff/${arenaId}`);

    const after = event.data?.after;
    if (!after?.exists) {
      await mirrorRef.delete();
      return;
    }

    const staffData = after.data() ?? {};
    const arenaSnap = await db.doc(`arenas/${arenaId}`).get();
    if (!arenaSnap.exists) {
      logger.warn("arenaStaff: arena inexistente, espelho omitido", {arenaId, staffUserId});
      return;
    }
    const arenaData = arenaSnap.data() ?? {};

    await mirrorRef.set(
      {
        ...buildArenaStaffMirrorData(staffData, arenaData),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    if (event.data?.before?.exists) return;

    await deliverNotificationToUser({
      userId: staffUserId,
      title: "Você entrou na equipe de uma arena",
      body: buildArenaStaffAddedBody(staffData.role, arenaData.name),
      type: "arena_staff_added",
      data: {arenaId, role: String(staffData.role ?? "")},
    });
  },
);

/** Arena excluída: apaga vínculos (cada delete dispara o sync, que limpa o
 *  espelho) e convites pendentes. */
export const onArenaDeletedCleanupStaff = onDocumentDeleted(
  "arenas/{arenaId}",
  async (event) => {
    const {arenaId} = event.params;
    const db = getFirestore();
    const [staffSnap, invitesSnap] = await Promise.all([
      db.collection(`arenas/${arenaId}/staff`).get(),
      db.collection("arenaStaffInvites").where("arenaId", "==", arenaId).get(),
    ]);
    if (staffSnap.empty && invitesSnap.empty) return;

    const batch = db.batch();
    for (const d of [...staffSnap.docs, ...invitesSnap.docs]) batch.delete(d.ref);
    await batch.commit();
    logger.info("arenaStaff: limpeza apos exclusao da arena", {
      arenaId,
      staff: staffSnap.size,
      invites: invitesSnap.size,
    });
  },
);

/** Marca convites vencidos como `expired` para liberar assento. */
export const sweepExpiredArenaStaffInvites = onSchedule(
  {schedule: "0 4 * * *", timeZone: "America/Sao_Paulo"},
  async () => {
    const db = getFirestore();
    const snap = await db
      .collection("arenaStaffInvites")
      .where("status", "==", "pending")
      .where("expiresAt", "<", Timestamp.now())
      .limit(500)
      .get();
    if (snap.empty) return;

    const batch = db.batch();
    for (const d of snap.docs) batch.set(d.ref, {status: "expired"}, {merge: true});
    await batch.commit();
    logger.info("arenaStaff: convites expirados", {count: snap.size});
  },
);
```

- [ ] **Step 4: Export in index.ts**

Somar ao bloco de exports da Task 6, em `functions/src/index.ts`:

```ts
export {
  onArenaStaffWrittenSyncMirror,
  onArenaDeletedCleanupStaff,
  sweepExpiredArenaStaffInvites,
} from "./arena-staff-sync";
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm --prefix functions test`
Expected: PASS — os 7 testes de `arena-staff-sync`

Run: `npm --prefix functions run lint`
Expected: sem erros

- [ ] **Step 6: Adicionar índice composto**

O sweeper consulta `status == 'pending' AND expiresAt < now`, e o callable consulta `arenaId == X AND status == 'pending'`. Acrescentar a `firestore.indexes.json`, no array `indexes`:

```json
{
  "collectionGroup": "arenaStaffInvites",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "expiresAt", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "arenaStaffInvites",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "arenaId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 7: Commit**

```bash
git add functions/src/arena-staff-sync.ts functions/src/arena-staff-sync.test.ts functions/src/index.ts firestore.indexes.json
git commit -m "feat(functions): espelho, limpeza e sweeper da equipe da arena"
```

---

## Task 8: Contexto e serviço de acesso no portal

**Files:**
- Create: `frontend/projects/arena/src/app/painel/data/arena-access.service.ts`
- Create: `frontend/projects/arena/src/app/painel/data/arena-access.service.spec.ts`
- Modify: `frontend/projects/arena/src/app/painel/data/arena-context.service.ts`

**Interfaces:**
- Consumes: `ArenaArea`, `ArenaStaffRole`, `arenaRoleCanRead`, `arenaRoleCanWrite`, `isArenaStaffRole` (Task 1)
- Produces:
  - `ArenaContextService.staffRole: Signal<ArenaStaffRole | null>` — `null` quando o usuário é o dono
  - `ArenaContextService.isOwner: Signal<boolean>`
  - `ArenaAccessService.isOwner()`, `.role()`, `.canRead(area)`, `.canWrite(area)`, `.ready()`

- [ ] **Step 1: Write the failing test**

Criar `frontend/projects/arena/src/app/painel/data/arena-access.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArenaAccessService } from './arena-access.service';
import { ArenaContextService } from './arena-context.service';
import type { ArenaStaffRole } from './arena-roles.model';

function contextStub(isOwner: boolean, role: ArenaStaffRole | null, loading = false) {
  return {
    isOwner: signal(isOwner),
    staffRole: signal(role),
    loading: signal(loading),
  };
}

function makeService(stub: ReturnType<typeof contextStub>): ArenaAccessService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [ArenaAccessService, { provide: ArenaContextService, useValue: stub }],
  });
  return TestBed.inject(ArenaAccessService);
}

describe('ArenaAccessService', () => {
  it('dono alcanca todas as areas, leitura e escrita', () => {
    const svc = makeService(contextStub(true, null));
    expect(svc.isOwner()).toBe(true);
    expect(svc.canWrite('financeiro')).toBe(true);
    expect(svc.canWrite('perfil')).toBe(true);
    expect(svc.canRead('torneios')).toBe(true);
  });

  it('recepcao segue a matriz do cargo', () => {
    const svc = makeService(contextStub(false, 'recepcao'));
    expect(svc.isOwner()).toBe(false);
    expect(svc.canWrite('agenda')).toBe(true);
    expect(svc.canRead('estoque')).toBe(true);
    expect(svc.canWrite('estoque')).toBe(false);
    expect(svc.canRead('financeiro')).toBe(false);
  });

  it('financeiro nao alcanca agenda', () => {
    const svc = makeService(contextStub(false, 'financeiro'));
    expect(svc.canRead('agenda')).toBe(false);
    expect(svc.canWrite('financeiro')).toBe(true);
  });

  it('sem vinculo nenhum nao alcanca nada', () => {
    const svc = makeService(contextStub(false, null));
    expect(svc.canRead('agenda')).toBe(false);
    expect(svc.canWrite('agenda')).toBe(false);
  });

  it('ready acompanha o loading do contexto', () => {
    const svc = makeService(contextStub(false, 'gestor', true));
    expect(svc.ready()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `arena-access.service` não existe e `ArenaContextService` não expõe `isOwner`/`staffRole`

- [ ] **Step 3: Extend ArenaContextService**

Em `arena-context.service.ts`:

1. Nos imports, somar `getDoc`, `doc`, `collection`, `onSnapshot` conforme necessário, e importar `isArenaStaffRole, type ArenaStaffRole` de `./arena-roles.model`.

2. Somar dois signals privados e um segundo listener. O `effect` do construtor hoje chama `this.watchArenas(user.uid)`; passa a chamar também `this.watchStaffMirror(user.uid)`, e o cleanup passa a derrubar os dois unsubscribes:

```ts
  /** Espelho `users/{uid}/arenaStaff/{arenaId}` → arenas em que este usuário é equipe. */
  private readonly staffMirror = signal<Map<string, ArenaStaffRole>>(new Map());
  private readonly staffArenaDocs = signal<Map<string, Record<string, unknown>>>(new Map());
  private staffUnsubscribe: Unsubscribe | null = null;
  private readonly staffLoadingSignal = signal(true);

  private watchStaffMirror(uid: string): void {
    const db = arenaFirestore();
    this.staffLoadingSignal.set(true);
    this.staffUnsubscribe = onSnapshot(
      collection(db, 'users', uid, 'arenaStaff'),
      async (snap) => {
        const roles = new Map<string, ArenaStaffRole>();
        for (const d of snap.docs) {
          const role = (d.data() as Record<string, unknown>)['role'];
          const status = (d.data() as Record<string, unknown>)['status'];
          if (isArenaStaffRole(role) && status === 'active') roles.set(d.id, role);
        }
        this.staffMirror.set(roles);

        // O espelho traz nome/logo, mas as telas precisam do doc completo da arena
        // (plano, courtsCount). Leitura direta por id — `arenas` é de leitura pública.
        const docs = new Map<string, Record<string, unknown>>();
        await Promise.all(
          [...roles.keys()].map(async (arenaId) => {
            const arenaSnap = await getDoc(doc(db, 'arenas', arenaId));
            if (arenaSnap.exists()) docs.set(arenaId, arenaSnap.data() as Record<string, unknown>);
          }),
        );
        this.staffArenaDocs.set(docs);
        this.staffLoadingSignal.set(false);
      },
      () => {
        this.staffMirror.set(new Map());
        this.staffArenaDocs.set(new Map());
        this.staffLoadingSignal.set(false);
      },
    );
  }
```

3. `loading` passa a considerar as duas fontes; `managedArenas` passa a somar as arenas de staff; `notFound` só é `true` quando as duas vêm vazias; `arenaDoc` procura primeiro nos docs de dono e depois nos de staff. Expor:

```ts
  readonly isOwner = computed(() => {
    const id = this.arenaId();
    return id != null && this.managedDocs().some((d) => d.id === id);
  });

  readonly staffRole = computed<ArenaStaffRole | null>(() => {
    const id = this.arenaId();
    if (id == null || this.isOwner()) return null;
    return this.staffMirror().get(id) ?? null;
  });
```

4. **Remover** o `console.log('snap.docs', snap.docs)` que está em `watchArenas` — é debug esquecido e agora passaria a vazar dados de arena a cada snapshot.

- [ ] **Step 4: Create ArenaAccessService**

Criar `frontend/projects/arena/src/app/painel/data/arena-access.service.ts`:

```ts
import { Injectable, computed, inject } from '@angular/core';
import { ArenaContextService } from './arena-context.service';
import { arenaRoleCanRead, arenaRoleCanWrite, type ArenaArea } from './arena-roles.model';

/** Fonte única do que a UI pode mostrar. NÃO é a autoridade: quem autoriza de
 *  fato é `firestore.rules`. Aqui só evitamos oferecer o que seria negado. */
@Injectable({ providedIn: 'root' })
export class ArenaAccessService {
  private readonly context = inject(ArenaContextService);

  readonly ready = computed(() => !this.context.loading());
  readonly isOwner = computed(() => this.context.isOwner());
  readonly role = computed(() => this.context.staffRole());

  canRead(area: ArenaArea): boolean {
    if (this.isOwner()) return true;
    const role = this.role();
    return role != null && arenaRoleCanRead(role, area);
  }

  canWrite(area: ArenaArea): boolean {
    if (this.isOwner()) return true;
    const role = this.role();
    return role != null && arenaRoleCanWrite(role, area);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS

Run: `npm --prefix frontend run build:arena`
Expected: build sem erros

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/arena/src/app/painel/data/arena-access.service.ts frontend/projects/arena/src/app/painel/data/arena-access.service.spec.ts frontend/projects/arena/src/app/painel/data/arena-context.service.ts
git commit -m "feat(arena-web): contexto resolve equipe alem de dono e servico de acesso"
```

---

## Task 9: Guards por área e filtro do menu

**Files:**
- Create: `frontend/projects/arena/src/app/auth/arena-area.guard.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`
- Modify: `frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts:10-39`

**Interfaces:**
- Consumes: `ArenaAccessService` (Task 8), `ArenaArea` (Task 1)
- Produces: `arenaAreaGuard(area: ArenaArea): CanActivateFn`, `arenaOwnerGuard: CanActivateFn`

- [ ] **Step 1: Create the guard**

Criar `frontend/projects/arena/src/app/auth/arena-area.guard.ts`:

```ts
import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { ArenaAccessService } from '../painel/data/arena-access.service';
import { ArenaContextService } from '../painel/data/arena-context.service';
import type { ArenaArea } from '../painel/data/arena-roles.model';

/** Bloqueia a rota quando o cargo do usuário não alcança a área. Espera o
 *  contexto carregar antes de decidir — senão um membro seria expulso da
 *  própria rota no primeiro frame, antes de o espelho de staff chegar. */
export function arenaAreaGuard(area: ArenaArea): CanActivateFn {
  return () => {
    const access = inject(ArenaAccessService);
    const context = inject(ArenaContextService);
    const router = inject(Router);
    return toObservable(context.loading).pipe(
      filter((loading) => !loading),
      take(1),
      map(() => (access.canRead(area) ? true : router.createUrlTree(['/painel']))),
    );
  };
}

/** Só o dono: Equipe e Planos. */
export const arenaOwnerGuard: CanActivateFn = () => {
  const access = inject(ArenaAccessService);
  const context = inject(ArenaContextService);
  const router = inject(Router);
  return toObservable(context.loading).pipe(
    filter((loading) => !loading),
    take(1),
    map(() => (access.isOwner() ? true : router.createUrlTree(['/painel']))),
  );
};
```

- [ ] **Step 2: Apply guards to routes**

Em `app.routes.ts`, somar o guard de área ao array `canActivate` de cada rota do painel, na ordem `[authGuard, arenaSelectionGuard, arenaAreaGuard('<área>')]`:

| rota | guard |
|---|---|
| `painel` | *(nenhum — Início é de todos)* |
| `painel/agenda`, `painel/reservas`, `painel/reservas/:id`, `painel/horarios-fixos`, todas as `painel/clubinho/*` | `arenaAreaGuard('agenda')` |
| `painel/financeiro`, `painel/financeiro/relatorios`, `painel/relatorios/ocupacao` | `arenaAreaGuard('financeiro')` |
| `painel/comandas`, `painel/comandas/:id` | `arenaAreaGuard('comandas')` |
| `painel/estoque`, `painel/estoque/novo`, `painel/estoque/:id/editar` | `arenaAreaGuard('estoque')` |
| `painel/promocoes*`, `painel/cupons*` | `arenaAreaGuard('promocoes')` |
| `painel/links`, `painel/meu-site` | `arenaAreaGuard('site')` |
| `painel/torneios` | `arenaAreaGuard('torneios')` |
| `painel/quadras*` | `arenaAreaGuard('quadras')` |
| `painel/avaliacoes`, `painel/seguidores`, `painel/ranking` | `arenaAreaGuard('comunidade')` |
| `painel/perfil*` | `arenaAreaGuard('perfil')` |
| `painel/equipe`, `painel/planos` | `arenaOwnerGuard` |

- [ ] **Step 3: Filter the sidebar**

Em `panel-shell.component.ts`, somar o campo à interface e a cada item:

```ts
interface PanelNavItem {
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
  badge: number | null;
  /** Área exigida; `null` = visível a todos; `'owner'` = só o dono. */
  area: ArenaArea | 'owner' | null;
}
```

Valores por item, na mesma ordem em que já estão: `inicio: null` · `agenda/reservas/horarios-fixos/clubinho: 'agenda'` · `financeiro: 'financeiro'` · `comandas: 'comandas'` · `estoque: 'estoque'` · `promocoes/cupons: 'promocoes'` · `links/meu-site: 'site'` · `torneios: 'torneios'` · `quadras: 'quadras'` · `ocupacao: 'financeiro'` · `avaliacoes/seguidores/ranking: 'comunidade'` · `equipe: 'owner'` · `planos: 'owner'`.

Injetar `ArenaAccessService` e trocar o uso direto de `NAV_ITEMS` no template por:

```ts
  private readonly access = inject(ArenaAccessService);

  protected readonly navItems = computed(() =>
    NAV_ITEMS.filter((item) => {
      if (item.area == null) return true;
      if (item.area === 'owner') return this.access.isOwner();
      return this.access.canRead(item.area);
    }),
  );
```

No template, trocar o `@for` que percorre `NAV_ITEMS` por `navItems()`. A função `pathOnly`/detecção de rota ativa na linha ~450 continua percorrendo `NAV_ITEMS` (a lista completa) — não trocar lá, senão o realce da rota some quando o item está filtrado.

- [ ] **Step 4: Build to verify**

Run: `npm --prefix frontend run build:arena`
Expected: build sem erros

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS — nenhum spec existente quebrado

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/auth/arena-area.guard.ts frontend/projects/arena/src/app/app.routes.ts frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts
git commit -m "feat(arena-web): guards por area e menu filtrado por cargo"
```

---

## Task 10: Tela Equipe com dados reais

**Files:**
- Create: `frontend/projects/arena/src/app/painel/data/arena-staff.model.ts`
- Create: `frontend/projects/arena/src/app/painel/data/arena-staff.service.ts`
- Modify: `frontend/projects/arena/src/app/painel/team/panel-team.component.ts` (substitui todo o bloco de mock, linhas 11-55 e a classe)

**Interfaces:**
- Consumes: callables da Task 6; `ARENA_ROLE_LABEL`, `ARENA_ROLE_DESCRIPTION`, `ARENA_ROLE_AREA_LABELS`, `ARENA_STAFF_ROLES` (Task 1); `ArenaContextService.hasCapability('equipe')` (Task 3)
- Produces: `ArenaStaffMember`, `ArenaStaffInvite`, `ArenaStaffService.watch(arenaId)`, `.invite(...)`, `.updateRole(...)`, `.remove(...)`, `.revokeInvite(...)`

- [ ] **Step 1: Create the model**

Criar `frontend/projects/arena/src/app/painel/data/arena-staff.model.ts`:

```ts
import type { DocumentSnapshot } from 'firebase/firestore';
import { isArenaStaffRole, type ArenaStaffRole } from './arena-roles.model';

export interface ArenaStaffMember {
  uid: string;
  role: ArenaStaffRole;
  email: string;
  displayName: string;
  photoUrl: string | null;
}

export interface ArenaStaffInvite {
  id: string;
  email: string;
  role: ArenaStaffRole;
}

function str(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

export function arenaStaffMemberFromDoc(snap: DocumentSnapshot): ArenaStaffMember | null {
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const role = data['role'];
  if (!isArenaStaffRole(role) || data['status'] !== 'active') return null;
  const email = str(data, 'email');
  return {
    uid: snap.id,
    role,
    email,
    displayName: str(data, 'displayName') || email.split('@')[0] || 'Membro',
    photoUrl: str(data, 'photoUrl') || null,
  };
}

export function arenaStaffInviteFromDoc(snap: DocumentSnapshot): ArenaStaffInvite | null {
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const role = data['role'];
  if (!isArenaStaffRole(role) || data['status'] !== 'pending') return null;
  return { id: snap.id, email: str(data, 'emailLower'), role };
}

/** Link que o dono copia/compartilha. O convite é aceito dentro do próprio portal. */
export function arenaInviteLink(origin: string, inviteId: string): string {
  return `${origin}/convite/${inviteId}`;
}

export function arenaInviteWhatsAppUrl(link: string, arenaName: string): string {
  const text = `Você foi convidado para a equipe da ${arenaName} no NexaGO. Acesse: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
```

- [ ] **Step 2: Write the failing test for the model**

Criar `frontend/projects/arena/src/app/painel/data/arena-staff.model.spec.ts`:

```ts
import { arenaInviteLink, arenaInviteWhatsAppUrl, arenaStaffMemberFromDoc, arenaStaffInviteFromDoc } from './arena-staff.model';

function snap(id: string, data: Record<string, unknown> | undefined) {
  return { id, data: () => data } as never;
}

describe('arena-staff.model', () => {
  it('le membro ativo', () => {
    const m = arenaStaffMemberFromDoc(
      snap('uid-1', { role: 'gestor', status: 'active', email: 'a@b.com', displayName: 'Ana' }),
    );
    expect(m?.uid).toBe('uid-1');
    expect(m?.role).toBe('gestor');
    expect(m?.displayName).toBe('Ana');
  });

  it('descarta membro com cargo invalido ou inativo', () => {
    expect(arenaStaffMemberFromDoc(snap('x', { role: 'chefe', status: 'active' }))).toBeNull();
    expect(arenaStaffMemberFromDoc(snap('x', { role: 'gestor', status: 'suspended' }))).toBeNull();
    expect(arenaStaffMemberFromDoc(snap('x', undefined))).toBeNull();
  });

  it('usa o e-mail como nome quando displayName falta', () => {
    const m = arenaStaffMemberFromDoc(snap('u', { role: 'recepcao', status: 'active', email: 'bia@x.com' }));
    expect(m?.displayName).toBe('bia');
  });

  it('le so convites pendentes', () => {
    expect(arenaStaffInviteFromDoc(snap('i1', { role: 'recepcao', status: 'pending', emailLower: 'a@b.com' }))?.email).toBe('a@b.com');
    expect(arenaStaffInviteFromDoc(snap('i2', { role: 'recepcao', status: 'accepted', emailLower: 'a@b.com' }))).toBeNull();
  });

  it('monta link e url de whatsapp', () => {
    const link = arenaInviteLink('https://arena.nexago.com.br', 'abc123');
    expect(link).toBe('https://arena.nexago.com.br/convite/abc123');
    expect(arenaInviteWhatsAppUrl(link, 'Arena CFC')).toContain('https://wa.me/?text=');
    expect(decodeURIComponent(arenaInviteWhatsAppUrl(link, 'Arena CFC'))).toContain('Arena CFC');
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS (o modelo do Step 1 já satisfaz)

- [ ] **Step 4: Create the service**

Criar `frontend/projects/arena/src/app/painel/data/arena-staff.service.ts`:

```ts
import { Injectable } from '@angular/core';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { arenaFirestore } from './firestore';
import { arenaFunctions } from './functions';
import {
  arenaStaffInviteFromDoc,
  arenaStaffMemberFromDoc,
  type ArenaStaffInvite,
  type ArenaStaffMember,
} from './arena-staff.model';
import type { ArenaStaffRole } from './arena-roles.model';

interface InviteResult {
  inviteId: string | null;
  status: 'active' | 'pending';
}

/** Leitura ao vivo da equipe e chamadas dos callables. Escrita direta é negada
 *  pelas rules de propósito — assento e plano são validados no servidor. */
@Injectable({ providedIn: 'root' })
export class ArenaStaffService {
  watchMembers(arenaId: string, onChange: (members: ArenaStaffMember[]) => void): Unsubscribe {
    return onSnapshot(
      collection(arenaFirestore(), 'arenas', arenaId, 'staff'),
      (snap) => onChange(snap.docs.map(arenaStaffMemberFromDoc).filter((m) => m != null)),
      () => onChange([]),
    );
  }

  watchInvites(arenaId: string, onChange: (invites: ArenaStaffInvite[]) => void): Unsubscribe {
    return onSnapshot(
      query(
        collection(arenaFirestore(), 'arenaStaffInvites'),
        where('arenaId', '==', arenaId),
        where('status', '==', 'pending'),
      ),
      (snap) => onChange(snap.docs.map(arenaStaffInviteFromDoc).filter((i) => i != null)),
      () => onChange([]),
    );
  }

  async invite(arenaId: string, email: string, role: ArenaStaffRole): Promise<InviteResult> {
    const call = httpsCallable<
      { arenaId: string; email: string; role: ArenaStaffRole },
      InviteResult
    >(arenaFunctions(), 'inviteArenaStaff');
    return (await call({ arenaId, email, role })).data;
  }

  async updateRole(arenaId: string, staffUserId: string, role: ArenaStaffRole): Promise<void> {
    const call = httpsCallable(arenaFunctions(), 'updateArenaStaffRole');
    await call({ arenaId, staffUserId, role });
  }

  async remove(arenaId: string, staffUserId: string): Promise<void> {
    const call = httpsCallable(arenaFunctions(), 'removeArenaStaff');
    await call({ arenaId, staffUserId });
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const call = httpsCallable(arenaFunctions(), 'revokeArenaStaffInvite');
    await call({ inviteId });
  }
}
```

- [ ] **Step 5: Rewire the screen**

Em `panel-team.component.ts`:

1. **Apagar** `MEMBERS`, `ROLE_OPTIONS`, `ROLE_PERMISSIONS`, `type MemberRole` e `interface Member` (linhas 11-55) — todo o mock. Importar de `../data/arena-roles.model`: `ARENA_STAFF_ROLES`, `ARENA_ROLE_LABEL`, `ARENA_ROLE_DESCRIPTION`, `ARENA_ROLE_AREA_LABELS`, `type ArenaStaffRole`.
2. `ROLE_TONE` passa a ser `Record<ArenaStaffRole, PillTone>`: `gestor: 'orange'`, os outros três `'dim'`.
3. Injetar `ArenaContextService` e `ArenaStaffService`; trocar `arenaName` para `this.arenaContext.arenaName() ?? 'Arena'` (hoje lê `auth.displayName()`, que é o nome da conta, não o da arena).
4. Substituir `members = signal<Member[]>(MEMBERS)` por dois signals alimentados pelos listeners, num `effect` que reage a `arenaContext.arenaId()` e derruba os unsubscribes anteriores — mesmo padrão de `panel-followers.component.ts`.
5. A tabela renderiza membros e convites numa lista só: `computed` que concatena membros (`status: 'ativo'`) e convites (`status: 'pendente'`). O pill de status já existe no template.
6. O modal de convite passa a mandar **um e-mail por vez** (o callable recebe `email`, não lista). Manter os chips na UI e chamar `invite()` em sequência para cada chip, acumulando erros por e-mail.
7. Depois de um convite `pending`, exibir o link (`arenaInviteLink(location.origin, inviteId)`) com botões **Copiar** (`navigator.clipboard.writeText`) e **WhatsApp** (`arenaInviteWhatsAppUrl`). Depois de um `active`, mostrar "Adicionado à equipe" — a pessoa já tinha conta.
8. Botão "Gerenciar" de cada linha abre um menu com trocar cargo (chama `updateRole`) e remover (`remove`, com confirmação). Convite pendente mostra "Cancelar convite" (`revokeInvite`).
9. Gate de plano: `readOnly = computed(() => !this.arenaContext.hasCapability('equipe'))`. Quando `readOnly()`, o botão "Convidar membro" fica desabilitado e um card de upsell aparece acima da tabela, com link para `/painel/planos` — mesmo padrão de `panel-stock.component.ts:361`.
10. KPI "Cargos" vira "Assentos": `membros + convites` de `maxSeats`, onde `maxSeats` é `5` para tier `pro` e `'ilimitado'` para `elite` (ler de `arenaContext.planStatus().tier`).

- [ ] **Step 6: Build and test**

Run: `npm --prefix frontend run build:arena`
Expected: build sem erros

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/arena/src/app/painel/data/arena-staff.model.ts frontend/projects/arena/src/app/painel/data/arena-staff.model.spec.ts frontend/projects/arena/src/app/painel/data/arena-staff.service.ts frontend/projects/arena/src/app/painel/team/panel-team.component.ts
git commit -m "feat(arena-web): tela Equipe com membros, convites e gate de plano reais"
```

---

## Task 11: Rota de aceite do convite

**Files:**
- Create: `frontend/projects/arena/src/app/auth/accept-invite.component.ts`
- Modify: `frontend/projects/arena/src/app/auth/auth.service.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `acceptArenaStaffInvite` (Task 6); `ar-auth-shell` (já existe)
- Produces: `AuthService.createStaffAccount(email, password, displayName)` — cria a conta **sem** chamar `completeArenaSignup`

- [ ] **Step 1: Add the account-creation variant**

Em `auth.service.ts`, ao lado de `createArenaAccount`:

```ts
  /** Cria conta para quem foi CONVIDADO para a equipe de uma arena.
   *
   *  Diferente de `createArenaAccount`, NÃO chama `completeArenaSignup` — essa
   *  função existe para o autocadastro de dono e faria o convidado nascer dono
   *  de uma arena própria. Aqui a role `arena` vem de `acceptArenaStaffInvite`,
   *  que a concede de forma síncrona ao criar o vínculo. */
  async createStaffAccount(email: string, password: string, displayName: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    const name = displayName.trim();
    if (name) {
      await updateProfile(credential.user, { displayName: name });
      this.displayNameOverride.set(name);
    }
  }

  /** Aceita o convite e recarrega o token para trazer a claim `arena` nova. */
  async acceptStaffInvite(inviteId: string): Promise<{ arenaId: string }> {
    const call = httpsCallable<{ inviteId: string }, { arenaId: string; role: string }>(
      this.functions,
      'acceptArenaStaffInvite',
    );
    const result = await call({ inviteId });
    await this.auth.currentUser?.getIdToken(true);
    return { arenaId: result.data.arenaId };
  }
```

- [ ] **Step 2: Create the route component**

Criar `frontend/projects/arena/src/app/auth/accept-invite.component.ts`, um standalone component com `ChangeDetectionStrategy.OnPush` que usa `ar-auth-shell` e segue os estilos de `login.component.ts`. Comportamento:

1. Lê `inviteId` de `ActivatedRoute` (`paramMap`).
2. Um `effect` sobre `auth.authReady()`:
   - **Autenticado** → chama `auth.acceptStaffInvite(inviteId)`; sucesso navega para `/painel`; erro exibe a mensagem do `HttpsError` (as mensagens dos callables já estão em português e são exibíveis direto).
   - **Não autenticado** → mostra dois caminhos: "Já tenho conta" (formulário de e-mail/senha que chama `auth.signInWithEmail`) e "Criar conta" (nome, e-mail, senha → `auth.createStaffAccount`). Nos dois casos, ao terminar, chama `acceptStaffInvite`.
3. **`signInWithEmail` não serve aqui sem cuidado**: ele chama `assertArenaRole`, que derruba a sessão de quem ainda não tem a role `arena` — exatamente o caso do convidado. Para essa tela, usar `signInWithEmailAndPassword` direto e só depois aceitar o convite (que concede a role). Expor isso em `auth.service.ts` como:

```ts
  /** Login do fluxo de convite: NÃO exige a role `arena`, porque quem está
   *  aceitando ainda não a tem. Quem valida o acesso é o próprio convite. */
  async signInForInvite(email: string, password: string): Promise<void> {
    await setPersistence(this.auth, browserLocalPersistence);
    await signInWithEmailAndPassword(this.auth, email.trim(), password);
  }
```

4. Estados de tela: carregando, erro ("Este convite não é mais válido ou foi enviado para outro e-mail." vindo do servidor) e sucesso.

- [ ] **Step 3: Register the route**

Em `app.routes.ts`, antes do catch-all `{ path: '**', redirectTo: '' }`:

```ts
  {
    path: 'convite/:inviteId',
    title: 'Convite de equipe — NexaGO Arena',
    loadComponent: () =>
      import('./auth/accept-invite.component').then((m) => m.AcceptInviteComponent),
  },
```

Sem `authGuard` — a rota precisa abrir para quem ainda não tem conta.

- [ ] **Step 4: Build**

Run: `npm --prefix frontend run build:arena`
Expected: build sem erros

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/auth/accept-invite.component.ts frontend/projects/arena/src/app/auth/auth.service.ts frontend/projects/arena/src/app/app.routes.ts
git commit -m "feat(arena-web): rota de aceite de convite de equipe"
```

---

## Task 12: Início sem faturamento para quem não tem financeiro

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/home/panel-home.component.ts:150` (KPI) e `:520-546` (abas do gráfico)

**Interfaces:**
- Consumes: `ArenaAccessService.canRead('financeiro')` (Task 8)

- [ ] **Step 1: Gate the revenue KPI**

Injetar `ArenaAccessService` e expor:

```ts
  private readonly access = inject(ArenaAccessService);
  protected readonly showsRevenue = computed(() => this.access.canRead('financeiro'));
```

Envolver o `<ar-kpi-card label="Faturamento hoje" ...>` (linha ~150) em `@if (showsRevenue()) { ... }`.

- [ ] **Step 2: Gate the chart tab**

`chartTabs` deixa de ser constante e vira derivado:

```ts
  protected readonly chartTabs = computed<ChartTab[]>(() =>
    this.showsRevenue() ? ['Faturamento', 'Reservas'] : ['Reservas'],
  );
```

`chartTab` passa a iniciar em `'Reservas'` quando `showsRevenue()` é falso. Como `chartTab` é um `signal`, somar um `effect` que corrige a aba selecionada se ela sair da lista:

```ts
  constructor() {
    effect(() => {
      if (!this.chartTabs().includes(this.chartTab())) {
        this.chartTab.set(this.chartTabs()[0]!);
      }
    });
  }
```

Se a classe já tiver `constructor`, somar o `effect` ao existente.

`chartTabs` deixa de ser um array e vira signal: **toda leitura no template passa a ser `chartTabs()`**. Conferir o `@for` das abas do gráfico e qualquer `chartTabs.length` — sem isso o template compila mas renderiza a função em vez da lista.

- [ ] **Step 3: Build and test**

Run: `npm --prefix frontend run build:arena`
Expected: build sem erros

Run: `npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/arena/src/app/painel/home/panel-home.component.ts
git commit -m "feat(arena-web): Inicio esconde faturamento de quem nao tem acesso financeiro"
```

---

## Task 13: Deploy no dev e verificação ponta a ponta

**Files:** nenhum alterado — esta task é verificação.

Ordem obrigatória: **rules → índices → functions → portal**. Invertida, um membro convidado bate em rules que ainda negam.

- [ ] **Step 1: Rodar a bateria inteira**

```bash
npm --prefix functions test
```
Expected: PASS

```bash
npx firebase emulators:exec --only firestore "node --test functions/test/arena-staff-rbac.rules.test.mjs functions/test/plan-tier-gates.rules.test.mjs functions/test/comanda-add-items.rules.test.mjs"
```
Expected: PASS — nenhuma regressão nos testes de rules existentes

```bash
npm --prefix frontend run ng -- test arena --watch=false --browsers=ChromeHeadless && npm --prefix frontend run build:arena
```
Expected: PASS + build limpo

- [ ] **Step 2: Deploy de rules e índices (dev)**

```bash
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project volley-track-dev-4596c
```
Expected: `Deploy complete!`

- [ ] **Step 3: Deploy das functions (dev)**

```bash
npx firebase-tools@latest deploy --only functions:inviteArenaStaff,functions:acceptArenaStaffInvite,functions:revokeArenaStaffInvite,functions:updateArenaStaffRole,functions:removeArenaStaff,functions:onArenaStaffWrittenSyncMirror,functions:onArenaDeletedCleanupStaff,functions:sweepExpiredArenaStaffInvites --project volley-track-dev-4596c
```
Expected: as 8 funções deployadas

- [ ] **Step 4: Smoke manual no dev**

Rodar o portal com `npm --prefix frontend start:arena` e verificar, com a arena do dono no dev (ver a receita em `docs` / memória `arena-creation-admin-recipe`):

1. Dono em arena **sem plano Pro**: `/painel/equipe` abre com o card de upsell e o botão de convidar desabilitado.
2. Dono em arena **Pro**: convidar um e-mail **que já tem conta** → membro aparece "Ativo" na hora.
3. Convidar um e-mail **sem conta** → linha "Convite pendente" + link copiável.
4. Abrir o link numa janela anônima, criar conta, aceitar → cai no `/painel` e **não** vira dono de arena nenhuma (conferir que nenhum doc `arenas` novo foi criado).
5. Entrar como o membro **Recepção**: o menu não mostra Financeiro, Estoque (edição), Perfil, Quadras, Equipe nem Planos; o Início não mostra "Faturamento hoje"; abrir `/painel/financeiro` na barra de endereço redireciona para `/painel`.
6. Como Recepção, abrir uma comanda → **salva**. É o teste que prova que as rules foram reescritas de verdade; se falhar com `permission-denied`, algum bloco da Task 5 ficou para trás.
7. Dono remove o membro → na sessão do membro, a próxima escrita falha.

- [ ] **Step 5: Registrar o estado**

Anotar em memória (`~/.claude/projects/.../memory/`) o que foi deployado no dev e o que falta em prod, seguindo o padrão dos demais registros de deploy pendente.

---

## Notas de execução

- **Prod não é tocado por este plano.** Todo o deploy é no projeto de dev (`volley-track-dev-4596c`). O deploy de produção é decisão do dono e entra na fila junto dos outros pendentes já registrados.
- **`firebase-tools` global está quebrado com Next 16** neste ambiente — usar sempre `npx firebase-tools@latest`, como as demais receitas do projeto fazem.
- **Se um teste de rules existente quebrar na Task 5**, a causa quase certa é ter perdido o ramo `isArenaOwner` em algum bloco. Conferir com `git diff firestore.rules` antes de mexer no teste — o teste está certo, a rule é que regrediu.
