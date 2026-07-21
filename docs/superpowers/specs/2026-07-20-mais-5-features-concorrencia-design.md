# Mais 5 funcionalidades — 2ª leva (pesquisa de concorrência)

## Contexto

Continuação da meta autônoma (`/goal`): usuário pediu "mais 5" depois da 1ª
leva (ver `2026-07-20-cinco-features-concorrencia-design.md`, que já entregou
placar ao vivo, lista de espera de quadra, head-to-head, probabilidade de
vitória e palpites da torcida, cada uma em sua branch `feat/*`, sem deploy).

As 5 daqui vêm da mesma lista de gaps já levantada contra concorrentes
(LetzPlay, LiveBT, BT Match, Playtomic, DUPR, UTR, LeagueApps, Challonge,
TeamSnap Live, Sua Praia) que não entraram na 1ª leva. Mapeamento de código
adicional feito antes de escrever este spec (achados relevantes citados em
cada seção).

**5 funcionalidades escolhidas** (diversas entre si, sem sobrepor a 1ª leva
nem o que o app já tem):

1. Peça na quadra (pedido de consumo pelo app, reaproveitando comandas/estoque da arena)
2. Confiabilidade do rating (transparência do RD do Glicko-2)
3. Avisos do organizador (comunicado público durante o evento, persistente no feed)
4. Galeria de fotos de destaque no perfil do atleta
5. Compartilhamento de conquista/nível (Sand Rank) via share nativo

Descartadas de novo: streaming, ticketing, split de pagamento (mesmos
motivos da 1ª leva — infra/PSP fora do que dá pra provisionar sozinho nesta
sessão).

Mesmas regras da 1ª leva: cada feature em worktree/branch isolada
(`feat/<nome>`), sem deploy/push/merge automático, seguindo os padrões reais
do repo (Cloud Functions flat em `functions/src/`, testes colocalizados
`node:test`, Flutter feature-first `data/domain/presentation`).

---

## 1. Peça na quadra (pedido de consumo pelo app)

**Achado-chave:** o sistema de estoque/comandas da arena já existe e é
real (não mock) — `arenas/{arenaId}/products`, `arenas/{arenaId}/stockMovements`,
`arenaComandas/{comandaId}` + subcoleções `items`/`payments`. **Já existe um
esqueleto de dado pensado exatamente para isso e nunca ligado**:
`ArenaComanda.allowAppOrders` (default `true`) e
`ArenaComandaItemSource.app` (vs `.counter`). O toggle "Pedidos pelo app" já
está desenhado em `arena_comanda_review_page.dart:154-175`, só que
**comentado**. Hoje `firestore.rules` (linhas ~803-901) só permite escrita a
quem passa em `canManageArenaProducts(arenaId)` — um atleta comum não tem
nenhum acesso.

**Escopo:**
- Descomentar/ligar o toggle em `arena_comanda_review_page.dart` (lado
  gestor da arena, já dentro do `nexago_app`).
- Nova Cloud Function `functions/src/arena-comanda-app-orders.ts`:
  callable `addAppOrderItem({arenaId, comandaId, productId, quantity})` —
  valida `comanda.allowAppOrders == true`, valida que o `request.auth.uid`
  é o atleta dono da comanda (ou tem uma reserva ativa vinculada a ela —
  confirme como a comanda se relaciona a uma reserva/atleta antes de
  decidir a regra exata), valida estoque disponível, grava item em
  `arenaComandas/{comandaId}/items` com `source: 'app'`, decrementa
  `stockMovements` (reaproveitar a mesma lógica de baixa de estoque já
  usada pelo fluxo do gestor — leia `arena_products_repository.dart` e o
  Angular `products-repository.ts` para replicar a regra, não invente uma
  nova).
- Ajustar `firestore.rules`: permitir ao atleta dono da comanda **ler**
  `arenaComandas/{id}` e seus `items`/`payments` (hoje é só leitura de
  gestor); escrita em `items` continua vedada ao client (só via a nova
  Cloud Function).
