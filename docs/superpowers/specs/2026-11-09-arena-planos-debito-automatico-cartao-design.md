# Planos de horário — débito automático no cartão

Continua a [cobrança online dos planos](2026-11-03-arena-planos-cobranca-online-design.md). Hoje cada mensalidade
online vira um link Asaas (Pix ou cartão) e o atleta paga na mão, todo mês. Este desenho troca o "pagar todo mês"
por "autorizar uma vez": o atleta salva um cartão, liga o débito automático no plano e cada mensalidade é debitada
sozinha no vencimento. Se o débito falhar, a mensalidade cai no link de hoje, sem perder nada.

## Por quê
O plano de horário é uma vaga fixa vendida por mês. Hoje, quando o atleta esquece de pagar, a mensalidade atrasa,
o lembrete dispara e, depois de `overdueReleaseDays`, a assinatura é suspensa e o horário fica livre. Com o débito
automático, a arena recebe no dia e o atleta não precisa abrir o app.

## Metas
- O pagador (titular ou membro do rateio) autoriza uma vez por plano. A partir daí, cada mensalidade online dele é
  debitada no cartão salvo no dia do vencimento.
- Débito recusado volta para o fluxo de hoje (link Pix/cartão + régua de atraso), com push explicando.
- O atleta vê o que vai ser debitado, quando e quanto, e desliga quando quiser.
- O gestor vê no portal quais mensalidades estão no débito automático e o que aconteceu com cada uma.

## Fora (não-metas)
- Pix Automático (ver o bloqueio em `pix-automatico-asaas-regras`: liberação do Asaas, CNPJ ≥ 6 meses, split no QR).
- Aulas e CT. Eles reaproveitam o cartão salvo e o worker depois, num PR próprio.
- Usar o cartão salvo em reservas, inscrições ou loja.
- Mais de um cartão por atleta.
- Assinatura do Asaas (`/v3/subscriptions`). Ver "Decisões".

## Anti-metas (falha mesmo que "funcione")
- Debitar duas vezes a mesma mensalidade.
- Debitar sem o atleta ter ligado o débito naquele plano, com o valor e o cartão à vista.
- Guardar número do cartão ou CVV em qualquer lugar nosso (Firestore, log, Crashlytics, erro devolvido).
- Debitar mensalidade que o gestor deu baixa, cancelou, pausou ou que já foi paga pelo link.

## Pré-requisito externo (do dono)
- **Tokenização de cartão habilitada no Asaas de produção.** Os docs dizem que, em produção, ela "depende de
  habilitação e está sujeita à análise da operação"; o pedido é feito ao atendimento do Asaas. No sandbox funciona sem
  pedir.
- Na mesma conversa com o Asaas, perguntar:
  1. se uma cobrança paga com cartão pela fatura (`invoiceUrl`) devolve um `creditCardToken` reutilizável. Se sim,
     dá para salvar o cartão sem ele passar pelo nosso servidor (ver "Alternativa à tela de cartão");
  2. o valor mínimo de uma cobrança com cartão por token.
- O DEV usa o ambiente que o segredo `ASAAS_ENV` disser. Como o app da loja aponta para o DEV, tratar o DEV como
  produção: a chave abaixo só liga depois da habilitação.

## Decisões
- **Cartão salvo + uma cobrança com token por mensalidade, não assinatura do Asaas.** O motor de mensalidades é nosso
  e os valores mudam de um mês para o outro: 1ª proporcional, volta da pausa proporcional, rateio (uma mensalidade por
  pagador), mês pausado sem cobrança, cancelamento no fim do ciclo. Uma assinatura do Asaas geraria as cobranças por
  conta própria, e seriam duas fontes de verdade. Pior: os docs dizem que mudar valor ou vencimento de assinatura com
  cartão exige a tokenização habilitada, ou seja, ela não tira a dependência. Com o token, o motor continua igual e só
  o passo de pagar muda: em vez de criar o link, o servidor cobra o token no vencimento.
- **Desligado por padrão, por ambiente:** `appConfig/payments.scheduleCardAutopay` (booleano, ausente = `false`).
  Com a chave desligada, tudo continua como hoje e as telas novas não aparecem. Assim o código vai ao ar antes da
  habilitação no Asaas.
