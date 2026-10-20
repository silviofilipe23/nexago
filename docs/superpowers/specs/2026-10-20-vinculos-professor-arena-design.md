# Vínculos professor ↔ arena — design (v1)

Origem: `nexago_vinculos_professores_arenas.md` (especificação funcional) + protótipo Claude Design
"NexaGO Vínculos Professor-Arena (Canvas)" (`vc-atoms.jsx`, `vc-arena-web.jsx`, `vc-prof.jsx`).

## Decisões (padrão recomendado; revisar no PR)

1. **Um documento por par arena + professor.** `arenaProfessors/{arenaId}_{professorUserId}`.
   A unicidade ("no máximo um vínculo não encerrado") vira trivial — toda transição é uma
   transação num doc só. Nova tentativa depois de `REJECTED`/`ENDED`/`CANCELED`/`EXPIRED`
   **reabre o mesmo doc** (`cycle` + 1, datas/motivos da rodada anterior zerados); o histórico
   completo fica em `events`. Assim a arena vê uma linha por professor e o professor um card por
   arena, como no protótipo.
2. **Estados extras além da spec:** `CANCELED` (arena cancela convite / professor cancela pedido —
   o protótipo tem "Cancelar pedido") e `EXPIRED` (convite com 7 dias vencidos; marcado
   preguiçosamente quando alguém toca no vínculo — sem agendador). Ambos são "fechados" e
   permitem nova tentativa.
3. **Quem administra na arena:** dono + cargo `gestor` (área `perfil`, leitura e escrita — o
   professor aparece na página pública, que é do perfil). Recepção/financeiro/manutenção não veem.
   Sem gate de plano: o núcleo do vínculo vale para toda arena. Superadmin atua como suporte
   (`actorRole: ADMIN` no evento).
4. **Permissões por vínculo** (`canManageOwnLessons`, `canBookCourts`, `canAppearInArenaProfile`):
   a arena propõe no convite e define na aprovação; o servidor valida (só booleanos conhecidos) e
   ignora qualquer permissão que o professor mande. Padrão: equipe = 3 ligadas; independente =
   aulas + quadras. **Efetivas só com `ACTIVE`** (`SUSPENDED` revoga sem apagar a configuração;
   reativar restaura).
   - `canAppearInArenaProfile` já tem efeito: espelho público
     `arenas/{arenaId}/publicProfessors/{uid}` (nome, foto, modalidades, tipo) mantido pelo backend
     a cada transição; seção "Professores" na página da arena no app.
   - `canBookCourts` e `canManageOwnLessons`: aplicação na reserva ("reservar como professor") e
     nas Aulas (chamada pelo professor; vínculo suspenso/encerrado trava turma nova) em
     `2026-10-20-vinculos-permissoes-reserva-aulas-design.md`. `classTeachers` se liga ao vínculo
     pela conta (`userId`), sem ser criado automaticamente.
5. **Convite só para conta NexaGO existente** (busca em `public_profiles`, como Aulas/Clubinho).
   "Não tem conta?" orienta a criar a conta e pedir vínculo pela página da arena (copiar link).
   Convite por e-mail sem conta fica para depois (não há envio de e-mail nem verificação).
6. **Encerramento pelo professor é imediato** (`ACTIVE`/`SUSPENDED` → `ENDED`), com motivo
   opcional e aviso à arena — ainda não há reservas/aulas atreladas ao vínculo para pendenciar.
7. **Sem `professorProfiles` na v1.** Nome, foto e modalidades são copiados do perfil do usuário
   (`sportOnboarding.levelsBySport`/`primarySportId`) para o vínculo a cada transição.
8. **Onde fica cada tela:**
   - Painel da arena (portal web `arena`): menu **Profissionais** (A1–A6).
   - Professor na web: portal do **atleta** (é a conta global; não existe portal do professor):
     **Minhas arenas** + card "Você é professor?" na página da arena (P1–P4).
   - App Flutter: lado do professor (M1–M6) — "Minhas arenas" no perfil do atleta e
     "Solicitar vínculo" na página da arena. O lado da arena no app fica para uma próxima etapa
     (os avisos para a arena caem na agenda do gestor, como todo aviso de arena hoje).
9. **Notificações:** professor recebe `professor_link_*` **sem `url` e sem `arenaId`** no `data`
   (o app antigo da loja não tem a rota e cairia na agenda do GESTOR pelo ramo genérico de arena);
   o app novo resolve pelo tipo. Arena recebe `arena_professor_*` (dono + gestores ativos), com
   `webUrl` para o painel.

## Modelo

`arenaProfessors/{arenaId}_{professorUserId}`

