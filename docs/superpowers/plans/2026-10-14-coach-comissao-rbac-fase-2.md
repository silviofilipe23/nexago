# Comissão técnica (coach) — RBAC fase 2: portal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O portal do treinador passa a funcionar para membros da comissão: o usuário escolhe de qual treinador está vendo os dados, o menu/rotas/botões respeitam o cargo, o convite é aceito por uma tela própria e a tela Permissões deixa de ser mock.

**Architecture:** Um `CoachContextService` (root) descobre os contextos do usuário — o próprio painel (`coaches/{uid}` existe) e os vínculos (`users/{uid}/coachStaff/*`, espelho mantido pelo backend da fase 1) — e expõe `activeCoachUid`, `role` e `can(area, modo)`. Todos os serviços que hoje usam `auth.user().uid` como `coachUid` passam a usar `activeCoachUid`. A matriz de cargos é espelhada em um model do portal, comparado com as rules e com o TS das functions por um teste de paridade. Guard de rota por área (dados em `route.data`), menu filtrado, botões de escrita gateados por área.

**Tech Stack:** Angular (standalone, signals, OnPush), Firebase JS SDK (Firestore + Functions callable), Karma/Jasmine (`ng test coach`), Firestore rules tests (`node --test` com emulador).

**Spec:** `docs/superpowers/specs/2026-10-14-coach-comissao-tecnica-rbac-design.md` (seção 6 e fase 2 da seção 8). **Pré-requisito:** a fase 1 (PR #684) — backend e rules deployados no dev; este plano parte do branch dela (PR empilhado) ou da `main` depois do merge.

## Global Constraints

- Regras do frontend (`frontend/.claude/CLAUDE.md`): componentes standalone **sem** `standalone: true` no decorator; `ChangeDetectionStrategy.OnPush`; `input()`/`output()`; signals + `computed()`; `inject()`; fluxo de controle nativo (`@if`/`@for`/`@switch`); **sem** `ngClass`/`ngStyle` (usar `[class.x]`/`[style.x]`); `host: {}` em vez de `@HostBinding`/`@HostListener`; formulários reativos; serviços `providedIn: 'root'`; sem `any` (usar `unknown`).
- Português nas strings de UI, inglês no código.
- **Retrocompatível**: para quem é só treinador (um único contexto, o próprio) nada muda visualmente — o seletor de painel só aparece com 2+ contextos e a sidebar/rotas se comportam como hoje.
- O model do portal tem o **mesmo formato** do TS das functions (`const COACH_WRITE_AREAS: Record<CoachStaffRole, readonly CoachArea[]> = { cargo: ['area', …], … }`, uma entrada por linha) porque o teste de paridade o lê por regex.
- Autorização de verdade é das rules/functions (fase 1). O gating do portal é UX: nunca é a única barreira, e nunca deve esconder nada que as rules deixam fazer (nem mostrar o que elas negam).
- O doc/perfil `coaches/{uid}` do **próprio usuário** é o "Perfil" (área `principal`); a claim `coach` **não** diz que a pessoa é treinador principal — um membro também a tem. Decidir "é membro de X" sempre pelo espelho/`staff`, nunca pela claim.
- Nenhum deploy neste plano. Pode haver mudança em `firestore.rules` só na Task 1 (e só se o teste provar que é preciso); se mudar, o deploy das rules no dev é decisão do usuário.
- Build/teste em worktree: `node_modules` não existe — symlink `ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules <worktree>/frontend/node_modules` e rode `ng` com caminho **absoluto do worktree** (senão sobe a árvore do checkout principal). Template só é checado por `ng build coach --configuration development`, não por `ng test`.

## Review Focus

Condições que o spec implica e nenhum caminho "feliz" exercita — cada uma tem teste/verificação na task dona:

1. **Membro sem painel próprio** (tem a claim `coach`, mas `coaches/{uid}` não existe): o contexto ativo é o primeiro vínculo; nunca cair num painel vazio "dele mesmo" → Task 4.
2. **Troca de treinador com assinaturas vivas**: dados do treinador anterior não podem aparecer (nem por um instante) nas telas do novo; `activeSquadId` do anterior não pode vazar → Task 5.
3. **Acesso revogado com o portal aberto**: o vínculo some do espelho/`staff` → listeners dão permission-denied → contexto cai para outro ou para a tela "sem acesso"; o treinador salvo em `localStorage` que não existe mais é ignorado → Task 4 e Task 6.
4. **Deep link para rota que o cargo não acessa** (ex.: preparador abre `/painel/lesoes` ou `/painel/treinos/novo`) → redireciona, nunca tela em branco nem erro de permissão cru → Task 6.
5. **Rota de escrita alcançável por URL** para cargo só-leitura → o guard de modo `write` barra (o botão escondido não basta) → Task 6.
6. **Convite**: link aberto sem login (redirect volta depois do login **e** do cadastro); e-mail de outra conta; vencido; já aceito; claim `coach` atualizada logo depois do aceite (senão o `coachGuard` barra quem acabou de entrar) → Task 8.
7. **Lista de convites por query** (`where coachUid == uid`): query com `get()` com default nas rules pode ser negada mesmo para o dono — prova em emulador antes de construir a tela → Task 1.
8. **Usuário que é dono E membro** (dois contextos): seletor, rótulo de cargo e permissões trocam juntos; "Permissões" só aparece no contexto de dono → Tasks 4, 6, 9.
9. **Rota nova esquecida sem `data.area`**: ficaria acessível a qualquer cargo → spec que falha se alguma rota `painel/*` não declarar a área → Task 6.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `functions/test/coach-staff-rbac.rules.test.mjs` (modifica) | testes de **query** de lista nas rules (Task 1) |
| `frontend/projects/coach/src/app/painel/access/coach-roles.model.ts` (novo) | cargos, áreas, matriz espelhada, rótulos, `roleCan…` |
| `…/access/coach-roles.model.spec.ts` (novo) | matriz exata e semântica do model |
| `functions/test/coach-roles-parity.test.mjs` (modifica) | model do portal entra na paridade |
| `…/access/coach-context.logic.ts` (novo) | `buildContexts`, `resolveActiveCoach` (puro) |
| `…/access/coach-context.logic.spec.ts` (novo) | casos do Review Focus 1, 3 e 8 |
| `…/access/coach-context.service.ts` (novo) | listeners, contexto ativo, `can()` |
| `…/access/area.guard.ts` (novo) | guard por `route.data` |
| `…/access/coach-staff.service.ts` (novo) | leitura ao vivo + callables da comissão |
| `…/access/no-access.component.ts` (novo) | tela "sem acesso" |
| `src/app/auth/auth.service.ts` (modifica) | `refreshClaims()` |
| `src/app/painel/*/*.service.ts` (modifica, 6) + `panel-torneios` | `activeCoachUid` + `coachUid` nas callables |
| `src/app/app.routes.ts` (modifica) | `data.area`/`mode` em toda rota `painel/*`, `areaGuard`, rotas novas |
| `src/app/app.routes.spec.ts` (novo) | toda rota `painel/*` declara área; menu e rotas concordam |
| `src/app/painel/ui/panel-shell.component.ts` (modifica) | menu filtrado, seletor de painel, rótulo de cargo, "sair da comissão" |
| telas do painel (modifica) | gating dos botões de escrita (Task 7) |
| `src/app/convites/convite-equipe.component.ts` (novo) | aceitar convite da comissão |
| `src/app/auth/signup.component.ts` (modifica) | honrar `?redirect=` |
| `src/app/painel/permissoes/panel-permissoes.component.ts` (reescreve) | tela real |

Todos os caminhos de `src/` abaixo são relativos a `frontend/projects/coach/`.

---

### Task 1: Rules — provar as queries de lista dos convites e da comissão

**Files:**
- Modify: `functions/test/coach-staff-rbac.rules.test.mjs`
- Modify (só se um teste falhar): `firestore.rules` — bloco `match /coachStaffInvites/{inviteId}`

**Interfaces:**
- Produces: a garantia de que estas queries funcionam sem erro de permissão, e que a tela Permissões (Task 9) pode usá-las: `where('coachUid','==',uid)` + `where('status','==','pending')` em `coachStaffInvites` (dono); `where('emailLower','==',email)` (convidado); `collection('coaches', uid, 'staff')` (dono); `collection('users', uid, 'coachStaff')` (o próprio).

- [ ] **Step 1: Escrever os testes (devem rodar contra as rules atuais)**

No import do `firebase/firestore` do arquivo, acrescente `query` e `where`. Ao final do arquivo:

```js
test('lista: dono consulta os próprios convites pendentes (coachUid + status)', async () => {
  const q = query(
    collection(as(COACH), 'coachStaffInvites'),
    where('coachUid', '==', COACH),
    where('status', '==', 'pending'),
  );
  await assertSucceeds(getDocs(q));
});

test('lista: dono NÃO consulta convites de outro treinador', async () => {
  const q = query(
    collection(as(COACH), 'coachStaffInvites'),
    where('coachUid', '==', OUTRO_COACH),
    where('status', '==', 'pending'),
  );
  await assertFails(getDocs(q));
});

test('lista: sem filtro nenhum, nem o dono lista a coleção inteira de convites', async () => {
  await assertFails(getDocs(collection(as(COACH), 'coachStaffInvites')));
});

test('lista: convidado consulta pelo próprio e-mail', async () => {
  const db = as('novo-uid', { email: 'novo@x.com' });
  await assertSucceeds(getDocs(query(collection(db, 'coachStaffInvites'), where('emailLower', '==', 'novo@x.com'))));
});

test('lista: convidado NÃO consulta por e-mail alheio', async () => {
  const db = as('novo-uid', { email: 'novo@x.com' });
  await assertFails(getDocs(query(collection(db, 'coachStaffInvites'), where('emailLower', '==', 'outro@x.com'))));
});

test('lista: dono lista a própria comissão; membro não lista a de outro', async () => {
  await assertSucceeds(getDocs(collection(as(COACH), 'coaches', COACH, 'staff')));
  await assertFails(getDocs(collection(as(AUX), 'coaches', COACH, 'staff')));
});

test('lista: o usuário lista os próprios vínculos em users/{uid}/coachStaff, não os de outro', async () => {
  await assertSucceeds(getDocs(collection(as(AUX), 'users', AUX, 'coachStaff')));
  await assertFails(getDocs(collection(as(PSICO), 'users', AUX, 'coachStaff')));
});
```

- [ ] **Step 2: Rodar**

Run (da pasta `functions/`): `firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/coach-staff-rbac.rules.test.mjs"`
Expected: os testes antigos passam; se **algum `lista:` falhar**, vá ao Step 3; se todos passarem, pule o Step 3 (registre no commit que as queries já funcionavam).

- [ ] **Step 3 (só se falhou): trocar `get()` com default por acesso direto no bloco `coachStaffInvites`**

`resource.data.get('coachUid', '')` não é avaliável de forma simbólica em query de lista. Reescreva o `allow read` do bloco para:

```
      allow read: if request.auth != null && (
        resource.data.coachUid == request.auth.uid ||
        (
          request.auth.token.get('email', '') != '' &&
          request.auth.token.email.lower() == resource.data.emailLower
        )
      );
```
(documento sem `coachUid`/`emailLower` dá erro de avaliação = negado, que é o comportamento desejado). Rode de novo o Step 2 e depois a suíte completa: `npm run test:rules` — tudo verde (incluindo os testes antigos de leitura de convite e o do convite sem e-mail).

- [ ] **Step 4: Commit**

```bash
git add functions/test/coach-staff-rbac.rules.test.mjs firestore.rules
git commit -m "test(coach): queries de lista de convites e da comissão nas rules"
```

---

### Task 2: Model do portal — cargos, áreas e matriz

**Files:**
- Create: `src/app/painel/access/coach-roles.model.ts`
- Test: `src/app/painel/access/coach-roles.model.spec.ts`

**Interfaces:**
- Produces:
  - tipos `CoachStaffRole`, `CoachRole = 'principal' | CoachStaffRole`, `CoachArea`, `PanelArea = CoachArea | 'principal'`, `AccessMode = 'read' | 'write'`
  - `COACH_STAFF_ROLES`, `COACH_AREAS` (arrays `as const`)
  - `isCoachStaffRole(v: unknown): v is CoachStaffRole`
  - `roleCanAccess(role: CoachRole, area: PanelArea, mode: AccessMode): boolean` — `principal` acessa tudo; a área `'principal'` só o principal
  - `ROLE_LABELS: Record<CoachRole, string>`, `ROLE_SUMMARIES: Record<CoachRole, string>`

- [ ] **Step 1: Escrever o spec que falha**

```ts
import {
  COACH_AREAS,
  COACH_STAFF_ROLES,
  ROLE_LABELS,
  isCoachStaffRole,
  roleCanAccess,
  type CoachArea,
  type CoachStaffRole,
} from './coach-roles.model';

describe('coach-roles.model', () => {
  it('isCoachStaffRole aceita só os quatro cargos (principal não é cargo de staff)', () => {
    for (const r of ['auxiliar', 'preparador_fisico', 'fisioterapeuta', 'psicologo']) {
      expect(isCoachStaffRole(r)).toBeTrue();
    }
    for (const r of ['principal', 'dono', '', undefined, null, 3]) {
      expect(isCoachStaffRole(r)).toBeFalse();
    }
  });

  it('principal acessa toda área em leitura e escrita, e a área "principal"', () => {
    for (const area of [...COACH_AREAS, 'principal' as const]) {
      expect(roleCanAccess('principal', area, 'read')).toBeTrue();
      expect(roleCanAccess('principal', area, 'write')).toBeTrue();
    }
  });

  it('nenhum cargo de staff acessa a área "principal"', () => {
    for (const role of COACH_STAFF_ROLES) {
      expect(roleCanAccess(role, 'principal', 'read')).toBeFalse();
    }
  });

  it('matriz exata por cargo (escrita implica leitura)', () => {
    const expected: Record<CoachStaffRole, { w: CoachArea[]; r: CoachArea[] }> = {
      auxiliar: { w: ['treinos', 'convocacoes', 'comunicacao'], r: ['atletas', 'avaliacoes'] },
      preparador_fisico: { w: ['fisico'], r: ['atletas', 'treinos', 'avaliacoes'] },
      fisioterapeuta: { w: ['saude'], r: ['atletas', 'treinos', 'fisico'] },
      psicologo: { w: ['mental'], r: ['atletas'] },
    };
    for (const role of COACH_STAFF_ROLES) {
      const writes = COACH_AREAS.filter((a) => roleCanAccess(role, a, 'write'));
      const readOnly = COACH_AREAS.filter((a) => roleCanAccess(role, a, 'read') && !roleCanAccess(role, a, 'write'));
      expect([...writes].sort()).toEqual([...expected[role].w].sort());
      expect([...readOnly].sort()).toEqual([...expected[role].r].sort());
    }
  });

  it('financeiro e equipe só o principal', () => {
    for (const role of COACH_STAFF_ROLES) {
      for (const area of ['financeiro', 'equipe'] as const) {
        expect(roleCanAccess(role, area, 'read')).toBeFalse();
      }
    }
  });

  it('todo cargo tem rótulo', () => {
    for (const role of ['principal', ...COACH_STAFF_ROLES] as const) {
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (de `<worktree>/frontend`): `npx ng test coach --watch=false --browsers=ChromeHeadless --include='**/coach-roles.model.spec.ts'`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
/**
 * Cargos da comissão técnica e matriz de acesso por área — ESPELHO MANUAL de
 * `functions/src/coach-staff-roles.ts` e dos mapas `coachWriteAreas`/`coachReadAreas` em
 * `firestore.rules`. `functions/test/coach-roles-parity.test.mjs` lê este arquivo por regex e
 * compara com os dois: mantenha o formato (uma entrada `cargo: ['area', …],` por linha).
 *
 * `principal` é o dono do painel (`uid == coachUid`), não um cargo de staff. `'principal'` como
 * *área* (`PanelArea`) marca telas só do dono (perfil, biblioteca, IA).
 */
export const COACH_STAFF_ROLES = ['auxiliar', 'preparador_fisico', 'fisioterapeuta', 'psicologo'] as const;
export type CoachStaffRole = (typeof COACH_STAFF_ROLES)[number];
export type CoachRole = 'principal' | CoachStaffRole;

export const COACH_AREAS = [
  'atletas',
  'treinos',
  'convocacoes',
  'avaliacoes',
  'fisico',
  'saude',
  'mental',
  'comunicacao',
  'financeiro',
  'equipe',
] as const;
export type CoachArea = (typeof COACH_AREAS)[number];

export type PanelArea = CoachArea | 'principal';
export type AccessMode = 'read' | 'write';

export function isCoachStaffRole(value: unknown): value is CoachStaffRole {
  return typeof value === 'string' && (COACH_STAFF_ROLES as readonly string[]).includes(value);
}

/** Áreas em que o cargo escreve. Escrita implica leitura. */
const COACH_WRITE_AREAS: Record<CoachStaffRole, readonly CoachArea[]> = {
  auxiliar: ['treinos', 'convocacoes', 'comunicacao'],
  preparador_fisico: ['fisico'],
  fisioterapeuta: ['saude'],
  psicologo: ['mental'],
};

/** Áreas só de leitura, somadas às de escrita. */
const COACH_READ_ONLY_AREAS: Record<CoachStaffRole, readonly CoachArea[]> = {
  auxiliar: ['atletas', 'avaliacoes'],
  preparador_fisico: ['atletas', 'treinos', 'avaliacoes'],
  fisioterapeuta: ['atletas', 'treinos', 'fisico'],
  psicologo: ['atletas'],
};

export function roleCanAccess(role: CoachRole, area: PanelArea, mode: AccessMode): boolean {
  if (role === 'principal') {
    return true;
  }
  if (area === 'principal') {
    return false;
  }
  const writes = (COACH_WRITE_AREAS[role] ?? []).includes(area);
  return mode === 'write' ? writes : writes || (COACH_READ_ONLY_AREAS[role] ?? []).includes(area);
}

export const ROLE_LABELS: Record<CoachRole, string> = {
  principal: 'Treinador principal',
  auxiliar: 'Auxiliar',
  preparador_fisico: 'Preparador físico',
  fisioterapeuta: 'Fisioterapeuta',
  psicologo: 'Psicólogo',
};

export const ROLE_SUMMARIES: Record<CoachRole, string> = {
  principal: 'Acesso total: atletas, treinos, avaliações, convocações, financeiro e a própria comissão',
  auxiliar: 'Treinos, presença, convocações e comunicação — sem edição de permissões',
  preparador_fisico: 'Plano de evolução física e condicionamento',
  fisioterapeuta: 'Módulo de lesões e histórico de saúde',
  psicologo: 'Notas de acompanhamento mental — acesso restrito',
};
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando do Step 2. Expected: 6 specs PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/coach/src/app/painel/access
git commit -m "feat(coach-web): model de cargos e áreas da comissão"
```

---

### Task 3: Paridade — o model do portal entra na comparação

**Files:**
- Modify: `functions/test/coach-roles-parity.test.mjs` (acrescentar ao fim)

**Interfaces:**
- Consumes: `lib/coach-staff-roles.js` (já importado no arquivo: `COACH_AREAS`, `COACH_STAFF_ROLES`, `coachRoleCanRead`, `coachRoleCanWrite`), `fs`, `path`, `assert`, `test` (já importados), `__dirname`.

- [ ] **Step 1: Escrever os testes (falham se o model divergir; hoje passam, então prove a mordida no Step 3)**

```js
const portalSrc = fs.readFileSync(
  path.join(__dirname, '../../frontend/projects/coach/src/app/painel/access/coach-roles.model.ts'),
  'utf8',
);

/** Extrai `const NOME … = { cargo: ['a', 'b'], … };` do model do portal. */
function parsePortalMap(name) {
  const m = portalSrc.match(new RegExp(`const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(m, `mapa ${name} não encontrado no model do portal`);
  const out = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const e = line.match(/^\s*([A-Za-z0-9_]+):\s*\[([^\]]*)\],?\s*$/);
    assert.ok(e, `linha ilegível em ${name}: "${line}"`);
    out[e[1]] = e[2].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort();
  }
  return out;
}

