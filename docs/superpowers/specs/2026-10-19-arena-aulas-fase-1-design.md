# Aulas da arena — fase 1 (operação de turmas + bloqueio da agenda)

Protótipo: Claude Design "NexaGO Arena - Aulas" (16 telas web + 12 do app da arena).

## Recorte da fase 1

Telas que entregam a operação do dia e o bloqueio da quadra, sem dinheiro:

| Superfície | Telas do protótipo |
|---|---|
| Portal da arena | 01 Visão geral · 02 Agenda semanal · 03 Aula (chamada) · 04 Turmas · 05 Nova turma · 06 Turma (alunos) · 14 Professores · "Agendar aula" avulsa |
| App da arena (Flutter) | A1 Aulas de hoje · A2 Chamada · A4 Cancelar aula · A5 Turmas |

Fica para a fase 2 (dependem de cobrança/planos): 07–12 Alunos e matrícula em 4 passos,
13 Planos, 15 Repasse, 16 Regras, A3 Encaixar reposição, A6 Aluno, A7 Mensalidades,
A8–A12 Matrícula no app, lista de espera, créditos de reposição, matrícula pelo app do atleta.

## Decisões

- **Bloqueio da agenda = mesmo mecanismo do mensalista/clubinho.** Cada aula materializa
  `arenaBookings` + `arenaSlots` + `arenaSlotLocks` (locks por hora cheia) com id
  `class_{classId}_{date}`. `createArenaBooking` recusa hora com lock → o horário some do
  aluguel no app, no portal do atleta e no balcão sem mudar nenhum leitor. Aula de 18:00–19:30
  trava as horas 18 e 19 (granularidade de lock do sistema).
- **Janela rolante de 35 dias**, agendador `materializeArenaClassSessions` às 03:20 SP
  (depois do mensalista 03:00 e do clubinho 03:10, que têm prioridade na quadra).
- **Conflito não impede criar a turma**: a prévia (`previewArenaClassSchedule`) mostra as datas
  ocupadas antes de salvar; a data em conflito não ganha aula e fica em `conflictDates`; o
  gestor libera a quadra e usa `scheduleArenaClassDate` para agendar de novo.
- **Liberar quadra só apaga lock cujo `bookingId` é o da aula** (o clubinho apaga sem checar —
  corrida com reserva de atleta), e sessão + booking + slot + locks saem **numa transação**
  (`releaseClassSession`): não sobra aula sem bloqueio nem bloqueio sem aula. Cancelar de novo uma
  aula já cancelada só termina de liberar.
- **Sessão é a fonte da verdade**: sem ela, o booking `class_…` é sobra (liberação interrompida,
  `merge` tardio do lembrete de 15 min) e a materialização sobrescreve.
- **Equipe não cancela o bloqueio pela tela Reservas**: a rule `arenaBookingStaffUpdateOk` recusa
  mudar `status` de booking com `isClassSession` — senão a quadra ficaria livre com a aula de pé.
- **Remarcar só solta o que muda**: mesma quadra e horário (ex.: estender a data de fim) mantém as
  aulas existentes; mudar quadra/horário solta e recria as futuras sem chamada.
- **Fila do agendador**: avulsa e turma com fim já gerado ficam com `materializedUntil = 9999-12-31`.
- **Cancelar uma aula** deixa o booking `cancelled` (dispara aviso de vaga a quem espera
  horário) e a sessão `canceled` — a série não recria a data (feriado/chuva).
  **Remarcar/pausar/encerrar** apaga a aula e o booking (o trigger de slots trataria um
  booking cancelado→ativo como "desfazer cancelamento").
- **RBAC: área `agenda`** (gestor/recepção escrevem, manutenção lê) — nenhum espelho novo da
  matriz de cargos. Financeiro não vê aulas na fase 1 (não há dinheiro nelas ainda).
- **Plano: Pro e Elite** (`isArenaEntitledPro`), como o clubinho. Cancelar aula, chamada,
  alunos e pausar seguem livres com plano vencido (desmontar não pode travar).
