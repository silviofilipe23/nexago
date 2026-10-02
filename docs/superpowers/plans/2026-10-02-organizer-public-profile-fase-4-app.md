# Perfil público do organizador — Fase 4 (app Flutter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No app, o atleta conhece quem organiza (perfil público, lista "Organizadores", entradas no
detalhe do torneio e no hub Competir) e o organizador edita a vitrine dele (tela "Perfil público"
no modo organizador).

**Architecture:** Feature nova `lib/features/organizer_public_profile/` (data / domain /
presentation) só consome o contrato da Fase 1: `organizerPublicProfiles/{uid}`, a subcoleção
`followers`, `organizerReputation/{uid}`, `tournamentReviewSummaries where organizerId == uid` e
`tournaments where managerId == uid`. Toda regra (o que é listado, próximo, realizado, selo do card,
ordenação da lista, números do cabeçalho) mora em funções puras testadas sem Firestore. O editor
fica em `lib/features/organizer/` (é tela do modo organizador) e grava `users/{uid}` com `update()`
por caminho pontilhado, montado por uma função pura.

**Tech Stack:** Flutter, Riverpod (StreamProvider/FutureProvider `family` com chave `String`),
go_router, cloud_firestore, firebase_storage, image_picker + `image` (redimensionamento),
share_plus, url_launcher.

**Spec:** `docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md`

## Global Constraints

- Worktree: `WT=/Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/organizador-perfil-fase-4-app`,
  branch `claude/organizador-perfil-fase-4-app`. Todo comando com `cd $WT && ` ou `cd $WT/nexago_app && `.
- `flutter analyze <arquivos>` limpo e `flutter test <arquivos>` verdes. A 1ª linha do output não
  pode dizer "Changing current working directory to" o checkout principal.
- Nunca `dart format` em arquivo existente (reformata o arquivo inteiro); só nos arquivos novos.
- Chave de `family` é sempre `String` (uid/id), nunca `List`.
- Código em inglês, strings de UI em português.
- Commits por task, arquivos adicionados por nome, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisões de produto já tomadas (dono)

- Sem `@handle` e sem comentário de atleta.
- "Arenas parceiras" do mock vira "Onde acontece" (`stats.venues`).
- 5 aspectos: organization, schedule, refereeing, venue, prizes → Organização, Pontualidade,
  Arbitragem, Estrutura, Premiação.
- Nota só com `organizerReputation.average != null`.
- "Mensagem" só com `whatsapp` (abre `https://wa.me/{dígitos}`).
- Seguir some no próprio perfil.

## Desvios conscientes do texto da spec

- **"Ver meu perfil" no modo organizador** abre `/organizer/perfil-publico/visualizar`, não
  `/competir/organizadores/:id`: o guard de papel (`redirectForActiveRole`) manda toda rota
  `/competir/**` de volta à home do organizador quando o papel ativo é organizer. A rota nova
  monta a MESMA página em modo "dono", com os cards de evento levando ao detalhe operacional
  (`/organizer/tournaments/:id`) pelo mesmo motivo.
- **Limite de 5 MB**: no app o seletor nativo já reduz a imagem (`maxWidth: 1600`) antes de o Dart
  ver os bytes — é o único caminho que converte HEIC do iPhone em JPEG. O limite vale sobre o
  arquivo entregue pelo seletor; o redimensionamento em Dart garante ≤ 1600 px JPEG.
- **Evento listado** espelha `isListedTournament` do backend (`listingStatus` em open/closed/
  completed e `visibility != linkOnly`), não o `isPubliclyListedTournamentDoc` do Competir (que
  aceita também `live` etc.): assim "Ver os N" bate com `stats.eventsCompleted`.

## Review Focus

- Payload do editor: só caminhos pontilhados `organizerProfile.*`, só campos alterados, capa
  removida = `FieldValue.delete()`, nunca o mapa inteiro (memória "campo congelado derruba o save").
