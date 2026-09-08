# Seguir partida e placar na tela bloqueada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Seguir partida" no app + placar ao vivo se atualizando sozinho na tela bloqueada do Android (notificação fixa) e linha de placar que se substitui no iOS (`apns-collapse-id`), alimentados por um fan-out por tópico FCM disparado pela própria escrita da mesa.

**Architecture:** Um gatilho `onDocumentUpdated` no doc do match decide, num núcleo puro (`resolveLiveUpdate`), se aquela escrita merece push; um doc irmão em `matchLiveNotify/{matchId}` guarda throttle e rótulos das duplas (evitando laço de escrita e o join `teams`→`public_profiles` a cada ponto); a entrega é por **tópico FCM por partida e por plataforma**, então é um `send()` por atualização independente do número de seguidores. No app, `users/{uid}/followedMatches/{matchId}` guarda o que o atleta segue (para a UI e o re-sync) e o `firebaseMessagingBackgroundHandler` — hoje um `debugPrint` — passa a construir/atualizar a notificação fixa do Android.

**Tech Stack:** Firebase Functions v2 (Node 22, TypeScript) com `node:test`; Flutter 3 + Riverpod + `flutter_local_notifications` 22; `@firebase/rules-unit-testing` sob emulador para as rules.

**Spec:** `docs/superpowers/specs/2026-09-05-seguir-partida-tela-bloqueada-design.md`

## Global Constraints

- **Comandos das functions rodam de `functions/`.** `npm ci` primeiro (o container onde este plano foi escrito não tinha `node_modules`). Baseline medida em 2026-09-08: **`npm test` → 1749 pass, 0 fail, 340 suites**. Se a contagem não subir a cada task de backend, você está rodando a árvore errada.
- **Comandos do app rodam de `nexago_app/`:** `flutter test` e `flutter analyze`. **Baseline não
  medida e tasks de Flutter escritas SEM execução** — não havia Flutter no container. Todo passo
  de execução das Tasks 6-11 está marcado `[~]` (escrito, não rodado). Rode a suíte antes de
  confiar em qualquer uma delas.
- `npm test` compila para `lib/` antes de rodar (`npm run build && node --test lib/*.test.js`). Todo `src/*.test.ts` novo é coletado sozinho — não precisa mexer no script.
- Rules test é separado, sob emulador, e **não** entra no `npm test`. Padrão:
  `firebase emulators:exec --only firestore --project <id> "node --test test/<arquivo>.rules.test.mjs"`.
  **`firebase-tools` não é dependência do repo** — instale (`npm i --no-save firebase-tools`) ou
  use o global. Baseline de 2026-09-08: as 10 suítes de rules existentes somam 108 testes, 0 falhas.
- **UI em português, código em inglês** (convenção do repo).
- `flutter-test-engineer` deve ser acionado nas tasks de Flutter (`CLAUDE.md`).
- **Não introduzir `RemoteViews` customizado no Android** — desqualifica a promoção a Live Update do Android 16 (ver spec, "portão de elegibilidade").

---

### Task 1: `resolveLiveUpdate` — o que merece um push (TDD)

**Files:**
- Create: `functions/src/match-live-follow-notify.ts`
- Test: `functions/src/match-live-follow-notify.test.ts`

**Interfaces:**
- Consumes: `isSetWon`, `targetPointsForSet`, `DEFAULT_BEST_OF` de `./match-scoring`; `MatchStatus`/helpers de `./match-status`.
- Produces:
  ```ts
  export type LiveUpdateKind = 'start' | 'set' | 'matchPoint' | 'score' | 'end' | 'dismiss';
  export interface LiveMatchSnapshot {
    status: string; sets: Array<{a: number; b: number}>;
    liveScore: {setsA: number; setsB: number; currentGamesA: number; currentGamesB: number} | null;
    currentSetIndex: number | null; bestOf: number | null;
  }
  export interface NotifySidecar { lastPushAt: number | null; lastSignature: string | null }
  export interface PointAlert { side: 'A' | 'B'; closesMatch: boolean }
  export interface LiveUpdateDecision {
    push: boolean; kind: LiveUpdateKind | null; signature: string;
    reason: string; pointAlert: PointAlert | null;
  }
  export const SCORE_THROTTLE_MS = 20_000;
  export function liveScoreSignature(m: LiveMatchSnapshot): string;
  export function resolveLiveUpdate(
    before: LiveMatchSnapshot, after: LiveMatchSnapshot,
    sidecar: NotifySidecar, nowMs: number,
  ): LiveUpdateDecision;
  ```

