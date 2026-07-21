# Mais 5 funcionalidades — 3ª leva (pesquisa de concorrência)

## Contexto

Continuação da meta autônoma (`/goal`), 3ª rodada depois de 10 funcionalidades
já entregues (ver `2026-07-20-cinco-features-concorrencia-design.md` e
`2026-07-20-mais-5-features-concorrencia-design.md`). A lista original de
gaps da pesquisa de concorrentes estava praticamente esgotada — esta rodada
fez pesquisa nova (Playtomic/MATCHi split payment, PadelOS/PadelPerks cupom
e fidelidade, Strava streaks, TeamSnap referral, DUPR reliability score,
LeagueApps site público/auto-agendamento, World ParaVolley classificação
adaptada) e um mapeamento de código adicional antes de escolher.

**Achados do mapeamento que mudaram o escopo em relação à pesquisa bruta:**
- **Streak semanal de atividade já existe, pronto**, não é gap:
  `GamificationSummary.streak`/`gameCompletionDays`, lógica em
  `athlete_quest_logic.dart` (`buildStreakWeekDays`), UI em
  `athlete_quest_streak_hero.dart`. Descartado desta leva por ser redundante.
- **Página pública de torneio/liga já existe** (Next.js em
  `frontend/projects/site/src/app/torneios/[id]` e `/ligas/[slug]`, com SEO
  completo, compartilhada via `nexaShareText` com URL real). O gap real do
  LeagueApps (branding/tema customizável por liga) não foi escolhido nesta
  leva — é incremento sobre algo que já existe, não uma lacuna aberta.
