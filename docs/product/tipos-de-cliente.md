# Tipos de cliente da arena

Portal da arena → **Vendas › Tipos de cliente** (`/painel/preco-por-perfil`). Tudo é **opcional por
arena**: desligado, todo mundo paga o preço normal da quadra e nada muda (arena sem a política nem lê
os dados a mais na reserva).

| Tipo | Quem é | Quanto paga a reserva | Onde liga |
| --- | --- | --- | --- |
| **Avulso** | Todo mundo que não é aluno nem mensalista | Preço normal da quadra (com promoção/cupom) | — (padrão) |
| **Aluno** | Lista manual da arena **ou** (opcional) matrícula ativa numa turma da arena | Preço do perfil Aluno: fixo por hora ou % | `arenas.athletePricing.student` (+ `autoFromClasses`) |
| **Professor** | Lista manual (ex.: professor de outro esporte) | Preço do perfil Professor | `arenas.athletePricing.professor` |
| **Mensalista** | Contrato do CRM (Clientes) com horas por semana | R$ 0 dentro do banco de horas da semana; o que passar, preço normal | `arenas.memberHoursBank` |

## Aluno

- Preço do perfil (#1168): não acumula com promoção e cupom, vale o menor.
- **Reconhecer pela matrícula** (`athletePricing.student.autoFromClasses`): quem tem matrícula
  `active` em `arenaClassEnrollments` daquela arena paga como aluno sem entrar na lista. A lista
  manual vem antes: quem está nela como Professor continua Professor.
- Só turmas da arena (professores vinculados). Aluno da carteira de professor independente
  (`professorLessons`) não conta: entra pela lista.

## Mensalista (banco de horas)

- Chave `arenas/{id}.memberHoursBank = {enabled, blockWhenOverdue}` (callable
  `setArenaMemberHoursPolicy`, área `agenda`). Ausente = desligada: o mensalista paga a reserva como
  antes.
- Contrato que vale: do CRM, do atleta do app, não cancelado, começou até a data da reserva e (sem
  renovação automática) não terminou antes dela. Mais de um: o de mais horas.
- Semana do banco = seg a dom **da data da reserva**. Usado = soma de `memberHoursMinutes` das
  reservas não canceladas do atleta na arena naquela semana. Cancelou → a hora volta sozinha (saiu a
  R$ 0, nada a estornar). Reserva paga antes da chave não gasta o banco.
- Cobertura horário a horário, na ordem; meia hora coberta num horário de 1h = metade do preço. O que
  sobra cobra pelo preço que já estava (promoção, aluno...).
- Cupom: se o cupom já deixa mais barato, fica o cupom e o banco não é tocado; senão o cupom sai e
  não é consumido.
- **Inadimplente** (`blockWhenOverdue`, padrão ligado): parcela vencida → reserva pelo preço normal
  até quitar. Desligado, o banco vale mesmo com parcela em aberto.
- Coberta inteira: reserva confirmada com nada a pagar (`paymentChannel: onsite`, `amountReais: 0`,
  `coveredByMemberHours: true`), mesmo se o app pediu Pix.
- Reserva como professor nunca usa o banco.
- Concorrência: a transação lê e grava `arenaMemberHoursWeeks/{contrato}_{segunda}` e relê as reservas
  da semana; duas reservas juntas não gastam a mesma hora.
- **Reserva manual (portal)**: com atleta escolhido, a cotação traz o banco dele e o modal oferece
  "Descontar do banco de horas" (marcado). O valor digitado é o do horário inteiro; o servidor tira a
  parte coberta.

Campos na reserva (`arenaBookings`): `memberHoursMinutes`, `memberHoursDiscountReais`,
`memberContractId`, `coveredByMemberHours`. A cotação (`quoteArenaBooking`) devolve
`memberHoursWeeklyMinutes`, `memberHoursAvailableMinutes`, `memberHoursMinutes`,
`memberHoursDiscountReais`, `memberHoursPlanName`, `memberHoursBlockedReason`
(`overdue` | `exhausted` | `coupon_cheaper`).

Código: `functions/src/arena-member-hours.ts` (puro + IO, testado em `arena-member-hours.test.ts`),
`arena-booking-create.ts`, `arena-manual-booking.ts`, `arena-athlete-pricing.ts`.

## Fora (por enquanto)

- Horário fixo, Planos de horário e clubinho seguem com o preço deles.
- Mensalista sem conta no app (contrato só com nome) não tem como ser reconhecido na reserva do app;
  no balcão a arena já digita o valor.

## Deploy

Ordem: functions (`quoteArenaBooking`, `createArenaBooking`, `quoteArenaManualBooking`,
`createArenaManualBooking`, `setArenaAthletePricing`, `setArenaMemberHoursPolicy` nova) → portal da
arena → portal do atleta → app. Sem índice novo (reusa `arenaBookings (arenaId, athleteId, date)` e o
simples de `arenaClassEnrollments.athleteId`); `arenaMemberHoursWeeks` só o servidor escreve (o
catch-all das rules nega o cliente).
