# Seguir partida e acompanhar o placar na tela bloqueada

Data: 2026-09-05
Branch: `claude/match-tracking-lock-screen-mltu1m`
Relacionados: `2026-08-20-app-focus-mode-design.md` (Focus no app),
`2026-08-27-seguir-torneio-espectador-design.md` (seguir torneio no site, sem conta)

## O que esta entrega faz

Dar ao atleta um botão **"Seguir partida"** e, a partir dele, o placar da partida vivo na
**tela bloqueada** do celular, atualizado sozinho enquanto o jogo acontece.

A entrega é **faseada por plataforma**, porque o custo das duas pontas é assimétrico:

- **Fase 1 (esta spec, completa):** modelo de "seguir" + fan-out no backend + **notificação fixa
  e atualizável na tela bloqueada do Android** (zero código nativo) + **alerta silencioso que se
  substitui no iOS** (`apns-collapse-id`).
- **Fase 2 (esboçada no fim, sem tarefas):** **Live Activity + Dynamic Island** no iOS, que exige
  Widget Extension no Xcode, bridge nativa e cliente APNs próprio nas Functions.

A Fase 1 entrega o comportamento inteiro no Android e a metade útil no iOS antes da 1ª etapa da
Liga (24/10). A Fase 2 fecha a lacuna do iOS depois, sem refazer nada do backend.

## O terreno: o que já existe

Quase toda a camada de dados já está pronta — esta entrega é sobretudo **distribuição**, não
placar.

**A partida ao vivo já é um documento público.** `artifacts/{projectId}/public/data/matches/{matchId}`
(`nexago_app/lib/features/tournaments/data/nexago_artifacts_paths.dart:31`), com
`allow read: if true` (`firestore.rules:2059`) — qualquer um lê, autenticado ou não. Os campos que
o placar precisa já estão lá: `status`, `liveScore {setsA, setsB, currentGamesA, currentGamesB,
updatedAt}`, `sets[]`, `currentSetIndex`, `servingTeamId`, `matchStartedAt`, `courtName`,
`teamADescription`/`teamBDescription`, `pointEventSeq`.

**Quem escreve.** A mesa grava **direto do cliente**, ponto a ponto, numa transação:
`recordPointTransaction` (`nexago_app/lib/features/tournaments/data/tournament_matches_repository.dart:130`)
atualiza o match e cria um doc em `pointEvents` no mesmo commit. A callable
`updateLiveMatchScoreCore` (`functions/src/organizer-match-ops.ts:796`) é o caminho das mesas web e
grava o mesmo `liveScore`. **Toda escrita de placar passa pelo doc do match** — logo um único
gatilho `onDocumentUpdated` cobre as duas mesas.

**Push já funciona.** Tokens em `users/{uid}/tokens/{tokenId}` (`{token, platform}`),
`buildFcmMessage` em `functions/src/notification-delivery.ts:83`, handler de background já
registrado e marcado `@pragma('vm:entry-point')`
(`nexago_app/lib/core/notifications/notification_service.dart:18`) — hoje ele só faz `debugPrint`.

**O toque já sabe navegar.** `resolveNotificationRoute`
(`nexago_app/lib/core/notifications/notification_navigation.dart:95`) devolve `data['url']` direto
quando começa com `/`. A rota de destino já existe:
`/torneios/:tournamentId/ao-vivo/:matchId` (`nexago_app/lib/core/router/routes.dart:158` →
`PublicMatchLivePage`). **Nada a mudar no resolver.**

**O que não existe:** nenhuma noção de "seguir partida", nenhum uso de tópico FCM em todo o repo,
nenhum `MethodChannel` (esta seria a primeira ponte nativa do app), e nenhuma Widget Extension.

## Parte 1 — Seguir

### O botão

Manual e explícito. Sem auto-seguir nesta entrega — nem as minhas partidas, nem as da dupla.

Vive em três superfícies, sempre o mesmo widget `FollowMatchButton`:

