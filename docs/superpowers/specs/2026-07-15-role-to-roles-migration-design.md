# Migração `role` → `roles[]` no documento do usuário

**Data:** 2026-07-15
**Status:** Aprovado (design revisado com o dono do projeto)

## Objetivo

Eliminar completamente o campo legado `role` (string) dos documentos de usuário,
dos custom claims e de todos os fallbacks de leitura. `roles[]` (array) passa a
ser a única fonte de verdade de papéis. Todo atleta que se cadastra no app
recebe `roles: ['athlete']` já na criação da conta. A troca de papel no app
(que já existe) permanece como está, dependendo exclusivamente de `roles[]`.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Escopo | Remoção completa: docs, claims e todos os fallbacks (rules, app, web, functions) |
| Troca de papel | Manter UX atual (seleção pós-login + troca); só garantir que dependa de `roles[]` |
| `roles` no cadastro | App cria `users/{uid}` com `roles: ['athlete']` logo no cadastro (email e 1º login social) |
| Compatibilidade | Rules **bloqueiam imediatamente** escritas contendo `role`; app antigo quebra o save de perfil até atualizar (aceito) |

## Estado atual (mapeado em 15/07)

- **Claims**: `functions/src/auth-roles.ts` escreve `roles[]` E o legado `role`
  (em `applyRolesToClaims` e `firestoreRolesPayload`).
- **App mobile**: infra multi-role completa (`role_selection_page.dart`,
  `active_role_providers.dart`, `userNeedsRoleSelection`) lendo claims `roles[]`
  com fallback legado. Papéis mobile: athlete, arena, organizer (coach fica fora).
- **Cadastro**: só cria a conta no Auth; o doc `users/{uid}` nasce no primeiro
  save do perfil (`athlete_profile_repository.dart`), que escreve `role` + `roles`.
- **Convite de parceiro**: `users_repository.dart:399` cria doc só com `role`.
- **Leitores com fallback**: `firestore.rules` (helper `hasAppRole`, leituras de
  `public_profiles`, create/update de `users`), queries duplicadas em
  `users_repository.dart`, `user_roles.dart`, webs athlete/arena,
  `search-keywords.ts`, `public-profile-sync.ts`.
- **Backfills existentes**: `functions/scripts/backfill-athlete-roles.js` e a
  callable `migrateUsersToMultiRole` populam `roles[]` mas ainda ESCREVEM o
  legado — não servem como estão.
- Contas pré-2026-07-06 podem não ter nem `role` nem `roles` (rules tratam
  ausência como athlete).

## Fases (ordem de deploy: dev primeiro, prod depois)

Ordem obrigatória: **functions → backfill → release do app → rules**.
Rules por último porque `set(merge)` inclui campos existentes do doc em
`request.resource.data` — o bloqueio de `role` só é seguro com os docs limpos.

### Fase 1 — Functions e claims

- `auth-roles.ts`:
  - `applyRolesToClaims`: para de escrever `role`; **deleta** a chave sempre
    (mantém lógica existente do `superAdmin`).
  - `firestoreRolesPayload`: grava `roles[]` + `role: FieldValue.delete()` —
    toda escrita futura de papéis purga o legado (callers usam `set(..., {merge: true})`).
- `search-keywords.ts`: `userDocHasRole` perde o branch legado; `"role"` sai da
  lista de campos que geram keywords.
- `public-profile-sync.ts`: `"role"` sai da lista de campos espelhados.
- `user-role-ops.ts`: `setUserRole`/`addUserRole`/`removeUserRole`/`setUserRoles`
  ficam como estão (herdam a limpeza via `auth-roles.ts`). A callable
  `migrateUsersToMultiRole` é removida (substituída pelo script da Fase 2).
- Auditar e limpar legado em: `arena-signup.ts`, `coach-signup.ts`,
  `admin-ops.ts`, `user-account-ops.ts`, `user-profile-link.ts`.

### Fase 2 — Backfill (script Admin SDK)

Novo `functions/scripts/backfill-remove-legacy-role.js` (padrão dos backfills
existentes: `--project`, dry-run por padrão, `--yes`, `--limit`). Dois passes:

**Passe A — usuários do Auth** (`listUsers`):
1. Papéis efetivos: união de (`claims.roles` ou `[claims.role]`) com
   (doc `roles` ou `[role]`); vazio vira `['athlete']` (mesmo default das
   rules). *(ajustado 15/07 na review final: união em vez de claims-first,
   evita rebaixamento silencioso)*
2. **Claims**: regrava com `roles[]` sem a chave `role`.
3. **Doc `users/{uid}`** (se existir): `roles[]`, `role: FieldValue.delete()`,
   recalcula `hasAthleteRole`/`hasOrganizerRole`.

