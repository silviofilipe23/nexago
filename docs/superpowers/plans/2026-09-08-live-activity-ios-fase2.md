# Fase 2 — Live Activity no iOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No iOS, trocar a linha de alerta da Fase 1 por um card vivo na tela bloqueada e na Dynamic Island, nascendo por push-to-start e atualizando por broadcast channel.

**Architecture:** O modelo de "seguir" da Fase 1 é reaproveitado inteiro — mesmo botão, mesma coleção, mesmo gatilho, mesmo `resolveLiveUpdate`. Muda o transporte no iOS: em vez de mensagem FCM por tópico, um **canal APNs por partida** (broadcast, O(1)) mais **push-to-start por aparelho seguidor** (O(N), uma vez por partida). O Android não é tocado.

**Spec:** `docs/superpowers/specs/2026-09-08-live-activity-ios-fase2-design.md`

## Global Constraints

- **Este container é Linux, sem Xcode e sem Swift.** As tarefas do Bloco B são escritas aqui e compiladas por quem tem Mac; os erros voltam em ciclo. As demais rodam e são verificadas aqui.
- **A ordem é deliberada:** o cliente APNs vem por ÚLTIMO. Os detalhes de fio do protocolo não puderam ser confirmados (ver "Incerteza declarada" na spec), então nada que dependa deles bloqueia o resto.
- Baselines de 2026-09-08, a bater a cada task: functions `npm test` → **1825 pass, 0 fail**; app `flutter test` → **3347 pass, 16 fail** (as 16 são pré-existentes e dependentes de data); rules → **118 pass**.
- Comparar falhas do Flutter **exige `-r json`** — o reporter padrão sobrescreve linha com `\r` e perde os nomes.
- **UI em português, código em inglês.**
- **Não remover o caminho da Fase 1 no iOS.** Ele continua servindo iOS < 18.

---

## Bloco A — o que independe do APNs (verificável aqui)

### Task 1: `ContentState` — o contrato entre backend e Swift (TDD)

O `ContentState` é o JSON que o backend manda e o Swift decodifica. É o mesmo tipo de acoplamento silencioso do nome de tópico da Fase 1: um campo renomeado de um lado e o card simplesmente para de atualizar, **sem erro em lugar nenhum**.

**Files:**
- Create: `functions/src/live-activity-content-state.ts` + `.test.ts`
- Modify: `docs/superpowers/specs/2026-09-08-live-activity-ios-fase2-design.md` (o contrato, para o Swift copiar)

**Interfaces:**
```ts
export interface MatchLiveContentState {
  setsA: number; setsB: number;          // sets vencidos
  pointsA: number; pointsB: number;      // pontos do set em jogo
  setIndex: number;                      // 0-based
  servingSide: 'A' | 'B' | null;
  status: 'live' | 'finished' | 'canceled';
  updatedAtMs: number;
  staleAfterMs: number;                  // updatedAtMs + STALE_WINDOW_MS
}
export const STALE_WINDOW_MS = 90_000;
export function contentStateFrom(
  snapshot: LiveMatchSnapshot, decision: LiveUpdateDecision, updatedAtMs: number,
): MatchLiveContentState;
export function contentStateBytes(state: MatchLiveContentState): number;
```

- [x] **Step 1: Escrever o teste que falha**
  - Mapeia os dois formatos de mesa (o `sets[]` do app e o `liveScore` da web) para o mesmo estado — reusa `snapshotFromMatchData`, não reimplementa.
  - `status` sai do `decision.kind`: `end` → `finished`, `dismiss` → `canceled`, resto → `live`.
  - `staleAfterMs === updatedAtMs + STALE_WINDOW_MS`.
  - **Vetores travados**: um `ContentState` fixo → JSON exato, byte a byte. É o que o Swift vai espelhar.
  - `contentStateBytes` de um estado realista fica **muito abaixo de 4 KB** (limite do APNs).
