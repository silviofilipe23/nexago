# NexaGO — Triagem de automação do Mapa de Teste (QA)

> Cruza os 720 casos de [`qa-test-map.md`](./qa-test-map.md) com a suíte de testes automatizados já existente (`nexago_app/test/` + `functions/src/*.test.ts`), para decidir o que já está coberto, o que dá pra automatizar e o que só um humano consegue validar.
>
> Gerado em 08/07/2026 a partir de: execução real de `flutter test` (1283 casos, 154 arquivos) + busca de cobertura equivalente nas Cloud Functions + checagem por nome/conteúdo de arquivo (não é leitura linha a linha de cada teste — ver "Limitações" ao final).

## Números de hoje

| Métrica | Valor |
|---|---|
| Arquivos de teste no app Flutter | 154 |
| Casos de teste individuais executados | 1283 |
| **Passando** | 1283 (era 1282 — ver correção abaixo) |
| **Falhando** | 0 |
| Testes de lógica pura (`test()`) | 142 arquivos (92%) |
| Testes de UI/widget (`testWidgets()`) | 13 arquivos (era 12 — `arena_plan_gate_test.dart` adicionado em 08/07/2026) |
| Testes de bracket/chave (Cloud Functions) | `bracket-definitions.test.ts`, `category-bracket-builders.test.ts`, `organizer-match-ops.test.ts` |

**Achado nº 1 — corrigido em 08/07/2026:** havia 1 teste vermelho (`league_create_mapper_test.dart`, "tolerates legacy prize value as string"). Causa raiz: o commit `2ed469f3` (07/07, reformatação/merge) trocou acidentalmente o literal `9000` por `22000` em duas linhas do arquivo — um find-and-replace largo demais. Só uma delas quebrou o teste (a outra era um dado de entrada nunca verificado em outro teste). O código de produção (`league_create_mapper.dart:_parsePrizes`) sempre esteve correto — `'90'` (reais, formato legado) converte para `9000` centavos, batendo com o round-trip do próprio `toJson`. Fix: 1 linha, só o literal errado na asserção. Suíte completa reexecutada: **1283/1283 passando.**

**Achado nº 2:** a suíte é fortíssima em **lógica de negócio pura** (validação, cálculo, elegibilidade, mapeamento de dados) e quase inexistente em **testes de UI** (12 de 154 arquivos). Isso significa: as *regras* por trás da maioria dos casos do mapa já estão garantidas por teste, mas *"o botão certo aparece/desaparece na tela certa com o texto certo"* raramente está.

## Como ler a tabela

- 🟢 **Forte** — a regra de negócio central do caso já tem teste automatizado dedicado (por nome de arquivo/conteúdo).
- 🟡 **Parcial** — parte da lógica está coberta, mas falta algo relevante (um caso de borda específico, ou a camada de UI/widget).
- 🔴 **Fraca/nenhuma** — não encontrei arquivo de teste correspondente; provavelmente só é validado hoje testando manualmente.
- "Ainda manual" lista o que **nunca** vai dar pra automatizar de forma realista (gateway de pagamento real, push de verdade, biometria, App Store).

## Papel: Atleta

