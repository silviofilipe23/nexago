# Calibração de Nível (Plano 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer cada atleta chegar a um nível declarado honesto: escolha obrigatória de nível, janela de correção livre até a primeira inscrição, confirmação do nível na primeira inscrição do esporte, e promoção pelo organizador — implementando o §4.5 do spec sobre a escada de 7 já mergeada.

**Architecture:** Um flag por esporte (`users/{uid}.sportOnboarding.levelLocked.{SPORT}`) materializa o fechamento da janela; SÓ o backend o escreve (trigger na coleção de inscrições). As rules passam a permitir DESCER o nível enquanto o flag não existe. A escolha obrigatória e a confirmação são UI (app + portal); a promoção pelo organizador é um ramo novo de autorização no callable `setAthleteLevel` existente.

**Tech Stack:** Cloud Functions (TS, node --test + trigger v2), Firestore rules (+ rules-unit-testing), Angular 20 (portais atleta/organizador), Flutter.

**Spec:** `docs/superpowers/specs/2026-08-15-nivelamento-escada-7-degraus-design.md` §4.5 (a–d). Decisões vinculantes: D1 (nunca jogar abaixo), D3 (só promoção, nunca rebaixamento automático), D6 (calibração neste escopo).

## Global Constraints

- **Janela de correção**: fecha na PRIMEIRA inscrição ATIVA (criação, status ≠ cancelada) do atleta naquele esporte — deliberadamente mais cedo que o texto do spec ("confirmada"), porque a elegibilidade é validada na criação; inscrição pendente já usou o nível declarado. Cancelamento NÃO reabre a janela. (Ruling registrado no plano; o spec deve ser lido com esta correção.)
- `sportOnboarding.levelLocked.{SPORT_CODE}: true` — escrito EXCLUSIVAMENTE pelo backend; as rules negam qualquer mudança desse mapa em update de owner.
- Enquanto `levelLocked[sport] != true`: atleta pode subir E descer o nível daquele esporte (UI, lógica e rules). Depois: ratchet integral atual. Campos legados globais (`level`, `sportProfile.level`) continuam ratcheted sempre.
- Promoção pelo organizador: SÓ para cima; só atleta com inscrição ativa em torneio do próprio organizador; auditada em `levelHistory` com `reason: "organizer_promotion"`, `tournamentId` e actor.
- Escolha obrigatória: nenhum default pré-selecionado de nível ao adicionar esporte/onboarding (app e portal); avançar exige escolha explícita.
- Copys (PT, exatas):
  - Janela: `Até a sua primeira inscrição neste esporte você pode ajustar o nível livremente — depois ele só sobe.`
  - Confirmação (título/corpo/botões): `Confirme seu nível` / `Você vai se inscrever como {nível} em {esporte}. Após a inscrição, o nível só poderá subir.` / `Ajustar nível` · `Confirmar e continuar`
  - Promoção (confirm): `Promover {atleta} para {nível}? O nível de um atleta nunca desce.`
- PT nas strings, inglês no código; specs de componente Angular novos exigem `provideZonelessChangeDetection()`; rodar `ng`/`flutter` SEMPRE de dentro do worktree; LER o arquivo inteiro antes de editar (âncoras de linha são do commit `e8dfa658`).
- Fixture das rules NÃO pode ter campo legado `role`.

---

### Task 1: Trigger de lock + correção pré-lock no rating

**Files:**
- Create: `functions/src/tournament-level-lock.ts`
- Modify: `functions/src/index.ts` (export do trigger), `functions/src/rating-triggers.ts` (descida pré-lock)
- Test: `functions/src/tournament-level-lock.test.ts` (novo), `functions/src/rating-ladder.test.ts` ou arquivo próprio p/ o helper

**Interfaces:**
- Consumes: `artifactsInscriptionsPath` (`firebase-paths.ts:23`), `tournamentSportToLevelSportCode` (category-level-eligibility), padrão de trigger de `tournament-collected-stats.ts:196-198` (`onDocumentWritten("artifacts/{appId}/public/data/inscriptions/{registrationId}")`).
- Produces: helper puro `inscriptionBecameActive(before, after): boolean` (após ativo e antes ausente/cancelado); helper `inscriptionAthleteUids(data): string[]`; trigger `onInscriptionWrittenLockLevels` que grava `sportOnboarding.levelLocked.{SPORT}: true` (merge) p/ cada uid ainda sem lock. Tudo idempotente (regravar true é inofensivo).

