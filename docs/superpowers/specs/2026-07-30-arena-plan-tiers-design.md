# Planos de arena Starter/Pro/Elite + taxa por tier (8/6/5%)

**Data:** 2026-07-30 · **Status:** aprovado pelo dono (decisões registradas abaixo)

## Objetivo

Substituir o modelo atual de planos de arena (Essencial grátis / Pro R$149 / Parceiro R$399, taxa de 5% só no plano grátis) pelo novo modelo comercial:

| Plano | Mensal | Anual (1 mês grátis) | Taxa por reserva |
|---|---|---|---|
| Starter | R$ 99 | 12× R$ 90 (R$ 1.080) | **8%** |
| Pro | R$ 249 | 12× R$ 228 (R$ 2.736) | **6%** |
| Elite | R$ 499 | 12× R$ 457 (R$ 5.484) | **5%** + saque PIX sem tarifa |

Todos os planos pagam mensalidade **e** taxa sobre reservas pagas online (ex.: atleta paga R$100 → arena Starter recebe R$92 na carteira). Ativação única de R$97 na primeira assinatura.

## Decisões do dono (2026-07-30)

1. **Arena sem plano ativo** (nunca assinou, ou venceu além da carência): continua recebendo reservas online, com taxa de **8%** (igual Starter). Nada é bloqueado.
2. **IDs de tier**: novos IDs canônicos `starter`/`pro`/`elite` com **aliases legados** — `parceiro` lido como `elite`, `essencial` lido como *sem plano*. Docs existentes não são migrados.
3. **Escopo completo nesta entrega**: preços novos, taxa 8/6/5, anual = 1 mês grátis, limites de quadras 2/5/ilimitado, ativação R$97, reempacotamento de capabilities.
4. **"PIX sem taxa" do Elite** = saque da carteira sem tarifa. Introduz tarifa fixa de **R$ 1,75** por saque para Starter/Pro/sem plano; Elite isento. Só saques de arena (organizador não muda).
5. **Ativação R$97**: somada à 1ª cobrança da assinatura (um único PIX); renovações no preço normal. Cobrada uma única vez por arena (`activationFeePaidAt` em `billing/subscription`).

## Arquitetura

### Tiers e normalização (todas as camadas)

- Tipo canônico: `"starter" | "pro" | "elite"`.
- Função `normalizeArenaPlanTier(raw)` por camada: `'parceiro'→'elite'`, `'essencial'→null` (sem plano), ids novos passam direto, resto → null.
- Assinaturas novas gravam IDs novos em `arenas/{id}.planTier`. Leitores (fee, capabilities, rules) aceitam legado via normalização/listas.
- Entitlement (active / overdue+7d / canceling até activeUntil) **não muda** — só as listas de tiers.

### Taxa por reserva — `functions/src/platform-fees.ts`

- `BOOKING_FEE_PERCENT_BY_TIER = {starter: 8, pro: 6, elite: 5}` e `BOOKING_FEE_PERCENT_NO_PLAN = 8`.
- Novo helper em `arena-entitlement.ts`: `resolveArenaBookingFeePercent(arenaDoc, nowMs)` — normaliza o tier, verifica titularidade (reusa a lógica de `isArenaEntitledPro` generalizada para qualquer tier pago) e devolve o percentual; sem titularidade → 8.
- Aplicação nos 3 pontos de cobrança de reserva: `asaas-arena-booking-webhook.ts` (2 call sites) e `mercadopago-arena-booking-webhook.ts` — substituem o par `isArenaEntitledPro` + `BOOKING_FEE_PERCENT` (que hoje **isenta** Pro/Parceiro) pelo novo helper. Piso `FEE_FLOOR_REAIS = 1.5` mantido.
- **Não mudam**: `TOURNAMENT_FEE_PERCENT = 8` (inscrições), `CLUB_FEE_PERCENT = 5` (clubinho, sem piso), estorno (`platformFeeReais: 0`).

### Catálogo de preços — `functions/src/arena-plans.ts` (fonte da verdade)

- `ARENA_PLANS`: starter 9900/108000 · pro 24900/273600 · elite 49900/548400 (centavos, mensal/anual total). Nenhum plano `free`.
- `ACTIVATION_FEE_CENTS = 9700`.
- `isArenaPlanTier` aceita só ids novos; `normalizeArenaPlanTier` exportada para os leitores.
- `resolvePlanPriceCents` deixa de ter caso grátis (todos billáveis).

### Assinatura + ativação — `functions/src/arena-subscription.ts`

- `createArenaSubscription` passa a aceitar `tier` starter/pro/elite (rejeita legados no input).
- Após criar a subscription e buscar a 1ª cobrança (fluxo existente), se a arena nunca pagou ativação (`billing/subscription.activationFeePaidAt` ausente): `PUT /v3/payments/{id}` com `value = mensalidade + 97` e descrição mencionando a ativação; QR PIX gerado depois do update. O id dessa cobrança é gravado como `activationPaymentId` em `billing/subscription`.
- Webhook (`asaas-arena-subscription-webhook.ts`): quando o payment confirmado (`CONFIRMED/RECEIVED`) tem id igual a `activationPaymentId`, grava `activationFeePaidAt`. Mapeamento de status inalterado; `planTier` gravado é o id novo.
- Idempotência: chave existente `arena-sub-{arenaId}-{tier}-{cycle}` continua; o update da 1ª cobrança é idempotente (re-rodar mantém o mesmo valor).

### Limites por plano