0. **`TournamentMatchCard`** (`.../tournaments/presentation/widgets/tournament_match_card.dart`)
   — a superfície pública: aba de chave, visão de grupo e visão de categoria. **É a mais
   importante das três**, e quase ficou de fora.

   O Modo Focus **some para quem não está jogando**: `athleteFocusHomeTargetProvider` devolve
   `null` fora do dia do evento e para atleta eliminado no mata-mata, e a entrada em
   `tournament_detail_page.dart` é gateada por `hasMyMatchToday`. Deixar o botão só lá entregaria
   a funcionalidade a quem menos precisa dela — o atleta que está em quadra — e negaria
   justamente ao espectador, que é o público natural de "acompanhar o placar".

1. `PublicMatchLivePage` (`.../tournaments/presentation/public_match_live_page.dart`) — na
   `NexaAppBar`, ao lado do compartilhar que já está lá.
2. `FocusMatchCard` (`.../tournaments/presentation/focus/widgets/focus_match_card.dart`) — ícone
   compacto no card, porque é onde o atleta vê o jogo rolando.
3. `BracketMatchNode` (`.../tournaments/presentation/widgets/bracket/bracket_match_node.dart`) —
   no sheet de detalhe do nó, não no nó em si (não cabe).

Estados: `Seguir` → `Seguindo` (com o ponto pulsante de `TournamentMatchCardLiveDot`, reusado). O
botão só aparece para partida `Scheduled` ou `In Progress` — seguir jogo encerrado não faz sentido
e evita lixo no banco.

Exige login. Sem sessão, o toque manda pro login com deep link pendente, o mesmo mecanismo de
`pendingDeepLinkPathProvider`.

### Onde mora o "seguindo"

Duas metades, cada uma resolvendo um problema diferente:

**Metade 1 — Firestore, para a UI e para re-sincronizar.**

```
users/{uid}/followedMatches/{matchId}
  { matchId, tournamentId, categoryId, followedAt, source: 'manual' }
```

Subcoleção do próprio usuário: as rules são uma linha (`allow read, write: if isOwner(uid)`), não
há fan-out lendo daqui, e a lista "Acompanhando" do app é uma query direta.

**Metade 2 — tópico FCM, para a entrega.**

O app assina `match-{matchId}-android` ou `match-{matchId}-ios` conforme a plataforma
(`FirebaseMessaging.instance.subscribeToTopic`).

**Por que tópico e não fan-out por token.** Com tópico, o backend faz **um** `send()` por
atualização, não importa se a partida tem 3 ou 300 seguidores: nada de ler `users/{uid}/tokens`
de cada seguidor, nada de limpar token inválido, nada de lote de 500. Numa etapa com 8 quadras
simultâneas isso é a diferença entre milhares de escritas/leituras por hora e algumas dezenas de
`send()`.

O preço é que o backend perde o filtro por usuário — não dá pra respeitar `quietHours` nem
`notificationPreferences.topics`
(`nexago_app/lib/features/athlete/domain/athlete_notification_preferences.dart:129`) do lado de lá.
**É a decisão certa aqui:** seguir é opt-in por partida, o atleta pediu esse jogo específico. Silêncio
noturno não deve engolir o match point que ele escolheu acompanhar. O controle fica no botão
"Seguindo", que desliga na hora.

**Por que dois tópicos e não um.** Android e iOS precisam de mensagens de formato diferente
(ver "O formato da mensagem"), e uma mensagem só não consegue ser data-only para um e alerta para o
outro. Dois tópicos, dois `send()` — ainda O(1) por partida.

### Ciclo de vida da assinatura

- **Seguir:** grava o doc + `subscribeToTopic`. Nessa ordem — se o subscribe falhar, o doc fica e o
  re-sync conserta no próximo boot.
- **Deixar de seguir:** `unsubscribeFromTopic` + apaga o doc.
- **Re-sync no boot** (`NotificationService.initialize`, após resolver a sessão): lê
  `followedMatches`, e para cada uma reassina o tópico. Idempotente. É o que cobre troca de
  aparelho, reinstalação e rotação de token.
- **Fim da partida:** o próprio push de `Completed` traz `action: 'end'`; o cliente derruba a
  notificação, desassina e apaga o doc.