- [x] **Step 1: Escrever o teste que falha**

  Cobrir a tabela inteira da spec, um `test()` por linha, mais as bordas:
  - `Scheduled` → `In Progress` ⇒ `kind: 'start'`, `push: true`.
  - contagem de sets **vencidos** sobe ⇒ `'set'`, em dois testes: pelo `liveScore.setsA/B` (mesa web) e pelo `sets[]` (mesa do app). **Não use `sets.length`**: `applyPoint` (`match_scoring_logic.dart:159`) só cria o set seguinte no primeiro ponto dele, então quando um set fecha o array não muda de tamanho. Quem detecta é `setsWon()`.
  - **alerta só na ENTRADA em set/match point**: 20x15 → 20x16 continua sendo match point e não pode alertar de novo, senão a notificação vibra a cada ponto do adversário até o set fechar.
  - set point e match point ⇒ `'matchPoint'`, em `bestOf: 1` e `bestOf: 3`, set normal (alvo 21) e decisivo (alvo 15) — use `targetPointsForSet`, não constante literal.
  - → `Completed` ⇒ `'end'`. → `Canceled` ⇒ `'dismiss'`. `In Progress` → `Scheduled` ⇒ `'dismiss'`.
  - ponto comum com `lastPushAt` a 5s ⇒ `push: false`; a 25s ⇒ `push: true, kind: 'score'`.
  - **`'set'` ignora o throttle**: `lastPushAt` a 1s e set fechado ⇒ `push: true`.
  - **assinatura igual ⇒ nunca empurra**, mesmo para `kind` imediato (protege contra reentrega do gatilho): `before` e `after` com mesmo placar mas `updatedAt` diferente ⇒ `push: false`.
  - `liveScore: null` nos dois lados e status inalterado ⇒ `push: false`.

- [x] **Step 2: Rodar e confirmar que falha** — `npm test` (falha de compilação conta como falha esperada aqui).

- [x] **Step 3: Implementar `resolveLiveUpdate` e `liveScoreSignature`**

  Ordem de decisão: `dismiss` → `end` → `start` → `set` → `matchPoint` → `score` (throttled). A checagem de assinatura vem ANTES de tudo e curto-circuita.

  `liveScoreSignature` serializa só o que é placar, já normalizado
  (`status|setsVencidosA|setsVencidosB|pontosA|pontosB|currentSetIndex`) — nunca `updatedAt`.

  Set/match point: com `targetPointsForSet(currentSetIndex, bestOf)` e `MIN_ADVANTAGE`, é match point quando o time que está a 1 ponto do alvo (com vantagem) fecharia também a partida em `bestOf`.

- [x] **Step 4: Rodar e confirmar que passa** — `npm test`, contagem acima de 1749, 0 falhas.

- [x] **Step 5: Commit** — `feat(functions): resolveLiveUpdate decide o push do placar ao vivo`

---

### Task 2: `buildMatchLiveMessages` — as duas mensagens FCM (TDD)

**Files:**
- Modify: `functions/src/match-live-follow-notify.ts`
- Modify: `functions/src/match-live-follow-notify.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function matchLiveTopics(matchId: string): {android: string; ios: string};
  export interface MatchLiveContext {
    matchId: string; tournamentId: string;
    teamALabel: string; teamBLabel: string; courtName: string;
    scoreLine: string; setsLine: string; statusLabel: string; updatedAtMs: number;
    pointAlert: PointAlert | null;   // distingue set point de match point no texto
  }
  export function buildMatchLiveMessages(
    kind: LiveUpdateKind, ctx: MatchLiveContext,
  ): [TopicMessage, TopicMessage];
  // Formatacao saiu do gatilho para ca, onde ha teste:
  export function buildMatchLiveContext(params: {
    matchId; tournamentId; teamALabel; teamBLabel; courtName;
    snapshot: LiveMatchSnapshot; decision: LiveUpdateDecision; updatedAtMs: number;
  }): MatchLiveContext;
  ```