| campo | tipo |
|---|---|
| `arenaId`, `professorUserId` | string |
| `relationshipType` | `ARENA_STAFF` \| `INDEPENDENT` |
| `status` | `INVITED` \| `PENDING` \| `ACTIVE` \| `REJECTED` \| `SUSPENDED` \| `ENDED` \| `CANCELED` \| `EXPIRED` |
| `initiatedBy` | `ARENA` \| `PROFESSOR` |
| `permissions` | `{canManageOwnLessons, canBookCourts, canAppearInArenaProfile}` (configuradas) |
| `message` | string \| null — mensagem do convite/pedido |
| `cycle` | number — 1 na primeira rodada |
| `professorName`, `professorPhotoUrl`, `professorModalities[]` | cópia do perfil |
| `arenaName`, `arenaLogoUrl`, `arenaCity` | cópia da arena |
| `createdAt`, `updatedAt`, `invitedAt`, `requestedAt`, `expiresAt`, `respondedAt`, `approvedAt`, `suspendedAt`, `endedAt`, `canceledAt` | Timestamp \| null |
| `invitedBy`/`invitedByName`, `approvedBy`/`approvedByName`, `suspendedBy`, `endedBy`, `endedBySide` | string \| null |
| `rejectionReason`, `suspensionReason`, `suspensionDetails`, `endedReason` | string \| null |

`arenaProfessors/{id}/events/{eventId}` — imutável: `eventType` (`INVITED`, `REQUESTED`,
`ACCEPTED`, `REJECTED`, `APPROVED`, `SUSPENDED`, `REACTIVATED`, `ENDED`, `PERMISSIONS_CHANGED`,
`CANCELED`, `EXPIRED`), `actorUserId`, `actorName`, `actorRole` (`ARENA`\|`PROFESSOR`\|`ADMIN`\|`SYSTEM`),
`cycle`, `fromStatus`, `toStatus`, `reason`, `metadata`, `createdAt`.

`arenas/{arenaId}/publicProfessors/{professorUserId}` — leitura pública: `name`, `photoUrl`,
`modalities[]`, `relationshipType`, `since`.

### Rules

- `arenaProfessors`: lê o próprio professor ou `arenaCanRead(arenaId, 'perfil')` ou superadmin;
  escrita só via Cloud Function. `events`: mesma leitura (via `get` do pai). `publicProfessors`:
  leitura pública, escrita negada.

## Transições (validadas no servidor)

| de | para | quem | callable |
|---|---|---|---|
| — / fechado | `INVITED` | arena | `createArenaProfessorInvite` |
| — / fechado | `PENDING` | professor | `requestArenaProfessorLink` |
| `INVITED` | `ACTIVE` / `REJECTED` | professor | `respondToArenaProfessorInvite` |
| `PENDING` | `ACTIVE` | arena | `approveArenaProfessorRequest` |
| `PENDING` | `REJECTED` | arena | `rejectArenaProfessorRequest` |
| `ACTIVE` | `SUSPENDED` | arena | `suspendArenaProfessorLink` |
| `SUSPENDED` | `ACTIVE` | arena | `reactivateArenaProfessorLink` |
| `ACTIVE`/`SUSPENDED` | `ENDED` | arena ou professor | `endArenaProfessorLink` |
| `INVITED` (arena) / `PENDING` (professor) | `CANCELED` | quem iniciou | `cancelArenaProfessorLink` |
| `INVITED` vencido | `EXPIRED` | sistema (ao tocar) | — |
| `ACTIVE`/`SUSPENDED` | (mesmo) | arena | `updateArenaProfessorPermissions` |

Duplicados: pedir/convidar com vínculo aberto devolve `already-exists` (ou `failed-precondition`
quando o outro lado já iniciou) com `details: {linkId, status, initiatedBy}` — a tela mostra o
"Você já tem um pedido aqui" (M5) ou "Este professor já pediu vínculo — analise a solicitação".

Todas as callables em `CLIENT_FACING_REGIONS`; respostas `{linkId, status}`.

## Fora desta etapa

Lado da arena no app; convite por e-mail sem conta; perfil profissional (bio, certificações); métricas operacionais.

## Contrato para os clientes (portal da arena, portal do atleta, app)

Fonte: `functions/src/arena-professor-links.ts`. Toda callable devolve `{linkId, status}`.

| callable | entrada | quem |
|---|---|---|
| `createArenaProfessorInvite` | `{arenaId, professorUserId, relationshipType, permissions?, message?}` | arena |
| `requestArenaProfessorLink` | `{arenaId, relationshipType, message?}` | professor (uid da sessão) |
| `respondToArenaProfessorInvite` | `{linkId, accept: boolean, reason?}` | professor |
| `approveArenaProfessorRequest` | `{linkId, permissions?}` | arena |
| `rejectArenaProfessorRequest` | `{linkId, reason?}` | arena |
| `suspendArenaProfessorLink` | `{linkId, reason (obrigatório), details?}` | arena |
| `reactivateArenaProfessorLink` | `{linkId}` | arena |
| `endArenaProfessorLink` | `{linkId, side: 'ARENA'\|'PROFESSOR', reason?}` | ambos |
| `cancelArenaProfessorLink` | `{linkId, side: 'ARENA'\|'PROFESSOR'}` | arena (convite) / professor (pedido) |
| `updateArenaProfessorPermissions` | `{linkId, permissions: Partial<...>}` | arena |

