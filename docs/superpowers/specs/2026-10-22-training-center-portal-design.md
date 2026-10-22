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
- Recebido = só cobrança aprovada. Sem provedor integrado ainda: aprovação manual com comprovante
  + motivo, auditada; aprova a matrícula pendente na mesma transação.
- Aula cancelada nunca consome crédito; com "reposição automática" cada matriculado ganha +1.
- Datas sempre como parede no fuso do centro (`domain/dates.ts`).

## Fora do MVP (follow-ups)

- Integração com provedor de pagamento (Asaas: Pix/cartão, webhook idempotente) e "Consultar
  provedor".
- Varredura de reserva vencida (pendente → libera vaga) e de oferta da fila (24h) — hoje é
  manual na tela de Matrículas.
- Notificações (push/e-mail) de cancelamento de aula, vaga aberta e convite.
- Telas do app (G1–G19, P1–P9) e chamada pelo professor no app (a rule já aceita o professor
  marcar presença na própria aula).
- Tela de centros no backoffice (ativar/suspender/assinatura).
