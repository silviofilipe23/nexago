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

## Locais (fixo e itinerante)

Protótipo: seção "Locais · fixo e itinerante" (L1–L5 web; L6–L7 são do app).

- `locations/{id}`: `type` próprio (o CT administra o espaço; quadras em `courts.locationId`),
  parceiro (arena de terceiros, `windows` = janela contratada, `courtsLabel`, contato) ou avulso
  (só endereço); `isPrimary` (um só); `status` active|archived — **nunca excluído** (rule nega
  delete): aula passada continua mostrando onde foi.
- Turma: `locationId/locationName` = local padrão (+ quadra só em local próprio). Aula copia o
  local e o endereço (`locationAddress`) na geração e pode trocar **só na data** (L3), com
  checagens de janela do parceiro, quadra livre, agenda e deslocamento do professor.
- Conflitos de turma: além de professor/quadra, `window` (fora da janela contratada) e `travel`
  (mesmo professor em outro local sem a folga `policies.travelBufferMinutes`, padrão 30 min —
  intervalo fixo em vez de distância real, que exigiria serviço de mapas).
- Arquivar (L4): mover turmas e aulas futuras para outro local (as da próxima semana ficam
  "alteradas" e avisam os alunos), manter as já marcadas, ou cancelar as futuras com reposição
  (só quando nenhuma turma usa o local como padrão).
- Centro novo escolhe "Sede própria" (vira o local principal) ou "Itinerante" (sem local
  próprio; a tela de Locais mostra a semana por local, L5).
- Migração: centro de antes dos locais (quadras sem `locationId`) ganha a "Sede" (id fixo
  `sede`, principal) com quadras, turmas e aulas futuras penduradas — feita pelo primeiro gestor
  que abre o painel; idempotente.
- Aviso: aula com local trocado gera push "Local alterado" com o endereço novo.
- Mapa: link "Abrir no mapa" pelo endereço (sem mapa embutido nem coordenadas por enquanto).

## Cobrança recorrente das mensalidades

- **Assinatura** `subscriptions/{enrollmentId}`: nasce no servidor quando uma matrícula MENSAL fica
  ativa (gatilho `onTrainingCenterEnrollmentBilling`), com preço do contrato, dia de vencimento da
  política (`center.billing`) e multa/juros congelados. Pausar/voltar/cancelar a matrícula espelha.
- **1º mês**: a cobrança da matrícula (portal e oferta da fila) é proporcional aos dias até o 1º
  vencimento fixo (`firstMonth: prorata`) ou cheia; com vencimento na data da matrícula é sempre cheia.
- **Rodada diária 06:00** (`runTrainingCenterBilling`, por centro ativo): pausa vencida volta;
  pacote vencido/sem crédito é concluído (libera a vaga); "cancela no fim do ciclo" encerra no
  vencimento; D−3 gera a cobrança `invoices/sub_{enrollmentId}_{YYYY-MM}` (id fixo: repetir não
  duplica), gera a fatura Asaas se o recebimento estiver conectado (multa 2% + juros 1% a.m.) e
  avisa; régua por push: D+1, D+7, aviso de bloqueio (5 dias antes), check-in com pendência
  (`students.billingHold`) e suspensão (cancela a matrícula, libera a vaga) ou só aviso. Cada
  estágio avisa uma vez por cobrança. Resumo em `billingRuns/{dia}`.
- **Pagamento**: o gatilho da cobrança (`onTrainingCenterSubscriptionInvoiceWritten`) recalcula o
  atraso na hora — sai de "em atraso" e tira a pendência sem esperar a rodada.
- **Mudar plano** (callable): agora, com a diferença proporcional dos dias restantes como cobrança
  avulsa (downgrade não devolve; recusa com mensalidade vencida em aberto), ou no próximo ciclo.
  **Cobrar agora** (callable): manda a cobrança aberta mais antiga ao provedor (ou antecipa o ciclo).
- Rules: assinatura e rodada só o servidor grava; o gestor só agenda/desfaz o cancelamento no fim do
  ciclo (`cancelAt == nextChargeDate`). `billingHold*`, `subscriptionId`, `cycle` e `lateFees` são
  do servidor.
- Só **Pix mensal** (link da fatura a cada ciclo). Cartão recorrente e Pix Automático dependem da
  autorização do aluno no app (protótipo R7) — retentativas de cartão vêm junto.

## Notificações (Configurações › Notificações)

- Preferências em `trainingCenters/{c}.notifications`: push ligado/desligado por evento, horário de
  silêncio (padrão 22:00–07:00) e antecedência do lembrete de aula (1–4h). Eventos obrigatórios
  (aula cancelada, local/horário alterado, lembrete e atraso de cobrança) não desligam.
- Todo push do centro passa por `deliverCenterNotice` (`training-center-notify.ts`): evento
  desligado não sai; no silêncio vai para `notificationOutbox` e sai quando ele acaba (cancelamento e
  troca de local/horário furam o silêncio; lembrete de aula é descartado).
- Agendador de 15 min: adiados, lembrete de aula, chamada não finalizada (30 min após o fim →
  professor). Recibo de pagamento confirmado (desligado por padrão) e alerta da equipe para
  pagamento online sem confirmação há mais de 2h (owner/admin, uma vez por cobrança).
- Link da fatura gerado/reenviado à mão pelo gestor sai direto (ação explícita).
- Só push. E-mail, WhatsApp, edição de texto, crédito de reposição vencendo e resumo diário ficam
  "em breve" na tela.

## Conta de recebimento (subconta Asaas pelo próprio centro)

- Configurações › Conta de recebimento: o OWNER cria a subconta Asaas (CNPJ com tipo de empresa,
  ou CPF de quem toca o centro) pela callable `createTrainingCenterReceivingAccount`. O `walletId` vai
  para `trainingCenterReceiving/{c}` (só servidor) e a `apiKey` da subconta, cifrada com
  `PROFESSOR_SECRETS_KEY`, para `trainingCenterAsaasSecrets/{c}`.
- Situação e documentos pendentes (links do Asaas) em `receivingAccount/current` (owner/admin leem) e
  `receivingStatus` no doc do centro. Consulta pela callable `refreshTrainingCenterReceivingStatus`
  e pela varredura de hora em hora; aprovada → `receivingConnected` liga sozinho.
- Conectar conta Asaas que o centro já tem continua só pelo time NexaGO (backoffice/script):
  `walletId` digitado no portal desviaria o dinheiro.

## Fora do MVP (follow-ups)

- Oferecer a vaga liberada ao próximo da fila automaticamente (hoje a varredura só libera; a
  oferta segue manual na tela de Matrículas).
- Notificações (push/e-mail) de cancelamento de aula, vaga aberta e convite.
- Telas do app (G1–G19, P1–P9) e chamada pelo professor no app (a rule já aceita o professor
  marcar presença na própria aula).
- Tela de centros no backoffice (ativar/suspender/assinatura).
- Cobrança recorrente por cartão e Pix Automático (autorização no app, R7) e retentativas.
- Avisos por e-mail/WhatsApp (sem provedor), texto editável, reposição vencendo (sem validade por crédito) e resumo diário.
