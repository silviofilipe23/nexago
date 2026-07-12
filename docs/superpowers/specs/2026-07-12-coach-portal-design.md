# Portal do Treinador (web) — design

## Contexto

Novo painel web para treinadores/professores gerenciarem atletas, equipes, treinos, presença, avaliações e acompanharem torneios — mesmo padrão visual dos painéis já existentes (`arena`, `backoffice`, `athlete`). O protótipo completo está no Claude Design (`NexaGO Treinador - Telas.html`, projeto `nexago`), com 14 itens de navegação em 7 módulos (~22 telas). O arquivo de fluxos do mesmo projeto (`NexaGO Treinador - Fluxos.html`) já marca quais telas são `mvp: true`.

Hoje não existe nenhum conceito de treinador/professor no Firestore, nas rules, no `goals.md` ou em qualquer projeto do monorepo — é domínio 100% novo. A claim `roles` já suporta multi-role (`athlete`, `arena`, `organizer`, `admin`), então basta adicionar `coach` à lista; uma conta pode ser atleta e treinador ao mesmo tempo.

## Decisões

- **Escopo MVP, não o portal inteiro.** Cobre os 10 módulos que o próprio protótipo marca como `mvp: true`: Início, Agenda, Atletas (+ novo atleta), Equipes (+ nova equipe), Treinos (listagem + planejamento), Presença, Convocações (+ nova), Avaliações (+ listagem), Histórico, Torneios. Ficam de fora desta rodada: Permissões, Comparação entre atletas, Formação de duplas, Plano de evolução (+ novo objetivo), Lesões (+ registro), Estatísticas da equipe, Relatórios, Financeiro (Pagamentos/Planos), Comunicação, Biblioteca, e todo o bloco de Inteligência NexaGO (IA do treinador, evolução do rating, recomendação de categoria, descoberta de talentos, gestão de metas, análise pós-torneio). O nav lateral (`TR_NAV` do protótipo tem 14 itens) é reduzido aos 10 itens do MVP — sem links mortos para telas que não existem ainda.
- **Conta de treinador é independente**, como `arena`/`athlete`/`backoffice` hoje — sem vínculo obrigatório com uma arena. Autocadastro (like `arena`'s `signup.component.ts`), não convite-only como `backoffice`.
- **Atletas gerenciados são contas nexaGO reais**, vinculadas por convite com aceite — não registros avulsos do treinador. Perfil público (nome, rating, categoria/nível) é lido ao vivo de `public_profiles`, nunca duplicado — o vínculo do treinador só guarda o que é genuinamente novo (posição em quadra, status na equipe, dados de contato/saúde), nunca uma cópia de algo que já existe no perfil real do atleta.
- **Seletor de equipe ativa faz parte do MVP.** O protótipo já mostra um trocador de equipe na sidebar (`TrTeamSwitcher`); como treinos, presença, avaliações e convocações são sempre por equipe, o contexto de "equipe ativa" (signal compartilhado no shell do painel) é necessário desde já — não é um extra.
- **Torneios é somente visualização.** O treinador vê torneios/ligas disponíveis e status de inscrição dos atletas vinculados; a inscrição em si continua sendo feita pelo atleta no app, como hoje. As abas "Duplas"/"Confrontos" do protótipo viram leitura de dados reais de inscrição, sem os botões "Inscrever atletas" / "Gerar novas sugestões" (ambos ligados a features fora de escopo: inscrição direta e formação de duplas por IA).
- **Resolução do aceite do atleta — sem tocar `athlete` nem o app Flutter.** Nem o portal web do atleta nem o app Flutter têm hoje qualquer tela de convites/notificações para estender (confirmado por busca — não existe `convite`/`invite`/`notif` em `athlete/src/app`). Em vez de abrir escopo em dois projetos que não foram pedidos, as duas interações do atleta (aceitar vínculo com o treinador; confirmar presença numa convocação) moram dentro do próprio app `coach`, em rotas autenticadas fora do guard de papel `coach`:
  - `/convite-atleta/:inviteId` — qualquer usuário nexaGO autenticado (independente do papel) vê os dados do convite e aceita/recusa.
  - `/convocacao/:callUpId` — idem, para confirmar presença.
  Notificação chega por push via `deliverNotificationToUser` (já existe), com deep link pra essas rotas; sem o deep link funcionar de imediato no app mobile, o link também funciona colado manualmente (ex.: enviado pelo treinador via WhatsApp) — não bloqueia o MVP.
- **Presença embutida como mapa, não subcoleção.** `attendance: { [athleteUid]: status }` dentro do próprio doc de treino — turmas são pequenas (~20-30 atletas), presença é sempre lida/escrita em bloco (tela inteira de uma vez), então subcoleção só adicionaria custo de leitura sem ganho.
- **CRUD do próprio escopo do treinador é client-side direto** (squads, athletes-link depois de aceito, trainings, evaluations, call-ups) — protegido só por rules de ownership (`request.auth.uid == coachUid`), sem Cloud Function no meio. **Operações que cruzam usuários** (convite, aceite/recusa, notificação, resposta de convocação, leitura agregada de torneio) passam por Cloud Functions `onCall`, no padrão exato de `tournament-partner-invite.ts` (doc de convite top-level com `status`/`expiresAt`, `deliverNotificationToUser`, transação no aceite).
- **Deploy só no projeto dev** (`volley-track-dev-4596c`) nesta rodada — mesma convenção do resto do app hoje (várias features ficam "deploy pendente" até promoção explícita a prod). Nada vai para `volley-track-2dd3b` sem confirmação separada.

## Modelo de dados (Firestore — tudo novo)

```
coaches/{coachUid}                                  — perfil do treinador (doc id = uid)
coaches/{coachUid}/squads/{squadId}                 — equipe/turma (nome, categoria, naipe, treinador auxiliar, descrição)
coaches/{coachUid}/athletes/{athleteUid}             — vínculo com atleta real (doc id = athleteUid)
  status: 'ativo'|'lesionado'|'afastado'|'ferias'      (status na equipe — não existe no perfil real)
  squadId, posicao, bracoDominante, alturaCm, pesoKg,   (dados só do contexto de treino, não duplicam perfil)
  contatoEmergencia, observacoes, linkStatus, linkedAt
  // nome, rating, categoria/nível: lidos ao vivo de public_profiles/{athleteUid}, nunca gravados aqui
coachAthleteInvites/{inviteId}                       — top-level (athlete precisa consultar "convites pra mim" entre vários treinadores)
  coachUid, coachName, athleteUid, athleteName, squadId?, status, createdAt, expiresAt(48h), respondedAt
coaches/{coachUid}/trainings/{trainingId}            — treino
  squadId, title, date, startTime, endTime, location, durationMin, materials,
  exercises: [{label, durationMin, order}], status: 'agendado'|'realizado'|'cancelado',
  attendance: { [athleteUid]: 'presente'|'ausente'|'atrasado'|'justificado' }
coaches/{coachUid}/callUps/{callUpId}                 — convocação
  squadId, title, message, eventRef(trainingId opcional), responseDeadline,
  recipients: [athleteUid...], responses: { [athleteUid]: 'confirmado'|'talvez'|'nao_vou'|'aguardando' }, createdAt
coaches/{coachUid}/evaluations/{evalId}               — avaliação técnica
  athleteUid, date, scores: { saque, recepcao, levantamento, ataque, defesa, bloqueio, condicionamento, comunicacao, mental } (0-10),
  notes, createdAt
```

Torneios não ganha coleção nova: lê `tournaments/{id}` e as coleções de inscrição/equipe já existentes (`artifactsInscriptionsPath`/`artifactsTeamsPath`), filtradas pelos atletas vinculados ao treinador, via Cloud Function (ver abaixo) — evita abrir rules de leitura ampla sobre dados de inscrição de terceiros.

## Regras de segurança (`firestore.rules`)

- `coaches/{coachUid}/**` — leitura/escrita só pelo dono (`request.auth.uid == coachUid`); nenhuma claim nova necessária pra isso (é ownership simples), a claim `coach` só importa pro guard de rota no frontend e pra distinguir contas no `users/{uid}`.
- `coachAthleteInvites/{id}` — leitura pelo `coachUid` (convidador) ou `athleteUid` (convidado); escrita só via Cloud Function (Admin SDK) — client nunca escreve direto, igual ao `tournamentRegistrationInvites`.
- `public_profiles` já permite leitura a qualquer autenticado — sem mudança, busca de atleta pra convite usa essa coleção pra exibição; o lookup por telefone/e-mail (que tem PII) passa por Cloud Function.

## Cloud Functions novas (`functions/src/`)

Um arquivo novo, ex. `coach-portal.ts` (+ `coach-athlete-invite.ts` se ficar grande), seguindo o estilo de `tournament-partner-invite.ts`:

- `completeCoachSignup` — chamada uma vez logo após `createUserWithEmailAndPassword` no client (igual ao fluxo de `createArenaAccount` do arena, mas a claim é setada aqui, não por um superAdmin): define `roles: ['coach']` (preservando roles existentes do caller) e cria `coaches/{uid}`.
- `searchAthleteForCoachInvite({ phoneOrEmail })` — lookup server-side em `users`, retorna só `{ uid, displayName, initials }` (nunca telefone/e-mail de volta).
- `sendCoachAthleteInvite({ athleteUid, squadId? })` / `acceptCoachAthleteInvite({ inviteId })` / `cancelCoachAthleteInvite({ inviteId, asDecline? })` — cria/aceita/cancela o convite; aceite cria `coaches/{coachUid}/athletes/{athleteUid}` numa transação.
- `sendCallUp({ squadId, title, message, recipients, responseDeadline, trainingId? })` — cria o doc e notifica cada destinatário via `deliverNotificationToUser`.
- `respondToCallUp({ callUpId, response })` — atleta (precisa estar em `recipients`) atualiza seu campo em `responses`.
- `getCoachTournamentOverview({ squadId? })` — agrega torneios disponíveis + status de inscrição dos atletas vinculados, somente leitura.

Índices compostos (`firestore.indexes.json`) são adicionados durante a implementação conforme as queries exigirem (ex.: `trainings` por `squadId`+`date` ordenado, `callUps`/`evaluations` por `squadId`/`athleteUid`+`createdAt`) — não há necessidade de enumerar todos agora.

## Configuração Firebase / infra

- `angular.json` — novo projeto `coach` (mesmo padrão de build/serve/test dos outros 4 projetos), `outputPath: dist/coach`.
- `firebase.json` — novo hosting target `coach` (`public: dist/coach/browser`).
- `.firebaserc` — novo alias de hosting `coach` associado a um site novo no projeto **dev** (`volley-track-dev-4596c`), criado via `firebase hosting:sites:create`. Nada é criado/associado no projeto de produção nesta rodada.
- `firestore.rules` / `firestore.indexes.json` / `functions/src` — mudanças acima, deploy só no dev.

## Arquitetura de arquivos (`frontend/projects/coach/src/app`)

```
auth/           (login, signup, forgot/reset password — cópia do padrão arena, ar-*→co-*)
  ui/
convites/       (convite-atleta/:id — resposta do atleta, fora do guard de papel coach)
convocacao/     (convocacao/:id — resposta do atleta, idem)
painel/
  ui/           (co-panel-shell com sidebar de 10 itens + co-team-switcher (equipe ativa),
                 co-page-header, co-kpi-card, co-radar-chart, co-athlete-avatar,
                 co-progress-bar, co-tabs, co-row, co-form-field/textarea/select
                 — portados de tr-panel-atoms.jsx)
  home/         (Início)
  agenda/
  atletas/      (lista + detalhe + novo atleta/convite)
  equipes/      (lista + nova equipe)
  treinos/      (listagem + planejamento/novo)
  presenca/     (marcar presença de um treino)
  convocacoes/  (lista + nova convocação)
  avaliacoes/   (listagem + nova avaliação com radar)
  historico/    (linha do tempo por atleta)
  torneios/     (visão somente leitura)
  perfil/       (perfil do treinador — settings básicos)
```

Nomes de arquivo/seletor em inglês, rotas em português (`entrar`, `cadastro`, `painel`, `painel/agenda`, ...), mesma convenção do resto do monorepo.

## Fora de escopo desta entrega

Todas as 12 telas não-MVP listadas em Decisões; deploy em produção; app Flutter e portal `athlete` (nenhuma mudança); seletor de múltiplas equipes simultâneas na sidebar além do básico já no protótipo; qualquer automação de IA.

## Testes

Lógica de negócio nova de verdade (convites com expiração/transação, agregação de presença, resposta de convocação) — cobrir com testes unitários nas Cloud Functions novas, no padrão de `tournament-partner-invite.ts`/`tournament-staff-sync.test.ts` (arrange com Admin SDK emulado, casos de sucesso + rejeição de permissão + estado inválido). Componentes Angular do painel seguem o padrão do backoffice/arena (sem suíte dedicada além do que a convenção do projeto já cobre).