- [ ] **Step 1: Descobrir o shape real do doc de inscrição** — ler `functions/src/organizer-create-registration.ts` e o fluxo PIX (`tournament-registration-pix.ts`) para extrair: campo(s) de status e vocabulário exato (viu-se `"pending"`/`"cancelled"`), campos de uid do atleta e do parceiro (ou teamId → `loadTeamAthleteIds` de `league-ranking.ts`), campo `tournamentId`. Documentar no report; os helpers usam ESSES campos.
- [ ] **Step 2: Testes dos helpers (falham)** — `inscriptionBecameActive`: criado ativo → true; update pendente→pago → false (já era ativa); criado cancelado → false; cancelada→ativa → true. `inscriptionAthleteUids`: solo, dupla, ids vazios filtrados.
- [ ] **Step 3: Rodar e ver falhar** — `cd functions && npm run build && node --test lib/tournament-level-lock.test.js`.
- [ ] **Step 4: Implementar helpers + trigger.** No corpo do trigger: resolver o torneio (`tournaments/{tournamentId}`) → `sportCode` via `tournamentSportToLevelSportCode`; sem código (esporte sem equivalente) → não trava nada; para cada uid, `set({sportOnboarding: {levelLocked: {[sportCode]: true}}}, {merge:true})` somente se ainda não true (ler doc; economizar writes). Registrar o trigger em `index.ts`.
- [ ] **Step 5: Descida pré-lock no rating** — em `rating-triggers.ts` (`onUserWrittenTrackLevelChanges`, hoje só trata subida ~:133-176): quando `afterRank < beforeRank` (descida — só possível na janela), gravar `levelHistory` com `reason: "self_correction"` e, se `athleteRatings` do esporte existir com `ratedMatches === 0`, re-seedar rating/RD/levelRank para o initial do novo degrau; com `ratedMatches > 0`, só o levelHistory. Testes das duas variantes.
- [ ] **Step 6: Suite + commit** — `npm test` verde; commit `feat(levels): janela de calibração — lock na 1ª inscrição ativa + correção pré-lock`.

---

### Task 2: Janela de correção nas rules

**Files:**
- Modify: `firestore.rules` (`athleteLevelsNotDowngraded` ~:353 e vizinhança)
- Test: `functions/test/athlete-level-rules.test.mjs`

**Interfaces:**
- Consumes: flag `sportOnboarding.levelLocked` (Task 1).
- Produces: owner pode DESCER `levelsBySport[sport]` quando `resource.data` não tem `levelLocked[sport] == true`; owner NUNCA altera `sportOnboarding.levelLocked` (novo predicado `levelLockedUnchanged()` exigido no update de owner); super admin bypassa como hoje.

- [ ] **Step 1: Testes (falham)** — (a) descer VOLEI_PRAIA sem flag → permitido; (b) descer com `levelLocked.VOLEI_PRAIA: true` → negado; (c) subir com flag → permitido; (d) owner tentando escrever `sportOnboarding.levelLocked.VOLEI_PRAIA: true` → negado; (e) owner regravando levelLocked idêntico (update noutro campo) → permitido; (f) legado global `level` descer → negado mesmo sem flag. Semear via `withSecurityRulesDisabled`.
- [ ] **Step 2: RED** — `firebase emulators:exec --only firestore "node functions/test/athlete-level-rules.test.mjs"`.
- [ ] **Step 3: Implementar** — `sportLevelNotLowered(req, cur, sportId)` vira `levelLocked(sportId) ? levelNotLowered(...) : true` (com `levelLockedOf(data)` lendo `sportOnboarding.levelLocked` de `resource.data`); manter curto-circuito de mapa inalterado (limite de expressões!); adicionar `levelLockedUnchanged()` (`request.resource.data.sportOnboarding.levelLocked == resource.data...` com defaults `{}`) ao branch de update do owner em `users/{userId}` (~:1491). Comentário do bloco atualizado.
- [ ] **Step 4: GREEN + commit** — `feat(rules): nível pode descer até o lock da 1ª inscrição; levelLocked é só do backend`.

---

### Task 3: Promoção pelo organizador no `setAthleteLevel`

