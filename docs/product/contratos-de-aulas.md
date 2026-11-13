# Contratos de aulas (aluno e professor)

Layout: canvas Claude Design "NexaGO" — página App do Atleta (`contratos-aulas/Aulas-app-01…08`, y≈97800),
Ecossistema (`Prof-app-01…03`, y≈96200) e Arena (`Arena-portal-01…03`, y≈62500).

## O que é

- **Atleta**: contrata um plano de aulas da arena pelo app — plano → professor → dias → lê o contrato
  até o fim → assina. Assinar = virar matrícula, na mesma transação. Pode ter vários planos ao mesmo
  tempo (um contrato por plano); não pode repetir a mesma turma.
- **Professor**: a arena envia o contrato; ele lê e assina no app (modo Professor › Arenas, ou pelo push).
- **Arena (portal)**: marca os professores de cada plano e "Contratar pelo app"; edita os modelos de
  contrato (aluno e professor); vê os assinados; envia/cancela o contrato do professor.

## Regras

- Tudo opt-in: plano só aparece no app com `availableInApp: true` (padrão desligado). Sem plano no app,
  o perfil da arena não mostra nada (`arenas/{id}.classSignupOpen`, mantido por `upsertArenaClassPlan`).
- `classPlans.teacherIds` = ids de `classTeachers`. Vazio = qualquer professor com turma ativa.
  O atleta vê só turmas (`type: turma`, ativas) dos professores do plano, com vaga por dia da semana.
- Plano mensal: escolher exatamente `classesPerWeek` horários. Pacote: 1 a 7.
- Cobrança: vencimento das Regras de aulas, valor da tabela, sem dispensa de taxa. Online quando a arena
  liga `onlineBillingEnabled` (pede CPF se não houver salvo); senão manual (paga na arena).
- Professor sem contrato **continua dando aula** (retrocompatível). Professor sem conta nexaGO não recebe.
- Reenviar o contrato do professor cancela o pendente; o assinado anterior vale até o novo ser assinado.
- Matrícula cancelada encerra o contrato do aluno (`ended`).

## Ciclos e cobrança — mesmo modelo dos Planos de horário

- `classPlans.cycles`: mensal (sem fidelidade), trimestral e semestral (desconto % e fidelidade de 3/6 meses,
  pagos mês a mês) e anual (desconto %, à vista: 12 meses numa cobrança, a 1ª proporcional). Desconto 0–50%
  sobre o mensal; ao menos um ciclo ligado. Ausente = só mensal. Pacote/avulsa não têm ciclo.
- `classPlans.billing`: formas aceitas (`pix`, `card`, `onsite`) e vencimento fixo (`dueDay`, null = o das
  Regras de aulas) ou à escolha do aluno (`dueDayOptions`, portal oferece 5/15/25).
- App: no plano escolhido o aluno escolhe ciclo, vencimento e forma. Pix/cartão = cobrança online (só com a
  cobrança online das Regras ligada); na arena = manual. A matrícula guarda `cycle`, `prepaidMonths`,
  `commitmentEndsOn`, `paymentForm`, `dueDay` e o valor do ciclo em `plan.priceReais`.
- Contrato: `{{plano.ciclo}}` ("trimestral, com fidelidade de 3 meses e pagamento mensal"), `{{plano.preco}}`
  com o desconto e `{{contrato.fidelidade}}` (fim da fidelidade).
- **Pagar ao assinar** (como nos Planos de horário): com Pix/cartão pelo app, assinar cria a matrícula em
  `pending_payment` com a vaga segurada por 30 min (`pendingPaymentUntil`) e leva à tela de pagamento (Pix com QR
  no app ou checkout do cartão — `getMyClassEnrollmentPayment`). Pago → `onArenaClassChargePaidActivateEnrollment`
  ativa; sem pagamento até o prazo + 5 min → `expireArenaClassPendingEnrollments` (a cada 5 min) cancela matrícula,
  cobranças, fatura e contrato e devolve a vaga (pagamento atrasado cai no estorno automático do webhook). Um plano
  sem pagar por vez. 1ª cobrança abaixo de R$ 5 (mínimo do Asaas) ou "na arena" = matrícula ativa na hora.
- **Recorrência**: depois de ativa, as mensalidades saem sozinhas pelo agendador (link Pix/cartão + aviso todo mês;
  anual renova os 12 meses de uma vez). Débito automático no cartão quando a tokenização do Asaas for liberada.
- Ainda não copiado dos Planos de horário: desconto no Pix e débito automático no cartão. Cancelar (pela arena) não
  devolve o que foi pago à vista.