- **Varredura:** `onSchedule` diário apaga `followedMatches` cuja partida está `Completed`/`Canceled`
  há mais de 48h — a rede de segurança para quem nunca mais abriu o app. Assinatura órfã de tópico
  é inofensiva (tópico de partida morta nunca mais recebe mensagem) e o FCM a limpa quando o token
  morre.

## Parte 2 — O fan-out

Arquivo novo: `functions/src/match-live-follow-notify.ts`.

### O gatilho

`onDocumentUpdated('artifacts/{appId}/public/data/matches/{matchId}')`.

**O risco a nomear: laço de escrita.** A function não pode escrever no doc do match — ela se
re-dispararia. O estado de throttle vive num **doc irmão, em outra coleção**:

```
matchLiveNotify/{matchId}
  { lastPushAt, lastSignature, lastKind }
```

Coleção nova, fora de `artifacts/`, sem gatilho nenhum em cima. Escrever ali não re-dispara nada.

### O que merece um push

Núcleo puro e testável, `resolveLiveUpdate(before, after, sidecar, now)`, no espírito de
`updateLiveMatchScoreCore` e `revertToScheduledFields` — a lógica separada do wrapper `onCall`/
`onDocumentUpdated` para o teste travar o comportamento sem emulador.

| Transição | Tipo | Entrega |
|---|---|---|
| `Scheduled` → `In Progress` | `start` | imediato, com som |
| contagem de sets mudou (`liveScore.setsA/B` ou `sets.length`) | `set` | imediato, com som |
| set point / match point alcançado | `matchPoint` | imediato, com som |
| → `Completed` | `end` | imediato, com som |
| → `Canceled`, ou volta pra `Scheduled` | `dismiss` | imediato, silencioso |
| ponto comum | `score` | **só se passaram ≥ 20s** desde `lastPushAt` |

Set point / match point sai de `functions/src/match-scoring.ts`, que já tem
`DEFAULT_SET_POINTS = 21`, `TIEBREAK_SET_POINTS = 15`, `MIN_ADVANTAGE = 2` e `DEFAULT_BEST_OF = 3`
(`functions/src/match-scoring.ts:6`) — a regra de "quantos pontos faltam pra fechar" já está escrita,
não se reimplementa aqui.

`lastSignature` é o placar serializado. Update que não move o placar (a mesa corrigiu `courtName`,
o `updatedAt` mexeu sozinho) tem a mesma assinatura e **não gera push** — vale mesmo para os tipos
imediatos, o que também protege contra reentrega dupla do gatilho.

**A concessão deliberada do throttle.** Um `score` engolido pela janela não é reenviado depois; ele
só aparece no próximo ponto que passar da janela. Numa partida em andamento os pontos chegam de
sobra. O caso ruim é uma rajada de pontos seguida de 3 minutos de pausa — a tela bloqueada mostra
um placar levemente atrasado até o próximo ponto. Aceitamos: os momentos que importam (`set`,
`matchPoint`, `end`) nunca são engolidos, e abrir o app mostra o placar exato via listener.

A alternativa — flush agendado — custa Cloud Tasks ou um `onSchedule` de 1 minuto (o mínimo do
Scheduler), que é mais lento que a própria janela de 20s. Não compensa.

### O formato da mensagem

Dois `send()`, um por tópico.

**Android — `match-{matchId}-android`, data-only.** Sem bloco `notification`: com ele presente, o
sistema desenha a notificação sozinho e o isolate de background do Dart não roda de forma
confiável — e é exatamente o isolate que precisa rodar pra atualizar a notificação fixa.

```
{ topic, data: { type: 'match_live_score', action, matchId, tournamentId,
                 teamA, teamB, scoreLine, setsLine, statusLabel, courtName,
                 url: '/torneios/{tid}/ao-vivo/{mid}' },
  android: { priority: 'high' } }
```

**iOS — `match-{matchId}-ios`, alerta que se substitui.**

```
apns.headers: { 'apns-collapse-id': 'match-{matchId}',
                'apns-priority': kind === 'score' ? '5' : '10',
                'apns-push-type': 'alert' }
apns.payload.aps: { alert: {title, body},
                    'interruption-level': kind === 'score' ? 'passive' : 'active',
                    sound: kind === 'score' ? undefined : 'default' }
```