- [x] **Step 1: Escrever o teste que falha**

  - `matchLiveTopics` **sanitiza** o id para o alfabeto de tópico do FCM (`[a-zA-Z0-9-_.~%]`): id com caractere fora da faixa vira `_`. Ids diferentes nunca colidem depois de sanitizados (inclua um caso com dois ids que só diferem no caractere inválido — devem gerar tópicos distintos, então sanitize com sufixo de hash, não substituição cega).
  - Mensagem Android **não tem** bloco `notification` (é o que faz o isolate Dart rodar) e tem `android.priority: 'high'`.
  - Mensagem Android carrega `type: 'match_live_score'`, `action`, `matchId`, `updatedAt` e `url: '/torneios/{tid}/ao-vivo/{mid}'`; **todos os valores são string** (exigência do FCM — reuse `coerceNotificationData` de `./notification-delivery`).
  - iOS: `apns-collapse-id === 'match-{matchId}'` sempre; `apns-priority === '5'` e `interruption-level: 'passive'` e **sem `sound`** quando `kind === 'score'`; `'10'`/`active`/`sound: 'default'` nos demais.
  - `kind: 'dismiss'` e `'end'` levam `action` correspondente no `data`.

- [x] **Step 2: Rodar e confirmar que falha**

- [x] **Step 3: Implementar** — reusando `coerceNotificationData` (`functions/src/notification-delivery.ts:66`) em vez de reescrever a coerção.

- [x] **Step 4: Rodar e confirmar que passa**

- [x] **Step 5: Commit** — `feat(functions): payloads FCM do placar ao vivo por plataforma`

---

### Task 3: O gatilho, o sidecar e os rótulos das duplas