- **Não existe carteira de atleta** (só arena e organizador têm carteira com
  saque). Isso mudou o desenho da feature de indicação (#4 abaixo): recompensa
  é XP via gamificação, não crédito monetário — não vou inventar uma
  carteira de atleta nova só pra essa feature.
- **Promoções de arena são desconto automático de precificação** (sem
  código, sem limite de uso, sem vínculo a cliente) — um cupom de marketing
  de verdade (código + validade + limite por cliente) é complementar, não
  redundante.

**Descartadas deliberadamente desta leva** (risco vs. valor, não por
inviabilidade técnica):
- **Categorias adaptadas/paradesporto** e **uso do reliability score como
  corte de elegibilidade de torneio** — ambas tocariam diretamente o sistema
  de elegibilidade anti-sandbagging já existente (`category-level-eligibility`,
  guard compartilhado usado em vários fluxos de inscrição). O princípio do
  projeto é "nunca quebrar regras de negócio"; mexer nesse guard de forma
  autônoma, sem revisão humana dedicada, é risco desproporcional ao ganho
  desta rodada. Fica registrado como candidato futuro, com recomendação de
  spec própria e revisão humana antes de tocar o guard.
- **Streaming, ticketing** — mesmos motivos das rodadas anteriores
  (infra de vídeo / novo fluxo de pagamento pra espectador, fora do que dá
  pra provisionar sozinho).

**5 funcionalidades escolhidas:**

1. Split de pagamento em reserva de quadra (PIX, multi-pagador)
2. Relatórios de ocupação de quadra para o dono da arena
3. Cupom de marketing (código, validade, limite de uso) para a arena
4. Programa de indicação com recompensa em XP
5. Filtro de acessibilidade na busca de arenas

Mesmas regras das leva anteriores: cada feature em worktree/branch isolada
(`feat/<nome>`), sem deploy/push/merge automático, seguindo os padrões reais
do repo.

---

## 1. Split de pagamento em reserva de quadra

**Situação atual:** `createArenaBooking`
(`functions/src/arena-booking-create.ts:171`) cria a reserva com
`athleteId` único (`request.auth.uid`) — um único pagador. Existe
`paymentFraction` (0.5 ou 1) pra pagar sinal ou valor cheio, mas o restante
é sempre do MESMO atleta, pago no balcão — não há conceito de terceiros.
Provedor real é **Asaas** (não Mercado Pago, apesar do nome legado de
alguns arquivos) — cobrança PIX via `createAsaasPixCharge`
(`functions/src/asaas-booking-payment.ts`), webhook em
`functions/src/asaas-arena-booking-webhook.ts`.

**Modelo (Playtomic/MATCHi):** quem reserva convida N pessoas; cada uma
recebe uma cobrança PIX da sua fatia; se alguém não pagar até um prazo
(ex. 2h antes do horário), a fatia cai automaticamente pro organizador da
reserva.

**Escopo:**
- Nova subcoleção `arenaBookings/{bookingId}/paymentShares/{shareId}`:
  `{payerAthleteId, amountReais, status: 'pending'|'paid'|'expired'|'covered_by_organizer', asaasPaymentId?, expiresAt}`.
- Novo callable `splitArenaBookingPayment({bookingId, shares: [{athleteId,
  amountReais}]})` em novo arquivo `functions/src/arena-booking-split.ts` —
  só o `athleteId` dono original da reserva pode chamar; valida que a soma
  das `shares` bate com `amountToPayNowReais` da reserva; cria uma cobrança
  PIX Asaas por fatia (reaproveitar `createAsaasPixCharge`, uma chamada por
  `share`, não reinventar a integração).
- Webhook: estenda (não duplique) `asaas-arena-booking-webhook.ts` pra
  também resolver pagamento de `paymentShares` (hoje só resolve o pagamento
  único da reserva) — precisa distinguir se o `asaasPaymentId` recebido é
  da reserva ou de uma fatia.
- Job de expiração (`onSchedule`, mesmo padrão de
  `arena-recurring-materializer.ts`): fatias `pending` vencidas viram
  `expired` e o valor é somado ao `amountDueOnsiteReais` do dono original
  da reserva (`covered_by_organizer` fica registrado pra rastreabilidade,
  não é cobrança automática adicional).
- App Flutter: no fluxo de reserva (`features/arenas/`), depois de criar a
  reserva, opção "Dividir com amigos" — seleciona contatos/atletas do app
  (reaproveite algum seletor de atleta já existente no app, ex. usado em
  "Bora Jogar" ou convite de dupla, se houver, em vez de criar um picker de
  contatos do zero) + valor por pessoa; cada convidado recebe notificação
  push com link de pagamento PIX.
- **Fora de escopo:** split assimétrico automático por sugestão de app
  (valores são sempre definidos manualmente por quem reserva); cobrança
  automática do cartão de quem não pagar (só PIX, sem "card on file" como o
  Playtomic tem).

---

## 2. Relatórios de ocupação de quadra

**Problema:** o painel arena já tem financeiro (saldo/saque real, per
memória do projeto), mas não analytics operacional — horas ocupadas,
jogadores únicos, taxa de no-show, recorrência.

**Escopo:**
- Nova callable `getArenaOccupancyReport({arenaId, dateFrom, dateTo})` em
  novo arquivo `functions/src/arena-occupancy-report.ts` — agrega
  `arenaBookings` no intervalo: total de horas reservadas por quadra,
  jogadores únicos (`athleteId` distintos), taxa de no-show (usar o campo
  de `attendanceStatus` já existente no doc de `arenaBookings`, confirme o
  nome exato do campo lendo `arena-booking-create.ts` antes de usar),
  reservas recorrentes vs. avulsas.
- Autorização: gestor da arena (mesmo guard já usado nas outras callables
  de arena, ex. `canManageArenaProducts`/equivalente para leitura
  financeira — reaproveite, não invente um novo).
- Considere se o relatório deve ser gated por plano (Essencial/Pro/Parceiro,
  per `arena-plans-and-gate`) — se o padrão do projeto é gatear
  funcionalidades avançadas de analytics pro plano pago, siga esse padrão
  (confirme lendo como outras features avançadas de arena são gateadas
  antes de decidir).
- App Flutter (painel de arena dentro do `nexago_app`, `features/arena/`):
  nova tela "Relatórios" com cards de métricas + gráfico simples por
  período (reaproveite algum componente de gráfico já usado no financeiro
  da arena, se existir, em vez de trazer uma lib de gráfico nova).
- Teste colocalizado cobrindo a agregação (casos: quadra sem reservas no
  período, mix de recorrente/avulsa, no-show contabilizado corretamente).

---

## 3. Cupom de marketing da arena

**Situação atual:** promoções (`arenas/{arenaId}/promotions`) são desconto
automático por quadra/dia/horário, sem código, sem limite de uso, sem
vínculo a cliente — aplicado sozinho na precificação
(`arena-booking-create.ts:85-90`). Um cupom de marketing de verdade
(código que o cliente digita, validade, limite de uso por pessoa) é
complementar a isso, não substitui.

**Escopo:**
- Nova coleção `arenas/{arenaId}/coupons/{couponId}`:
  `{code, discountPercent OU fixedDiscountReais, validFrom, validUntil,
  maxRedemptionsTotal?, maxRedemptionsPerAthlete (default 1), active}`.
  Siga o mesmo padrão XOR de desconto (percentual OU valor fixo) já usado
  em `promotions` pra consistência.
- Nova subcoleção `arenas/{arenaId}/coupons/{couponId}/redemptions/{athleteId}`
  pra rastrear uso por cliente (contagem de resgates que as promoções
  explicitamente NÃO têm hoje — aqui você precisa ter, é o diferencial do
  cupom).
- No fluxo de reserva (`quoteArenaBooking`/`createArenaBooking`), aceitar um
  `couponCode` opcional no payload — valida vigência/limite/uso antes de
  aplicar o desconto, grava o resgate. Some ao desconto de promoção
  automática se houver (ou decida uma regra de precedência simples e
  documente — ex. cupom e promoção não se acumulam, vale o maior desconto).
- App Flutter: campo "Tenho um cupom" no fluxo de reserva (`features/arenas/`)
  + tela simples do lado gestor (`features/arena/`) pra criar/listar cupons,
  seguindo o mesmo padrão de tela de `promotions` já existente do lado
  gestor.
- Teste colocalizado: cupom válido aplica desconto, cupom expirado rejeita,
  cupom no limite de uso por cliente rejeita na 2ª tentativa do mesmo
  atleta.

---

## 4. Programa de indicação (referral)

**Situação atual:** não existe carteira de atleta — recompensa não pode ser
crédito monetário sem inventar infraestrutura de carteira nova (fora de
escopo desta feature). O trilho existente e reutilizável é gamificação:
`users/{uid}/gamification_events` + `users/{uid}/gamification/summary`
(XP, nível, streak), já usado por `functions/src/game-completed-gamification.ts`.

**Escopo:**
- Cada atleta tem um código de indicação (derivável do próprio uid/handle,
  não precisa gerar um código aleatório novo se já existir algum
  identificador curto de usuário reaproveitável — confirme antes de
  inventar um formato de código do zero).
- Novo callable `registerReferral({referralCode})`, chamado uma vez no
  onboarding do NOVO atleta (referenciado) — grava vínculo em
  `users/{referredUid}.referredBy = referrerUid` (idempotente, só no
  primeiro cadastro, nunca sobrescreve depois de setado).
- Trigger (`onDocumentWritten`/`onDocumentUpdated`, no padrão dos outros
  triggers de gamificação já existentes) que credita XP pro indicador
  (`referrerUid`) quando o indicado completa uma ação de valor real — não
  no cadastro puro (evita farming), mas na 1ª partida rateada ou 1ª
  reserva paga do indicado (escolha uma âncora clara e documente por quê).
  Reaproveite o mesmo mecanismo idempotente de crédito de XP que as outras
  features de gamificação já usam (doc idempotente por evento, não somar
  duas vezes).
- App Flutter: tela simples "Convide um amigo" (em `features/athlete/`,
  perto de configurações/perfil) com o código/link de indicação + share
  nativo (reaproveitar `nexaShareUri`/`nexaShareText` já existentes) e
  campo pra inserir o código de quem indicou no onboarding (se ainda não
  setado).
- **Fora de escopo:** crédito monetário/carteira (não existe hoje, não é
  desta feature criar); indicação em cascata multi-nível.

---

## 5. Filtro de acessibilidade na busca de arenas

**Situação atual:** `ArenaAmenities`
(`nexago_app/lib/features/athlete/presentation/widgets/arena_search/arena_amenities.dart`)
já tem o padrão exato pra isso — bools com default `false`
(`parking`, `lockerRoom`, `coveredCourt`, `bar`, `racketRental`),
`fromMap`/`toFirestoreMap`/`matchesRequirements`/`copyWith`. Adicionar
campos novos é aditivo e não quebra docs antigos (campo ausente = `false`).
Nenhum concorrente pesquisado (Playtomic, MATCHi) tem isso — diferencial
real, baixo risco, sem tocar nenhuma regra de negócio sensível.

**Escopo:**
- Adicione a `ArenaAmenities`: `hasAccessibleCourt`, `hasAccessibleBathroom`,
  `hasPcdParking` (bools, default `false`), seguindo exatamente o mesmo
  padrão dos campos existentes (mesmo `fromMap`/`toFirestoreMap`/
  `matchesRequirements`/`copyWith`/`==`/`hashCode`).
- `ArenaSearchFilters`/`arena_search_filters_sheet.dart`: adicione os 3
  novos toggles na mesma seção de comodidades já existente (não crie uma
  seção separada "acessibilidade" a menos que a UI existente já separe
  amenities em grupos — siga o padrão visual atual).
- Exibição no perfil/detalhe da arena (badge/ícone de acessibilidade quando
  algum campo for `true`) e formulário do lado gestor da arena
  (`features/arena/`) pra ele preencher esses campos no cadastro/edição da
  arena (senão o dado nunca é preenchido e o filtro fica sempre vazio).
- Teste colocalizado da lógica de `matchesRequirements` com os campos
  novos (padrão dos testes já existentes de `ArenaAmenities`).
- **Fora de escopo:** verificação/certificação dos dados informados pelo
  gestor (autodeclarado, mesmo nível de confiança que os outros amenities
  já têm hoje).

---

## Ordem e paralelismo de implementação

Mesmo padrão das levas anteriores: 5 branches independentes, worktrees
isolados, implementação em paralelo, sem merge/push/deploy automático.