- Substitui o `cyclePrices` (valor por mês absoluto, #1205), que deixou de ser lido.
- App da arena (Flutter) ainda matricula só no mensal (não manda `cycle`).

## Cancelamento pelo aluno (aviso prévio e multa)

Regras do plano (`classPlans.cancellation`, editor do plano no portal → "Cancelamento e multa"), copiadas para a
matrícula na assinatura (`enrollment.cancellationPolicy`): vale o que estava no contrato, não a regra de hoje.
Padrão sem regra gravada: **30 dias de aviso + multa de 50%**. Cláusula 5 do contrato padrão usa
`{{cancelamento.aviso}}` e `{{cancelamento.multa}}`.

- **Aviso prévio** (0, 15 ou 30 dias; até 90): as aulas e as mensalidades seguem até o fim do aviso (`endsOn`).
  Depois disso o agendador encerra a matrícula (`ended`, `endedReason: canceled_by_request`) e não gera mais meses.
- **Multa só por quebra de fidelidade** (trimestral/semestral, quando `commitmentEndsOn` passa do fim do aviso):
  % × valor mensal × mensalidades que faltariam do fim do aviso até o fim da fidelidade (mês começado conta
  inteiro), ou um valor fixo. Vence em 3 dias. Vira a cobrança `{matrícula}_penalty`; com cobrança online, Pix/cartão
  pelo app (`getMyClassEnrollmentPayment` com `kind: 'penalty'`). Não pagar **não desfaz** o cancelamento.
- **Mensal** (sem fidelidade): só o aviso. **Anual à vista**: encerra no fim do período pago, sem reembolso e sem
  multa. **Pacote**: encerra na hora.
- App: "Cancelar plano" no card do plano em Treinos → motivo (e outras saídas) → como fica (linha do tempo +
  multa) → pagar a multa ou "Pagar depois" → cancelamento agendado. A arena recebe push.
- Portal: Aulas → **Cancelamentos** — pedidos, multa em aberto/paga/isenta, e as ações *isentar multa*,
  *encerrar agora* e *desfazer* (volta a matrícula ao normal e anula a multa em aberto).
- Callables: `previewMyClassCancellation`, `cancelMyClassEnrollment` (atleta); `waiveClassCancellationPenalty`,
  `undoClassCancellation` (arena, área `agenda`). A multa entra no repasse como taxa (fica com a arena).

## Assinatura

Assinatura eletrônica simples (mesmo critério dos contratos do CT): sessão autenticada + aceite explícito
+ leitura até o fim + evidências (IP, user-agent, plataforma, versão do app, tempo de leitura) + `sha256`
do texto mostrado. O servidor refaz o texto e confere o hash; diferente = "o contrato mudou, revise".

## Dados

- `arenas/{a}/agreementTemplates/{student|professor}` — modelo publicado (título, corpo, versão). Sem
  modelo = padrão do nexaGO (`DEFAULT_TEMPLATES` em `arena-agreements-model.ts`).
- `arenaAgreements/{id}` — texto congelado + hash + comprovante. Aluno: id `enr_{matrícula}`.
- Os dois só pelo servidor (rules negam o cliente); leitura sempre por callable.

## Callables (`functions/src/arena-agreements.ts`)

Atleta/professor: `getArenaClassSignupOptions`, `previewMyArenaClassEnrollment`, `enrollMeInArenaClassPlan`,
`getMyArenaAgreements`, `getMyArenaAgreement`, `signMyArenaAgreement`.
Arena (área `agenda`): `getArenaAgreementTemplates`, `saveArenaAgreementTemplate`, `listArenaAgreements`,
`getArenaAgreement`, `previewArenaProfessorAgreement`, `sendArenaProfessorAgreement`, `cancelArenaAgreement`.
Mudou: `upsertArenaClassPlan` (aceita `teacherIds`/`availableInApp`, grava `classSignupOpen`) e
`setArenaClassEnrollmentStatus` (encerra o contrato).

Push: `professor_agreement_pending` (sem `url`/`arenaId`, o app novo resolve pelo tipo) e
`arena_agreement_signed` para quem enviou.

## Deploy

Cancelamento: as 4 callables novas + `upsertArenaClassPlan`, `generateArenaClassMonthlyCharges` (agendador),
`setArenaClassEnrollmentStatus`, `getMyTrainingPlans`, `getMyClassEnrollmentPayment`,
`onArenaClassChargePaidActivateEnrollment`, `createArenaClassEnrollment` e as do contrato → portal → app.

Functions (as 13 novas + `upsertArenaClassPlan` + `setArenaClassEnrollmentStatus`) → rules → portal da arena
→ app. Sem índice novo (consultas de igualdade simples).