function parsePortalList(name) {
  const m = portalSrc.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  assert.ok(m, `lista ${name} não encontrada no model do portal`);
  return m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
}

const portalWrite = parsePortalMap('COACH_WRITE_AREAS');
const portalReadOnly = parsePortalMap('COACH_READ_ONLY_AREAS');

test('portal: mesmos cargos e mesmas áreas do TS das functions', () => {
  assert.deepEqual(parsePortalList('COACH_STAFF_ROLES'), [...COACH_STAFF_ROLES]);
  assert.deepEqual(parsePortalList('COACH_AREAS'), [...COACH_AREAS]);
  assert.deepEqual(Object.keys(portalWrite).sort(), [...COACH_STAFF_ROLES].sort());
  assert.deepEqual(Object.keys(portalReadOnly).sort(), [...COACH_STAFF_ROLES].sort());
});

test('portal: escrita == TS, cargo a cargo', () => {
  for (const role of COACH_STAFF_ROLES) {
    const ts = COACH_AREAS.filter((a) => coachRoleCanWrite(role, a)).sort();
    assert.deepEqual(portalWrite[role], ts, `escrita de ${role}`);
  }
});

test('portal: leitura (escrita + só-leitura) == TS == rules, cargo a cargo', () => {
  for (const role of COACH_STAFF_ROLES) {
    const portalRead = [...new Set([...portalWrite[role], ...portalReadOnly[role]])].sort();
    const ts = COACH_AREAS.filter((a) => coachRoleCanRead(role, a)).sort();
    assert.deepEqual(portalRead, ts, `leitura de ${role} (portal x TS)`);
    assert.deepEqual(portalRead, readMap[role], `leitura de ${role} (portal x rules)`);
  }
});
```

- [ ] **Step 2: Rodar** — de `functions/`: `npm run build && node --test test/coach-roles-parity.test.mjs`. Expected: todos PASS (os 4 antigos + 3 novos).

- [ ] **Step 3: Provar que morde** — em `…/coach-roles.model.ts` troque `psicologo: ['mental'],` por `psicologo: ['mental', 'saude'],`, rode o Step 2 e veja **FAIL** em "portal: escrita == TS"; reverta com `git checkout -- frontend/projects/coach/src/app/painel/access/coach-roles.model.ts` (seguro: a Task 2 já commitou).

- [ ] **Step 4: Commit**

```bash
git add functions/test/coach-roles-parity.test.mjs
git commit -m "test(coach): paridade da matriz inclui o model do portal"
```

---

### Task 4: Contexto do treinador ativo

**Files:**
- Create: `src/app/painel/access/coach-context.logic.ts`, `src/app/painel/access/coach-context.logic.spec.ts`, `src/app/painel/access/coach-context.service.ts`
- Modify: `src/app/auth/auth.service.ts`

**Interfaces:**
- Consumes: `isCoachStaffRole`, `roleCanAccess`, `CoachRole`, `CoachStaffRole`, `PanelArea`, `AccessMode` (Task 2); `AuthService.user`.
- Produces:
  - `interface CoachMembership { coachUid: string; role: unknown; coachName: string }`
  - `interface CoachContext { coachUid: string; role: CoachRole; coachName: string; isOwn: boolean }`
  - `buildContexts(ownUid: string | null, ownExists: boolean, memberships: readonly CoachMembership[]): CoachContext[]`
  - `resolveActiveCoach(contexts: readonly CoachContext[], preferredUid: string | null): CoachContext | null`
  - `CoachContextService`: `ready: Signal<boolean>`, `contexts: Signal<CoachContext[]>`, `activeContext: Signal<CoachContext | null>`, `activeCoachUid: Signal<string | null>`, `role: Signal<CoachRole | null>`, `can(area: PanelArea, mode?: AccessMode): boolean`, `select(coachUid: string): void`
  - `AuthService.refreshClaims(): Promise<void>`

- [ ] **Step 1: Spec da lógica pura (falha)**

```ts
import { buildContexts, resolveActiveCoach, type CoachMembership } from './coach-context.logic';