O `collapse-id` é o que faz a atualização **substituir** a anterior em vez de empilhar: uma linha
só por partida na tela bloqueada, sempre com o placar atual. `passive` + sem som mantém as
atualizações de rotina mudas; set e match point tocam.

O `url` no `data` é o que faz o toque abrir a transmissão — `resolveNotificationRoute` já o
devolve tal e qual (`notification_navigation.dart:95`), sem tocar no resolver.

## Parte 3 — A tela bloqueada no Android

Onde a Fase 1 realmente entrega o pedido.

`firebaseMessagingBackgroundHandler` (`notification_service.dart:18`) hoje só loga. Passa a
despachar: `data['type'] == 'match_live_score'` cai num
`MatchLiveNotification.handle(data)` novo, em `lib/core/notifications/match_live_notification.dart`.

**Dois canais**, porque as duas coisas têm ritmos opostos:

| Canal | Importância | Papel |
|---|---|---|
| `match_live` | `Importance.low` | o placar fixo — atualiza sem barulho |
| `match_live_alerts` | `Importance.high` | set, match point, fim — vibra uma vez |

Hoje só existe o canal `default` (`foreground_local_notifications.dart:18`); os dois novos são
criados junto dele.

**A notificação fixa:**

```dart
AndroidNotificationDetails(
  'match_live', 'Placar ao vivo',
  importance: Importance.low,        // aparece na tela bloqueada, não faz heads-up
  priority: Priority.low,
  ongoing: true, autoCancel: false, onlyAlertOnce: true, showWhen: false,
  visibility: NotificationVisibility.public,   // conteúdo visível na tela bloqueada
  category: AndroidNotificationCategory.event,
  styleInformation: BigTextStyleInformation(...),
)
```

Id estável derivado do `matchId` (`matchId.hashCode & 0x7fffffff`), para que cada push **substitua**
a notificação em vez de criar outra. `Importance.low` é o ponto de equilíbrio: `min` sumiria da
barra de status, `default` faria heads-up a cada ponto.

Momento-chave posta uma **segunda** notificação, transitória, no canal de alertas, id diferente,
`autoCancel: true`. O placar fixo continua onde está e o atleta sente a vibração. `action: 'end'`
e `'dismiss'` cancelam a fixa.

**Limites honestos, para não prometer o que o Android não dá:**

- `POST_NOTIFICATIONS` já está no manifesto
  (`nexago_app/android/app/src/main/AndroidManifest.xml:9`) — nada a pedir para a Fase 1.
- No Android 14+ o usuário pode dispensar notificação `ongoing` que não seja de foreground service.
  Isso é desejável, não bug.
- OEM agressivo (Xiaomi, Samsung com otimização pesada) pode segurar data message com o app
  force-stopped. Mensagem `high priority` é o máximo que o FCM oferece; um foreground service
  resolveria e custa `FOREGROUND_SERVICE_SPECIAL_USE` + justificativa na Play Store. **Fora de
  escopo** — Uber e iFood conseguem foreground service porque têm tipo legítimo (`location`);
  placar de partida não tem.
- **Frescor visível.** O throttle de 20s deixa o placar defasado por projeto. A notificação carrega
  `updatedAt` e o corpo diz "há Xs" quando passa de 60s, em vez de exibir um número velho como se
  fosse atual. É o `staleDate` do ActivityKit feito à mão — a mesma ideia, um nível abaixo.

### Android 16: Live Updates e o portão de elegibilidade

