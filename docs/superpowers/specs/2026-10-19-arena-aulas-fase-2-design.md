# Aulas da arena — fase 2 (matrícula, mensalidades, reposição)

Continua a [fase 1](2026-10-19-arena-aulas-fase-1-design.md). Protótipo: "NexaGO Arena - Aulas".

## Recorte

| Etapa | Telas do protótipo |
|---|---|
| **2a (este trabalho)** — backend + portal | 07 Alunos · 08 Aluno · 09–12 Matrícula em 4 passos · 13 Planos · 16 Regras · encaixe de reposição/experimental na chamada (03) · lista de espera na turma (06) |
| 2b | 15 Repasse do professor (+ modelo de repasse no cadastro) · app da arena A3 Encaixe, A6 Aluno, A7 Mensalidades, A8–A12 Matrícula |
| depois | cobrança online (PIX/cartão recorrente pelo Asaas), matrícula pelo app do atleta, oferta automática da lista de espera, check-in por QR, lembrete 2h antes |

## Decisões

- **Cobrança manual.** O sistema gera as mensalidades (`arenaClassCharges`) e o gestor registra o
  pagamento recebido direto (PIX, dinheiro, maquininha, transferência). "Cobrar" abre o WhatsApp com
  a mensagem pronta. Nenhum dinheiro passa pela plataforma — sem taxa, sem Asaas, sem carteira. A
  cobrança online entra depois em cima das mesmas mensalidades.
- **Matrícula = aluno + plano + horários fixos.** Os horários são pares (turma, dia da semana); um
  aluno "2x/semana" pode ter Ter de uma turma e Qui de outra. A matrícula escreve o aluno em
  `classStudents` de cada turma com os `weekdays` dele — a chamada de um dia só lista quem tem aquele
  dia (`weekdays` ausente = todos os dias, compatível com a fase 1).
- **Vagas por dia da semana.** A turma de 6 vagas comporta 6 alunos por dia; quem faz só a terça não
  ocupa a quinta. Conferido na transação da matrícula.
- **Planos**: `monthly` (aulas/semana, reposições/mês), `package` (créditos de aula, validade em dias)
  e `single` (avulsa, só catálogo nesta etapa). Matrícula aceita `monthly` e `package`.
- **Primeira cobrança**: mensal = proporcional do mês corrente (aulas restantes dos dias escolhidos ÷
  aulas do mês nesses dias × valor) + taxa de matrícula (regra da arena, dispensável). Pacote = valor
  cheio. As mensais seguintes nascem no agendador diário com id `{matrícula}_{AAAA-MM}` (idempotente),
  vencendo no dia escolhido.
- **Pausa (férias) não gera mensalidade, nem na volta.** Pausada, a matrícula sai da chamada e o
  agendador não gera a mensal (ele só lê matrícula `active`). Ao reativar, na mesma transação, o
  `billedThrough` pula para o mês da volta: os meses parados não são cobrados depois. O mês da volta
  sai proporcional às aulas que restam a partir do dia da reativação (mesma conta e mesmo id
  `{matrícula}_{AAAA-MM}` da 1ª cobrança, vencendo no dia da volta). Se esse mês já tem
  mensalidade (aberta, paga ou cancelada), ela fica como está e não nasce outra. Pausa e volta no
  mesmo mês com o mês já cobrado não mudam nada. As mensalidades em aberto de antes da pausa
  continuam como estão (o gestor cancela à mão se quiser perdoar). Pacote não muda: o crédito e a
  validade seguem como antes. Consequência com vencimento depois do dia 10: a mensal do mês sai
  durante o próprio mês (10 dias antes do vencimento), então se a pausa começa antes disso esse mês
  não é cobrado cheio: com a volta em outro mês ele fica sem cobrança; com a volta no mesmo mês ele
  sai proporcional a partir da volta. Com vencimento até o dia 10 (padrão 5), o mês da pausa já
  está cobrado.
- **Pacote consome crédito na chamada fechada** (presente ou falta sem aviso), uma vez por aula
  (`packageDebits` na aula guarda quem já foi debitado — corrigir a chamada não debita de novo).