const member = (coachUid: string, role: unknown, coachName = ''): CoachMembership => ({ coachUid, role, coachName });

describe('buildContexts', () => {
  it('treinador sem vínculos: só o próprio painel', () => {
    expect(buildContexts('me', true, [])).toEqual([{ coachUid: 'me', role: 'principal', coachName: 'Meu painel', isOwn: true }]);
  });

  it('membro SEM painel próprio: só os vínculos, nenhum contexto "próprio" vazio', () => {
    const ctx = buildContexts('me', false, [member('A', 'fisioterapeuta', 'Carla')]);
    expect(ctx.map((c) => c.coachUid)).toEqual(['A']);
    expect(ctx[0].isOwn).toBeFalse();
  });

  it('dono E membro: o próprio vem primeiro, depois os vínculos', () => {
    const ctx = buildContexts('me', true, [member('A', 'auxiliar', 'Carla')]);
    expect(ctx.map((c) => c.coachUid)).toEqual(['me', 'A']);
    expect(ctx[1].role).toBe('auxiliar');
  });

  it('espelho com cargo inválido ou vazio não vira contexto (não libera nada)', () => {
    expect(buildContexts('me', false, [member('A', ''), member('B', 'dono'), member('C', undefined)])).toEqual([]);
  });

  it('vínculo apontando para o próprio uid é ignorado', () => {
    expect(buildContexts('me', true, [member('me', 'auxiliar')]).length).toBe(1);
  });

  it('sem nome do treinador: rótulo padrão', () => {
    expect(buildContexts(null, false, [member('A', 'psicologo', '')])[0].coachName).toBe('Treinador');
  });
});

