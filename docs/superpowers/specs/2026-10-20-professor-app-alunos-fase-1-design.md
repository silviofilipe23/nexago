# App do Professor — gestão de alunos, fase 1 (abas, Mais, Alunos, Aluno, Turmas)

Fonte: Claude Design, "NexaGO Professor - App Alunos (Canvas)" (B1–B16) e "NexaGO Professor - Portal
(Canvas)" (A1–A10, de onde vem a barra de abas). Continua o papel Professor no app (#803): hoje o
modo Professor é uma tela só (`/professor`: aulas de hoje, chamada, reserva como professor, Minhas
arenas).

## As 16 telas em três fases

O canvas mistura três coisas com custos muito diferentes:

| fase | telas | o que precisa |
|---|---|---|
| **1 (este PR)** | B1 Mais, B2 Alunos + "Ver alunos de…", B3 Aluno (equipe da arena), A4 Minhas turmas | leitura do que já existe nas Aulas da arena + anotação privada |
| 2 | B5 Adicionar aluno (equipe), B6 Matricular, B7 Converter experimental, B8 Nova aula (equipe), B11 Reposição, B12 Lista de espera, B13 Comunicado/cancelamento, "Mover para outra turma" | o professor ESCREVER no módulo Aulas da arena — hoje tudo isso é `requireClassManager`. Precisa de chaves novas no vínculo, ligadas pela arena (o spec #798 deixou fora: "regra comercial §17.3") |
| 3 | B4 Aluno independente, B9 Nova aula independente, B10 Turma própria, B14 Meus planos e preços, B15 Nova cobrança, B16 Carteira própria | domínio novo: carteira do professor (alunos, planos e cobranças DELE, fora do caixa da arena), recebimento por Pix/cartão na conta do professor, custo de quadra. É fluxo de dinheiro novo — decisão do dono antes de construir |

## Fase 1 — decisões (padrão recomendado; revisar no PR)

### Navegação

- Modo Professor ganha barra de abas (mesma `NexaBottomNavBar` do gestor): **Hoje · Alunos · Mais**.
  O canvas tem também Agenda e Mensagens; Agenda fica para o próximo passo (a home já lista os
  próximos 7 dias) e Mensagens não tem backend (não existe chat no projeto).
- Rotas: `/professor` (Hoje, a home de hoje sem mudança), `/professor/alunos`, `/professor/mais`.
  Telas empilhadas (aluno, turmas) em `/professor/alunos/:arenaId/:studentId` e
  `/professor/turmas`, sem a barra. O guard de papel já cobre `/professor/*`.

### Quem o professor vê (B2)

- **Alunos = alunos das turmas em que ele é o professor** (`arenaClasses.teacherUserId == uid`,
  turma não arquivada; aluno `active` ou `paused`, não `removed`). Um aluno por arena
  (`arenaId` + `studentId`), juntando as turmas.
- **Mesma régua da chamada:** só nas arenas com vínculo `ACTIVE` + "Gerenciar as próprias aulas"
  (`canManageOwnLessons`). Sem a permissão a arena aparece no filtro com o motivo, sem nomes —
  igual a `getMyClassSessionRoster`.
- Filtro "Ver alunos de…": Todas as arenas / cada arena com a etiqueta do tipo de vínculo
  (Equipe da arena / Independente) e a contagem. Busca por nome; chips Todos · Turma · Particular ·
  Pendentes (pagamento atrasado ou vencendo hoje).
- Encaixes (reposição/experimental de outra turma) não viram aluno na lista: eles não são
  `classStudents` da turma. Entram na fase 2 (B7/B11).

### O que aparece do aluno (B3)

- Turmas do aluno com o professor (nome, dias, horário), "desde" (`enrolledAt`), presença das
  **12 últimas marcas** nas aulas DESTE professor (P presente, F falta, J justificada, R reposição
  presente) e a porcentagem, créditos de reposição disponíveis.
- **Plano e pagamento só para vínculo de equipe (`ARENA_STAFF`)**: nome e preço do plano (tabela da
  arena, snapshot da matrícula), pacote (créditos restantes/total, validade) e a situação — Em dia /
  Vence hoje / Atrasado / Pausado / Sem plano, mesma régua de `arenaClassStudentStanding` do app da
  arena — com o próximo vencimento. **Sem valores de fatura, sem telefone.** Professor
  independente escalado numa turma da arena não vê a cobrança da arena.
- Aviso fixo: "Turma da {arena}: preço e cobrança são da arena. Pedidos de desconto vão para a
  gestão."
- **Anotações · só você vê**: texto livre por aluno, até 2000 caracteres, em
  `users/{uid}/professorStudentNotes/{arenaId}_{studentId}` (`arenaId`, `studentId`, `text`,
  `updatedAt`). Rule: só o dono lê e grava; allow-list de campos. A arena não lê, o aluno não lê.
- Fora da fase 1: atalhos Mensagem/Avaliar/Reposição/Aula e "Mover para outra turma" (fases 2+;
  não existe chat nem avaliação no backend). Nota de avaliação (7.2 +0.8) também — não existe.

### Mais (B1)

Cartão do professor (nome; toque abre o perfil público de atleta) e grupos só com o que existe:
- Alunos e aulas: **Turmas** (A4).
- Agenda: **Minhas arenas** (com a contagem de convites pendentes).
- Conta: **Trocar papel** (quando há mais de um) e **Sair** — os mesmos da folha de ajustes.
Itens do canvas sem backend (Avaliações, Reposições, Comunicados, Pacotes e cobranças, Ganhos, Meus
planos e preços, Disponibilidade) ficam fora até existirem — nada de "em breve".

### Minhas turmas (A4)

Cartão por turma: nível, nome, dias · horário · quadra, vagas (ativos/capacidade), presença (%
das marcas nas aulas fechadas da janela), próxima aula, "N na espera" (`classWaitlist` com
`status == waiting`). Mesma régua de permissão.

## Backend

`getMyProfessorStudents` (callable nova, `{}` → tudo de uma vez; a tela de aluno lê do mesmo
resultado, sem outra ida ao servidor):

```
{ todayKey,
  arenas:   [{arenaId, arenaName, relationshipType, canSeeStudents, studentCount, classCount}],
  classes:  [{classId, arenaId, arenaName, name, type, level, weekdays, startTime, endTime, courtName,
              capacity, activeCount, waitlistCount, presenceRate, nextDate, status}],
  students: [{studentId, arenaId, arenaName, athleteId, name, photoUrl, status, since,
              classes: [{classId, name, type, weekdays, startTime, endTime}],
              marks: [{date, mark, makeup}], presenceRate, lastDate, credits,
              plan: {name, kind, priceReais, credits, creditsLeft, expiresOn} | null,
              billing: {standing, nextDueDate} | null}] }
```

Leituras (todas no servidor; nenhuma rule das Aulas muda): turmas por `teacherUserId`; vínculos
das arenas; `classStudents` e contagem da espera por turma; aulas do professor de hoje−120 a
hoje+35 (índice `teacherUserId`+`date` já existe); matrículas por id (`enrollmentId` do aluno);
cobranças `open` e créditos `available` por arena. A montagem é uma função pura
(`buildProfessorStudents`) com teste; a fiação tem teste no emulador (`test:callables`).

Limites: até 40 turmas; janela de marcas de 120 dias.

## Fora de escopo / próximas fases

- Fase 2 e 3 (tabela acima). Para a fase 2, a proposta é uma chave por grupo de ação no vínculo
  (ex.: `canEnrollStudents`, `canScheduleLessons`, `canCancelLessons`), desligadas por padrão,
  ligadas pela arena em Profissionais — e as callables das Aulas aceitando o professor da turma com
  a chave, como `saveArenaClassAttendance` já faz.
- Abas Agenda (A2) e Mensagens (A9), Avaliação (A6), Disponibilidade (A10), Ganhos (A8).