- App Flutter (lado atleta, `features/arenas/` ou nova pasta
  `features/arena_orders/`): tela simples de catálogo de produtos da arena
  (lendo `arenas/{arenaId}/products`) + botão "Adicionar à comanda" que
  chama a callable; exibição do total da comanda em andamento.
- **Fora de escopo:** pagamento do consumo pelo app (o pagamento da comanda
  já é resolvido no balcão pelo fluxo existente do gestor — não mexer
  nisso); esse recurso só permite o atleta ADICIONAR itens, não fechar
  conta.

---

## 2. Confiabilidade do rating

**Achado-chave:** o campo `rd` (RD do Glicko-2) já é lido do Firestore em
`athlete_rating.dart` mas **nunca é exibido em nenhuma tela** — só existe o
indicador binário `isProvisional => ratedMatches < 10`, mostrado em
`AthleteLevelZoneCard` (`athlete_level_zone_card.dart:64-70`,
usado em `athlete_sports_levels_page.dart:400`). Puramente uma feature de
UI, sem necessidade de mudança de backend (dado já existe e já é público).

**Escopo:**
- Função pura em Dart (ex. `features/athlete/domain/rating_reliability.dart`):
  mapeia `rd` (faixa 60–350 conforme `DEFAULT_GLICKO_OPTIONS` do backend,
  confirme os limites reais lendo `functions/src/glicko.ts`) para um rótulo
  categórico (ex. `Alta` / `Média` / `Baixa` confiabilidade) — não precisa
  ser um % preciso, é um indicador de leitura rápida.
- Exibir esse rótulo em `AthleteLevelZoneCard` e em
  `athlete_sports_levels_page.dart`, ao lado do que já existe (zona
  `promotion`/`relegation`/`stable`), sem substituir o texto de
  "consolidando" já existente para o caso provisional (a confiabilidade
  complementa, não substitui).
- Testes unitários puros da função de mapeamento (limites de faixa).

---

## 3. Avisos do organizador (comunicado público, persistente)

**Achado-chave:** já existe `sendCategoryCommunication`
(`functions/src/organizer-category-ops.ts:544-614`) — mas é mensagem
DIRETA (push + link de WhatsApp) só pros times já inscritos numa categoria
específica, e **não fica em lugar nenhum depois de enviada** (some no
inbox genérico, misturado com outras notificações). O gap identificado na
pesquisa (TeamSnap "Locker Room" — aviso de clima/atraso durante o evento)
é sobre um **canal persistente e público** de avisos do torneio, que
qualquer torcedor (não só inscrito) possa ver — e o `communityFeed` já
comporta isso: é sistêmico hoje (`tournament_open`/`tournament_champions`),
mas o modelo aceita novos `type`s sem mudança de regra de segurança
(`allow write: if false`, só Admin SDK escreve).

**Escopo:**
- Nova Cloud Function callable `postTournamentAnnouncement({tournamentId,
  message})` em novo arquivo `functions/src/tournament-announcements.ts` —
  autorização: mesmo guard de `assertCanManageTournament` já usado por
  `sendCategoryCommunication` (reaproveitar de `tournament-acl.ts`, não
  duplicar). Grava doc em `communityFeed/{id}` com `type:
  'organizer_announcement'` (padrão de ID determinístico como os outros:
  ex. `announcement_{tournamentId}_{timestamp}` ou auto-ID, sua escolha) +
  `tournamentId`, `message`, `createdAt`. Opcionalmente também dispara push
  pros inscritos (reaproveitar `deliverNotificationToUser`, mesmo padrão de
  `sendCategoryCommunication`, mas escopo é o torneio inteiro, não uma
  categoria).
- Adicionar o novo `type` ao enum fechado `CommunityFeedType` em
  `community_feed_models.dart:4-19` e tratar a exibição em
  `community_feed_section.dart` (hoje só tem `if/else` pra
  `tournamentChampions` vs. resto — adicione o caso novo, não quebre os
  existentes).
- Tela organizador: nova ação "Publicar aviso" — pode ser uma tela nova
  simples ou uma aba dentro de
  `organizer_category_communicate_page.dart` existente (avalie qual encaixa
  melhor: esse já é o service `organizer_category_ops_service.dart`, então
  um método novo lá reaproveita o mesmo client de callable).