describe('resolveActiveCoach', () => {
  const ctx = buildContexts('me', true, [member('A', 'auxiliar', 'Carla')]);

  it('sem contextos: null', () => expect(resolveActiveCoach([], 'A')).toBeNull());
  it('respeita o treinador preferido quando existe', () => expect(resolveActiveCoach(ctx, 'A')?.coachUid).toBe('A'));
  it('preferido que não existe mais (acesso revogado): cai no primeiro contexto', () =>
    expect(resolveActiveCoach(ctx, 'ZZZ')?.coachUid).toBe('me'));
  it('sem preferência: primeiro contexto (o próprio painel, se existir)', () =>
    expect(resolveActiveCoach(ctx, null)?.coachUid).toBe('me'));
  it('sem painel próprio e sem preferência: o primeiro vínculo', () =>
    expect(resolveActiveCoach(buildContexts('me', false, [member('A', 'psicologo', 'C')]), null)?.coachUid).toBe('A'));
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx ng test coach --watch=false --browsers=ChromeHeadless --include='**/coach-context.logic.spec.ts'` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar a lógica**

```ts
import { isCoachStaffRole, type CoachRole } from './coach-roles.model';

export interface CoachMembership {
  coachUid: string;
  /** Vem do espelho; só vale se for um cargo conhecido. */
  role: unknown;
  coachName: string;
}

export interface CoachContext {
  coachUid: string;
  role: CoachRole;
  coachName: string;
  /** `true` = o painel do próprio usuário (ele é o treinador principal). */
  isOwn: boolean;
}

/** Monta os painéis a que o usuário tem acesso: o próprio (se existir) + os vínculos válidos. */
export function buildContexts(
  ownUid: string | null,
  ownExists: boolean,
  memberships: readonly CoachMembership[],
): CoachContext[] {
  const out: CoachContext[] = [];
  if (ownUid && ownExists) {
    out.push({ coachUid: ownUid, role: 'principal', coachName: 'Meu painel', isOwn: true });
  }
  for (const m of memberships) {
    if (!isCoachStaffRole(m.role) || m.coachUid === ownUid) {
      continue;
    }
    out.push({ coachUid: m.coachUid, role: m.role, coachName: m.coachName || 'Treinador', isOwn: false });
  }
  return out;
}

/** Painel ativo: o preferido se ainda existir; senão o primeiro (o próprio, quando há). */
export function resolveActiveCoach(
  contexts: readonly CoachContext[],
  preferredUid: string | null,
): CoachContext | null {
  return contexts.find((c) => c.coachUid === preferredUid) ?? contexts[0] ?? null;
}
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando. Expected: 11 specs PASS.

- [ ] **Step 5: `AuthService.refreshClaims()`** — em `src/app/auth/auth.service.ts`, depois de `readRoleClaims`:

```ts
  /** Relê as claims do ID token (forçando refresh) — usado depois de entrar numa comissão,
   *  quando o servidor acabou de conceder a claim `coach`. */
  async refreshClaims(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return;
    }
    const roles = (await user.getIdTokenResult(true)).claims['roles'];
    this.roleClaims.set(Array.isArray(roles) ? roles.map(String) : []);
  }
```

- [ ] **Step 6: O serviço** (`coach-context.service.ts`)

```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { collection, doc, getFirestore, onSnapshot, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { buildContexts, resolveActiveCoach, type CoachContext, type CoachMembership } from './coach-context.logic';
import { roleCanAccess, type AccessMode, type PanelArea } from './coach-roles.model';

const STORAGE_KEY = 'nexago.coach.activeCoachUid';

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Conveniência por navegador — pode lançar (aba anônima, dados bloqueados): nunca é requisito. */
function readStoredCoach(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeCoach(coachUid: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, coachUid);
  } catch {
    /* sem persistência: a escolha vale só nesta sessão */
  }
}

function readMembership(d: QueryDocumentSnapshot): CoachMembership {
  const data = d.data();
  return { coachUid: d.id, role: data['role'], coachName: String(data['coachName'] ?? '') };
}

/**
 * De qual treinador o usuário está vendo os dados. Só DESCOBERTA: a autorização de verdade é das
 * rules/functions, que leem `coaches/{coachUid}/staff/{uid}` ao vivo. A claim `coach` não entra
 * aqui — um membro também a tem.
 */
@Injectable({ providedIn: 'root' })
export class CoachContextService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly ownExists = signal(false);
  private readonly memberships = signal<CoachMembership[]>([]);
  private readonly preferredUid = signal<string | null>(readStoredCoach());
  private readonly ownReady = signal(false);
  private readonly membershipsReady = signal(false);

  /** `true` quando os dois listeners já responderam (ou falharam) pelo menos uma vez. */
  readonly ready = computed(() => this.ownReady() && this.membershipsReady());

  readonly contexts = computed<CoachContext[]>(() =>
    buildContexts(this.auth.user()?.uid ?? null, this.ownExists(), this.memberships()),
  );
  readonly activeContext = computed(() => resolveActiveCoach(this.contexts(), this.preferredUid()));
  readonly activeCoachUid = computed(() => this.activeContext()?.coachUid ?? null);
  readonly role = computed(() => this.activeContext()?.role ?? null);

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      this.ownExists.set(false);
      this.memberships.set([]);
      this.ownReady.set(false);
      this.membershipsReady.set(false);
      if (!uid) {
        return;
      }

      const stopOwn = onSnapshot(
        doc(this.firestore, 'coaches', uid),
        (snap) => {
          this.ownExists.set(snap.exists());
          this.ownReady.set(true);
        },
        () => {
          this.ownExists.set(false);
          this.ownReady.set(true);
        },
      );
      const stopMemberships = onSnapshot(
        collection(this.firestore, 'users', uid, 'coachStaff'),
        (snap) => {
          this.memberships.set(snap.docs.map(readMembership));
          this.membershipsReady.set(true);
        },
        () => {
          this.memberships.set([]);
          this.membershipsReady.set(true);
        },
      );
      onCleanup(() => {
        stopOwn();
        stopMemberships();
      });
    });
  }

  /** O cargo do painel ativo cobre a área no modo pedido? Sem painel ativo, não. */
  can(area: PanelArea, mode: AccessMode = 'read'): boolean {
    const role = this.role();
    return role !== null && roleCanAccess(role, area, mode);
  }

  select(coachUid: string): void {
    if (!this.contexts().some((c) => c.coachUid === coachUid)) {
      return;
    }
    this.preferredUid.set(coachUid);
    storeCoach(coachUid);
  }
}
```

- [ ] **Step 7: Verificar** — `npx ng test coach --watch=false --browsers=ChromeHeadless` (todos os specs do coach passam) e `npx ng build coach --configuration development` (limpo).

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/coach/src/app/painel/access frontend/projects/coach/src/app/auth/auth.service.ts
git commit -m "feat(coach-web): contexto do treinador ativo e refresh de claims"
```

---

### Task 5: Serviços de dados passam a usar o treinador ativo

**Files (modify):** `src/app/painel/equipes/squads.service.ts`, `src/app/painel/atletas/athletes.service.ts`, `src/app/painel/treinos/trainings.service.ts`, `src/app/painel/avaliacoes/evaluations.service.ts`, `src/app/painel/convocacoes/call-ups.service.ts`, `src/app/painel/torneios/panel-torneios.component.ts`
**Não modificar:** `panel-perfil.component.ts` (o Perfil é do **próprio** usuário, área `principal`) e `convocacao.component.ts` / `convite-atleta.component.ts` (lado do atleta).

**Interfaces:**
- Consumes: `CoachContextService.activeCoachUid` (Task 4).
- Produces: nenhuma assinatura pública muda; cada serviço passa a reassinar o Firestore quando `activeCoachUid` muda, **limpando o estado antes** (Review Focus 2).

Mudança mecânica e igual em todos os serviços. Para cada arquivo:

- [ ] **Step 1: Ler o arquivo inteiro** e localizar todas as ocorrências de `this.auth.user()?.uid` (efeito de leitura, `requireUid()`, métodos de escrita). Grep de controle: `grep -n "user()?.uid" <arquivo>`.

- [ ] **Step 2: Aplicar o padrão**
  1. `private readonly ctx = inject(CoachContextService);` (import de `../access/coach-context.service`). Remova o `AuthService` do arquivo **só se** não sobrar outro uso (lint de import não usado).
  2. Troque toda leitura de `this.auth.user()?.uid` por `this.ctx.activeCoachUid()` (o tipo continua `string | null`, então os `if (!uid)` existentes seguem válidos; mensagens `'Usuário não autenticado.'` viram `'Nenhum painel de treinador ativo.'`).
  3. No `effect`, **logo depois** de ler `uid` e **antes** do `onSnapshot`, resete o estado do serviço (ex.: `this.trainingsState.set([]); this.ready.set(false);` em trainings; `this.squadsState.set([]); this.squadContext.setSquads([]);` em squads — o `setSquads([])` também zera `activeSquadId` via a regra existente "se a equipe ativa não existir mais cai pra null"; em athletes: `linksState.set([])` e `profilesState.set(new Map())`; evaluations/call-ups: o signal da lista). O ramo `!uid` já faz esse reset — reaproveite movendo o reset para antes do `if`.
  4. Callables que o backend da fase 1 autoriza por área ganham `coachUid` no payload:
     - `athletes.service.ts` — `searchAthleteByEmail`: payload `{ coachUid: this.ctx.activeCoachUid(), email }`; `inviteAthlete`: `{ coachUid: this.ctx.activeCoachUid(), athleteUid, athleteName, … }`. Ajuste os genéricos de `httpsCallable` para incluir `coachUid: string | null`.
     - `call-ups.service.ts` — `sendCallUp`: `{ coachUid: this.ctx.activeCoachUid(), ...input }`.
     - `panel-torneios.component.ts` (~linha 102) — `{ coachUid: <activeCoachUid>, squadId }` (injete o `CoachContextService`; ajuste o genérico para `{ coachUid?: string | null; squadId?: string }`).
     (Quando `coachUid` é o do próprio usuário, o backend se comporta como antes.)
  4. `panel-torneios.component.ts`: o componente chama a callable num `ngOnInit`/efeito — se ele só carrega uma vez, faça-o recarregar quando `activeCoachUid()` mudar (use `effect` ou leia o signal dentro da função de carga chamada por um `effect`).

- [ ] **Step 3: Conferir que não sobrou resíduo** — o comportamento novo (reassinar ao trocar de treinador) vive no `effect`, que exige Firestore, e é validado no QA da Task 10 (itens 6, 7 e 9). Aqui a prova é por grep, a registrar no relatório: `grep -rn "auth.user()?.uid" src/app/painel --include=*.service.ts` deve retornar vazio, e `grep -rn "auth.user()?.uid" src/app/painel --include=*.component.ts` deve listar **somente** `perfil/panel-perfil.component.ts` (Perfil é do próprio usuário) — qualquer outro componente que apareça lendo o uid como `coachUid` entra na task.

- [ ] **Step 4: Verificar** — os dois greps acima conforme esperado; `npx ng test coach --watch=false --browsers=ChromeHeadless` verde; `npx ng build coach --configuration development` limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/coach/src
git commit -m "feat(coach-web): dados do painel seguem o treinador ativo"
```

---

### Task 6: Rotas por área, guard, tela "sem acesso" e shell

**Files:**
- Create: `src/app/painel/access/area.guard.ts`, `src/app/painel/access/no-access.component.ts`, `src/app/app.routes.spec.ts`
- Modify: `src/app/app.routes.ts`, `src/app/painel/ui/panel-shell.component.ts`

**Interfaces:**
- Consumes: `CoachContextService` (`ready`, `contexts`, `can`, `select`, `activeContext`), `PanelArea`, `AccessMode`, `ROLE_LABELS` (Tasks 2 e 4).
- Produces: `areaGuard: CanActivateFn` (lê `route.data['area']: PanelArea` e `route.data['mode']: AccessMode` — padrão `'read'`); rota `sem-acesso`; `export const NAV_ITEMS` do shell (cada item com `area: PanelArea`).

- [ ] **Step 1: O guard**

```ts
import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { CoachContextService } from './coach-context.service';
import type { AccessMode, PanelArea } from './coach-roles.model';

/**
 * Libera a rota se o cargo do painel ativo cobre `data.area` no modo `data.mode` (padrão leitura).
 * Roda depois de `authGuard` e `coachGuard`. Sem nenhum painel → /sem-acesso; sem permissão →
 * volta ao Início (que todo cargo acessa: `atletas` em leitura).
 */
export const areaGuard: CanActivateFn = (route) => {
  const ctx = inject(CoachContextService);
  const router = inject(Router);
  const area = route.data['area'] as PanelArea | undefined;
  const mode = (route.data['mode'] as AccessMode | undefined) ?? 'read';
  return toObservable(ctx.ready).pipe(
    filter((ready) => ready),
    take(1),
    map(() => {
      if (ctx.contexts().length === 0) {
        return router.createUrlTree(['/sem-acesso']);
      }
      if (!area || ctx.can(area, mode)) {
        return true;
      }
      return router.createUrlTree(['/painel']);
    }),
  );
};
```

- [ ] **Step 2: Tela "sem acesso"** (`no-access.component.ts`) — standalone, OnPush, template inline: título "Você ainda não tem um painel", texto "Sua conta não está vinculada a nenhum treinador. Peça um convite à pessoa que lidera a comissão técnica, ou cadastre-se como treinador.", botão `<button class="co-ghost-btn" (click)="signOut()">Sair</button>` que chama `AuthService.signOutUser()` e navega para `/entrar`, e `<a class="co-btn-primary" routerLink="/cadastro">Cadastrar como treinador</a>`. Mesmo visual do `ConviteAtleta` (`.wrap`/`.card`).

- [ ] **Step 3: `app.routes.ts`** — `canActivate: [authGuard, coachGuard]` vira `[authGuard, coachGuard, areaGuard]` em **todas** as rotas `painel*` e cada uma ganha `data`. Mapa completo (rota → `data`):

| Rota | `area` | `mode` |
|---|---|---|
| `painel` | `atletas` | read |
| `painel/equipes` | `atletas` | read |
| `painel/equipes/nova`, `painel/equipes/:id/editar` | `atletas` | write |
| `painel/atletas`, `painel/atletas/comparar` | `atletas` | read |
| `painel/atletas/novo` | `atletas` | write |
| `painel/atletas/plano-evolucao` | `fisico` | read |
| `painel/atletas/plano-evolucao/novo` | `fisico` | write |
| `painel/treinos`, `painel/presenca`, `painel/agenda`, `painel/historico`, `painel/historico/relatorios` | `treinos` | read |
| `painel/treinos/novo`, `painel/treinos/:id/editar` | `treinos` | write |
| `painel/convocacoes` | `convocacoes` | read |
| `painel/convocacoes/nova` | `convocacoes` | write |
| `painel/avaliacoes` | `avaliacoes` | read |
| `painel/avaliacoes/nova` | `avaliacoes` | write |
| `painel/lesoes` | `saude` | read |
| `painel/lesoes/novo` | `saude` | write |
| `painel/torneios`, `painel/torneios/estatisticas` | `atletas` | read |
| `painel/permissoes` | `equipe` | read |
| `painel/financeiro`, `painel/financeiro/planos` | `financeiro` | read |
| `painel/financeiro/planos/novo` | `financeiro` | write |
| `painel/comunicacao` | `comunicacao` | read |
| `painel/perfil`, `painel/biblioteca`, `painel/ia`, `painel/ia/*` (5 rotas) | `principal` | read |

Formato por rota: `data: { area: 'treinos', mode: 'write' }` (omita `mode` para leitura). `convocacao/:coachUid/:callUpId` e `convite-atleta/:id` (lado do atleta) **não** mudam. Adicione a rota `{ path: 'sem-acesso', title: 'Sem acesso — NexaGO Treinador', canActivate: [authGuard], loadComponent: … NoAccessComponent }` antes do `**`. (A Task 8 acrescenta `convite-equipe/:id`.)

- [ ] **Step 4: Spec das rotas (varrer por área — Review Focus 9)** (`app.routes.spec.ts`):

```ts
import { routes } from './app.routes';
import { NAV_ITEMS } from './painel/ui/panel-shell.component';

const painelRoutes = routes.filter((r) => r.path === 'painel' || r.path?.startsWith('painel/'));

describe('rotas do painel', () => {
  it('toda rota painel/* declara data.area e usa o areaGuard', () => {
    expect(painelRoutes.length).toBeGreaterThan(30);
    for (const r of painelRoutes) {
      expect(r.data?.['area']).withContext(`${r.path} sem data.area`).toBeDefined();
      expect((r.canActivate ?? []).length).withContext(`${r.path} sem areaGuard`).toBe(3);
    }
  });

  it('rotas de criação/edição exigem escrita', () => {
    for (const r of painelRoutes.filter((x) => /(^|\/)(nova|novo)$|\/editar$/.test(x.path ?? ''))) {
      expect(r.data?.['mode']).withContext(`${r.path} deveria ser write`).toBe('write');
    }
  });

  it('o menu lateral e as rotas concordam sobre a área de cada tela', () => {
    for (const item of NAV_ITEMS) {
      const route = painelRoutes.find((r) => `/${r.path}` === item.route);
      expect(route).withContext(`item ${item.id} sem rota`).toBeDefined();
      expect(route?.data?.['area']).withContext(`área de ${item.id}`).toBe(item.area);
    }
  });
});
```

- [ ] **Step 5: Shell** (`panel-shell.component.ts`):
  1. `export const NAV_ITEMS` (era `const`), cada item com `area`: `inicio`→`atletas`, `atletas`→`atletas`, `equipes`→`atletas`, `treinos`→`treinos`, `presenca`→`treinos`, `avaliacoes`→`avaliacoes`, `agenda`→`treinos`, `convocacoes`→`convocacoes`, `torneios`→`atletas`, `historico`→`treinos`, `lesoes`→`saude`, `permissoes`→`equipe`, `financeiro`→`financeiro`, `comunicacao`→`comunicacao`, `biblioteca`→`principal`, `ia`→`principal`. Ajuste a interface `PanelNavItem` (`area: PanelArea`).
  2. `protected readonly navItems = computed(() => NAV_ITEMS.filter((i) => this.ctx.can(i.area)))` (injete `CoachContextService` como `ctx`); o template itera `navItems()`.
  3. Rótulo da sidebar: `who-role` mostra `roleLabel()` = `ROLE_LABELS[ctx.role() ?? 'principal']` (era "Treinador(a)" fixo). O nome mostrado continua o do usuário.
  4. Seletor de painel — **só com 2+ contextos** — acima do seletor de equipe:

```html
@if (ctx.contexts().length > 1) {
  <label class="coach-switcher">
    <span class="nav-kicker">Painel</span>
    <select [value]="ctx.activeCoachUid() ?? ''" (change)="switchCoach($any($event.target).value)">
      @for (c of ctx.contexts(); track c.coachUid) {
        <option [value]="c.coachUid" [selected]="c.coachUid === ctx.activeCoachUid()">{{ c.isOwn ? 'Meu painel' : c.coachName }}</option>
      }
    </select>
  </label>
}
```
  (`$any` só no handler do evento; se o lint do projeto proibir, use um método `onCoachChange(event: Event)` que faz `(event.target as HTMLSelectElement).value`.) Estilo igual ao do `.switcher` existente; sem `ngClass`/`ngStyle`.
  5. `switchCoach(uid)`: `this.ctx.select(uid)` e `this.router.navigateByUrl('/painel')` (a rota atual pode não ser permitida ao outro cargo).
  6. Mudança de cargo com o portal aberto (Review Focus 3/8): `constructor` com `effect` que lembra o `activeCoachUid`+`role` iniciais e, quando mudarem sem ação do usuário (vínculo removido/alterado ao vivo), faz `router.navigateByUrl('/painel')`. Como o shell é recriado a cada página, o valor inicial sempre é o atual e não há navegação espúria. Se `ctx.contexts().length === 0` depois de `ready`, navegue para `/sem-acesso`.

- [ ] **Step 6: Verificar** — `npx ng test coach --watch=false --browsers=ChromeHeadless` (incluindo `app.routes.spec.ts`); `npx ng build coach --configuration development`.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/coach/src
git commit -m "feat(coach-web): rotas e menu por área do cargo, tela sem acesso e seletor de painel"
```

---

### Task 7: Gating dos botões de escrita — varrer por ÁREA

**Files (modify):** as telas do painel listadas abaixo. **Regra de ouro (lição `rbac-varrer-por-area-nao-por-lista`):** a lista abaixo é o ponto de partida, **nunca** a autoridade — o inventário é por área e vem da leitura de cada `*.component.ts` inteiro (template **e** classe), inclusive gestos (`(press)`, `(contextmenu)`, `(keydown)`), links `routerLink` e ações escondidas atrás de `toggleEdit`/`confirmingDelete`.

**Interfaces:**
- Consumes: `CoachContextService.can(area, 'write')` (Task 4); rotas já guardadas por modo (Task 6).
- Produces: nenhuma API; o relatório da task traz a **tabela arquivo → elemento (linha) → condição aplicada** e a afirmação "varri todas as telas das áreas X, Y, Z; estes são todos os pontos".

Padrão (exemplo completo, `panel-treinos.component.ts`): injete `protected readonly ctx = inject(CoachContextService)` e envolva cada ponto de escrita:

```html
@if (ctx.can('treinos', 'write')) {
  <a class="co-ghost-btn" [routerLink]="['/painel/treinos', t.id, 'editar']">Editar</a>
}
```
Quando o ponto é um método chamado por gesto sem botão, proteja **no método** também (`if (!this.ctx.can('treinos', 'write')) { return; }`) — a defesa em profundidade evita que um atalho esquecido dispare a escrita (as rules ainda negariam, mas a UI mostraria erro cru).

Pontos conhecidos (comece por eles, depois varra o resto de cada área):

| Área | Arquivo | Pontos de escrita conhecidos |
|---|---|---|
| `atletas` (write) | `atletas/panel-atletas.component.ts` | link "novo" (~l.60), `toggleEdit`/`save` (~l.93, 111, 296-318) |
| `atletas` (write) | `equipes/panel-equipes.component.ts` | link `equipes/nova` (~l.23), "Editar" (~l.56), "Excluir"/`remove` (~l.53, 152) |
| `treinos` (write) | `treinos/panel-treinos.component.ts` | novo (~l.32), Editar (~l.71), Reativar/Cancelar/Excluir (~l.64-78, 144-154) |
| `treinos` (write) | `presenca/panel-presenca.component.ts` | botão Salvar e edição das marcações (`setAttendance`, ~l.54, 187): em leitura, mostrar a presença sem controles |
| `treinos` (write) | `home/panel-inicio.component.ts`, `agenda/panel-agenda.component.ts` | links "novo treino" (~l.45 / ~l.47) |
| `convocacoes` (write) | `convocacoes/panel-convocacoes.component.ts` | link `convocacoes/nova` (~l.18) |
| `avaliacoes` (write) | `avaliacoes/panel-avaliacoes.component.ts` | link `avaliacoes/nova` (~l.31) |
| `saude`/`fisico`/`financeiro` (mock) | `lesoes/panel-lesoes.component.ts`, `evolucao/panel-plano-evolucao.component.ts`, `financeiro/panel-planos.component.ts` | links "novo" (~l.57 / ~l.32 / ~l.40) com a área da tabela de rotas da Task 6 |

- [ ] **Step 1: Montar o inventário** — para cada área acima rode, de `src/app/painel`: `grep -rnE "routerLink=\"[^\"]*(nova|novo|editar)|\\.(createSquad|updateSquad|deleteSquad|createTraining|createTrainings|setAttendance|updateTraining|setTrainingStatus|deleteTraining|createEvaluation|sendCallUp|inviteAthlete|updateAthleteLink)\\(" --include=*.ts .` e leia **cada arquivo que aparecer por inteiro**. Anote a tabela completa no relatório.
- [ ] **Step 2: Aplicar o gating** em cada ponto (template e, quando houver gesto sem botão, também o método).
- [ ] **Step 3: Verificação por área** — para cada uma das 5 áreas com dados reais (`atletas`, `treinos`, `convocacoes`, `avaliacoes` e a presença dentro de `treinos`), liste no relatório as telas lidas e confirme que não sobrou ponto de escrita sem condição. Rode `grep -rn "ctx.can(" src/app/painel` e confira que a contagem bate com a tabela.
- [ ] **Step 4: Verificar** — `npx ng test coach --watch=false --browsers=ChromeHeadless`; `npx ng build coach --configuration development` (template só é checado pelo build).
- [ ] **Step 5: Commit**

```bash
git add frontend/projects/coach/src
git commit -m "feat(coach-web): botões de escrita respeitam o cargo (varredura por área)"
```

---

### Task 8: Tela de convite da comissão + cadastro com redirect

**Files:**
- Create: `src/app/convites/convite-equipe.component.ts`
- Modify: `src/app/app.routes.ts`, `src/app/auth/signup.component.ts`

**Interfaces:**
- Consumes: callable `acceptCoachStaffInvite({ inviteId }) → { coachUid, role }`; doc `coachStaffInvites/{id}` (campos `coachName`, `role`, `emailLower`, `status`, `expiresAt`); `AuthService.refreshClaims()`; `ROLE_LABELS`, `isCoachStaffRole` (Task 2).
- Produces: rota `/convite-equipe/:id` (apenas `authGuard`); o signup respeita `?redirect=`.

- [ ] **Step 1: Estado puro do convite — spec primeiro** (`src/app/convites/convite-equipe.state.spec.ts` + `convite-equipe.state.ts`):

```ts
export type InviteViewState = 'ready' | 'not-pending' | 'expired' | 'wrong-account';

export function inviteViewState(
  invite: { status?: unknown; emailLower?: unknown; expiresAtMs?: number | null },
  myEmail: string | null,
  nowMs: number,
): InviteViewState {
  if (invite.status !== 'pending') return 'not-pending';
  if (invite.expiresAtMs != null && invite.expiresAtMs <= nowMs) return 'expired';
  const mine = (myEmail ?? '').trim().toLowerCase();
  if (mine === '' || invite.emailLower !== mine) return 'wrong-account';
  return 'ready';
}
```
Spec: `status !== 'pending'` → `not-pending` (mesmo vencido, status manda); pendente vencido → `expired`; e-mail diferente / sem e-mail / maiúsculas → `wrong-account` / `ready` (case-insensitive no e-mail da conta); pendente válido → `ready`. (Mesma ordem do backend `inviteClaimState`: status, depois prazo, depois e-mail.)

- [ ] **Step 2: Componente** — modelo do `ConviteAtletaComponent` (mesmo `.wrap`/`.card`, mesmo padrão `@switch (state())`), estados `loading | not-found | ready | not-pending | expired | wrong-account | accepted`:
  - `ngOnInit`: lê `coachStaffInvites/{id}` (`getDoc`); inexistente ou permission-denied → `not-found`; calcula `inviteViewState(...)` com `expiresAt.toMillis()` e o e-mail de `auth.user()`.
  - `ready`: "**{coachName}** convidou você para a comissão técnica como **{ROLE_LABELS[role]}**." + `ROLE_SUMMARIES[role]`, botões "Aceitar convite" (`co-btn-primary`) e "Agora não" (`co-ghost-btn`, `routerLink="/"`).
  - `wrong-account`: "Este convite foi enviado para outro e-mail. Você está conectado como {email}." + botão "Sair e trocar de conta" que faz `signOutUser()` e navega para `/entrar?redirect=<url atual>`.
  - `accept()`: chama a callable, depois **`await this.auth.refreshClaims()`** (a claim `coach` acabou de ser concedida; sem isso o `coachGuard` barra), depois `CoachContextService.select(coachUid)` e `router.navigateByUrl('/painel')`. Erro → `co-alert` com a mensagem do servidor (`FirebaseError.message`).
  - `accepted` nunca aparece por tempo: navega direto.
- [ ] **Step 3: Rota** — em `app.routes.ts`:

```ts
  {
    path: 'convite-equipe/:id',
    title: 'Convite da comissão — NexaGO Treinador',
    canActivate: [authGuard],
    loadComponent: () => import('./convites/convite-equipe.component').then((m) => m.ConviteEquipeComponent),
  },
```
- [ ] **Step 4: Signup com `?redirect=`** — `signup.component.ts` não honra `redirect` (o login honra: `login.component.ts:178-181`). Copie a validação (`redirect.startsWith('/') && !redirect.startsWith('//')`) e use-a no destino pós-cadastro no lugar de `'/painel'`; o link "Já tenho conta" do signup e o "Cadastrar" do login repassam o `redirect` recebido. Convidado sem conta: o link do convite → `authGuard` manda para `/entrar?redirect=/convite-equipe/ID` → "Cadastrar" → volta ao convite.
- [ ] **Step 5: Verificar** — `npx ng test coach --watch=false --browsers=ChromeHeadless` (o spec de estado + os anteriores); `npx ng build coach --configuration development`.
- [ ] **Step 6: Commit**

```bash
git add frontend/projects/coach/src
git commit -m "feat(coach-web): tela de convite da comissão e cadastro com redirect"
```

---

### Task 9: Permissões real + "sair da comissão"

**Files:**
- Create: `src/app/painel/access/coach-staff.service.ts`
- Modify (reescreve): `src/app/painel/permissoes/panel-permissoes.component.ts`
- Modify: `src/app/painel/ui/panel-shell.component.ts` (botão "Sair desta comissão")

**Interfaces:**
- Consumes: callables `createCoachStaffInvite({ email, role }) → { inviteId }`, `changeCoachStaffRole({ staffUserId, role })`, `removeCoachStaff({ staffUserId })`, `revokeCoachStaffInvite({ inviteId })`, `leaveCoachStaff({ coachUid })` (fase 1); queries já provadas na Task 1.
- Produces: `CoachStaffService` com `watchMembers(coachUid, cb)`, `watchInvites(coachUid, cb)` (devolvem `Unsubscribe`), `invite(email, role)`, `changeRole(staffUserId, role)`, `remove(staffUserId)`, `revokeInvite(inviteId)`, `leave(coachUid)`; tipos `StaffMember { uid; displayName; email; role: CoachStaffRole }`, `StaffInvite { id; emailLower; role: CoachStaffRole; expiresAtMs: number | null }`.

- [ ] **Step 1: Serviço** — padrão do `ArenaStaffService` (`frontend/projects/arena/src/app/painel/data/arena-staff.service.ts`):
  - `watchMembers`: `onSnapshot(collection(fs,'coaches',coachUid,'staff'), …)` mapeando cada doc (descarte os de cargo inválido via `isCoachStaffRole`); erro → `onChange([])`.
  - `watchInvites`: `onSnapshot(query(collection(fs,'coachStaffInvites'), where('coachUid','==',coachUid), where('status','==','pending')), …)`; mapeie `expiresAt?.toMillis?.() ?? null` e **filtre os vencidos no cliente** (o servidor não os encerra).
  - As escritas são `httpsCallable(getFunctions(app, FUNCTIONS_REGION), '<nome>')`; erros sobem (a tela mostra a mensagem).
  - Função pura exportada `inviteLink(origin: string, inviteId: string): string` → `` `${origin}/convite-equipe/${inviteId}` `` — com spec (`origin` com barra final não duplica barra).

- [ ] **Step 2: Tela** — substitui o mock (mantém `co-panel-shell`, `co-page-header title="Permissões" subtitle="Comissão técnica"`, `co-panel-card`, `co-row`, `co-athlete-avatar`, `co-pill`); só o contexto de dono chega aqui (a rota é área `equipe`, só do principal):
  1. **Comissão** (`co-panel-card title="Comissão técnica"`): uma `co-row` por membro (`initialsOf(displayName)`, nome, e-mail em `sub`), `<select>` do cargo (opções = `COACH_STAFF_ROLES` com `ROLE_LABELS`) que chama `changeRole` ao mudar, e botão "Remover" com confirmação em dois passos (padrão `confirmingDeleteId` de `panel-treinos`), sem `confirm()` nativo. Estado vazio: "Você ainda não convidou ninguém."
  2. **Convidar** (`co-panel-card title="Convidar para a comissão"`): formulário reativo `{ email: required+email, role: required }` (`co-form-field` + `co-form-select`). Sucesso → mostra o link gerado (`inviteLink(location.origin, inviteId)`) com botão "Copiar link" (`navigator.clipboard.writeText`, com fallback silencioso) e o aviso "O convite vale por 7 dias e só funciona para este e-mail." Erros do servidor (`already-exists`, `invalid-argument`) viram `co-alert`.
  3. **Convites pendentes**: lista com e-mail, cargo, validade; botões "Copiar link" e "Revogar" (`revokeInvite`).
  4. **O que cada cargo enxerga** — os 5 cartões de referência passam a vir de `ROLE_LABELS`/`ROLE_SUMMARIES` do model (some a lista fixa do mock). Mantém o grid atual.
  5. `watchMembers`/`watchInvites` num `effect` keyed em `ctx.activeCoachUid()` com `onCleanup` (mesmo padrão dos serviços de dados).
- [ ] **Step 3: "Sair desta comissão"** — no shell, quando `ctx.activeContext()?.isOwn === false`, um botão discreto na `user-row`: primeiro clique mostra "Confirmar saída" / "Cancelar" (signal `confirmingLeave`); confirmar chama `CoachStaffService.leave(coachUid)` e navega para `/painel` — o espelho some em ~1 s e o contexto cai para outro painel (ou `/sem-acesso`).
- [ ] **Step 4: Verificar** — specs verdes (inclui `inviteLink`), `npx ng build coach --configuration development`.
- [ ] **Step 5: Commit**

```bash
git add frontend/projects/coach/src
git commit -m "feat(coach-web): tela Permissões real (convidar, trocar cargo, remover) e sair da comissão"
```

---

### Task 10: Verificação — specs, build de produção e QA no navegador

**Files:** nenhum arquivo de produção (apenas correções que o QA exigir, como commits à parte).

- [ ] **Step 1: Specs e builds** — `npx ng test coach --watch=false --browsers=ChromeHeadless` (todos verdes), `npx ng build coach --configuration development` e `npx ng build coach --configuration production` (limpos), e da pasta `functions/`: `npm run build && node --test test/coach-roles-parity.test.mjs` (7 testes) e `npm run test:rules` (todos verdes).
- [ ] **Step 2: Subir o portal contra o dev** — `npx ng serve coach` (via `preview_start`, config em `.claude/launch.json` se ainda não existir) apontando para `volley-track-dev-4596c` (é o `environment` padrão do coach; **nunca** produção).
- [ ] **Step 3: QA no navegador (browser pane)** com contas **descartáveis** criadas pelo próprio cadastro do portal (`coach-qa-<ts>-dono@example.test`, etc.; é app local em `localhost`, vale a exceção de "testar o próprio app"; apague as contas e os docs `coaches/*` criados ao final, como no e2e da fase 1). Roteiro, anotando o resultado de cada item:
  1. Dono cadastrado: sidebar completa, rótulo "Treinador principal", **sem** seletor de painel (um contexto só), Início e telas como antes (regressão zero).
  2. Dono convida `fisio` pela tela Permissões → link do convite aparece; convite pendente listado.
  3. Abrir o link **sem login** → vai a `/entrar?redirect=…` → "Cadastrar" → conta nova (fisioterapeuta) → volta ao convite → "Aceitar" → entra em `/painel` já como fisioterapeuta, **sem** painel próprio vazio.
  4. Fisioterapeuta: menu mostra só Início, Atletas, Equipes, Treinos, Presença, Agenda, Torneios, Histórico, Lesões; **não** mostra Avaliações, Convocações, Permissões, Financeiro, Comunicação, Biblioteca, IA. Rótulo "Fisioterapeuta". Botões de escrita de Treinos/Atletas/Equipes **ausentes**.
  5. Deep links: `/painel/avaliacoes`, `/painel/permissoes`, `/painel/treinos/novo`, `/painel/atletas/novo`, `/painel/equipes/nova` → voltam a `/painel` (nenhuma tela em branco, nenhum erro de permissão).
  6. Dono troca o cargo de `fisio` para `psicologo` **com o portal do fisio aberto** → o menu do fisio encolhe e a tela volta ao Início sem recarregar.
  7. Dono remove o membro com o portal dele aberto → cai em `/sem-acesso` (conta sem painel).
  8. Auxiliar: pode criar/editar treino e salvar presença; pode enviar convocação; **não** vê "Convidar atleta", "Nova avaliação", "Nova equipe", "Excluir equipe".
  9. Usuário que é dono **e** membro: seletor aparece, trocar painel zera listas e equipe ativa (nada do outro treinador por um instante), "Permissões" só no painel de dono.
  10. Convite com outra conta logada → "enviado para outro e-mail" + "Sair e trocar de conta"; convite já aceito → "já foi usado".
- [ ] **Step 4: Corrigir o que o QA achar** (cada correção = commit próprio com teste quando for lógica pura).
- [ ] **Step 5: Limpar** as contas/documentos de teste e o symlink `node_modules` se tiver entrado no `git status`.

---

## O que a fase 2 NÃO faz (fica para a fase 3 em diante)

- Áreas com dados novos (`saude`, `fisico`, `mental`, `comunicacao`, `financeiro`): as telas continuam mock e o gating delas só protege rota/menu. Quando ganharem coleções, cada uma nasce com rules por área e o gating de botões por área.
- Notificação ao convidado (o treinador compartilha o link); transferência de titularidade; verificação de e-mail do convite (reavaliar antes de `saude`/`mental`, junto do LGPD).
- O atleta enxergar a comissão (P4: continua só vendo o treinador).

## Self-review

- **Cobertura do spec (seção 6 + fase 2 da 8):** `CoachContextService` + seletor (T4, T6); serviços usando o treinador ativo (T5); gating de rota/menu/botões por área (T6, T7); teste de paridade com o model do portal (T2, T3); tela Permissões real (T9); rota de convite (T8); consequências já decididas — P3 seletor na v1 (T4/T6), perfil só do dono (T5 nota + T6 `principal`).
- **Placeholders:** nenhum. T7 não lista cada linha de cada botão de propósito: pede a varredura por área (lição das memórias) e dá o padrão, os pontos conhecidos com arquivo/linha e o artefato de prova (tabela no relatório + grep de contagem); a rede de segurança por URL está na T6 (guard de modo `write`).
- **Consistência de tipos:** `PanelArea`/`AccessMode`/`CoachRole` (T2) → `roleCanAccess`, `CoachContextService.can` (T4), `areaGuard` e `NAV_ITEMS.area` (T6); `CoachContext`/`CoachMembership` (T4) → T6/T8/T9; `inviteViewState` (T8) segue a ordem de `inviteClaimState` do backend; nomes das callables e payloads batem com `functions/src/coach-staff-ops.ts` da fase 1 (`createCoachStaffInvite`, `acceptCoachStaffInvite`, `revokeCoachStaffInvite`, `changeCoachStaffRole`, `removeCoachStaff`, `leaveCoachStaff`) e `coachUid` opcional nas 5 callables antigas.
- **Review Focus → tarefa:** 1 (T4 spec), 2 (T5 reset de estado + QA 9), 3 (T4 spec + T6 effect + QA 6-7), 4 (T6 guard + QA 5), 5 (T6 `mode: write` + spec de rotas), 6 (T8 + QA 3, 10), 7 (T1), 8 (T4 spec + QA 9), 9 (T6 spec de rotas).