**Files:**
- Modify: `functions/src/athlete-level-admin.ts` (`planLevelChange` :84, guard admin :184, `setAthleteLevel` :272, reason :361)
- Test: `functions/src/athlete-level-admin.test.ts`

**Interfaces:**
- Consumes: docs `tournaments/{id}` (campo do dono — conferir nome real: `organizerId`/`createdBy` — ler o doc-shape em organizer-create-registration/tournament docs) e inscrições ativas do torneio (mesmos campos da Task 1).
- Produces: `setAthleteLevel` aceita `{uid, sportCode, level, tournamentId?}`; sem claim admin, o caminho organizador exige: `tournamentId` presente; caller é dono do torneio; atleta tem inscrição ATIVA nesse torneio; `novo rank > rank atual` (nunca igual/abaixo — mensagem `Organizador só pode promover — o nível de um atleta nunca desce.`); grava com `reason: "organizer_promotion"`, `tournamentId` e `actor: "organizer:{callerUid}"` no `levelHistory`. Caminho admin permanece byte-idêntico.

- [ ] **Step 1: Testes (falham)** — organizador promove atleta inscrito → aplica e audita; tenta rebaixar/igual → `failed-precondition`; atleta sem inscrição no torneio → `permission-denied`; caller não-dono → `permission-denied`; sem `tournamentId` e sem admin → `permission-denied`; admin sem `tournamentId` → funciona como hoje.
- [ ] **Step 2: RED** — `node --test lib/athlete-level-admin.test.js`.
- [ ] **Step 3: Implementar** — extrair a autorização atual para `assertAdminOrPromotingOrganizer(...)`; reuso do `planLevelChange` (que já realinha rating/histórico); direção validada ANTES de aplicar. Não notificar o atleta neste ciclo (spec não pede; anotar no report).
- [ ] **Step 4: GREEN + suite + commit** — `feat(levels): organizador promove atleta do próprio torneio (só sobe)`.

---

### Task 4: App — escolha obrigatória + janela na UI

**Files:**
- Modify: `nexago_app/lib/features/athlete/onboarding/presentation/...level_step.dart` (achar o step de nível; sem default, avanço bloqueado sem escolha), `athlete_sports_levels_draft.dart` (`defaultLevel` some do fluxo de adicionar esporte — adicionar exige escolher nível num sheet), `athlete_sports_levels_providers.dart` (`updateLevel` :151-162 — permitir descer quando não locked; estado ganha `levelLocked` do doc), `athlete_sports_levels_page.dart`/`athlete_sport_level_card.dart` (chips abaixo do salvo destravados pré-lock + copy da janela)
- Test: `nexago_app/test/features/athlete/` (upgrade_only + sports_levels)

**Interfaces:**
- Consumes: `sportOnboarding.levelLocked` no doc do usuário (Tasks 1–2).
- Produces: pré-lock, o atleta ajusta livremente com o aviso da janela; pós-lock, exatamente a UI atual (cadeado + confirmação de subida). Esporte novo não entra mais como `iniciante_1` silencioso em NENHUM fluxo do app.

- [ ] **Step 1: Testes (falham)** — notifier: descer pré-lock aplica; descer pós-lock rejeita (comportamento atual); adicionar esporte sem nível escolhido não salva. Ajustar os testes existentes de `athlete_level_upgrade_only_test.dart` que assumem rejeição incondicional de descida: passam a semear `levelLocked` true.
- [ ] **Step 2: RED → implementar → GREEN** — `flutter test test/features/athlete/`.
- [ ] **Step 3: Commit** — `feat(app): escolha obrigatória de nível e janela de correção pré-inscrição`.

---

### Task 5: Portal do atleta — escolha obrigatória + janela

**Files:**
- Modify: `frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.ts` (:82 `selectedLevelCode = signal<string>(DEFAULT_LEVEL)` → `''`; validação bloqueia avançar sem escolha; template marca estado vazio), `frontend/projects/athlete/src/app/profile/athlete-sports-levels.component.ts` (adicionar esporte exige escolha explícita — sem `DEFAULT_LEVEL_CODE`; permitir descer quando `levelLocked[sport] != true`, com a copy da janela; pós-lock UI atual)
- Test: specs dos dois componentes (zoneless TestBed)