- [x] **Step 2: Rodar e confirmar que falha** — `npm test` de `functions/`
- [x] **Step 3: Implementar**
- [x] **Step 4: Rodar e confirmar que passa** — acima de 1825, 0 falhas
- [x] **Step 5: Registrar o contrato na spec**, em bloco Swift copiável, para o `struct ContentState` não divergir
- [x] **Step 6: Commit** — `feat(functions): ContentState da Live Activity como contrato versionado`

### Task 2: ciclo de vida do canal (TDD)

**Files:**
- Create: `functions/src/live-activity-channel-lifecycle.ts` + `.test.ts`

**Interfaces:**
```ts
export type ChannelAction = 'create' | 'reuse' | 'delete' | 'none';
export function resolveChannelAction(
  decision: LiveUpdateDecision, storedChannelId: string | null,
): ChannelAction;
```

- [ ] **Step 1: Teste que falha**
  - `start` sem canal → `create`; `start` com canal → `reuse` (reentrega do gatilho não pode criar canal duplicado e vazar o limite de 10.000).
  - `score`/`set`/`matchPoint` com canal → `reuse`; **sem** canal → `create` (a partida pode ter começado antes do deploy).
  - `end`/`dismiss` com canal → `delete`; sem canal → `none`.
  - `push: false` → sempre `none`.
- [ ] **Step 2: Rodar e confirmar que falha**
- [ ] **Step 3: Implementar**
- [ ] **Step 4: Rodar e confirmar que passa**
- [ ] **Step 5: Commit** — `feat(functions): decisao de ciclo de vida do canal APNs`

### Task 3: JWT do APNs (TDD)

Autenticação é pura cripto: dá para verificar aqui inteira, sem rede.

**Files:**
- Create: `functions/src/apns-auth.ts` + `.test.ts`

**Interfaces:**
```ts
export function buildApnsJwt(p: {
  teamId: string; keyId: string; privateKeyPem: string; nowSec: number;
}): string;
export const APNS_JWT_TTL_SEC = 45 * 60;   // Apple recusa token > 1h
export function apnsJwtIsExpired(issuedAtSec: number, nowSec: number): boolean;
```

- [ ] **Step 1: Teste que falha**
  - Header tem `alg: ES256` e o `kid` certo; payload tem `iss` (teamId) e `iat`.
  - Assinatura **verifica** contra a chave pública derivada — gere um par ES256 no teste com `node:crypto`, não use chave real.
  - `apnsJwtIsExpired` respeita a janela: Apple rejeita token com mais de 1h, e reemitir a cada request é abuso.
- [ ] **Step 2-4: falhar, implementar, passar**
- [ ] **Step 5: Commit** — `feat(functions): JWT ES256 para autenticar no APNs`

### Task 4: Firestore — token de push-to-start, rules e índice

**Files:**
- Modify: `firestore.rules`, `firestore.indexes.json`
- Test: `functions/test/live-activity-tokens.rules.test.mjs`

- [ ] **Step 1: Teste de rules que falha** — `users/{uid}/liveActivityTokens/{installationId}`: dono lê/escreve, terceiro não, anônimo não.
- [ ] **Step 2: Rodar sob emulador e confirmar que falha**
- [ ] **Step 3: Implementar** — rule no formato de `followedMatches`, mais o **índice de collection group em `matchId`** sobre `followedMatches` (o `start` precisa achar quem segue a partida; ver a assimetria na spec).
- [ ] **Step 4: Rodar as 12 suítes de rules** — `firestore.rules` é arquivo único e `allow` faz OR entre `match` do mesmo caminho.
- [ ] **Step 5: Commit** — `feat(rules): tokens de push-to-start e indice de seguidores por partida`

---

## Bloco B — o nativo (escrito aqui, compilado no Mac)

### Task 5: target da extension no Xcode

- [ ] `NexagoLiveActivity` (Widget Extension), deployment target **18.0**.
- [ ] App Group `group.br.com.nexago.liveactivity` nos dois targets.
- [ ] `NSSupportsLiveActivities: true` e `NSSupportsLiveActivitiesFrequentUpdates: true` no `Info.plist` do Runner (**hoje ausentes**).
- [ ] Commit — `chore(ios): target da Live Activity e entitlements`