- **Fora de escopo:** integração real de previsão do tempo (precisa de API
  key externa que não posso provisionar) — o aviso é sempre escrito
  manualmente pelo organizador, não automático.

---

## 4. Galeria de fotos de destaque no perfil

**Achado-chave:** já existe upload single-file com crop
(`nexago_app/lib/core/media/profile_image_picker.dart` +
`ProfileImageCropPage`, usado por avatar/capa em
`athlete_profile_repository.dart:162-196` — `Storage:
profiles/{uid}/avatar.jpg` e `.../cover.jpg`). **Não existe galeria de
múltiplas fotos em lugar nenhum do app** (confirmado até na doc
`docs/product/qa-test-map.md:327`, que descreve a arena como "imagem de
capa única, sem galeria"). Você não tem um padrão pronto de grid/múltiplo
upload pra copiar — vai precisar desenhar isso do zero, mas reaproveitando
o picker/crop single-file já existente por foto individual.

**Escopo:**
- Modelo: array de URLs (ou subcoleção `profiles/{uid}/highlights/{id}`,
  sua escolha — array é mais simples se o limite for pequeno, ex. até 6
  fotos; prefira array se não houver necessidade de metadata por foto além
  de ordem) no doc do perfil do atleta.
- Upload: `Storage: profiles/{uid}/highlights/{index_ou_id}.jpg`,
  reaproveitando `profile_image_picker.dart`/`ProfileImageCropPage` por
  foto adicionada (mesmo fluxo de picker+crop, só que anexando à lista em
  vez de substituir um único arquivo).
- UI: grid simples na tela de edição de perfil (adicionar/remover, limite
  máximo definido no código) + exibição em grid/carrossel na tela de
  perfil público do atleta (`athlete_public_profile_page.dart`).
- **Fora de escopo:** vídeos (só fotos na v1, apesar do gap de pesquisa
  mencionar "vídeos/fotos" — vídeo exige pipeline de compressão/streaming
  fora de escopo razoável aqui); moderação de conteúdo (mesmo nível de
  confiança que já existe pra avatar/capa hoje, sem revisão adicional).

---

## 5. Compartilhamento de conquista/nível (Sand Rank) via share nativo

**Achado-chave:** `share_plus` já está no `pubspec.yaml` e já tem um
wrapper central pronto (`nexago_app/lib/core/ui/nexa_share.dart` —
`nexaShareUri`/`nexaShareText`), usado em vários fluxos (resultado de
partida com captura de imagem em
`match_detail_share_capture.dart`/`match_detail_share_section.dart`,
sucesso de inscrição, reserva, perfil público). **Não existe hoje nenhum
gatilho de compartilhamento a partir do Sand Rank** (subida de degrau,
conquista desbloqueada) — é a peça que falta, reaproveitando 100% da infra
de share já validada em produção.

**Escopo:**
- Botão "Compartilhar" na tela do Sand Rank
  (`nexago_app/lib/features/athlete/presentation/sand_rank/sand_rank_track_page.dart`)
  e/ou num momento de "subiu de degrau" (se existir algum modal/celebração
  de level-up hoje — procure por isso em `domain/sand_rank/`; se não
  existir, o botão fica só na tela do track mesmo, sem inventar um modal
  novo de celebração).
- Reaproveitar o padrão de "capturar widget como imagem" já usado em
  `match_detail_share_capture.dart` (mesmo pacote/técnica, ex.
  `RepaintBoundary` + `toImage`) pra gerar uma imagem simples do
  card/emblema atual do Sand Rank, e chamar `nexaShareUri`/equivalente com
  a imagem + texto (ex. "Cheguei ao degrau X no nexaGO!").
- **Fora de escopo:** deep link de volta pro app a partir do compartilhamento
  (ex. Firebase Dynamic Links/App Links pra quem clicar na imagem
  compartilhada abrir o app) — só compartilhamento simples de
  imagem+texto na v1, sem tracking de conversão.

---

## Ordem e paralelismo de implementação

Mesmo padrão da 1ª leva: 5 branches independentes, worktrees isolados,
implementação em paralelo, sem merge/push/deploy automático.