O Android 16 trouxe **Live Updates** — `FLAG_PROMOTED_ONGOING` promove a notificação a chip na
barra de status e a destaque na tela bloqueada
([docs](https://developer.android.com/develop/ui/views/notifications/live-update)). É o upgrade
natural desta entrega, **mas não é automático**: o Google filtra por critério de uso, e a
documentação diz explicitamente que **placar esportivo não qualifica** — é informação ambiente, não
iniciada pelo usuário.

A exceção, também explícita na doc: **qualifica quando o usuário optou por monitorar aquele jogo**,
com uma ação de desafixar.

**Consequência de projeto, não detalhe:** o botão manual "Seguir" é o que nos torna elegíveis.
Auto-seguir minhas partidas transformaria isso em informação ambiente e o Android deixaria de
promover. A decisão de UX da Parte 1 é também a decisão técnica — e é por isso que auto-seguir, se
um dia entrar, precisa continuar sendo uma **preferência que o atleta liga**, nunca um padrão.

Requisitos para a promoção, quando formos buscá-la:

- `POST_PROMOTED_NOTIFICATIONS` no manifesto (permissão nova, além da que já temos).
- `setRequestPromotedOngoing(true)` + `setOngoing(true)` + `contentTitle` preenchido.
- Estilo entre os permitidos: Standard, `BigTextStyle`, `CallStyle`, `ProgressStyle`, `MetricStyle`.
  **`MetricStyle` é o candidato certo para placar** — `ProgressStyle` foi desenhado para jornada com
  etapas (corrida, entrega), que não é a nossa forma.
- Desqualificam: `RemoteViews` customizado, `setGroupSummary(true)`, `setColorized(true)`, canal
  com `IMPORTANCE_MIN`.

Duas dessas travas já estão respeitadas de graça pelo desenho da Fase 1: usamos
`BigTextStyleInformation` (permitido) e canal `Importance.low` (só `MIN` desqualifica). **Não
introduzir `RemoteViews` customizado** na Fase 1 é o que mantém a porta aberta — fica registrado
aqui porque é a tentação óbvia de quem for desenhar um placar bonito.

Verificação em runtime: `Notification.hasPromotableCharacteristics()` e
`NotificationManager.canPostPromotedNotifications()`.

## Parte 4 — O iOS na Fase 1

Sem Live Activity ainda: o `collapse-id` dá uma **linha de placar na tela bloqueada que se
substitui sozinha**, silenciosa nas atualizações de rotina e sonora nos momentos-chave. É o que dá
pra fazer sem extension.

O que **não** se tem até a Fase 2: card persistente, Dynamic Island, e a notificação continua
sujeita a o usuário limpar a Central de Notificações. A UI deve ser honesta — o botão diz
"Seguindo" nas duas plataformas, mas o texto de apoio no iOS fala em "avisos do jogo", não em
"placar fixo".

## Parte 5 — Dentro do app

Uma seção **"Acompanhando"** no hub, alimentada por `followedMatches`, reusando `FocusMatchCard`
como o plano do site reusou `TournamentCard`. Some quando a lista está vazia. É também o lugar
onde o atleta desfaz o follow sem caçar a partida.

## Fase 2 — Live Activity no iOS (esboço, sem tarefas)

Registrado agora para que a Fase 1 não feche nenhuma porta. O backend da Fase 1 é reaproveitado
inteiro: mesmo gatilho, mesmo `resolveLiveUpdate`, mesmo throttle — muda só o transporte.

**O erro a não cometer: copiar o Uber.** Uber, iFood e 99 são **1:1** — uma corrida, uma activity,
um device; o backend guarda um push token e manda um push por evento, sem fan-out nenhum. Nós somos
**1:N**: uma partida, N seguidores. É o problema de ESPN e FotMob, não o do Uber. Seguir o padrão
deles nos levaria a guardar um token por seguidor e mandar N pushes por ponto.

**Transporte: broadcast channels, não push por token.** A resposta da Apple para 1:N são os
*channels* ([WWDC24](https://developer.apple.com/videos/play/wwdc2024/10069/)): publica-se **uma vez**
num canal e o APNs distribui para todos os inscritos. Zero token armazenado. Um canal por partida —
o mesmo modelo mental do tópico FCM da Fase 1, o que torna as duas fases simétricas. A opção **"No
Message Storage" tem orçamento de publicação maior**, pensada exatamente para placar esportivo; é a
que queremos. Push por token de activity fica como fallback para iOS abaixo da versão que suporta
canais.

- **Target novo** `NexagoLiveActivity` (Widget Extension), deployment target **16.2**, App Group
  `group.br.com.nexago.liveactivity`. O app principal fica em iOS 15
  (`nexago_app/ios/Podfile:3`, travado pelo `recaptcha_enterprise_flutter`) — a extension pode ter
  alvo mais alto e simplesmente não instala em iOS 15, com `if #available` na ponte.
- `NSSupportsLiveActivities: true` no `Info.plist` do Runner, mais
  `NSSupportsLiveActivitiesFrequentUpdates` para pedir orçamento maior de atualização (o sistema
  ainda pode estrangular).
- `ActivityAttributes` estático (matchId, nomes, categoria, quadra) + `ContentState` (sets, games,
  set atual, saque, status).
- **`staleDate` é obrigatório, não enfeite.** É como esses apps sobrevivem a push perdido: declara-se
  quando o dado apodrece e o widget renderiza sozinho um estado "desatualizado" em vez de exibir um
  placar velho como se fosse atual. Com a janela de 20s do throttle, `staleDate = updatedAt + 90s`.
- **Reconciliação no foreground.** Push é best-effort. Ao voltar para o primeiro plano, o app relê a
  partida e chama `activity.update()` com a verdade do Firestore, sem esperar o próximo push.
- **Limite duro da plataforma:** 8h de atualizações ativas, até 12h na tela bloqueada. Irrelevante
  para uma partida; relevante no dia em que alguém seguir uma etapa inteira.
- **Primeira ponte nativa do app:** `MethodChannel('br.com.nexago/live_activity')` com
  `isSupported/start/update/end`, mais um `EventChannel` para o push token. Pacotes de prateleira
  (`live_activities`, `flutter_activity_kit`) resolvem **a ponte**, não o design — a Widget
  Extension em Swift continua sendo trabalho nosso.
- **O FCM não entrega ActivityKit.** A function precisa falar APNs direto: HTTP/2, JWT de chave
  `.p8` no Secret Manager, `apns-push-type: liveactivity`,
  `apns-topic: br.com.nexago.nexagoApp.push-type.liveactivity`.
- iOS 17.2+: push-to-start — a partida entra ao vivo e a activity nasce sem o app aberto (casa com
  a chamada pra quadra).

## Fora de escopo

- Auto-seguir (minhas partidas, dupla, atletas que sigo) e seguir o torneio inteiro — o botão
  manual primeiro; o modelo `followedMatches` já comporta os outros via `source`. **Se um dia
  entrar, tem que ser opção que o atleta liga, não padrão** — ver o portão de elegibilidade do
  Android 16 acima.
- Amistosos (`features/friendly_match/`): não têm placar ao vivo ponto a ponto, seguir não teria o
  que mostrar.
- Foreground service no Android.
- Widget de home screen.
- Respeitar `quietHours` no fan-out (decisão consciente, ver "Onde mora o seguindo").

## Testes

Espinha dorsal em núcleos puros, como o resto do repo faz:

**Functions (`*.test.ts`, sem emulador):**
- `resolveLiveUpdate` — a tabela inteira de transições, um caso por linha.
- Throttle: `score` dentro da janela não empurra; fora da janela empurra; `set` empurra sempre,
  janela ou não.
- Assinatura idêntica não empurra (protege contra reentrega do gatilho).
- Set point e match point em `bestOf` 1 e 3, set normal (21) e tiebreak (15).
- `dismiss` no revert para `Scheduled` — pareado com `revertToScheduledFields`, que já apaga
  `liveScore`.

**Flutter (`flutter-test-engineer`):**
- Construção do payload → conteúdo da notificação (linha de placar, sets, labels).
- Rótulo de frescor: até 60s sem sufixo; acima disso, "há Xs"/"há Xmin" a partir de `updatedAt`.
- Id estável por `matchId`: dois pushes da mesma partida, uma notificação só.
- `FollowMatchButton`: alterna estado, esconde em partida encerrada, manda pro login sem sessão.
- Re-sync no boot: N docs em `followedMatches` → N `subscribeToTopic`, idempotente.

**Manual, antes de 24/10:** Android físico com o app fechado, mesa marcando ponto de outro
aparelho, celular bloqueado — o placar tem que mudar sozinho na tela bloqueada. Repetir com o
aparelho em Doze (`adb shell dumpsys deviceidle force-idle`).