- **Vale só onde a mensalidade já seria online:** `billingMode == 'asaas'` (regra da arena ligada, arena apta,
  forma ≠ `onsite`, pagador com conta, valor ≥ R$ 5). Mensalidade `manual` nunca é debitada.
- **Por pagador e por plano.** Cada membro do rateio liga o próprio débito com o próprio cartão. Ligar num plano não
  liga nos outros.
- **Taxa igual à do cartão de hoje.** O débito cobra o valor da mensalidade mais o acréscimo do cartão
  (`cardSurcharge`, o mesmo do checkout com cartão, #1088). A tela de ligar e o aviso antes do débito mostram
  "R$ X + taxa do cartão R$ Y = R$ Z". Para a arena, nada muda: ela recebe o mesmo valor que receberia pelo link.
- **Duas tentativas, depois link.** A 1ª no dia do vencimento e a 2ª no dia seguinte. Se as duas falharem, a
  mensalidade ganha o link de hoje e o push "Não conseguimos debitar".
- **Pagar antes continua valendo.** O "Pagar" (Pix ou cartão) segue disponível em mensalidade agendada para débito. Se o
  atleta pagar, o débito do vencimento é pulado.

## Dados
- `users/{uid}/asaas/savedCard` (só servidor; o catch-all das rules já nega, mas pôr a regra explícita como as de
  `arenaScheduleAsaasPayments`):
  `{creditCardToken, brand, last4, expiryMonth, expiryYear, holderName, customerId, env, remoteIp, createdAt, updatedAt}`.
  `env` = `getAsaasEnvTag()`. Token de outro ambiente conta como "sem cartão".
- Assinatura (`arenaScheduleSubscriptions/{id}`) ganha
  `autopay: {[athleteId]: {enabled: boolean, brand, last4, consentAt, consentText, updatedAt}}`. Só o servidor grava.
  O app já lê a assinatura.
- Mensalidade (`arenaScheduleCharges/{id}`) ganha
  `autopay: {state, scheduledFor: 'AAAA-MM-DD', attempts: 0..2, lastAttemptAt|null, lastError|null, groupId|null,
  brand, last4, chargedReais}` ou fica sem o campo.
  `state`: `scheduled → charging → paid`, `charging → retry → charging` (2ª tentativa), `failed` (caiu no link), `skipped`
  (saiu de "em aberto" antes do débito, ou o débito foi desligado ou o cartão removido).
- **Um grupo por mensalidade, como hoje.** A cobrança com token é mais um pagamento dentro do grupo da mensalidade
  (`arenaScheduleAsaasPayments/{groupId}`, o mesmo para o qual aponta o espelho `asaas.groupId`), no padrão que o
  checkout de cartão (`scheduleCardCheckout`) já usa: outro `paymentId`, `externalReference: arenaSchedulePayment:{groupId}`
  e o acréscimo em `cardCharges.{paymentId}`, **gravado antes do POST** (o webhook pode chegar antes da resposta).
  Nada de grupo paralelo, porque o webhook estorna pagamento de grupo que não é o do espelho, e a varredura anula
  como `superseded` o grupo que deixou de ser o do espelho.
  - Mensalidade que já tem grupo (link vivo, como a 1ª ao assinar): o débito usa esse grupo e o link continua
    pagável. O que for pago primeiro quita; o outro é estornado pela regra de hoje ("mensalidade já resolvida").
  - Mensalidade agendada sem grupo: o débito cria o grupo no estado novo `autopay`, que o
    `onArenaScheduleAsaasPaymentWritten` ignora (não chama `ensureScheduleAsaasPayment`), e aponta o espelho para
    ele. Se o débito falhar de vez, o grupo passa para `pending` e o fluxo de hoje gera o link nele mesmo.
  - Recusa não anula o grupo: só registra a tentativa.
  - Tudo que hoje pergunta "esta mensalidade foi paga no Asaas?" olhando só `group.paymentId` passa a olhar também
    os `paymentId` de `tokenCharges` (abaixo). O caso conhecido é `firstChargePaidAtAsaas`, o prazo de 30 min.
- Grupo ganha `tokenCharges.{attemptId}: {paymentId|null, source: 'autopay'|'manual', status, error|null, at}`.
  `attemptId` é um id aleatório gerado na transação que reivindica a tentativa. A chave de idempotência no Asaas é
  `schedule-token-{env}-{attemptId}`: única por tentativa, então trocar o cartão, pagar na mão depois de uma
  recusa ou voltar da pausa (mensalidade regravada no mesmo id) nunca reaproveita uma resposta antiga do Asaas.
  Repetir o POST da MESMA tentativa (travada sem `paymentId`) usa a mesma chave, e o Asaas devolve a mesma
  cobrança em vez de criar outra.

## Backend
- **Salvar cartão:** callable `saveMyPaymentCard({number, holderName, expiryMonth, expiryYear, ccv, postalCode,
  addressNumber})` → `{brand, last4}` (região de cliente).
  - Usa o cliente Asaas do atleta (`getOrCreateAsaasCustomer`; sem CPF → `failed-precondition`
    "Informe seu CPF para pagar online.", a mesma mensagem e folha de hoje). Nome, e-mail, CPF e telefone do
    `creditCardHolderInfo` saem do cadastro.
  - Chama `POST /v3/creditCard/tokenizeCreditCard` com o `remoteIp` da requisição. Grava só o que está em
    `savedCard`. Número e CVV nunca entram em log, erro ou Firestore. Os logs desta callable não imprimem `request.data`.
  - Trocar de cartão = salvar de novo: o novo substitui o anterior e vale para todos os planos com débito ligado
    (`autopay.{uid}.brand/last4` atualizados).
  - No máximo 5 tentativas por atleta a cada 24 h (contador em `users/{uid}/asaas/savedCardAttempts`), contra teste de
    cartão roubado. Estourou → `resource-exhausted` "Muitas tentativas. Tente de novo amanhã.".
  - Asaas recusou → `invalid-argument` com a mensagem do Asaas traduzida ou, sem mensagem, "Não foi possível validar
    este cartão. Confira os dados.".
- `getMyPaymentCard()` → `{brand, last4, expiryMonth, expiryYear} | null`. `removeMyPaymentCard()`: apaga
  `savedCard`, desliga `autopay.{uid}` em todas as assinaturas e passa as mensalidades `scheduled`/`retry` dele para o
  fluxo do link (abaixo).
- **Ligar/desligar:** callable `setScheduleAutopay({subscriptionId, enabled})` → `{enabled, brand, last4}`.
  - Quem chama precisa ser pagador de alguma mensalidade da assinatura (titular ou membro do rateio). A assinatura
    não pode estar `canceled` nem ter `endsOn` no passado. A arena precisa estar apta à cobrança online, a chave de
    ambiente ligada e o cartão salvo existir, no mesmo ambiente.
  - Erros: sem cartão → `failed-precondition` "Salve um cartão para ligar o débito automático."; arena sem cobrança
    online → `failed-precondition` "Esta arena não recebe online."; chave desligada → `failed-precondition`
    "Débito automático indisponível no momento.".
  - Ligar grava `consentAt` e `consentText` (o texto que a tela mostrou, mandado pelo app em `consentText`) e marca
    como `scheduled` as mensalidades `open` dele com `billingMode == 'asaas'`, ainda sem pagamento, que vencem hoje
    ou depois. Mensalidade que já tem link vivo continua com o link e ganha `scheduled` também; se for paga pelo
    link antes, o débito é pulado.
  - Desligar marca como `skipped` as `scheduled`/`retry` dele e garante o link (cria o grupo, como a decisão de hoje
    faz).
- **Decisão da mensalidade** (`decideScheduleChargeBilling`): quando decide `asaas` e o pagador tem débito ligado
  na assinatura e cartão salvo válido para o mês do vencimento, grava `autopay.state: 'scheduled'`,
  `scheduledFor: dueDate`, e **não cria o grupo do link** (nem manda o push "Mensalidade disponível"). Cartão
  vencido antes do mês do vencimento → segue o link de hoje e manda o push "Seu cartão final 1234 venceu".
- **Aviso antes:** a rodada diária (`runArenaScheduleSubscriptionsDaily`, 04:10) manda, 3 dias antes de
  `scheduledFor`, o push `schedule_plan_autopay_upcoming`: "Dia DD/MM vamos debitar R$ Z no cartão final 1234
  (plano X)". Uma vez por mensalidade.
- **Débito:** `chargeArenaScheduleAutopay`, todo dia às 06:00 (São Paulo), e o mesmo núcleo na varredura de 30 min
  para destravar:
  - pega as mensalidades `autopay.state in (scheduled, retry)` com `scheduledFor <= hoje`;
  - em transação: confere que a mensalidade está `open` e sem pagamento, que o débito do pagador segue ligado, que o
    cartão existe e é deste ambiente, que a chave `scheduleCardAutopay` está ligada e que a arena continua apta à
    cobrança online. Se tudo estiver certo, vai para `charging`, `attempts + 1`, gera o `attemptId` e cria o grupo
    `autopay` se faltar. Se não, vai para `skipped` e, se ainda estiver aberta, garante o link (com o push normal
    "Mensalidade disponível"). Desligar a chave é, portanto, o freio de emergência: nenhuma agendada é debitada
    depois disso; cada uma cai no link no próprio dia de débito, não todas de uma vez;
  - fora da transação: `POST /v3/payments` com `billingType: CREDIT_CARD`, `creditCardToken`, `remoteIp` (o gravado
    em `savedCard`), `value` = valor + acréscimo do cartão, `dueDate` = hoje e `description` igual à da fatura de hoje;
  - resposta `CONFIRMED`/`RECEIVED` → `paid` pelo mesmo caminho do webhook (o webhook que chegar depois não faz nada
    de novo). Recusa (HTTP 400 ou `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` no webhook) → a tentativa fica `refused` em
    `tokenCharges` e, se for a 1ª, `retry` com `scheduledFor = amanhã`; se for a 2ª, `failed` + link (grupo
    `autopay` → `pending`; grupo que já tinha link segue com ele) + push
    `schedule_plan_autopay_failed` "Não conseguimos debitar R$ Z no cartão final 1234. Pague por Pix ou cartão.";
  - travado em `charging` há mais de 15 min: com `paymentId`, consulta no Asaas (pago → `paid`; recusado → recusa).
    Sem `paymentId`, repete o POST com o MESMO `attemptId` e a mesma chave. Nunca abre outra tentativa por cima de
    uma travada.
  - rede de segurança na varredura: mensalidade `scheduled`/`retry` com `scheduledFor` 2 ou mais dias no passado
    (o job das 06:00 não rodou) vai para `skipped` e garante o link. Nenhuma mensalidade fica parada sem débito e
    sem link.
  - pago → push `schedule_plan_autopay_paid` "Mensalidade do plano X paga no cartão final 1234".
- **Atraso e suspensão:** a régua e a suspensão seguem o `dueDate` de sempre, mas não contam a mensalidade enquanto
  ela estiver em `scheduled`, `retry` ou `charging` (está na janela das tentativas). Depois de `failed` tudo volta
  como hoje. Sem isso, uma arena com `overdueReleaseDays: 1` suspenderia antes da 2ª tentativa.
- **Primeira mensalidade ao assinar** (`pending_payment`, 30 min): callable `payScheduleChargeWithSavedCard({chargeId})`
  cobra a mensalidade agora com o token (o mesmo núcleo do débito, sem esperar o vencimento e sem 2ª tentativa:
  recusa = erro na tela). Pago → o gatilho ativa a assinatura, como hoje. A mesma callable vale para o "Pagar com
  cartão salvo" em qualquer mensalidade aberta, inclusive em `failed`.
  - O pagamento na mão entra em `tokenCharges` com `source: 'manual'` e **não conta como tentativa**: não mexe em
    `attempts`. Recusa na tela não muda `autopay.state`. Pago → `autopay.state: 'paid'` (se havia agendamento).
  - Não roda enquanto a mensalidade estiver em `charging` (`failed-precondition` "Estamos debitando esta mensalidade.
    Aguarde um instante.").
  - Recusa → `invalid-argument` com a mensagem do Asaas traduzida ou "O cartão foi recusado. Tente outro cartão ou
    pague com Pix.".
- **Saiu de "em aberto"** (baixa manual, cancelamento, pausa, encerramento): o gatilho de hoje já anula grupo vivo;
  passa também `autopay.state` de `scheduled`/`retry` para `skipped`. Se estiver `charging`, a transação do débito já
  não deixa cobrar; se a cobrança passar mesmo assim, o webhook estorna (regra de hoje).
- Índice: `arenaScheduleCharges (autopay.state, autopay.scheduledFor)`.
- Testes com deps injetadas (como `ScheduleAsaasDeps`) e FakeFirestore. Casos obrigatórios:
  - débito no dia;
  - recusa → retry → pago;
  - recusa 2× → link;
  - pago pelo link antes do vencimento → débito pulado;
  - baixa manual entre `scheduled` e o débito;
  - dois workers ao mesmo tempo → uma cobrança só;
  - `charging` travado → consulta ou repete com a mesma chave, não duplica;
  - recusa → troca de cartão → pagar na mão cobra de verdade (chave nova);
  - 1ª ao assinar com link vivo + token no mesmo grupo → ativa; link pago depois → estornado;
  - chave desligada ou arena inapta no dia → `skipped` + link;
  - agendada esquecida 2 dias → varredura põe link;
  - desligar com mensalidade agendada → link;
  - cartão removido;
  - cartão vencido;
  - suspensão não conta `scheduled`/`retry`;
  - rateio com um membro no débito e outro no link;
  - número e CVV nunca aparecem no que é gravado ou logado.

## App
- **Meu plano** ganha o card "Débito automático":
  - desligado: "Pague todo mês sem abrir o app" + "Ativar";
  - ligado: "Cartão Visa final 1234 · próxima: DD/MM, R$ Z" + "Trocar cartão" + "Desligar";
  - "Ativar" sem cartão salvo abre a tela de cartão e volta. Com cartão, abre a confirmação com valor, taxa, dia e
    cartão, e o texto de autorização (mandado como `consentText`).
- **Tela de cartão:** número, nome impresso, validade, CVV, CEP e número do endereço. Usa o CPF do cadastro; sem CPF,
  a folha de CPF de hoje. Os dados vão direto para a callable, sem cache, rascunho ou log local.
- **Assinar (A2):** na forma "Cartão", com a chave ligada e a arena online, aparece o checkbox "Debitar todo mês
  neste cartão", marcado. Com ele marcado, o fluxo é: salvar o cartão (se faltar) → assinar →
  `payScheduleChargeWithSavedCard` da 1ª → `setScheduleAutopay(true)`.
- **Mensalidade agendada:** "Será debitada em DD/MM no cartão final 1234", com "Pagar agora" ao lado. Falhou: o
  "Pagar" de hoje com o aviso "Não conseguimos debitar".
- **Cobranças (#1080):** a mesma linha mostra o selo "Débito automático em DD/MM".
- **Sua conta → Cobranças → Cartão salvo:** mostra o cartão e "Remover". A confirmação avisa que o débito automático
  de todos os planos será desligado.
- Push `schedule_plan_autopay_*` abre `/meus-planos-horario`.

## Portal da arena
- Mensalidade: selo "Débito automático · agendado DD/MM", "Débito automático · pago", "Débito recusado · link
  enviado".
- Assinatura: "Débito automático ligado" por pagador. O gestor não liga nem desliga: a autorização é do atleta.
- "Registrar pagamento" em mensalidade agendada avisa que o débito será cancelado.

## Alternativa à tela de cartão
Se o Asaas confirmar que a fatura paga com cartão devolve `creditCardToken`, troca-se a tela de cartão por "pague a
1ª pelo checkout do Asaas e o cartão fica salvo". Assim o número do cartão não passa pelo nosso servidor, e só
`saveMyPaymentCard` muda (vira um passo depois do webhook). O resto do desenho fica igual.

## Deploy
Índice → functions (callables novas, `chargeArenaScheduleAutopay`, gatilhos e varredura alterados, webhook) → rules
→ portal → app. A chave `scheduleCardAutopay` só liga depois que o Asaas habilitar a tokenização e de um teste com
cartão real no DEV. Desligar a chave para os débitos novos. Os que estão em `charging` terminam.