- **Professor tem conta NexaGO obrigatória** (quase sempre é atleta da própria arena): escolhido
  pela busca de atleta, `userId` no doc, nome e foto vêm do perfil, uma conta por arena. Professor
  antigo sem conta aparece como "Sem conta · vincular" e não recebe turma nova (`upsertArenaClass`
  exige conta em turma nova ou troca de professor; quem já estava numa turma segue nela). Aula e
  turma guardam `teacherUserId` — base para o professor ver as aulas no app depois.
- **Aluno** = atleta NexaGO (docId = uid) ou nome livre (sem conta). Aluno com conta recebe
  push quando a aula é cancelada.
- **Aula avulsa** (particular/dupla/experimental) = `arenaClasses` com `weekdays: []` e uma data
  só; reaproveita tudo da turma.

## Modelo (escrita 100% via Cloud Functions)

`arenas/{arenaId}/classTeachers/{teacherId}` — `userId (uid da conta NexaGO), name e photoUrl
(do perfil), specialty, phone, color (#RRGGBB), status: active|archived`.

`arenaClasses/{classId}` — `arenaId, arenaName, name, type: turma|particular|dupla|experimental,
sport (código do catálogo), level: iniciante|intermediario|avancado|kids|livre, teacherId,
teacherName, teacherColor, weekdays: number[] (ISO 1=seg…7=dom; vazio = avulsa), startTime,
endTime ("HH:mm"), courtId, courtName, capacity, startDate, endDate|null, status:
active|paused|archived, notes, studentCount, conflictDates: string[], materializedUntil`.

`arenaClasses/{classId}/classStudents/{studentId}` — `arenaId, classId, athleteId|null, name,
phone, photoUrl, status: active|removed, enrolledAt, removedAt`.

`arenaClassSessions/{class_{classId}_{date}}` — snapshot da turma (`className, type, sport,
level, teacher*, court*, capacity`) + `date, startTime, endTime, startAt, status:
scheduled|canceled|completed, blockBookingId, attendance: {studentId: {mark:
present|absent|excused, name}}, teacherNote, closedAt, cancelReason, cancelNote`.

Bloqueio: `arenaBookings/{sessionId}` com `source: "class"`, `isClassSession: true`, `classId`,
`classSessionId`, `customerName: "Aula · {nome}"`, `athleteId: null`.

Leitura (rules): quem lê a área `agenda` da arena; toda query filtra `arenaId`.
Índices: `arenaClasses(status, materializedUntil)`, `arenaClassSessions(arenaId, date)`,
`arenaClassSessions(arenaId, classId, date)`.

## Callables (`southamerica-east1` + ponte `us-central1`)

| Callable | Entrada | Saída |
|---|---|---|
| `upsertArenaClassTeacher` | `arenaId, teacherId?, userId (obrigatório no cadastro; vincula legado), specialty?, phone?, color?, status?` | `{teacherId}` |
| `previewArenaClassSchedule` | campos de agenda da turma + `classId?` | `{totalDates, conflicts: [{date, label}]}` |
| `upsertArenaClass` | `arenaId, classId?, name, type, sport, level, teacherId, weekdays, startTime, endTime, courtId, capacity, startDate?, endDate?, notes?, students?` (só na criação) | `{classId, createdDates, conflictDates}` |
| `setArenaClassStatus` | `classId, status: active\|paused\|archived` | `{classId, status, …}` |
| `scheduleArenaClassDate` | `classId, date` | `{sessionId, outcome}` |
| `cancelArenaClassSession` | `sessionId, reason: rain\|teacher_absent\|maintenance\|holiday\|other, note?` | `{sessionId, notified}` |
| `addArenaClassStudent` | `classId, athleteId? \| name, phone?` | `{studentId, studentCount}` |
| `removeArenaClassStudent` | `classId, studentId` | `{studentCount}` |
| `saveArenaClassAttendance` | `sessionId, marks: {studentId: mark\|null}, teacherNote?, close?` | `{status, marked}` |

Editar turma mudando dias/horário/quadra/datas remarca as aulas futuras sem chamada; mudar só
nome/professor/vagas atualiza o snapshot das aulas futuras e o rótulo na agenda.

## Deploy (ordem)

1. `firestore.indexes.json` → 2. functions (9 callables + agendador) → 3. `firestore.rules` →
4. portal da arena / app. As queries do portal falham sem os índices.
