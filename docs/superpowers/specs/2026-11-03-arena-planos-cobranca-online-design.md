# Planos de horário — cobrança online das mensalidades (Asaas)

Continua os [Planos de horário](2026-11-03-arena-planos-de-horario-design.md), que saíram com cobrança só manual.
Segue o modelo das Aulas ([cobrança online das Aulas](2026-10-19-arena-aulas-cobranca-online-design.md)):
cada mensalidade online vira uma fatura Asaas `billingType: UNDEFINED` (o atleta escolhe Pix ou cartão na fatura),
o dinheiro cai no caixa da arena com a mesma taxa do aluguel online.

## Decisões
- **Link mensal, não débito automático.** Pix Automático exige liberação do Asaas e CNPJ ≥ 6 meses do recebedor;
  cartão recorrente exige tokenização liberada. Fica para depois. "Pix automático" e "Cartão" do plano viram, por
  enquanto, "link mensal (Pix ou cartão)"; "Na arena" segue manual.
- **Liga por arena:** `arenas/{id}/scheduleSettings/rules.onlineBillingEnabled` (padrão `false`). Ligar exige pagamento
  online ativo e chave PIX de repasse (`assertArenaCanBillOnline`, o mesmo das Aulas). `saveArenaScheduleRules` sem o
  campo mantém o gravado.
- **Quem é online decide-se por mensalidade, uma vez:** mensalidade nova nasce com `billingMode: null` ("a decidir").
  O gatilho da mensalidade decide: `asaas` se a regra da arena está ligada e a assinatura não é `paymentMethod: onsite`;
  senão `manual`. Assim, ligar a regra vale já para as próximas mensalidades das assinaturas existentes que escolheram
  Pix/cartão. Mensalidade antiga (sem o campo) fica manual.
- **Um pagamento Asaas por mensalidade** (sem agrupar): o rateio já dá uma mensalidade por pagador.
- **Taxa igual à das Aulas/aluguel:** `resolveArenaBookingFeePercent` (Pro 6%, Elite 5%, mínimo R$ 1,50) + taxa do
  cartão, descontadas da arena. O atleta paga o valor da mensalidade. Manual segue sem taxa.
- **CPF:** o cliente Asaas é o do atleta (`getOrCreateAsaasCustomer`, CPF de `users/{uid}/asaas/customer`). Sem CPF o
  grupo fica `needs_cpf` e o app pede o CPF no "Pagar" (callable abaixo), que grava o CPF como o aluguel online faz.
  Assinatura sem conta (titular só com nome) fica manual.
- **Baixa manual** de mensalidade online anula o link (o webhook estorna se o atleta pagar depois). Cancelar
  mensalidade, pausar (mensalidades do período pausado) e encerrar também anulam.
- **Pago online** reativa a assinatura suspensa (`reactivateIfClearCore`), como a baixa manual.

## Dados
- `arenaScheduleAsaasPayments/{groupId}` (só servidor; rules negam tudo). Id automático. Campos:
  `arenaId, subscriptionId, chargeId, payerAthleteId, customerAthleteId|null, name, amountReais, dueDate, description,
  state, attempt, paymentId|null, invoiceUrl|null, asaasStatus|null, lastError?, claimedAt?, lastCheckedAt?, paidAt?,
  voidedAt?, voidReason?, createdAt, updatedAt`.
  `state`: `pending → creating → open → paid`; `voiding → void`; `failed` (retenta); `needs_cpf` (sem CPF; o "Pagar"
  com CPF cria grupo novo).
- Mensalidade (`arenaScheduleCharges`) ganha:
  - `billingMode: null | 'manual' | 'asaas'` (`buildPayerCharges` grava `null`);
  - `asaas: {groupId, state, invoiceUrl|null, status|null} | ausente` — espelho para portal e app;
  - quando paga online: `status: 'paid', paidVia: 'asaas', onlineBillingType: 'PIX'|'CREDIT_CARD'|…,
    asaasPaymentId, platformFeeReais, paidOn, paidAt, paymentMethod: null`.
- `externalReference` do Asaas: `arenaSchedulePayment:{groupId}`; chave de idempotência `schedule-pay-{env}-{groupId}`.

## Backend
- `arena-schedule-asaas.ts` (worker, espelho do `asaas-class-billing.ts`):
  - `onArenaScheduleChargeWritten` (gatilho em `arenaScheduleCharges/{chargeId}`):
    - aberta com `billingMode == null` → decide (transação) e, se `asaas`, cria o grupo `pending` + espelho;
    - saiu de `open` sem ser `paidVia: 'asaas'` com grupo vivo (`pending|creating|open|failed|needs_cpf`) →
      grupo `voiding` (ou `void` direto se `needs_cpf`, que não tem nada no Asaas).
  - `onArenaScheduleAsaasPaymentWritten` (gatilho no grupo): `pending` → `ensureScheduleAsaasPayment`;
    `voiding` → `voidScheduleAsaasPayment`.
  - `reconcileArenaScheduleAsaasPayments` (a cada 30 min): retenta `pending/failed/voiding`, destrava `creating`
    velho, consulta abertas que vencem em até 3 dias (no máximo a cada 6h), e decide mensalidades abertas com
    `billingMode == null` esquecidas pelo gatilho.
  - Push ao pagador quando o link fica pronto: tipo `schedule_plan_charge_link`, `data: {chargeId, subscriptionId,
    arenaId, invoiceUrl, webUrl: invoiceUrl, url: '/meus-planos-horario'}`.
