# Portal do Centro de Treinamento — desenho (MVP web)

Protótipo: Claude Design "NexaGO Centro de Treinamento (Canvas)" — telas web W1–W23
(`ct-web-a/b/c.jsx`). As telas G* (app de gestão) e P* (app do professor) são mobile e ficam
para o Flutter.

## Projeto

`frontend/projects/center` (Angular 20, standalone, zoneless, signals), mesmo padrão do `coach`.
`npm run start:center` (porta 4215 no `.claude/launch.json`) / `npm run build:center`.
Deploy como os outros portais: build de produção + upload manual (Hostinger), `.htaccess` em
`public/`.

## Acesso

- Login com a conta NexaGO (e-mail/senha ou Google). Não há claim de papel.
- Papel é **por centro**: `trainingCenters/{c}/centerMembers/{uid}` (`center_owner`,
  `center_admin`, `coach`, `receptionist`) + `extraPerms`. Matriz em `domain/roles.ts`, espelhada
  em `firestore.rules` (`ctHasPerm`).
- "Meus centros" = collection group `centerMembers` por `uid`; convites = collection group
  `centerInvites` por e-mail. Aceitar exige e-mail **verificado** (a rule confere).
- Revogar vale na próxima requisição (a rule relê o vínculo).
- URL `/centro/:centerId/<área>`; papel sem acesso à área → W6 (acesso negado, registrado em
  `auditLogs`).

## Dados (`trainingCenters/{centerId}/…`)

`centerMembers`, `centerInvites`, `programs` (modalidade + níveis), `courts`, `classes` (regra
recorrente), `sessions` (`{classId}_{dayKey}`, geradas 8 semanas à frente e estendidas ao abrir a
agenda), `students`, `plans`, `enrollments` (com **snapshot do contrato**), `invoices`,
`auditLogs` (só cria).

## Regras de negócio

- Centro nasce `pending`; matrícula/cobrança só com `active`; `suspended` = somente leitura.
  Status, recebimento e assinatura só o backoffice/Admin SDK
  (`functions/scripts/set-training-center-status.js`).
- Vaga: `classes.seatsTaken` muda em transação junto da matrícula; nunca passa da capacidade
  (rule). Turma lotada no commit → `full`, sem gravar; tela oferece fila ou outra turma.
- Preço novo vale para contratações a partir da data; contratos guardam preço e políticas do dia.
- Recebido = só cobrança aprovada. Aprova o provedor (webhook/consulta) ou a confirmação manual
  com comprovante + motivo, auditada; as duas ativam a matrícula pendente na mesma transação.

## Cobrança online (Asaas)

`functions/src/training-center-billing.ts` (+ `-model.ts`, testes em `training-center-billing.test.ts`).

- **Conta de recebimento:** `trainingCenterReceiving/{c}` (`walletId` Asaas, `asaasEnv`, `feePercent`
  opcional; rules negam tudo) + `receivingConnected` no centro, gravados por
  `functions/scripts/set-training-center-status.js --wallet-id <id> [--asaas-env production] [--fee 5] --yes`.
  A fatura nasce na conta NexaGO com **split** de `100 − fee`% (padrão 5% de taxa) para o centro.
- **Gerar** (`issueTrainingCenterInvoicePayment`, owner/admin, centro ativo): fatura hospedada
  (Pix ou cartão), `externalReference = trainingCenterInvoice:{c}:{invoiceId}`, chave de
  idempotência por cobrança + `providerAttempt`. Grava `providerRef/providerUrl/providerStatus`,
  evento `provider` e auditoria; push para o aluno com conta. A cobrança segue **pendente**.
  Pagador: CPF do perfil do atleta (aluno com conta) ou CPF informado no portal
  (`trainingCenterPayers/{c}_{studentId}`, só servidor).
- **Webhook** (ramo no `asaasWebhook`): pago → `approved` + evento + matrícula `pending → active`
  (`holdUntil` null) numa transação; repetido = no máximo um evento "sem efeito"; pago com a
  cobrança fora de pendente (cancelada, baixa manual, fatura trocada) → **estorno automático**.
  Estorno/contestação no provedor só mexe em cobrança aprovada por ele.
- **Gatilho:** cobrança que sai de `pending` sem o provedor (baixa manual, cancelamento, reserva
  vencida) → apaga a fatura no Asaas.
- **Varredura (15 min):** reserva vencida (`holdUntil` no passado, inclusive vaga oferecida da fila)
  → primeiro pergunta ao Asaas; se não pagou, cancela a matrícula, devolve `seatsTaken` e cancela a
  cobrança. Pendentes geradas no provedor são consultadas 2h depois e então a cada 2h (1º dia) /
  12h (`providerCheckAt`).
- **Portal (drawer W22):** "Gerar Pix/cartão", "Consultar provedor agora", "Reenviar Pix"
  (copia-e-cola + link; push se o aluno tem conta). Campos `provider*` só o servidor grava (rules).
- Aula cancelada nunca consome crédito; com "reposição automática" cada matriculado ganha +1.
- Datas sempre como parede no fuso do centro (`domain/dates.ts`).

## Fora do MVP (follow-ups)

- Oferecer a vaga liberada ao próximo da fila automaticamente (hoje a varredura só libera; a
  oferta segue manual na tela de Matrículas).
- Onboarding da conta de recebimento pelo próprio centro (subconta Asaas criada pela NexaGO, como
  a do professor) — hoje o `walletId` entra pelo script.
- Notificações (push/e-mail) de cancelamento de aula, vaga aberta e convite.
- Telas do app (G1–G19, P1–P9) e chamada pelo professor no app (a rule já aceita o professor
  marcar presença na própria aula).
- Tela de centros no backoffice (ativar/suspender/assinatura).