**Passe B — varredura da coleção `users/`** (cobre docs sem conta no Auth,
como os docs "sombra" criados pelo convite de parceiro com uid gerado):
qualquer doc que ainda tenha `role` ou esteja sem `roles[]` recebe o mesmo
tratamento do passo 3 (sem mexer em claims, que não existem).

**Passe C — `public_profiles/`**: deleta `role` diretamente em todos os docs
que ainda o tenham (além do re-espelho do trigger).

Roda DEPOIS do deploy da Fase 1, senão o sync re-espelha `role` de volta.

### Fase 3 — App Flutter

**Cadastro cria o doc:**
- Hook em `post_login_bootstrap.dart` (caminho único para email e social):
  se `users/{uid}` não existe, cria com `email`, `fullName` (se disponível do
  provider), `roles: ['athlete']`, `hasAthleteRole: true`, `createdAt`.

**Escritores:**
- `athlete_profile_repository.dart:78`: remove `data['role'] = 'athlete'`
  (mantém a união em `roles`).
- `users_repository.dart:399` (convite de parceiro): `'roles': ['athlete']` +
  `hasAthleteRole` no lugar de `'role': role`.

**Leitores:**
- `user_roles.dart`: `appRolesFromIdToken` sem fallback do claim `role`;
  `userDocHasRole` sem parâmetro `legacyRole`.
- `users_repository.dart`: `mergeAthleteRoleQueries` colapsa para só
  `roles array-contains` (+ `hasAthleteRole` onde já usado); filtro genérico
  `where('role', isEqualTo: ...)` vira `where('roles', arrayContains: ...)`.
- `app_user_profile.dart`: campo `role` sai do modelo.
- `core/search/search_keywords.dart`: mesma limpeza da versão TS.

**Troca de papel:** sem mudanças (já depende só do claim `roles[]`).

**Índices:** validar em `firestore.indexes.json` os compostos
`roles (array-contains) + nickname/fullName/email` em `users` e
`public_profiles` (as queries por `roles` já rodam hoje; provavelmente existem).

### Fase 4 — Firestore rules (deploy por último)

- Helper `hasAppRole` (linhas ~5–9): remove o OR com `request.auth.token.role`.
- Leituras de `public_profiles` (~250–261): só `roles`.
- Create de `users/{uid}` (self-create, ~1115): **exige** `roles` com
  `hasOnly(['athlete'])` e **rejeita** doc contendo `role`.
- Create via convite de parceiro (~275–303): idem.
- Update de `users/{uid}` (~1132): rejeita `'role' in request.resource.data`;
  imutabilidade de `roles` para não-admin permanece.
- **Não tocar**: `role` de staff de torneio (`tournaments/{t}/staff`, linhas
  86/1476) e de membro de equipe de arena — conceitos diferentes, mesmo nome.

### Fase 5 — Frontends web

- `athlete/auth.service.ts`: gate "é atleta?" sem fallback de `role`; `roles[]`
  ausente → trata como atleta (default p/ docs órfãos), sem ler `role`.
- `arena/auth.service.ts`: gate de gestor só por `roles[]` (claim e/ou doc).
- `backoffice/invite.component.ts`: auditar; se cria/edita com `role`, migrar
  para as callables (`setUserRoles`/`addUserRole`).
- `coach/panel-permissoes.component.ts`: auditar leitura de papéis.
- `arena/panel-team.component.ts`: `role` de membro de equipe é outro conceito —
  não tocar, só confirmar na auditoria.

## Testes e verificação

- **Functions**: atualizar testes de `auth-roles`/`user-role-ops` que esperam o
  legado; caso novo: "claims não contém a chave `role`".
- **Flutter**: atualizar testes de `user_roles.dart`; acionar o agente
  `flutter-test-engineer` para o novo fluxo de criação de doc no cadastro.
- **Rules** (se houver harness de testes): create sem `roles` → nega; create
  com `role` → nega; create `roles:['athlete']` → permite; update contendo
  `role` → nega.
- **QA manual (dev)**: cadastro email → doc nasce com `roles:['athlete']`;
  1º login Google sem doc → idem; multi-role → tela de seleção + troca ok;
  busca de atletas e convite de parceiro ok; save de perfil não regrava `role`.
- **Pós-backfill (dev)**: auditoria com zero docs contendo `role` em `users` e
  `public_profiles`; amostra de claims sem a chave `role`.

## Riscos e mitigação

- **App antigo na loja escreve `role` no save de perfil** → quebra quando as
  rules da Fase 4 entrarem (decisão aceita). Mitigação: rules só sobem depois
  do app novo publicado; janela mínima.
- **Ordem errada de deploy** → sync re-espelha `role` ou rules rejeitam docs
  sujos. Mitigação: ordem fixa functions → backfill → app → rules, documentada
  aqui e no plano.
- **Token com claims defasadas** (até ~1h ou re-login) → app lê `roles[]` que o
  backfill já garantiu em todas as claims; sem janela sem `roles[]`.