`permissions` = `{canManageOwnLessons: boolean, canBookCourts: boolean, canAppearInArenaProfile: boolean}`.
`linkId` = `${arenaId}_${professorUserId}` — o cliente pode montar o id para ler o vínculo de uma
arena específica (`doc(db, 'arenaProfessors', linkId)`), útil na página da arena.

Erros (mensagem em português, pronta para a tela; `details` quando houver):
- duplicado: `already-exists` / `failed-precondition` com `details: {linkId, status, initiatedBy}`
  → M5 "Você já tem um pedido aqui" (status `PENDING`), "A arena já convidou você" (`INVITED`),
  "Você já tem vínculo" (`ACTIVE`/`SUSPENDED`).
- convite vencido ao responder: `failed-precondition`, `details.status = 'EXPIRED'`.
- estado errado: `failed-precondition`, `details.status` = estado atual.
- sem acesso: `permission-denied`.

Leituras diretas (rules já liberam):
- arena: `query(collection(db,'arenaProfessors'), where('arenaId','==',arenaId))` (dono/gestor).
- professor: `query(collection(db,'arenaProfessors'), where('professorUserId','==',uid))`.
- histórico: `collection(db,'arenaProfessors',linkId,'events')`, ordenar por `createdAt` desc no cliente.
- público: `collection(db,'arenas',arenaId,'publicProfessors')`.

"Convite expirado" na tela: `status == 'INVITED' && expiresAt <= agora` (o servidor só grava
`EXPIRED` quando alguém toca no vínculo).

Permissões efetivas = configuradas só se `status == 'ACTIVE'`; senão tudo desligado
("revogadas" na arena; "após o aceite"/"após a aprovação" para convite/pedido).

### Rótulos e cores (do protótipo `vc-atoms.jsx`)

| | rótulo (arena) | rótulo (professor) | cor |
|---|---|---|---|
| `INVITED` | Convite enviado | Convite recebido | `#5B9BFF` |
| `PENDING` | Aguardando aprovação | Aguardando a arena | `#F4C543` |
| `ACTIVE` | Ativo | Ativo | `#2BD17E` |
| `REJECTED` | Recusado | Recusado | texto 50% |
| `SUSPENDED` | Suspenso | Suspenso | `#FF3B30` |
| `ENDED` | Encerrado | Encerrado | texto 50% |
| `CANCELED` | Cancelado | Cancelado | texto 50% |
| `EXPIRED` (ou INVITED vencido) | Convite expirado | Convite expirado | texto 50% |

Tipo: `ARENA_STAFF` = "Equipe da arena" — "Integra a rede de professores da arena" (`#FF8A4A`,
fundo `rgba(255,106,26,0.12)`); `INDEPENDENT` = "Independente" — "Autônomo, usa a estrutura para os
próprios alunos" (`#5B9BFF`, fundo `rgba(91,155,255,0.12)`).

Permissões: `canManageOwnLessons` "Gerenciar as próprias aulas" — "Criar aulas e turmas, fazer
chamada dos seus alunos"; `canBookCourts` "Reservar quadras" — "Reservar horários conforme regras e
preços da arena"; `canAppearInArenaProfile` "Aparecer no perfil da arena" — "Listado em
“Professores” na página pública". Rótulo curto na lista: Aulas / Quadras / Perfil.

Eventos (linha do histórico): `INVITED` "Convite enviado · {tipo}", `REQUESTED` "{nome} solicitou
vínculo · {tipo}", `ACCEPTED` "Convite aceito", `REJECTED` "Recusado" (+ motivo), `APPROVED`
"Solicitação aprovada como {tipo}", `SUSPENDED` "Vínculo suspenso · {motivo}", `REACTIVATED`
"Vínculo reativado", `ENDED` "Vínculo encerrado" (+ motivo), `PERMISSIONS_CHANGED` "Permissão
“X” ligada/removida" (de `metadata.changed` + `metadata.after`), `CANCELED` "Convite cancelado" /
"Pedido cancelado", `EXPIRED` "Convite expirou". Linha de baixo: `{eventType} · {actorName} · {data}`.

Avisos: professor recebe `professor_link_*` (`invite`, `approved`, `rejected`, `suspended`,
`reactivated`, `ended`, `permissions_changed`) com `data = {linkId, linkStatus, webUrl:
'/professor/arenas/{linkId}'}`; arena recebe `arena_professor_*` (`request`, `invite_accepted`,
`invite_declined`, `ended`) com `data = {linkId, arenaId, linkStatus, webUrl:
'/painel/profissionais/{linkId}'}`.