- **Quadras**: sem plano/starter **2** · pro **5** · elite ilimitado.
  - App: `maxCourtsFor` em `arena_plan.dart`; Angular: `arena-plan.model.ts`.
  - Rules: `arenaCanAddCourt` vira: entitled elite/parceiro → sempre; entitled pro → `courtsCount < 5`; senão `courtsCount < 2`.
  - Quadras excedentes existentes: grandfathered (política atual — mantém, só não adiciona).
- **Horários fixos**: sem plano/starter **3** · pro/elite ilimitado (renomeia `ESSENCIAL_MAX_ACTIVE_RECURRING` → `STARTER_MAX_ACTIVE_RECURRING`, gate em `arena-recurring-booking.ts` passa a usar o entitlement generalizado).

### Capabilities

- Gates funcionais existentes preservados: `pdvComandas`, `estoque`, `promocoes`, `clubinho`, `metricasCompletas`, `receberTorneios` = **Pro+** (pro, elite, parceiro-legado); `multiUnidade` = **Elite** (elite, parceiro-legado).
- Starter não destrava feature nova no código (compra site institucional/perfil/onboarding — serviço, não gate).
- Itens sem feature implementada ficam **só como copy** (site/telas): push para atletas, landing pages ilimitadas, área de patrocinadores, "1 admin"/usuários ilimitados, consultoria semanal, suporte prioritário.
- Rules: listas `['pro','parceiro']` (7 call sites) viram `['pro','parceiro','elite']`.
- Server (`isArenaEntitledPro`): generalizado — `arenaEntitledTier(arena, nowMs)` devolve o tier normalizado se titular, senão null; call sites Pro+ (occupancy, recurring, club, comanda-app-orders) checam `tier != null && tier != 'starter'`.

### Tarifa de saque — Elite isento

- `platform-fees.ts`: `ARENA_WITHDRAWAL_FEE_REAIS = 1.75` (starter/pro/sem plano) · `0` para elite/parceiro-legado.
- `requestArenaWithdrawal` (`arena-booking-pix.ts`): calcula a tarifa pelo tier titular da arena no momento do pedido, grava `feeReais` e `netReais` no doc `arenaWithdrawals`; a reserva de saldo continua pelo `amountReais` cheio (a tarifa sai do valor sacado, não além dele).
- `asaas-payout.ts`: transfere `netReais` (fallback: docs antigos sem `feeReais` transferem `amountReais` — retrocompat).
- Validação: saque mínimo deve cobrir a tarifa (rejeita `amount <= fee`).
- Saques de organizador não mudam (código compartilhado parametrizado — tarifa só no fluxo de arena).

### Superfícies de UI

1. **App Flutter** (`arena_plan.dart` + telas): enum ganha `starter`/`elite` (mantém legados para leitura), catálogo com preços/copy novos, tela de plano oferece os 3 pagos, tela de ativação ganha conteúdo do Elite, banner/paywalls seguem funcionando via capabilities.
2. **Painel Angular arena** (`arena-plan.model.ts`, `panel-plans.component`): catálogo novo; ação de assinar disponível para os 3 planos (hoje só grátis→pago; troca pago→pago continua via suporte); exibe ativação R$97 e taxa do plano.
3. **Site** (`ArenaPlanos.tsx`): cards da imagem — Starter/Pro/Elite, preços, "Mais escolhido" no Pro, ativação R$97 no subtítulo, anual 1 mês grátis, taxa por plano nas features; remove copy "Essencial é grátis para sempre".
4. **Backoffice**: tela de revisão de saques passa a exibir `feeReais`/`netReais` quando presentes (mudança mínima).

## Retrocompatibilidade

- Arenas `parceiro` ativas: viram Elite na prática (5%, todas as caps, saque isento) sem tocar no doc.
- Arenas `essencial` (docs antigos que porventura tenham a string): tratadas como sem plano → 8%, caps base. Sem migração.
- Apps antigos que ainda mostram catálogo velho: a cobrança real vem sempre do servidor (`resolvePlanPriceCents`), então preço errado exibido no app velho não cobra errado; assinatura de tier legado é rejeitada pelo servidor com erro claro.
- Saques em voo (docs sem `feeReais`): payout transfere `amountReais` cheio.

## Ordem de rollout

1. Functions (catálogo, fee, ativação, saque) + rules juntos — as rules novas aceitam docs velhos e novos.
2. Webs (site, painel arena, backoffice).
3. App Flutter (release nova).
4. Nenhum backfill necessário.

## Testes

- **Functions (unit)**: fee por tier e por status de titularidade (active/overdue±7d/canceling/none, legados), preço mensal/anual por tier, ativação (1ª assinatura vs re-assinatura), tarifa de saque por tier + validação de mínimo + fallback de doc antigo.
- **Rules (emulator)**: create de produto/comanda/promoção com tier `elite` e `parceiro`; limite de quadras Pro=5 (create da 6ª nega), Elite ilimitado.
- **Flutter**: `capabilitiesFor`/`maxCourtsFor`/`maxRecurringBookingsFor` com tiers novos e legados; parsing de `planTier` legado.

## Fora de escopo (deferido)

- Push para atletas/seguidores, landing pages múltiplas, área de patrocinadores, limites de admins/usuários (features inexistentes — só copy).
- Migração de docs `parceiro`→`elite` (aliases cobrem; script opcional futuro).
- Troca de plano pago→pago self-service no painel.
- Estorno de reserva não reverte crédito de carteira (gap pré-existente, rastreado à parte).