- Doc de seguidor com exatamente `userId`, `organizerId`, `followedAt` (serverTimestamp), `set`
  sem merge; deixar de seguir = `delete`.
- Seguir otimista com rollback e snackbar; botão some no próprio perfil.
- Nota/reputação só com média; "Ainda sem avaliações suficientes" abaixo de 3.
- Header fixo (botão voltar fora do Scrollable).

---

### Task 1: Modelos e mapeadores puros (perfil, eventos, reputação)

**Files:**
- Create: `nexago_app/lib/features/organizer_public_profile/domain/organizer_public_profile_models.dart`
- Create: `nexago_app/lib/features/organizer_public_profile/domain/organizer_event_mapper.dart`
- Modify: `nexago_app/lib/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart`
  (`OrganizerReputation` ganha `distribution` e `aspects`, opcionais — retrocompatível)
- Test: `nexago_app/test/features/organizer_public_profile/organizer_public_profile_models_test.dart`
- Test: `nexago_app/test/features/organizer_public_profile/organizer_event_mapper_test.dart`

**Interfaces:**
- `OrganizerPublicProfile.fromMap(String id, Map<String, dynamic>? data)` → `null` sem doc.
  Campos: `uid, name, logoUrl?, coverUrl?, bio?, city?, state?, whatsapp?, verified, listed,
  followersCount, stats (OrganizerPublicStats)`.
- `OrganizerPublicStats { listedEvents, eventsCompleted, openEvents, athletes, organizerSince?,
  sports, venues (List<OrganizerVenue>) }`.
- `isOrganizerListedEventDoc(Map data)` (espelho do backend).
- `OrganizerEvent { detail (TournamentDetail), listing (open|closed|completed), champions
  (List<OrganizerEventChampion{categoryId, categoryName, teamId}>) }` e
  `organizerEventFromMap(id, data)` → `null` quando não listado.

- [ ] Testes falhando → implementar → verdes → commit.

### Task 2: Lógica pura das telas (cabeçalho, abas, lista, card de evento)

**Files:**
- Create: `nexago_app/lib/features/organizer_public_profile/domain/organizer_public_profile_logic.dart`
- Test: `nexago_app/test/features/organizer_public_profile/organizer_public_profile_logic_test.dart`

**Interfaces:**
- `formatOrganizerCount(int)` ("38", "1.240", "12,4 mil"), `organizerLocationLine(city, state)`,
  `organizerSinceLabel(DateTime?)`, `organizerInitials(name)`, `organizerSportLabel(code)`,
  `organizerWhatsappUri(String?)`.
- `organizerHeaderStats(profile, reputation)` → `List<OrganizerHeaderStat{value,label}>` (nota só
  com média).
- `organizerUpcomingEvents(events, now)`, `organizerCompletedEvents(events)`.
- `organizerEventBadge(event, {enrolled, capacity, now})` → `OrganizerEventBadge` (abertas,
  últimas vagas ≥ 80%, ao vivo, em breve, encerradas) e `organizerEventCtaIsRegister(badge)`.
- `organizerEventTypeLabel(event)` ("Torneio" / "Liga · Etapa N"), `organizerEventPriceLabel`.
- `organizerReputationView(reputation)` (média, contagem, 5 aspectos na ordem, distribuição 5→1).
- `organizerEventReviewRows(summaries, eventsById)` (resumos fechados com `count >= 3`).
- `filterOrganizersDirectory(list, query)` (sem acento, nome e cidade) e
  `sortOrganizersDirectory(list)` (abertas > seguidores > nome).

- [ ] Testes falhando → implementar → verdes → commit.

### Task 3: Repositório, serviço de seguir e providers

**Files:**
- Create: `nexago_app/lib/features/organizer_public_profile/data/organizer_public_profile_repository.dart`
- Create: `nexago_app/lib/features/organizer_public_profile/domain/organizer_public_profile_providers.dart`
- Test: `nexago_app/test/features/organizer_public_profile/organizer_follow_payload_test.dart`