| # | Subseção | Cobertura já existente | Nível | Ainda manual (mesmo depois de automatizar) |
|---|---|---|---|---|
| 2.1 | Autenticação e Onboarding | `auth_password_strength`, `firebase_auth_error_mapper`, `role_route_guard`, `role_preferences_repository`, `post_login_bootstrap`, `athlete_onboarding_draft`, `athlete_profile_onboarding` | 🟡 | Login social Google/Apple de verdade, Apple Sign-In ausente no Android, comportamento de app real após cancelar popup |
| 2.2 | Hub principal (Início) | `athlete_home_competitions_logic`, `athlete_home_featured_logic` | 🟡 | Renderização visual real dos cards |
| 2.3 | Perfil do Atleta | `athlete_level_upgrade_only` ✅ (regra "nível só sobe"), `athlete_profile_stats_logic`, `athlete_sports_levels_mapper`, `athlete_profile_repository`, `profile_completion_state`, `athlete_display_name`, `br_phone_input_formatter`, `athlete_discover_logic` | 🟢 | Upload real de foto/recorte |
| 2.4 | Agenda unificada | `athlete_agenda_logic`, `booking_details_view_model`, `booking_details_team_providers`, `booking_played_today`, `my_bookings_logic` (janela de cancelamento 6h) | 🟢 | — |
| 2.5 | Descoberta e Reserva de Arenas | `arena_search_filter_logic`, `arena_search_metadata`, `nearby_arenas_logic`, `arena_detail_logic`, `slots_page_logic`, `slots_suggestions_logic`, `court_pricing`, `arena_booking_cancellation_policy`, `arena_booking_pix_amounts`, `pending_pix_booking_match`, `arena_booking_success_actions`, `favorite_arenas_logic`, `booking_invite_status` ✅ (novo) | 🟢 | Pagamento PIX real, GPS real. Convite de reserva ganhou teste + fix dos 2 bugs (corrida de aceite, dados de reserva cancelada) em 08/07/2026 |
| 2.6 | Torneios — Descoberta | `tournament_detail_logic`, `tournament_detail_tab`, `tournament_discovery_hub_logic`, `tournament_discovery_helpers/stats`, `double_elimination_bracket_layout` (layout visual, não geração), `compete_hub_logic`, `tournament_group_standings_logic`, `tournament_match_display`, `tournament_listing_status` | 🟡 | Falta teste da regra de rota pública da transmissão ao vivo (o gap já sinalizado no mapa) |
| 2.7 | Inscrição em Torneios | `tournament_registration_logic`, `category_level_eligibility` ✅ (anti-sandbagging), `category_age_eligibility`, `tournament_category_spots`, `tournament_partner_invite` + 3 variantes, `pix_brcode`, `tournament_registration_share_phrases`, `my_tournaments_logic` | 🟢 | **Seção mais bem testada do app.** Só o pagamento PIX real fica manual |
| 2.8 | Ligas (atleta) | `league_detail_logic`, `league_document_mapper`, `league_ranking_logic` | 🟢 | — |
| 2.9 | Duplas e equipes | `team_discover_logic`, `team_follow_logic`, `team_public_profile_logic` | 🟢 | — |
| 2.10 | Partidas e Histórico | 12 arquivos `match_detail_*` + `athlete_match_*` | 🟢 | Quase tudo coberto — inclusive regras finas como "XP só aparece na vitória" e "momentum só com 4+ pontos" |
| 2.11 | Gamificação | `daily_mission_catalog`, `athlete_quest_logic`, `achievement_catalog`, `achievement_resolver`, `user_badge_progress`, `gamification_profile_step` | 🟢 | — |
| 2.12 | Ranking | `ranking_logic` ✅ (confirma: exclui atleta sem nível resolvido, mantém lista intacta quando filtro é "todos os níveis"), `ranking_list_mapper` | 🟡 | A **lógica** do filtro de nível — a área mais arriscada por ser a mudança mais recente — já está testada. Falta um `testWidgets` cobrindo a interação real do bottom sheet (abrir/selecionar/fechar) |
| 2.13 | Notificações | `athlete_notification_preferences`, `athlete_notifications_logic`, `athlete_inbox_notification`, `foreground_local_notifications`, `notification_navigation` (deep link ao tocar) | 🟡 | Entrega real de push (FCM/APNs) é sempre manual |
| 2.14 | Configurações e conta | `athlete_privacy_preferences`, `role_preferences_repository`, `theme_preferences_repository`, `account_deletion_error` ✅ (novo), `firebase_auth_error_mapper` (alterar senha reusa) | 🟢 | Alterar senha já reusava o mapper testado; exclusão de conta ganhou teste + fix do bug AT-CONF-23 em 08/07/2026 |
| 2.15 | Comunidade | `community_feed_models` | 🟡 | — |

## Papel: Organizador

