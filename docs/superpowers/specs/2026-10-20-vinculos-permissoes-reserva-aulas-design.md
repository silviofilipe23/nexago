# Vínculos professor ↔ arena — aplicação de "Reservar quadras" e "Gerenciar as próprias aulas"

Continuação de `2026-10-20-vinculos-professor-arena-design.md` (PR #797), que deixou `canBookCourts` e
`canManageOwnLessons` só gravadas. Spec funcional: §4.7 ("a reserva exige autorização operacional
válida; perfil de professor não concede acesso"), §5.2 (aulas/reservas/cobrança fora do escopo
inicial) e §17 itens 2–3 (quem reserva e em que condições; modelo comercial).

## Princípio

**O vínculo libera o que é DE PROFESSOR; não tira nada do atleta.** Hoje qualquer atleta reserva
quadra e qualquer conta pode ser professor numa turma das Aulas. Nada disso muda. A permissão só
decide se a pessoa pode agir **como professor daquela arena** — e quem decide é sempre o servidor,
lendo `arenaProfessors/{arenaId}_{uid}` com `effectiveArenaProfessorPermissions` (só `ACTIVE`).
O cliente nunca diz "tenho permissão"; no máximo diz "quero agir como professor".

## Decisões (padrão recomendado; revisar no PR)

### 1. Reservar quadras (`canBookCourts`)

Não existe hoje nenhum caminho nem benefício de professor na reserva. O mínimo útil:

- `createArenaBooking` aceita `asProfessor: true` (opcional). **Sem a flag, nada muda** — atleta
  comum, professor reservando para jogar e app antigo seguem idênticos.
- Com a flag, o servidor exige vínculo `ACTIVE` com `canBookCourts` naquela arena; senão recusa
  (`permission-denied`) com o motivo pronto para a tela (sem vínculo / suspenso / encerrado /
  permissão não liberada) e lembra que dá para reservar como atleta.
- Aceita, a reserva é carimbada: `bookedAs: "professor"`, `professorLinkId`,
  `professorRelationshipType`. A arena vê na agenda que aquele horário é de professor. O carimbo é
  o fato no momento da reserva (suspender depois não o apaga).
- **Mesmos preços, regras, cupons, pico, bloqueio e formas de pagamento** de qualquer reserva —
  é o que a permissão promete ("conforme regras e preços da arena"). Preço/aluguel de professor é
  regra comercial (§17.3) e fica para quando existir.
- Os dois tipos de vínculo (equipe e independente) podem; quem decide é a chave do vínculo
  (padrão: ligada nos dois, como já é no #797).
- Por que explícito e não automático: o professor também joga. Carimbar toda reserva de quem tem
  vínculo rotularia o jogo de fim de semana como aula, e a permissão nunca recusaria nada — viraria
  só um rótulo, não uma autorização (§4.7).
- O carimbo não sai do cliente por outro caminho: a reserva do atleta só nasce pela callable, e a
  edição do dono é por allow-list (`arenaBookingOwnerUpdateOk`), que não inclui esses campos.

### 2. Gerenciar as próprias aulas (`canManageOwnLessons`)

**2a. Vínculo e `classTeachers` se ligam pela conta, sem criar professor automaticamente.**
`classTeachers` é o cadastro do módulo Aulas (Pro/Elite) e carrega configuração da arena — cor,
especialidade, modelo de repasse. Criar sozinho a cada vínculo poria professor (e repasse) em arena
sem o módulo e sem o gestor decidir. A ligação é `classTeachers.userId == arenaProfessors.professorUserId`.
Professor cadastrado nas Aulas sem vínculo (todos os de hoje) segue funcionando exatamente como hoje.

**2b. Vínculo suspenso ou encerrado impede turma NOVA com ele.** Em `upsertArenaClass`, turma nova
ou troca de professor recusa (`failed-precondition`) quando o professor tem vínculo `SUSPENDED`
("reative em Profissionais") ou `ENDED` ("convide de novo"). Mesma régua de
`requireTeacherAccount`: o que já existe segue onde estava — turma existente não é cancelada nem
pausada (a arena decide se troca o professor ou pausa), reativar turma pausada continua livre.
Sem vínculo, ou vínculo ainda não estabelecido (`INVITED`/`PENDING`/`REJECTED`/`CANCELED`/`EXPIRED`),
não bloqueia — é o professor de hoje, retrocompatível. A trava é sobre o status, não sobre a
chave: `canManageOwnLessons` fala do professor agir, não da arena escalá-lo.

**2c. O que a permissão libera para o professor: a chamada das próprias aulas.** Hoje o professor
só vê as aulas na agenda (contagem, sem nomes); a chamada é da equipe (área `agenda`). Com vínculo
`ACTIVE` + `canManageOwnLessons` naquela arena:
- `getMyClassSessionRoster({sessionId})` (novo): lista da aula — nome, foto, tipo
  (turma/reposição/experimental) e marca — só das aulas com `teacherUserId` = ele. Sem telefone
  nem financeiro. Mesma composição da chamada do app da arena (`arenaClassAttendanceRoster`).
- `saveArenaClassAttendance` aceita o professor da aula, além da equipe — inclusive fechar a
  chamada (crédito de reposição e débito de pacote são o efeito normal da chamada, iguais aos da
  recepção). O fechamento grava `closedByRole: "teacher" | "staff"`.
- `getMyClassAgenda` ganha `canManageLessons` nos itens de professor (o cliente mostra "Fazer
  chamada" só quando o servidor deixaria).
- Suspender, encerrar ou desligar a chave corta isso na hora (a agenda continua mostrando as
  aulas, como hoje; a arena é que tira o professor da turma).

**Fica de fora (precisa de regra comercial, §17.3):** professor **criar** turma/aula avulsa,
cancelar aula, matricular aluno, mexer em cobrança. Aula do módulo Aulas é produto da arena (ela
cobra o aluno e paga repasse); turma criada pelo professor independente misturaria o negócio dele
no caixa da arena. Para o independente, "usar a estrutura para os próprios alunos" hoje é reservar
como professor (item 1).

### 3. Sempre no servidor

Nenhuma rule muda: `arenaClassSessions`/`classStudents` seguem fechadas à equipe (o professor lê
pela callable, que projeta só o necessário — precedente `getMyClassAgenda`), e o vínculo continua
gravado só por Cloud Function. Toda checagem lê o vínculo no momento da operação.

## Contrato para os clientes

| callable | mudança |
|---|---|
| `createArenaBooking` | entrada opcional `asProfessor: boolean`. Recusa: `permission-denied`, `details: {reason}` com `reason` ∈ `no_link`, `not_active` (`details.status`), `permission_off`. Reserva aceita grava `bookedAs`, `professorLinkId`, `professorRelationshipType`. |
| `getMyClassSessionRoster` | **nova.** `{sessionId}` → `{session: {sessionId, arenaId, arenaName, classId, className, date, startTime, endTime, courtName, status, teacherNote, attendanceOpen}, students: [{studentId, name, photoUrl, kind: 'regular'\|'makeup'\|'trial', mark}]}`. Recusa: `permission-denied` (aula de outro professor, ou permissão — mesmos `details.reason`). |
| `saveArenaClassAttendance` | mesma entrada; agora o professor da aula com a permissão também grava. |
| `getMyClassAgenda` | item de professor ganha `canManageLessons: boolean`; de aluno, `null`. |

Para mostrar o "Reservar como professor" na tela, o cliente lê o próprio vínculo
(`arenaProfessors/{arenaId}_{uid}`, a rule já deixa) e calcula a permissão efetiva — a tela é só
dica; quem decide é a callable.

## Telas (próxima etapa)

Nenhuma tela muda neste PR — a decisão não exige: sem a flag, tudo segue igual. Para a permissão
aparecer ao usuário:
- reserva (app + portal do atleta): opção "Reservar como professor" quando o vínculo deixar;
- agenda da arena (app + portal da arena): selo "Professor" nas reservas com `bookedAs`;
- agenda do professor (app + portal do atleta): "Fazer chamada" nas aulas com `canManageLessons`,
  com a lista de `getMyClassSessionRoster`;
- Aulas › Professores: sugerir os professores com vínculo ao cadastrar.