**Interfaces:** mesmos flags; `MyAthleteProfile`/repositório expõe `levelLocked` (parse do doc — adicionar ao tipo se ausente).

- [ ] **Step 1: Specs (falham)** — onboarding: avançar sem nível bloqueado; perfil: descida pré-lock emite save, pós-lock bloqueada; add-sport sem escolha não grava.
- [ ] **Step 2: RED → implementar → GREEN** — `npx ng test athlete --watch=false`.
- [ ] **Step 3: Commit** — `feat(athlete-web): escolha obrigatória de nível e janela de correção`.

---

### Task 6: App — confirmação na 1ª inscrição do esporte

**Files:**
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_registration_page.dart` (antes de submeter a PRIMEIRA inscrição no esporte — `levelLocked[sportDoTorneio] != true` — sheet de confirmação com as copys globais; `Ajustar nível` navega p/ Esportes e níveis; `Confirmar e continuar` prossegue)
- Test: teste de lógica (função pura `needsLevelConfirmation(profile, tournamentSport)`) + teste de widget do sheet se o padrão do arquivo permitir

**Interfaces:** `needsLevelConfirmation` exportada de `category_level_eligibility.dart` ou arquivo vizinho; consome o mapa `levelLocked` do perfil.

- [ ] Steps: teste RED da função pura → implementar → sheet → `flutter test test/features/tournaments/` → commit `feat(app): confirmação de nível na primeira inscrição do esporte`.

---

### Task 7: Portal do atleta — confirmação na 1ª inscrição

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-registration-shell.component.ts` (mesmo gate antes de criar a 1ª inscrição do esporte; dialog com as mesmas copys; `Ajustar nível` → `/perfil/esportes`)
- Test: spec da função de gate + spec do fluxo (zoneless)

**Interfaces:** mesma `needsLevelConfirmation` espelhada em `tournament-eligibility.ts` (exportar de lá).

- [ ] Steps: RED → implementar → `npx ng test athlete --watch=false` → commit `feat(athlete-web): confirmação de nível na primeira inscrição`.

---

### Task 8: Portal do organizador — ação Promover nível

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/eventos/categoria-detalhe.component.ts` (ação por atleta na linha/sheet da dupla: "Promover nível", visível quando a categoria está concluída — derivar do estado de chave/resultados já exposto na tela; oferecer SOMENTE degraus acima do atual; confirm com a copy global; chama `setAthleteLevel` com `tournamentId`)
- Test: spec da lógica de opções (só acima) e do gating de visibilidade

**Interfaces:** consome `setAthleteLevel` (Task 3) via o padrão de callables do portal; nível atual do atleta já está na tela (team-level-score).

- [ ] Steps: RED (lógica pura de opções/visibilidade) → implementar UI → `npx ng test organizer --watch=false && npx ng build organizer` → commit `feat(organizer-web): promover nível de atleta do torneio`.

---

### Task 9: Docs + verificação integrada

**Files:** `docs/business-rules/levels.md` (seção nova "Calibração"), `docs/business-rules/registrations.md` (nota do lock)

- [ ] **Step 1: levels.md** — documentar: escolha obrigatória; janela (fecha na 1ª inscrição ATIVA — registrar o ruling e o porquê; cancelar não reabre); `levelLocked` só-backend; confirmação na 1ª inscrição; promoção pelo organizador (só sobe, auditada). Atualizar a seção "só sobe" para citar a janela.
- [ ] **Step 2: Suites completas** — functions `npm test`; rules emulator; `ng test athlete/organizer/backoffice`; `ng build` dos três; `flutter analyze && flutter test`. Tudo verde (backoffice não muda mas roda).
- [ ] **Step 3: Commit** — `docs: calibração de nível (janela, lock, confirmação e promoção)`.
- [ ] **Step 4: Registrar pendências de rollout (NÃO executar)** — deploy functions (trigger novo!) → rules → portais → app. O trigger só trava inscrições NOVAS; se houver inscrições ativas pré-deploy, rodar um backfill simples (script admin) marcando levelLocked dos esportes já inscritos — anotar como follow-up se a base já tiver inscrições.

---

## Fora deste plano

Notificação ao atleta promovido pelo organizador; aviso dinâmico de cobertura no wizard (§4.2, metade dinâmica); unlock administrativo da janela (suporte usa o bypass de super admin existente).