| # | Subseção | Cobertura já existente | Nível | Ainda manual |
|---|---|---|---|---|
| 3.1 | Acesso e Home | nenhum arquivo dedicado encontrado | 🔴 | — |
| 3.2 | Criação de Torneio | `tournament_create_identity_page`, `tournament_create_local_store`, `tournament_create_location_page`, `tournament_create_logic`, `tournament_create_mapper`, `tournament_create_session`, `tournament_express_create_page` | 🟢 | — |
| 3.3 | Criação de Liga | `league_create_identity_page`, `league_create_local_store`, `league_create_logic`, `league_create_mapper` ⚠️, `league_create_season_page`, `league_create_session`, `league_stage_create_local_store`, `league_stage_create_logic`, `league_stage_tournament_factory` | 🟡 | **1 teste falhando agora** (`league_create_mapper_test.dart`) — ver achado nº 1 |
| 3.4 | Painel / Hub do Torneio | `organizer_tournament_explore_section` ✅ (novo, 08/07/2026) — confirma visibilidade por papel (dono/scorer/manager) | 🟢 | — |
| 3.5 | Gestão de Categorias | `category_ops_logic` (elegibilidade, seeds, pagamentos), `tournament_uniforms_logic` | 🟢 | — |
| 3.6 | Central de Partidas | `match_ops_logic`, `match_scoring_logic`, `schedule_logic`, `schedule_grid_logic`, `schedule_pick_logic`, `schedule_time_logic`, `organizer_match_card`, `organizer_match_live_table`, `organizer_match_validate`, `organizer_court_panel` | 🟢 | **Gap específico:** "final agendada só depois das demais" não tem teste direto no app nem nas Functions — hoje é garantido só *indiretamente* (ver seção Cloud Functions abaixo) |
| 3.7 | Uniformes | `tournament_uniforms_logic` | 🟢 | Exportação de CSV real |
| 3.8 | Financeiro (Organizador) | não encontrado no app — lógica de carteira/saque provavelmente só nas Cloud Functions (não auditado nesta rodada) | 🔴 | Saque PIX real, aprovação manual no backoffice |
| 3.9 | Comunicação com atletas | sem teste (condizente — funcionalidade inalcançável pela UI, ver mapa) | 🔴 | — |

## Papel: Gestor de Arena

| # | Subseção | Cobertura já existente | Nível | Ainda manual |
|---|---|---|---|---|
| 4.1 | Dashboard / Métricas | `arena_dashboard_formatters` ✅ (novo, 08/07/2026) — formatação de %/hora/eixo do gráfico | 🟡 | Cálculo dos KPIs em si (`arena_dashboard_service.dart`) ainda não testado — acoplado a Firestore, mesmo padrão de "shell de I/O" não coberto do resto do app |
| 4.2 | Gestão de Quadras | `arena_court` | 🟡 | — |
| 4.3 | Agenda / Horários | não encontrei teste de geração de disponibilidade padrão | 🔴 | — |
| 4.4 | Reservas (gestor) | `arena_manager_booking_recurring`, `arena_recurring_booking`, `arena_plan_recurring_limit` ✅ (limite de 3 séries no Essencial) | 🟡 | Cancelamento com motivo + undo de 30s do lado do gestor não tem teste dedicado que eu tenha achado |
| 4.5 | Comandas (PDV) | `arena_comanda_logic` | 🟢 | Pagamento real |
| 4.6 | Estoque / Produtos | `arena_product_logic` | 🟢 | — |
| 4.7 | Financeiro e Pagamentos | `arena_financial_logic`, `cpf_cnpj` (core) | 🟡 | Saque PIX real |
| 4.8 | Plano / Assinatura | `arena_plan_activation_content`, `arena_plan_recurring_limit` | 🟢 | Checkout Asaas real (PIX/cartão) |
| 4.9 | Perfil e Configurações da Arena | não encontrei arquivo dedicado | 🔴 | — |
| 4.10 | Avaliações, Seguidores, Promoções | `arena_promotion`, `arena_promotion_display` ✅ (validações de promoção) | 🟡 | Avaliações/seguidores sem teste dedicado que eu tenha achado |

## Cloud Functions (`functions/src/`) — relevante para os casos "gerados no backend"

