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

## Ciclos de pagamento (plano mensal)

- Mensal sempre; trimestral (3), semestral (6) e anual (12) quando a arena preenche o valor por mês do ciclo
  (`classPlans.cyclePrices`). Pacote e avulsa não têm ciclo.
- O aluno (app) ou a recepção (portal) escolhe o ciclo; a matrícula guarda `cycle`/`cycleMonths` e o valor
  por mês do ciclo em `plan.priceReais` (proporcional, renovação e contrato usam esse valor).
- Uma cobrança por ciclo, paga adiantada: a 1ª = proporcional do mês + os meses seguintes do ciclo, vence
  na matrícula; a renovação sai 10 dias antes do vencimento do 1º mês do próximo ciclo (mesmo agendador
  das mensalidades, id `{matrícula}_{AAAA-MM}` do 1º mês).
- Cancelar não devolve ciclo pago (só cancela o que ainda ia vencer). Reativar depois de pausa cobra o mês
  da volta proporcional e segue no mesmo ciclo.
- Repasse por % da receita conta a cobrança no mês em que foi paga (regime de caixa, como antes).
- App da arena (Flutter) ainda matricula só no mensal (não manda `cycle`).

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

Functions (as 13 novas + `upsertArenaClassPlan` + `setArenaClassEnrollmentStatus`) → rules → portal da arena
→ app. Sem índice novo (consultas de igualdade simples).
