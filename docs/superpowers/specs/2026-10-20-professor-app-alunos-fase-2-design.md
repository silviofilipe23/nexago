# App do Professor — fase 2: o professor da equipe age nas Aulas da arena

Continua `2026-10-20-professor-app-alunos-fase-1-design.md` (PR #811) e
`2026-10-20-vinculos-permissoes-reserva-aulas-design.md` (§2c deixou de fora "criar aula, cancelar,
matricular, mexer em cobrança" por regra comercial). Canvas: "NexaGO Professor - App Alunos"
B5, B6, B7, B8, B11, B12, B13 e "Mover para outra turma" (rodapé do B3).

A fase 3 (carteira independente, cobrança própria do professor) **não** entra aqui.

## Princípio

**A arena decide, chave por chave, o que o professor DA EQUIPE pode fazer nas turmas DELE.**
O produto continua sendo da arena: preço sempre da tabela (`classPlans`), cobrança no caixa da arena
(manual ou online, como a arena já configurou), repasse pelo modelo do professor. O professor não
escolhe preço, não dispensa taxa, não digita CPF, não vê valor de fatura.

## Decisões (padrão recomendado; revisar no PR)

### 1. Três chaves novas no vínculo

| chave | o que libera (só nas turmas com `teacherUserId` = o professor) | telas |
|---|---|---|
| `canEnrollStudents` | matricular (prévia + matrícula, plano da tabela), mover de turma, lista de espera (pôr, tirar, matricular da espera) | B5, B6, B7, mover, B12 |
| `canScheduleLessons` | encaixe na aula (reposição com crédito, experimental) e **aula avulsa** com quadra escolhida pelo servidor | B5 (experimental), B7, B8, B11 |
| `canCancelLessons` | cancelar a própria aula (crédito pela regra da arena) e mandar comunicado aos alunos da aula | B13 |

- **Desligadas por padrão**, inclusive nos vínculos que já existem (chave ausente = `false`).
- **Só valem para `ARENA_STAFF`.** Independente com a chave gravada como `true` é recusado na
  gravação (`invalid-argument`) e, se aparecer por outro caminho, a permissão efetiva é `false`.
  O independente usa a estrutura reservando como professor; turma da arena é produto da arena.
- Ligadas pela arena em Profissionais (app `/arena/professionals/:id` e portal da arena), mesma
  callable `updateArenaProfessorPermissions` (patch parcial) — o aviso `PERMISSIONS_CHANGED` já existe.
- `canManageOwnLessons` continua sendo a porta de entrada (ver alunos, chamada). As chaves novas
  não exigem `canManageOwnLessons`, mas sem ela o app não mostra os alunos — então, na prática,
  a arena liga as duas.

### 2. Quem pode, no servidor

`authorizeClassAction(db, arenaId, teacherUserIds, uid, key)` — mesma forma de
`authorizeClassAttendance`:
1. equipe da arena com a área `agenda` (escrita) → `"staff"` (nada muda para a equipe);
2. senão, todas as turmas envolvidas têm `teacherUserId == uid` **e** o vínculo `ACTIVE` +
   `ARENA_STAFF` + a chave → `"teacher"`;
3. senão, `permission-denied` com o motivo pronto (`no_link` / `not_active` / `permission_off`
   / `not_staff`).

Turma de outro professor nunca passa, nem com a chave.

### 3. Callables que passam a aceitar o professor

| callable | chave | o que muda no caminho do professor |
|---|---|---|
| `previewArenaClassEnrollment`, `createArenaClassEnrollment` | `canEnrollStudents` | todas as turmas do pedido são dele; `waiveFee` forçado `false`; `cpfCnpj` ignorado (online só se o CPF já está salvo); `dueDay` = o padrão (dia de hoje, como a equipe); grava `createdByRole: "teacher"` |
| `addArenaClassWaitlist`, `removeArenaClassWaitlist` | `canEnrollStudents` | turma dele |
| `addArenaClassExtra`, `removeArenaClassExtra` | `canScheduleLessons` | aula dele |
| `cancelArenaClassSession` | `canCancelLessons` | aula dele; crédito segue a regra da arena (o professor pode desligar, como a equipe) |

### 4. Callables novas

- **`moveArenaClassStudent({fromClassId, toClassId, studentId, weekdays?})`** (`canEnrollStudents`;
  equipe também pode). Mesma arena. Com matrícula: troca na matrícula os horários da turma de
  origem pelos da destino (mesma quantidade de dias; `weekdays` escolhe quais, padrão = os dias
  da destino até completar), confere vaga por dia, tira da origem (`removed`) e põe na destino
  com o mesmo `enrollmentId`. **Preço não muda** (o plano não depende da turma). Sem matrícula
  (aluno avulso legado): tira e põe. Uma transação; contadores `studentCount` ajustados.
- **`createArenaClassLesson({arenaId, type, date, startTime, endTime, students, courtId?})`**
  (`canScheduleLessons`; aula avulsa = turma com `weekdays: []`, a mesma da "Agendar aula" da
  equipe). No caminho do professor: o professor é ele (o `classTeachers` com `userId` = ele; sem
  cadastro nas Aulas, recusa), **a quadra é escolhida pelo servidor** (primeira quadra livre da
  arena naquele horário), tipo `particular` | `dupla` | `experimental`, alunos entre os dele (ou
  com conta, para experimental). **Cobrança:** aula particular/dupla do professor **usa 1
  crédito do pacote** do aluno (matrícula `package` ativa com `creditsLeft > 0` na arena — o
  `classStudents` da avulsa leva o `enrollmentId`, e a chamada fechada debita como em qualquer
  turma). Sem pacote com crédito, recusa: "Sem pacote com crédito — a arena precisa vender o
  pacote". Experimental não exige pacote (a arena decide o preço da experimental no balcão, como
  hoje). Nada de aula sem cobrança escondida no caixa da arena.
- **`sendArenaClassNotice({sessionIds, message})`** (`canCancelLessons`): push "Aviso do
  professor" para quem tem conta nas aulas escolhidas (turma do dia + encaixes). Até 10 aulas,
  hoje ou futuras, mensagem até 300 caracteres. O cancelamento com aviso usa
  `cancelArenaClassSession` com `note` = mensagem (o push de cancelamento já leva a nota).
- **`getProfessorClassActions({arenaId})`**: o que as telas precisam ler e as rules não deixam —
  permissões efetivas, turmas dele com ocupação por dia da semana, aulas dele dos próximos 14 dias
  com vagas, lista de espera das turmas dele (nome, nota, desde), créditos de reposição dos alunos
  dele (id, aluno, validade), planos ativos da tabela (nome, tipo, preço, aulas/semana) e as regras
  que a tela mostra (`onlineBillingEnabled`, validade do crédito, crédito ao cancelar). Sem
  telefone, sem CPF, sem fatura.

`getMyProfessorStudents` ganha `arenas[].actions = {canEnrollStudents, canScheduleLessons,
canCancelLessons}` (efetivas) para o app mostrar só os botões que o servidor aceitaria.

### 5. Telas (app, modo Professor)

Todas em `nexago_app/lib/features/professor_mode/presentation/actions/`, abertas a partir do
Aluno (B3), de Turmas (A4) e da home (aula do dia). Botão só aparece com a chave; a callable decide.

- **B5 Adicionar aluno**: arena (só as de equipe com `canEnrollStudents` ou `canScheduleLessons`),
  busca de atleta com conta (mesma busca do app da arena), "Começa com": Aula experimental (encaixe
  numa aula dele com vaga) ou Plano (vai para B6). Link de convite e carteira privada ficam para a
  fase 3.
- **B6 Matricular em turma**: turmas dele com vagas (LOTADA → "Pôr na espera"), plano da tabela
  com preço, prévia do servidor (1ª cobrança proporcional + taxa), aviso "a arena cobra o aluno".
- **B7 Converter experimental**: do encaixe experimental de uma aula dele → B6 com o aluno, ou
  lista de espera se a turma sugerida lotou.
- **B8 Nova aula**: Particular / Dupla / Experimental, aluno(s), dia e horário; quadra "escolhida
  pela arena"; "Usa 1 crédito do pacote (N restantes)".
- **B11 Reposição**: créditos do aluno → aulas dele com vaga nos próximos 14 dias → encaixa.
- **B12 Lista de espera**: fila da turma em ordem de chegada; "Matricular" (B6 com a entrada) e
  "Tirar da espera". Oferta da vaga continua pelo WhatsApp (o backend não tem oferta com prazo).
- **B13 Comunicado**: modelos (Chuva · cancelada, Atraso, Troca de quadra, Livre), aulas de hoje e
  amanhã dele, mensagem; com "Cancelar as aulas" ligado usa `cancelArenaClassSession` (e o toggle
  de crédito), senão `sendArenaClassNotice`.
- **Mover para outra turma** (rodapé do B3): turmas dele com vaga nos dias.

Fora: link de convite/carteira (fase 3), "nível observado" e mensagem livre com link de pagamento
no B7 (o link de pagamento já sai da matrícula online), oferta de vaga com 24h (B12), "seus
horários livres" calculados (o servidor tenta e recusa se não houver quadra).

## Rules

Nenhuma rule muda: o vínculo continua gravado só por Cloud Function, as coleções de Aulas seguem
fechadas à equipe, e o professor lê e grava só pelas callables.

## Deploy

Functions: as 9 callables tocadas + `updateArenaProfessorPermissions`/`inviteArenaProfessor`/
`approveArenaProfessorRequest` (parse das chaves) + `getMyProfessorStudents` + as 4 novas. App e
portal da arena depois das functions (app antigo ignora as chaves novas; function antiga recusaria
o professor com `permission-denied`, sem estrago).