**Files:**
- Modify: `functions/src/match-live-follow-notify.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces (puros, com teste): `snapshotFromMatchData(data)` — doc cru do Firestore para
  `LiveMatchSnapshot`, tolerante a campo faltando e a entrada corrompida em `sets`;
  `pairLabelFrom(team, profiles, fallback)` — `teamName` > apelido > nome completo, mesma
  ordem de `resolveAppUserDisplayName` no app.
- Produces: `export const onMatchLiveScoreChanged` (`onDocumentUpdated('artifacts/{appId}/public/data/matches/{matchId}')`); exportado em `index.ts` junto dos demais.

**O ponto sensível:** a function **não pode escrever no doc do match** — ela se re-dispararia. Todo estado vai para `matchLiveNotify/{matchId}`, coleção nova sem gatilho.

- [x] **Step 1: Implementar o gatilho**

  1. Lê `before`/`after`, monta os `LiveMatchSnapshot`. Toda formatação já está em
     `buildMatchLiveContext` (Task 2) — o gatilho não monta texto.
  2. Lê `matchLiveNotify/{matchId}`.
  3. `resolveLiveUpdate(...)`. Se `push: false`, retorna **sem gravar nada**: o sidecar só
     guarda o que foi realmente notificado. Gravar assinatura a cada ponto engolido pelo
     throttle dobraria as escritas da partida e não protegeria nada — reentrega de evento
     throttled também não empurraria.
  4. Resolve rótulos das duplas: se o sidecar já tem `teamALabel`/`teamBLabel`, usa; senão faz o join `teams/{teamId}` → `player1Id`/`player2Id` → `public_profiles` (fallback `teamName`, depois `teamADescription`/`teamBDescription`, depois `'Dupla A'`/`'Dupla B'`) e **grava no sidecar**. O join acontece uma vez por partida, não por ponto.
  5. `getMessaging().send()` nas duas mensagens, em `Promise.allSettled` — falha de uma plataforma não derruba a outra.
  6. Grava `{lastPushAt, lastSignature, lastKind, teamALabel, teamBLabel}`.

- [x] **Step 2: Guardas obrigatórias**
  - `try/catch` no envio, com `logger.error` — o gatilho nunca pode lançar e virar retry infinito em cima da mesa.
  - Ignorar update cujo `after` não é partida de torneio válida (sem `tournamentId`).

- [x] **Step 3: Exportar em `index.ts`** — seguindo o padrão dos outros (`export {onMatchLiveScoreChanged} from "./match-live-follow-notify";`).

- [x] **Step 4: Type-check e suíte** — `npm run lint` (é `tsc --noEmit`) e `npm test` sem regressão.

- [x] **Step 5: Commit** — `feat(functions): gatilho de fan-out do placar ao vivo por topico`

---

### Task 4: Rules de `followedMatches` e `matchLiveNotify`

**Files:**
- Modify: `firestore.rules`
- Test: `functions/test/followed-matches.rules.test.mjs`

**Interfaces:**
- `users/{userId}/followedMatches/{matchId}` — dono lê e escreve.
- `matchLiveNotify/{matchId}` — **ninguém** pelo cliente (só Admin SDK).

- [x] **Step 1: Escrever o teste que falha** — no padrão de `functions/test/mesa-scorer-point.rules.test.mjs`:
  - dono cria/lê/apaga o próprio `followedMatches` ⇒ `assertSucceeds`.
  - outro uid lê ou escreve o `followedMatches` alheio ⇒ `assertFails`.
  - não autenticado ⇒ `assertFails`.
  - qualquer cliente, autenticado ou não, lendo ou escrevendo `matchLiveNotify/{id}` ⇒ `assertFails`.

- [x] **Step 2: Rodar e confirmar que falha** — `firebase emulators:exec --only firestore --project nexago-followed-matches-test "node --test test/followed-matches.rules.test.mjs"`

- [x] **Step 3: Implementar as rules** — `followedMatches` copia o formato de
  `users/{userId}/favorites/{arenaId}` (`firestore.rules:1709`), que é exatamente o mesmo caso.
  `matchLiveNotify` recebe `allow read, write: if false;` — o Admin SDK ignora rules.
  **Os 3 testes de `matchLiveNotify` já passam antes desta regra**, porque o catch-all do fim
  do arquivo nega tudo que não está mapeado. A regra explícita entra assim mesmo: documenta a
  decisão e sobrevive a qualquer afrouxamento do catch-all.

- [x] **Step 4: Rodar e confirmar que passa** — e rodar TAMBÉM as outras 10 suítes
  `test/*.rules.test.mjs`: `firestore.rules` é um arquivo só e um `match` novo pode alterar o
  OR de `allow` de caminhos vizinhos.

- [x] **Step 5: Commit** — `feat(rules): followedMatches do atleta e matchLiveNotify fechado`

---

### Task 5: Varredura de follows órfãos

**Files:**
- Modify: `functions/src/match-live-follow-notify.ts`
- Modify: `firestore.indexes.json` (índice de collection group, ver Step 1)

**Interfaces:**
- Produces: `export const sweepStaleFollowedMatches` (`onSchedule`, diário).

- [x] **Step 1: Implementar** — núcleo puro `staleFollowPaths(candidates, matches, nowMs)` com
  teste; apaga quando `Completed`/`Canceled` há mais de 48h ou quando a partida sumiu.
  **Conservador:** partida que a varredura não conseguiu ler fica de fora da lista — apagar o
  follow de uma partida que ainda vai acontecer é pior que deixar lixo.
  **`orderBy('followedAt')` é obrigatório**, não enfeite: com lote fixo e sem ordenação, a
  varredura examinaria sempre os mesmos primeiros docs e nunca alcançaria o lixo. Isso exige
  um índice de escopo `COLLECTION_GROUP` em `followedAt` — primeiro `fieldOverrides` do repo.
  Uma leitura por partida DISTINTA, não por follow: numa etapa, dezenas seguem o mesmo jogo.
- [x] **Step 2: Exportar em `index.ts`, type-check, suíte.**
- [x] **Step 3: Commit** — `feat(functions): varredura diaria de partidas seguidas encerradas`

---

### Task 6: `matchLiveNotificationContent` — texto e id da notificação (TDD)

**Files:**
- Create: `nexago_app/lib/core/notifications/match_live_notification_content.dart`
- Test: `nexago_app/test/core/notifications/match_live_notification_content_test.dart`

Núcleo puro, sem plugin — é o que dá para testar de verdade. O plugin entra na Task 7.

**Interfaces:**
```dart
// `set` e `end` viraram `setEnded`/`ended`: o valor de fio continua 'set'/'end'.
enum MatchLiveAction { start, setEnded, matchPoint, score, ended, dismiss }
class MatchLiveNotificationContent {
  final String title, body, matchId, url;
  final MatchLiveAction action;
  final bool alerts;          // true => canal de alertas, vibra
  int get notificationId;     // estável por matchId
}
MatchLiveNotificationContent? matchLiveNotificationContentFrom(
  Map<String, dynamic> data, {DateTime? now});
String freshnessSuffix(DateTime updatedAt, DateTime now);
```

- [x] **Step 1: Escrever o teste que falha**
  - `type` diferente de `match_live_score` ⇒ `null` (não sequestra outras notificações).
  - payload sem `matchId` ⇒ `null`.
  - `notificationId` é estável para o mesmo `matchId` e diferente entre ids distintos; sempre positivo (`hashCode & 0x7fffffff`).
  - `alerts` é `true` para `set`/`matchPoint`/`end`/`start` e `false` para `score`.
  - **Frescor:** `updatedAt` a 20s ⇒ sufixo vazio; a 90s ⇒ `"há 1min"`; a 5s ⇒ vazio. Fronteira exata em 60s.
  - Corpo traz linha de placar e linha de sets vindas do `data`, sem recalcular nada.

- [~] **Step 2: Rodar e confirmar que falha** — NÃO EXECUTADO: sem Flutter no container em que
  esta task foi escrita. Rode `flutter test test/core/notifications/match_live_notification_content_test.dart`.
- [x] **Step 3: Implementar**
- [~] **Step 4: Rodar a suíte inteira** — NÃO EXECUTADO pelo mesmo motivo. `flutter test` +
  `flutter analyze`. São 26 testes novos neste arquivo.
- [x] **Step 5: Commit** — `feat(app): conteudo da notificacao de placar ao vivo`

---

### Task 7: Canais Android e despacho no handler de background

**Files:**
- Modify: `nexago_app/lib/core/notifications/foreground_local_notifications.dart`
- Modify: `nexago_app/lib/core/notifications/notification_service.dart`
- Create: `nexago_app/lib/core/notifications/match_live_notification.dart`

**Interfaces:**
- Produces: `MatchLiveNotification.handle(Map<String, dynamic> data)` — mostra, atualiza ou cancela; e `MatchLiveNotification.ensureChannels()`.

- [ ] **Step 1: Criar os dois canais** junto do `default` que já existe (`foreground_local_notifications.dart:18`):
  - `match_live` / "Placar ao vivo" / `Importance.low`
  - `match_live_alerts` / "Momentos do jogo" / `Importance.high`

- [ ] **Step 2: Implementar `MatchLiveNotification.handle`**

  Fixa, no canal `match_live`:
  ```dart
  AndroidNotificationDetails(
    'match_live', 'Placar ao vivo',
    importance: Importance.low, priority: Priority.low,
    ongoing: true, autoCancel: false, onlyAlertOnce: true, showWhen: false,
    visibility: NotificationVisibility.public,
    category: AndroidNotificationCategory.event,
    styleInformation: BigTextStyleInformation(...),
  )
  ```
  `action: end`/`dismiss` cancelam por `notificationId`. Quando `content.alerts`, posta **também** uma notificação transitória no canal de alertas, id `notificationId + 1`, `autoCancel: true` — a fixa continua onde está.

  **Não usar `RemoteViews`/`styleInformation` customizado** (ver Global Constraints).

- [ ] **Step 3: Ligar no `firebaseMessagingBackgroundHandler`** (`notification_service.dart:18`), que hoje só faz `debugPrint`: se `matchLiveNotificationContentFrom(message.data)` devolver não-nulo, despacha para `MatchLiveNotification.handle` e retorna. Fazer o mesmo no caminho de foreground.

- [ ] **Step 4: Rodar a suíte** — `flutter test`, sem regressão.
- [ ] **Step 5: Commit** — `feat(app): notificacao fixa de placar ao vivo no Android`

---

### Task 8: `followedMatches` — repositório, providers e tópicos

**Files:**
- Create: `nexago_app/lib/features/tournaments/data/followed_matches_repository.dart`
- Create: `nexago_app/lib/features/tournaments/domain/followed_matches_providers.dart`
- Test: `nexago_app/test/features/tournaments/followed_matches_logic_test.dart`

**Interfaces:**
```dart
class FollowedMatch { final String matchId, tournamentId, categoryId, source; final DateTime followedAt; }
class FollowedMatchesRepository {
  Future<void> follow({required String uid, required TournamentMatch match});
  Future<void> unfollow({required String uid, required String matchId});
  Stream<List<FollowedMatch>> watch(String uid);
  Future<void> resyncTopics(String uid);
}
String matchTopicName(String matchId, {required bool ios});  // espelha matchLiveTopics do backend
```

- [ ] **Step 1: Escrever o teste que falha** — `matchTopicName` gera exatamente o mesmo nome que `matchLiveTopics` do backend (mesma sanitização; **duplique os casos da Task 2 aqui** — divergência entre os dois lados é silenciosa e o push simplesmente não chega).
- [ ] **Step 2: Rodar e confirmar que falha**
- [ ] **Step 3: Implementar.** `follow` grava o doc **antes** de `subscribeToTopic` (se o subscribe falhar, o re-sync conserta). `unfollow` desassina e depois apaga.
- [ ] **Step 4: Rodar a suíte** — `flutter test`
- [ ] **Step 5: Commit** — `feat(app): repositorio de partidas seguidas e topicos FCM`

---

### Task 9: `FollowMatchButton` e as três superfícies

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/follow_match_button.dart`
- Modify: `nexago_app/lib/features/tournaments/presentation/public_match_live_page.dart`
- Modify: `nexago_app/lib/features/tournaments/presentation/focus/widgets/focus_match_card.dart`
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/bracket/bracket_match_node.dart`
- Test: `nexago_app/test/features/tournaments/follow_match_button_test.dart`

- [ ] **Step 1: Escrever o teste de widget que falha**
  - partida `Completed`/`Canceled` ⇒ botão **não** renderiza.
  - sem sessão, toque grava `pendingDeepLinkPathProvider` e navega para o login.
  - com sessão, toque alterna `Seguir` ⇄ `Seguindo`.
- [ ] **Step 2: Rodar e confirmar que falha**
- [ ] **Step 3: Implementar o widget** — estado "Seguindo" reusa `TournamentMatchCardLiveDot` (`.../widgets/tournament_match_live_badge.dart`), não desenha outro ponto pulsante.
- [ ] **Step 4: Plugar nas três superfícies** — na `NexaAppBar` da página pública ao lado do share; ícone compacto no `FocusMatchCard`; no sheet de detalhe do `BracketMatchNode`, não no nó.
- [ ] **Step 5: Rodar a suíte** — `flutter test`
- [ ] **Step 6: Commit** — `feat(app): botao seguir partida nas telas de jogo`

---

### Task 10: Re-sync dos tópicos no boot

**Files:**
- Modify: `nexago_app/lib/core/notifications/notification_service.dart`

- [ ] **Step 1: Implementar** — depois de a sessão assentar em `initialize`, chamar `resyncTopics(uid)`. Idempotente; é o que cobre troca de aparelho, reinstalação e rotação de token. `try/catch` — falha de rede aqui nunca pode derrubar o boot das notificações.
- [ ] **Step 2: Rodar a suíte, commit** — `feat(app): reassina topicos das partidas seguidas no boot`

---

### Task 11: Seção "Acompanhando"

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/following_matches_section.dart`
- Modify: a home do atleta

- [ ] **Step 1: Implementar** — alimentada por `watch(uid)`, reusando `FocusMatchCard`. Some quando a lista está vazia. É também onde se desfaz o follow sem caçar a partida.
- [ ] **Step 2: Rodar a suíte, commit** — `feat(app): secao acompanhando na home do atleta`

---

### Task 12: Verificação end-to-end (manual, obrigatória antes de 24/10)

Nenhum teste automatizado cobre "a tela bloqueada atualizou sozinha". Esta task é a que valida a entrega.

- [ ] **Step 1:** Suíte completa dos dois lados — `npm test` de `functions/` (acima de 1749, 0 falhas) e `flutter test` de `nexago_app/` (acima da baseline, 0 falhas).
- [ ] **Step 2:** Deploy em dev — `npm run deploy:dev`.
- [ ] **Step 3:** Android físico, app **fechado**, celular **bloqueado**, mesa marcando ponto de outro aparelho: o placar muda sozinho na tela bloqueada, sem som, sem empilhar notificação.
- [ ] **Step 4:** Fechar um set na mesa ⇒ vibra uma vez e a notificação fixa continua lá.
- [ ] **Step 5:** Doze — `adb shell dumpsys deviceidle force-idle`, repetir o Step 3 e **anotar o resultado observado**, seja ele qual for (é o limite conhecido do Android, não um bug a esconder).
- [ ] **Step 6:** iPhone: a linha de placar se substitui em vez de empilhar; atualização de rotina não toca som.
- [ ] **Step 7:** Encerrar a partida ⇒ notificação fixa some nas duas plataformas, doc de `followedMatches` apagado, tópico desassinado.
- [ ] **Step 8:** Reportar o resultado dos 7 passos anteriores, com o que falhou.