**Interfaces:**
- `organizerFollowerDocData({followerId, organizerId})` → `{userId, organizerId, followedAt:
  FieldValue.serverTimestamp()}` (pura, testada).
- Repositório: `watchProfile(uid)`, `watchListedProfiles()`, `watchEvents(uid)`,
  `watchReviewSummaries(uid)`, `watchIsFollowing({organizerId, followerId})`,
  `follow({organizerId, followerId})` (`set` sem merge), `unfollow(...)` (`delete`).
- Providers (`family<String>`): `organizerPublicProfileProvider`, `organizerEventsProvider`,
  `organizerReviewSummariesProvider`, `organizerIsFollowedProvider`,
  `organizerChampionNamesProvider`; e `organizersDirectoryProvider`.

- [ ] Teste do payload → implementar → analyze → commit.

### Task 4: Página do perfil público + rotas + link de compartilhamento

**Files:**
- Create: `.../presentation/organizer_public_profile_page.dart` e widgets em
  `.../presentation/widgets/` (hero, ações, abas, card de evento, reputação).
- Modify: `lib/core/router/routes.dart`, `lib/core/router/app_router.dart`,
  `lib/core/deep_link/app_domains.dart` (`AppShareLinks.organizerProfile`).
- Test: `test/features/organizer_public_profile/organizer_public_profile_page_test.dart`
  (carregando, não encontrado, sem reputação, próprio perfil sem Seguir, seguir otimista com
  rollback).

- [ ] Testes de widget falhando → implementar → verdes → commit.

### Task 5: Lista "Organizadores" + entradas (hub Competir e detalhe do torneio)

**Files:**
- Create: `.../presentation/organizers_directory_page.dart`
- Create: `lib/features/tournaments/presentation/widgets/compete_hub/compete_hub_wide_card.dart`
- Modify: `tournament_discovery_page.dart` (card "Organizadores"),
  `tournament_detail_page.dart` (nome do perfil público com fallback; toque abre o perfil),
  `tournament_detail_tournament_info_section.dart` (`onOrganizerTap`, logo opcional).
- Test: `organizers_directory_page_test.dart`, ampliar
  `tournament_detail_tournament_info_section_test.dart`.

- [ ] Testes → implementar → verdes → commit.

### Task 6: Editor "Perfil público" (modo organizador)

**Files:**
- Create: `lib/features/organizer/domain/public_profile/organizer_profile_editor_logic.dart`
  (`OrganizerProfileSource.fromUserDoc`, `OrganizerProfileForm`, `validateOrganizerProfileForm`,
  `buildOrganizerProfileUpdate`, `validateOrganizerImageBytes`, `resizeOrganizerImageJpeg`).
- Create: `lib/features/organizer/data/organizer_public_profile_editor_repository.dart`
  (`watchSource`, `save` = `update()`, `uploadLogo`/`uploadCover` em
  `profiles/{uid}/organizer-logo.jpg` / `organizer-cover.jpg`).
- Create: `lib/features/organizer/domain/public_profile/organizer_profile_editor_providers.dart`
- Create: `lib/features/organizer/presentation/public_profile/organizer_public_profile_editor_page.dart`
- Modify: rotas (`/organizer/perfil-publico`, `/organizer/perfil-publico/visualizar`) e
  `organizer_home_page.dart` (atalho).
- Test: `organizer_profile_editor_logic_test.dart` (payload só com campos alterados, capa removida
  = delete, WhatsApp exige telefone, limites) e `organizer_public_profile_editor_page_test.dart`
  (validação de nome/bio, switch desabilitado sem telefone, save manda só o alterado).

- [ ] Testes → implementar → verdes → commit.

### Task 7: Verificação final

- [ ] `flutter analyze` nos arquivos tocados.
- [ ] Testes novos + vizinhos (detalhe do torneio, hub Competir, home do organizador, reviews).
