# Aulas — cobrança online das mensalidades (Asaas)

Continua a [fase 2](2026-10-19-arena-aulas-fase-2-design.md). Antes, a mensalidade era só manual.
Agora a arena pode cobrar online pelo Asaas, pela mesma conta e pelo mesmo caixa do aluguel online.

## Decisões
- **PIX ou cartão por link mensal.**
  - Cada mensalidade online vira uma cobrança Asaas `billingType: UNDEFINED`: o aluno escolhe PIX ou cartão na fatura hospedada.
  - O link vai no "Cobrar" (WhatsApp) e num push para quem tem conta (`arena_class_charge_link`, `invoiceUrl`).
  - Funciona para aluno sem conta NexaGO, desde que tenha CPF.
- **Débito automático no cartão** (assinatura Asaas) fica para depois de um teste no sandbox. A doc não garante que o cartão digitado na 1ª fatura seja cobrado sozinho, e tokenizar exige liberação da conta.
- **Taxa igual à do aluguel online:**
  - `resolveArenaBookingFeePercent`: Pro 6%, Elite 5%, mínimo R$ 1,50;
  - mais a taxa do cartão (`value − netValue`), quando é cartão;
  - sem cashback e sem NFS-e nesta versão;
  - manual continua sem taxa.
- **Regra `onlineBillingEnabled`:** desligada por padrão. Para ligar, a arena precisa do pagamento online ativo e da chave PIX de repasse (`assertArenaCanBillOnline`).
  - `saveArenaClassRules` mantém o valor salvo quando o campo não vem (`mergeClassRulesInput`). Assim o app antigo não desliga nada calado.
- **Modo de cobrança `billingMode: manual | asaas`** na matrícula e na mensalidade. Não entra em `paymentMethod`, porque builds antigos leriam valor desconhecido como "pix".
- **CPF:**
  - O CPF digitado pela arena vai para `arenaClassBillingProfiles/{arenaId}_{studentId}` (só servidor). Ele vira cliente Asaas com `externalReference: classStudent:{arenaId}:{studentId}` e nunca é gravado no cadastro do atleta.
  - Atleta com CPF no cadastro reaproveita o cliente dele (`getOrCreateAsaasCustomer`).
  - A matrícula guarda só `cpfMasked`.
  - Sem CPF, a matrícula online é recusada. Se o CPF sumir depois, o grupo fica `needs_cpf` (cobra manual).

## Como funciona
- **Grupo** `arenaClassAsaasPayments/{groupId}` (só servidor) = UM pagamento Asaas, `externalReference: arenaClassPayment:{groupId}`.
  - Na matrícula, o 1º mês proporcional + taxa saem juntos (`{e}_first`).
  - Na volta da pausa, `{e}_resume_{mês}`.
  - No agendador, a mensalidade do mês (id = id da mensalidade).
  - As mensalidades guardam o espelho `asaas: {groupId, state, invoiceUrl, status}` para as telas.
- **Transações nunca chamam o Asaas.** Matrícula, agendador, volta da pausa, baixa manual e cancelamento só gravam o grupo `pending` (ou `voiding`).
- **Worker** (`asaas-class-billing.ts`): gatilho `onArenaClassAsaasPaymentWritten` + varredura `reconcileArenaClassAsaasPayments` (30 min).
  - `ensureClassAsaasPayment`:
    - assume o grupo numa transação (`pending|failed → creating`);
    - cria a cobrança com a chave `class-pay-{env}-{groupId}`, então a retentativa devolve a mesma;
    - grava o link e manda o push.
  - `voidClassAsaasPayment`: apaga a cobrança e reagrupa as mensalidades que seguem em aberto (`{groupId}_v{n}`). Exemplo: a taxa paga em dinheiro → o mês segue online sozinho.
  - Cobrança criada depois da anulação é apagada pelo próprio worker.
  - A varredura:
    - retenta `pending`/`failed`/`voiding`;
    - destrava `creating` velho;
    - consulta no Asaas as abertas que vencem em até 3 dias (no máximo a cada 6h). Isso cobre webhook perdido, já que o `asaasWebhook` sempre responde 200.
- **Webhook** (`asaas-arena-class-webhook.ts`), roteado antes do ramo genérico de assinatura. Fases de `resolvePaymentPhases`:
  - PIX `RECEIVED` → mensalidades pagas (`paidVia: "asaas"`) + crédito no caixa (`creditArenaWalletFromBookingPayment`, idempotente; extrato com `source: "class"`);
  - cartão `CONFIRMED` → pagas + "a liberar"; `RECEIVED` → crédito.
  - Pago com o grupo anulado ou mensalidade fora de "em aberto" → **estorno**.
  - `OVERDUE` só espelha o status (não cancela).
  - Removido no Asaas → grupo `void` (volta a ser manual).
  - Estorno/chargeback depois de pago: a mensalidade fica paga, o "a liberar" é solto e o log grita.
- **Baixa manual** de mensalidade online pede a anulação do grupo. "Desfazer" pago online é recusado (é estorno). "Desfazer" uma baixa manual gera link novo.
- **Cancelar a matrícula** anula os grupos das mensalidades futuras canceladas. Pausar não mexe: as mensalidades já geradas seguem em aberto, como no manual.

## Teste e QA
- O DEV aponta para o Asaas de **produção**. Os testes injetam o Asaas por `ClassAsaasDeps`/`ClassWebhookDeps`.
- No emulador, o Asaas é recusado fora do sandbox (`ASAAS_BLOCKED_IN_EMULATOR`).
- A regra fica desligada no DEV até um teste combinado.