### Task 6: Swift — atributos e a view

- [ ] `MatchLiveAttributes` + `ContentState` **espelhando o contrato da Task 1**, campo a campo.
- [ ] View da tela bloqueada + as três formas da Dynamic Island (compacta, mínima, expandida).
- [ ] Estado "desatualizado" quando passa do `staleAfterMs` — é o que impede exibir placar velho como atual.
- [ ] Commit — `feat(ios): Live Activity com placar e Dynamic Island`

### Task 7: ponte Dart ↔ Swift

- [ ] `MethodChannel('br.com.nexago/live_activity')`: `isSupported`, `end`.
- [ ] `EventChannel` do **push-to-start token** → grava em `users/{uid}/liveActivityTokens/{installationId}`.
- [ ] Reconciliação no foreground: relê a partida e chama `activity.update()` sem esperar push.
- [ ] Guardas `if #available(iOS 18)`; abaixo disso a ponte responde `isSupported: false` e o app segue no caminho da Fase 1.
- [ ] Commit — `feat(app): ponte da Live Activity e registro do push-to-start token`

---

## Bloco C — o transporte (depende de confirmar o `APNS_WIRE`)

### Task 8: confirmar o `APNS_WIRE`

**Bloqueante para as Tasks 9 e 10.** Não escrever cliente sobre endpoint adivinhado.

- [ ] Confirmar contra a doc da Apple, e registrar em bloco único com link:
  - método, path e corpo do *create channel*; em qual header o channel ID volta
  - path e headers do envio de broadcast (`apns-channel-id`, `apns-push-type`, `apns-topic`, `apns-priority`)
  - forma do payload de push-to-start com o channel ID embutido
- [ ] **Já confirmado:** hosts `api-manage-broadcast.sandbox.push.apple.com:2195` (dev) e `api-manage-broadcast.push.apple.com:2196` (prod); auth JWT igual à do APNs comum; 10.000 canais por ambiente; payload 4 KB; cadência 5–15s.
- [ ] Commit — `docs: bloco APNS_WIRE conferido contra a documentacao`

### Task 9: cliente APNs

- [ ] `createChannel` / `deleteChannel` / `broadcast` / `pushToStart`, sobre `node:http2`.
- [ ] Chave `.p8` via Secret Manager, **nunca** no repo.
- [ ] Teste com servidor HTTP/2 local: verifica headers e corpo enviados, sem tocar a Apple.
- [ ] Commit — `feat(functions): cliente APNs com broadcast e push-to-start`

### Task 10: ligar no gatilho

- [ ] `onMatchLiveScoreChanged` passa a, além do FCM, resolver a ação de canal e falar com o APNs.
- [ ] `apnsChannelId` no sidecar `matchLiveNotify/{matchId}`.
- [ ] `Promise.allSettled` entre FCM e APNs — **falha de um transporte não derruba o outro**, mesma regra da Fase 1.
- [ ] Commit — `feat(functions): fan-out da Live Activity no gatilho do placar`

---

## Bloco D

### Task 11: verificação em aparelho (obrigatória)

Nada disto é verificável por teste automatizado. **Simulador não serve** — sem APNs não há token nem entrega.

- [ ] Pré-requisitos manuais feitos: `.p8` no projeto dev, **Broadcast Capability** no App ID, provisioning regenerado.
- [ ] iPhone físico com iOS 18+, app fechado: seguir partida agendada, a activity **nasce sozinha** quando o jogo começa.
- [ ] O card atualiza sem reabrir o app; Dynamic Island nas três formas.
- [ ] Cortar a rede por 2 min: o card entra em "desatualizado" em vez de mentir.
- [ ] Fim de jogo derruba o card; o canal é deletado (conferir no APNs).
- [ ] iPhone com iOS < 18: continua recebendo o alerta da Fase 1, sem regressão.
- [ ] Reportar o resultado dos passos anteriores, com o que falhou.
