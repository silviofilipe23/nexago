# NexaGO — Planos de Pagamento e Monetização

> Documento consolidado do modelo de monetização do NexaGO: planos de arena, controle de acesso por plano (gate), limite de quadras, política de downgrade e taxas da plataforma sobre reservas e inscrições.
>
> Status por item: ✅ implementado · 🟡 parcial · ⏳ pendente. Tudo o que está marcado como implementado ainda **depende de deploy** de Cloud Functions, `firestore.rules` e índices para valer em produção (ver seção 7).
>
> Última atualização: 01/07/2026.

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Planos de arena](#2-planos-de-arena)
3. [Controle de acesso por plano (gate)](#3-controle-de-acesso-por-plano-gate)
4. [Limite de quadras](#4-limite-de-quadras)
5. [Política de downgrade](#5-política-de-downgrade)
6. [Taxas da plataforma](#6-taxas-da-plataforma)
7. [Pendências de deploy e follow-ups](#7-pendências-de-deploy-e-follow-ups)
8. [Referências de código](#8-referências-de-código)

---

## 1. Visão geral

O NexaGO monetiza por **duas fontes complementares**:

1. **Assinatura de arena** (mensal/anual) — libera a operação completa da arena (PDV, estoque, promoções, métricas, receber torneios, multi-unidade).
2. **Taxas sobre transações** — percentual sobre reservas (só arenas no plano gratuito) e sobre inscrições de torneio (todos os organizadores).

O princípio: o **plano gratuito (Essencial)** não é caridade — ele gera GMV (reservas online) e monetiza via **taxa por reserva**. A assinatura Pro **elimina a taxa de reserva** e vende a operação da arena. Organizadores não têm plano; pagam **taxa por inscrição**.

---

## 2. Planos de arena

Três tiers: **Essencial** (grátis), **Pro** e **Parceiro**. Ciclo anual = **2 meses grátis** (10× o mensal).

| | Essencial | Pro | Parceiro |
|---|---|---|---|
| **Mensal** | Grátis | R$ 149 | R$ 399 |
| **Anual** | Grátis | R$ 1.490 | R$ 3.990 |
| **Persona** | Arena testando a plataforma | Arena que quer encher quadra e vender online | Rede / arena-sede da Liga nexaGO |

### Empacotamento por funcionalidade

| Funcionalidade | Essencial | Pro | Parceiro |
|---|:---:|:---:|:---:|
| Perfil público + listagem na busca | ✅ | ✅ | ✅ |
| Reservas online com pagamento PIX | ✅ | ✅ | ✅ |
| Agenda e disponibilidade das quadras | ✅ | ✅ | ✅ |
| Avaliações da arena | ✅ | ✅ | ✅ |
| Carteira e saque via PIX | ✅ | ✅ | ✅ |
| Limite de quadras | 2 | ilimitado | ilimitado |
| **Taxa sobre reservas** | **5%** | isento | isento |
| PDV / comandas | — | ✅ | ✅ |
| Controle de estoque e produtos | — | ✅ | ✅ |
| Destaque na busca e promoções de horário | — | ✅ | ✅ |
| Dashboard completo, insights e seguidores | básico | ✅ | ✅ |
| Receber etapas e torneios | — | ✅ | ✅ |
| Múltiplas quadras / unidades, sem limite | — | — | ✅ |
| Prioridade em etapas da Liga nexaGO | — | — | ✅ |
| Gerente de conta dedicado | — | — | ✅ |

**Fonte da verdade dos preços:** `functions/src/arena-plans.ts` (servidor). Espelhado em `nexago_app/.../arena/domain/arena_plan.dart` e no site (`frontend/projects/site/.../ArenaPlanos.tsx`).

**Cobrança:** recorrente via Asaas — PIX (QR in-app) ou cartão (checkout hospedado). O cliente envia só `tier` + `cycle`; o valor cobrado sempre vem do servidor.

---

## 3. Controle de acesso por plano (gate)

Cada funcionalidade Pro tem **dois níveis** de bloqueio:

- **UI (UX):** esconde/bloqueia a ação e oferece upsell ("Ver planos").
- **Segurança (`firestore.rules`):** bloqueia a escrita direta — senão um gestor poderia furar o gate mandando dados direto ao Firestore.

### Fonte única de verdade (app)

`ArenaCapability` + `capabilitiesFor(tier, entitled:)` em `arena_plan.dart` derivam as capacidades a partir do tier e da **titularidade** (ver seção 5). Sem titularidade, a arena cai para o comportamento do Essencial.

| Recurso Pro | Gate de UI | Gate de segurança (rules) |
|---|---|---|
| PDV / comandas | Aba read-only + "Nova" vira upsell | `create` de `arenaComandas` e de itens exige `arenaEntitled(['pro','parceiro'])` |
| Estoque / produtos | Lista read-only; criar/editar/repor viram upsell | `create`/`update` de `products` e `create` de `stockMovements` |
| Promoções | Sheet vira upsell | `create`/`update` de `promotions` |
| Destaque na busca | — | (lado atleta; boost por plano ainda ⏳) |

**Segurança confiável:** `planTier`/`planStatus`/`planActiveUntil` no doc da arena são gravados **apenas pelas Cloud Functions** (o gestor não se auto-promove), então as rules podem confiar neles.

---

## 4. Limite de quadras

- **Essencial:** até **2 quadras**. **Pro/Parceiro:** ilimitado.
- **UI:** no limite, o botão "Adicionar quadra" abre o paywall.
- **Segurança:** rules não contam documentos, então uma Cloud Function (`arena-courts-count.ts`) mantém `arenas/{id}.courtsCount` (triggers de create/delete). A rule `arenaCanAddCourt` libera se Pro+ **ou** `courtsCount < 2`.
- **Grandfather:** arena que já tinha mais quadras que o limite mantém todas funcionando (só não adiciona novas).
- **Corrida conhecida:** criações em rajada podem furar o limite por instantes até o contador atualizar — aceitável para limite de volume.

> **Backfill obrigatório após deploy:** rodar a callable `backfillArenaCourtsCount` (super admin) uma vez para popular `courtsCount` das arenas existentes.

---

## 5. Política de downgrade

### Titularidade (entitlement) derivada de data

A titularidade do plano **não** vem do flag cru, e sim de uma função com data (`ArenaPlanStatus.entitledAt` no app; `arenaEntitled` nas rules; `isArenaEntitledPro` no backend):

| Estado no banco | Tem Pro? | Exibição |
|---|---|---|
| `active` | sim | "Ativo" |
| `overdue` | sim **enquanto** `agora ≤ planActiveUntil + 7 dias` | "Pagamento em atraso — regularize até DD/MM" |
| `canceling` | sim **até** `planActiveUntil` (fim do período pago) | "Cancelado — Pro ativo até DD/MM" |
| `none` / refund / chargeback | não (imediato) | "Essencial" |

Isso garante: **cancelamento** mantém o Pro até o fim do período já pago; **atraso** tem **7 dias de carência**; **estorno/chargeback** corta na hora.

### O que acontece ao cair para o Essencial

| Recurso | Comportamento |
|---|---|
| Comandas | Read-only; comandas **abertas podem ser fechadas/recebidas** (nunca prende dinheiro); não abre novas nem adiciona itens |
| Produtos/estoque | Read-only; sem criar/editar/repor |
| Promoções | **Auto-pausadas**; sem criar/reativar |
| Quadras | **Grandfather** — todas seguem funcionando; só não adiciona novas |

### Finalização (job diário)

`finalizeLapsedArenaPlans` (agendado, 03:00 America/Sao_Paulo) varre arenas `overdue`/`canceling` com titularidade expirada e, uma única vez: **pausa as promoções ativas** e transiciona `planStatus → none`.

---

## 6. Taxas da plataforma

**Modelo:** percentual com **piso mínimo** de R$ 1,50 por transação (cobre o custo de gateway ~R$1/PIX). A taxa é sempre **descontada do recebedor** (arena/organizador recebe líquido); o pagador (atleta) paga o mesmo valor. Fonte da verdade: `functions/src/platform-fees.ts`.

| Fluxo | Taxa | A quem se aplica | Como assenta |
|---|---|---|---|
| **Reserva de arena** | **5%** | Só arenas no plano **gratuito** (Pro/Parceiro isentos) | Carteira da arena recebe bruto − taxa; arena saca por PIX |
| **Inscrição de torneio** | **8%** | Todos os organizadores | Carteira do organizador recebe bruto − taxa; organizador saca por PIX |

### 6.1 Taxa de reserva (5%) — ✅

Aplicada no momento da confirmação do pagamento, em 3 pontos: webhook Asaas (recebedor plataforma → carteira), webhook Mercado Pago (idem) e `resolvePixPaymentAuth` (recebedor "manager" via split MP). Arenas Pro/Parceiro com titularidade ativa são **isentas**.

### 6.2 Taxa de inscrição (8%) — carteira do organizador

Como o organizador não tinha carteira nem repasse, foi criado um subsistema espelhando o das arenas:

- **Crédito (✅):** a cada inscrição paga via Asaas, `organizerWallets/{organizerId}` é creditado com bruto − 8%; a plataforma retém a taxa. (`organizer-wallet.ts`, `asaas-tournament-registration-webhook.ts`.)
- **Saque (✅ backend):** chave PIX de repasse no doc da carteira; `requestOrganizerWithdrawal` (auto até R$ 500, manual acima), `listPendingOrganizerWithdrawals`, `reviewOrganizerWithdrawal`, `setOrganizerPayoutPixKey`. Rules `organizerWithdrawals` + índices. (`organizer-withdrawal.ts`.)
- **App (✅):** tela financeira do organizador (`organizer_financial_page.dart`) — saldo, chave PIX, saque e histórico. Acesso pelo sheet de ajustes do organizador → "Carteira e saques".
- **Backoffice (⏳):** falta a tela Angular para a equipe aprovar/rejeitar saques de organizador acima de R$ 500.

> **Nota:** o caminho de inscrição via **Mercado Pago** foi deixado de lado por ora (o produto usará **só Asaas**). Se reativado, ajustar `marketplace_fee` para 8% em `createMercadoPagoPreference`.

---

## 7. Pendências de deploy e follow-ups

### Deploy necessário (não é código — precisa ser publicado)
- **Cloud Functions:** triggers de `courtsCount`, `finalizeLapsedArenaPlans`, callables de saque de organizador, e alterações de taxa/webhook/cancelamento.
- **`firestore.rules`** e **`firestore.indexes.json`** (novos índices de `organizerWithdrawals`).
- **Backfill:** rodar `backfillArenaCourtsCount` uma vez após o deploy.

### Follow-ups em aberto
- **Backoffice Angular:** revisão de saques de organizador.
- **"Receber torneios":** definir a semântica comercial (filtrar picker de arena do organizador para Pro+, ou gatear o futuro "arena cria torneio").
- **Destaque na busca:** boost por plano no ordenamento (hoje sem gate).
- **Estorno de reserva:** o webhook faz dedup por `paymentId` e ignora o evento `REFUNDED` de um pagamento já processado → a carteira **não** é revertida. Tratar reversão de crédito/taxa em estorno.
- **Piso da taxa (R$ 1,50)** e **percentuais** são configuráveis em `platform-fees.ts`.

---

## 8. Referências de código

| Área | Arquivo(s) |
|---|---|
| Catálogo de planos (servidor) | `functions/src/arena-plans.ts` |
| Catálogo de planos (app / site) | `nexago_app/.../arena/domain/arena_plan.dart` · `frontend/projects/site/.../ArenaPlanos.tsx` |
| Assinatura (criar/cancelar) | `functions/src/arena-subscription.ts` · webhook `asaas-arena-subscription-webhook.ts` |
| Capacidades / gate (app) | `arena_plan.dart` · `arena_plan_providers.dart` · `presentation/plan/widgets/arena_plan_gate.dart` |
| Gate (segurança) | `firestore.rules` (`arenaEntitled`, `arenaCanAddCourt`) |
| Limite de quadras | `functions/src/arena-courts-count.ts` |
| Downgrade (titularidade) | `arena-entitlement.ts` · `ArenaPlanStatus` em `arena_plan.dart` |
| Downgrade (sweeper) | `functions/src/arena-plan-sweeper.ts` |
| Taxas (config) | `functions/src/platform-fees.ts` |
| Taxa de reserva | `asaas-arena-booking-webhook.ts` · `mercadopago-arena-booking-webhook.ts` · `mercadopago-arena-helpers.ts` |
| Carteira/saque de arena | `arena-wallet.ts` · `arena-booking-pix.ts` · `asaas-payout.ts` |
| Carteira/saque de organizador | `organizer-wallet.ts` · `organizer-withdrawal.ts` · `organizer-withdrawal-payout.ts` |
| Tela financeira do organizador | `nexago_app/.../organizer/presentation/organizer_financial_page.dart` |