- **Geração de chave DE (SE/DE/grupos)** — `bracket-definitions.test.ts` e `category-bracket-builders.test.ts` são exemplares: validam as 9+ plantas estáticas, testam "FINAL sempre é o maior matchNumber" e rodam **300 partidas aleatórias por número de equipes** checando que a chave nunca fica inconsistente. 🟢 Forte — provavelmente a parte mais bem testada de todo o produto.
- **Auto-programação "final por último"** (organizer-match-ops.ts) — **fechado em 08/07/2026.** O comparador de ordenação foi extraído para a função pura exportada `compareByMatchNumber` (mesmo comportamento, só nomeada e testável) e ganhou 3 testes diretos em `organizer-match-ops.test.ts`, incluindo o cenário exato do bug original (WB/LB/3º lugar/final com `round` reiniciando por trilha). Suíte completa de Cloud Functions: 408/408 passando.

## Recomendação de próximos passos (em ordem de prioridade)

1. ~~Corrigir o teste que já está quebrado (`league_create_mapper_test.dart`)~~ ✅ feito em 08/07/2026.
2. ~~Escrever o teste faltante de "final agendada por último"~~ ✅ feito em 08/07/2026 (`compareByMatchNumber` extraída + 3 testes).
3. ~~Cobrir exclusão de conta e alterar senha (2.14)~~ ✅ feito em 08/07/2026. "Alterar senha" já usava `mapFirebaseAuthException` (já testado, sem gap real). "Exclusão de conta" tinha o bug confirmado: o backend já distinguia as duas falhas com mensagens PT específicas, mas o client descartava tudo num `catch` genérico. Criado `lib/core/auth/account_deletion_error.dart` (via TDD, 9 testes) e plugado no `catch` de `athlete_settings_page.dart` — agora a mensagem do servidor chega ao usuário.
4. ~~Cobrir o convite de reserva (`bookingInvite`, 2.5)~~ ✅ feito em 08/07/2026. Os 2 gaps eram bugs reais: `acceptInvite` não era transacional (dois usuários podiam aceitar o mesmo convite, duplicando `confirmedParticipants`) e `fetchInvite` nunca relia o status atual da reserva (convite continuava parecendo válido após a reserva ser cancelada). Extraída a função pura `resolveBookingInviteBlockedReason` (TDD, 7 testes) e reusada tanto na tela quanto dentro de uma transação Firestore em `acceptInvite`.
5. ~~Escrever os primeiros `testWidgets` para os gates de plano da arena~~ ✅ feito em 08/07/2026. Achado: todos os gates de plano (Quadras, Estoque, Comandas, Horários fixos, Promoções) passam por um único componente compartilhado, `ArenaPlanUpsell`/`ArenaPlanReadOnlyBanner`/`showArenaPlanUpsellSheet` (`arena_plan_gate.dart`) — testar esse componente uma vez cobre os 8 pontos de uso reais no código. 8 `testWidgets` novos (1 por `ArenaCapability` + copy customizada de "limite atingido" + o banner de somente-leitura).
6. ~~Preencher os 🔴 de visibilidade por papel de staff (3.4) e telas sem teste da arena (4.1, 4.3, 4.9)~~ **parcial, 08/07/2026.** Feito: (a) visibilidade por papel no hub do torneio — `OrganizerTournamentExploreSection` confirmada exatamente como o mapa descreve (dono vê tudo, scorer só "Partidas", staff manager vê tudo exceto "Equipe"), 4 `testWidgets` novos; (b) formatadores do dashboard da arena (`arena_dashboard_formatters.dart` — clamp de %, "k" compacto no eixo do gráfico), 8 testes novos. **Não feito:** 4.3 (geração de disponibilidade padrão) e 4.9 (perfil/config da arena) — a lógica de validação está inline nas próprias páginas, não extraída em função pura; fechar esses exigiria um refactor de extração maior (mesmo padrão usado no convite de reserva), não só escrever teste.

## Limitações desta triagem

- Classificação por **nome e leitura parcial** de arquivo, não por linha-a-linha de cada um dos 1283 casos — um 🟢 pode ter uma lacuna fina que só apareceria lendo o teste inteiro; um 🔴 pode estar coberto por um arquivo com nome que eu não associei corretamente.
- Não auditei a suíte de testes das Cloud Functions além de bracket/auto-schedule (há mais arquivos `*.test.ts` em `functions/src/` cobrindo carteira, saques, PIX etc. que não foram checados nesta rodada).
- "🟢 Forte" significa que a *regra de negócio* está testada — não substitui os casos do mapa que dependem de renderização visual, gateway de pagamento real ou hardware do aparelho.