- `asaas-arena-schedule-webhook.ts` (espelho do `asaas-arena-class-webhook.ts`), roteado em `asaas-webhook.ts`
  junto do ramo das aulas (antes do ramo genérico de assinatura). Pago com grupo anulado ou mensalidade fora de
  `open` → estorno. Crédito no caixa com `ledgerExtra: {source: 'schedule_plan', subscriptionId, scheduleChargeId}`.
- Callable `getArenaScheduleChargePaymentLink({chargeId, cpfCnpj?}) → {invoiceUrl}` (região de cliente):
  quem está em `visibleTo` da mensalidade; mensalidade `open` e `billingMode == 'asaas'`, senão
  `failed-precondition` "Esta mensalidade é paga direto na arena.". Com link pronto devolve. Sem CPF guardado e sem
  `cpfCnpj` → `failed-precondition` com mensagem exata `"Informe seu CPF para pagar online."`. Com CPF válido grava o
  cliente (`getOrCreateAsaasCustomer`) e, se o grupo estava `needs_cpf`/`void`/ausente, cria grupo novo `pending` com
  `customerAthleteId = uid` e roda `ensureScheduleAsaasPayment` na hora. Grupo ainda `pending/creating` → espera curta
  (até ~10 s relendo) e, sem link, `unavailable` "O link ainda está sendo gerado. Tente de novo em instantes.".
- `saveArenaScheduleRules` aceita `onlineBillingEnabled`; `getArenaScheduleOverview` já devolve as regras.
  `getArenaSchedulePlanAvailability` passa a devolver `onlineBilling: boolean`.
- Lembrete de atraso: com `asaas.invoiceUrl`, o texto diz "Toque para pagar com Pix ou cartão." e o push leva
  `invoiceUrl`/`webUrl`; sem link segue "Acerte com a arena.".
- Índices: `arenaScheduleAsaasPayments (state, dueDate)`; `arenaScheduleCharges (status, billingMode)`.
- Testes com deps injetadas (`ScheduleAsaasDeps`, `ScheduleWebhookDeps`) e FakeFirestore, como nas Aulas.

## Portal da arena
- Modal de Regras: chave "Cobrança online (Pix ou cartão)" com a explicação da taxa e o erro do servidor quando
  faltar pagamento online/chave PIX.
- Editor do plano: some a nota "cobrança online chega em breve"; as formas passam a dizer
  "Pix ou cartão por link (online)" quando a regra está ligada, e "baixa manual" quando desligada.
- Mensalidades (detalhe do assinante e onde mais aparecem): selo do estado online (`Gerando link`, `Link enviado`,
  `Pago online · Pix/Cartão`, `Sem CPF — cobrar manual`, `Falhou — tentando de novo`), botão "Copiar link" quando há
  `invoiceUrl`. "Registrar pagamento" segue disponível; em mensalidade com link avisa que o link será cancelado.

## App
- "Meu plano": mensalidade aberta com `billingMode == 'asaas'` mostra "Pagar" → callable → abre o `invoiceUrl`
  (navegador externo). Erro "Informe seu CPF para pagar online." → folha com o campo de CPF (reusar o campo do Pix da
  reserva) e repete com `cpfCnpj`. Paga online mostra "Pago · Pix/Cartão".
- Assinar (A2): com `onlineBilling`, as formas Pix/cartão dizem "Link mensal: Pix ou cartão"; sem, "Combine o
  pagamento com a arena".
- Push `schedule_plan_charge_link`: abre `/meus-planos-horario` (o `url`).

## Fora
Pix Automático (Jornada 3) e cartão recorrente; NFS-e; cashback.

## Desvios do backend
O que o backend fez além (ou diferente) do texto acima — portal e app devem contar com isto:
- **Valor mínimo:** mensalidade abaixo de R$ 5,00 fica `manual` (a fatura "Pix ou cartão" do Asaas recusa menos que
  isso e o grupo ficaria em `failed` para sempre).
- **Arena apta na hora de decidir:** além da regra ligada, a decisão exige que a arena ainda receba online (pagamento
  online ligado e chave PIX de repasse). Se o gestor desligar isso depois, as mensalidades novas nascem `manual`.
  `getArenaSchedulePlanAvailability.onlineBilling` usa a mesma conta (regra && arena apta).