- **Crédito de reposição**: falta justificada na chamada fechada e aula cancelada pela arena geram
  crédito (regras ligáveis), validade da regra (padrão 30 dias), id `{aula}_{aluno}` (idempotente).
  Usar o crédito = encaixar o aluno numa aula com vaga (`extras` na aula); tirar o encaixe devolve o
  crédito.
- **Experimental** é encaixe sem crédito (`extras` kind `trial`).
- **Lista de espera** manual: entra, sai, "matricular" leva para a matrícula; a oferta é pelo
  WhatsApp.
- **Acesso**: escrita na área `agenda`, como a fase 1 (gestor e recepção — a recepção cobra no
  balcão). Matrículas e mensalidades são lidas por quem lê `agenda` **ou** `financeiro`.
- **Uma matrícula por aluno por turma.** Aluno avulso da fase 1 (sem plano) que é matriculado passa a
  ter a matrícula no mesmo doc de `classStudents`. Aluno com matrícula não sai da turma pelo botão
  "Remover" — muda-se a matrícula.

## Modelo (escrita 100% via Cloud Functions)

`arenas/{arenaId}/classPlans/{planId}` — `name, kind: monthly|package|single, priceReais,
classesPerWeek, makeupsPerMonth, credits, validityDays, description, status: active|archived`.

`arenas/{arenaId}/classSettings/rules` — `makeupValidityDays (30), excusedGeneratesCredit (true),
arenaCancelGeneratesCredit (true), defaultDueDay (5), enrollmentFeeReais (0)`.

`arenaClassEnrollments/{enrollmentId}` — `arenaId, studentId, athleteId|null, name, phone,
plan {planId, name, kind, priceReais, classesPerWeek, makeupsPerMonth, credits, validityDays},
slots [{classId, className, weekday, startTime, teacherId}], status: active|paused|canceled,
dueDay, paymentMethod: pix|cash|card_machine|transfer, startDate, creditsLeft|null,
expiresOn|null, createdAt`.

`arenaClasses/{classId}/classStudents/{studentId}` ganha `enrollmentId, weekdays|null, planName`
e o status `paused`.

`arenaClassCharges/{chargeId}` — `arenaId, enrollmentId, studentId, athleteId, name, phone,
description, period ('AAAA-MM'|null), amountReais, dueDate, status: open|paid|canceled, paidAt,
paidOn, paymentMethod, registeredByUid`.

`arenaClassCredits/{aula}_{aluno}` — `arenaId, studentId, athleteId, name, enrollmentId, reason:
excused|arena_canceled, sourceSessionId, status: available|used|expired, expiresOn, usedSessionId`.

`arenaClassSessions/{id}` ganha `extras {studentId: {name, kind: makeup|trial, creditId|null,
athleteId|null}}` e `packageDebits {studentId: enrollmentId}`.

`arenaClasses/{classId}/classWaitlist/{entryId}` — `arenaId, classId, name, athleteId, phone, note,
status: waiting|removed|enrolled`.

## Callables

| Callable | O que faz |
|---|---|
| `upsertArenaClassPlan` | cria/edita/arquiva plano |
| `saveArenaClassRules` | grava as regras |
| `previewArenaClassEnrollment` | valida horários/vagas e calcula a primeira cobrança |
| `createArenaClassEnrollment` | matrícula: aluno em cada turma + primeiras cobranças |
| `setArenaClassEnrollmentStatus` | pausar / reativar (mês da volta proporcional, meses parados sem cobrança) / cancelar (sai das turmas, cancela cobranças abertas futuras) |
| `registerArenaClassPayment` / `cancelArenaClassCharge` | baixa manual / cancelamento de cobrança |
| `addArenaClassExtra` / `removeArenaClassExtra` | encaixe de reposição (usa crédito) ou experimental |
| `addArenaClassWaitlist` / `removeArenaClassWaitlist` | lista de espera |
| agendador `generateArenaClassMonthlyCharges` (04:00 SP) | gera a mensal do mês, expira créditos e pacotes vencidos |

Chamada (`saveArenaClassAttendance` com `close`) e cancelamento (`cancelArenaClassSession`, com
`generateCredits`) passam a gerar créditos e debitar pacote conforme as regras.