- **Erros de ligar a regra** (texto do `assertArenaCanBillOnline`, agora com o nome do produto):
  "Ative o pagamento online da arena antes de cobrar os planos de horário online." e
  "Cadastre a chave PIX de repasse da arena para receber os planos de horário online." (`failed-precondition`).
  `onlineBillingEnabled` que não seja booleano → `invalid-argument` "Cobrança online inválida.".
- **Callable `getArenaScheduleChargePaymentLink`, mensagens além das do contrato:**
  fora de `visibleTo` → `permission-denied` "Esta mensalidade não é sua."; paga → `failed-precondition`
  "Esta mensalidade já foi paga."; cancelada → `failed-precondition` "Esta mensalidade foi cancelada.";
  CPF digitado inválido → `invalid-argument` "CPF inválido. Confira os números."; o Asaas recusou criar →
  `unavailable` "Não foi possível gerar o link agora. Tente de novo em instantes.". Mensalidade ainda com
  `billingMode: null` é decidida ali mesmo. Grupo `pending`/`failed` é gerado na hora (não só esperado).
- **Espelho `asaas.state` na mensalidade** pode ser `pending`, `open`, `paid`, `failed`, `needs_cpf`, `voiding` ou
  `void` (o `failed` também é espelhado, para o selo "Falhou — tentando de novo"). Link vivo = `billingMode == 'asaas'`
  e `asaas.state == 'open'` com `invoiceUrl`; é o que o lembrete de atraso usa.
- **Campos extras do grupo:** `silentLink: true` quando o grupo nasce do "Pagar" (quem está pagando não recebe o push
  "Mensalidade disponível"); `voidError` (o Asaas não apagou — o webhook estorna se pagarem); `voidReason`:
  `manual_payment`, o `cancelReason` da mensalidade (`paused`, `subscription_ended`, `subscription_ending`),
  `canceled` (cancelada pelo gestor), `replaced` (grupo `needs_cpf` trocado pelo do "Pagar") ou `deleted_in_asaas`.
- **Descrição da fatura:** `Plano {nome do plano} · {mês}/{ano} · {nome da arena}`.
- **Varredura** devolve também `decided` (mensalidades `billingMode: null` decididas por ela) e `staleVoided`: grupos
  `pending`/`failed`/`open`/`needs_cpf` cuja mensalidade não está mais em aberto (ou aponta para outro grupo) são
  anulados por ela também — a anulação não depende só do gatilho.
- **`voidReason`** ganhou `paid_by_other_group`, `superseded` (mensalidade trocou de grupo), `charge_missing` e
  `charge_resolved`. Grupo `pending`/`failed` cuja mensalidade já foi resolvida vira `void` direto na reivindicação
  do worker (nada é criado no Asaas).
- **Anular com o Asaas fora do ar:** DELETE que falha e cuja consulta mostra a cobrança ainda pagável
  (`PENDING`/`OVERDUE`) — ou a consulta falha — mantém o grupo em `voiding` (`voidAttempts` conta); a varredura tenta
  de novo e, na 10ª, fecha `void` com `voidError`. O espelho fica `voiding` enquanto isso.
- **Volta da pausa:** ao regravar a mensalidade no mesmo id, o grupo vivo dela vai para `voiding` (`voidReason:
  paused`) na mesma transação.
- **Webhook:** pagamento cuja mensalidade aponta para outro grupo é estornado; o mesmo pagamento processado ao mesmo
  tempo por webhook e varredura é confirmado uma vez só (sem estorno nem crédito em dobro).

## Desconto no Pix (12/11/2026)

- Plano: `billing.pixDiscountPercent` (0–50, padrão 0; zera se o plano não aceita Pix). Assinatura guarda
  `pixDiscountPercent`; salvar o plano com outro valor regrava as assinaturas não canceladas dele (vale para as
  próximas faturas; fatura já criada fica como nasceu).
- A mensalidade (`amountReais`) segue cheia. O grupo Asaas guarda `amountReais` (base do cartão e do débito
  automático) e, com desconto, `pixAmountReais`/`pixDiscountPercent`: a fatura nasce **só Pix** (`billingType: PIX`)
  pelo valor com desconto, para o link não ser pago no cartão pelo preço do Pix. Valor do Pix em centavos
  arredondados; abaixo de R$ 5 não há desconto.
- Cartão pelo app: sempre cobrança à parte pelo valor cheio (+ taxas), mesmo sem taxa, quando a fatura é só Pix.
- Webhook: o caixa da arena recebe o que foi pago (já era `payment.value − taxa do cartão`); a mensalidade ganha
  `paidReais`.
- Fora: baixa manual (Pix direto na arena) não aplica o desconto sozinha; app da loja sem `method` só paga Pix
  quando há desconto.
