# Equipe da arena e controle de acesso por função (RBAC)

**Data:** 2026-07-31 · **Status:** aprovado pelo dono (decisões registradas abaixo) · **Escopo:** portal web da arena (`frontend/projects/arena`), `firestore.rules`, `functions/`

## Objetivo

Hoje a arena tem **um único usuário**: o dono. `ArenaContextService` resolve a arena com
`arenas where managerUserId == uid`, e ~30 blocos de `firestore.rules` autorizam escrita comparando
`managerUserId == request.auth.uid`. A tela `/painel/equipe` existe mas é 100% mock — quatro membros
fixos, cargos Gestor/Recepção/Manutenção sem nenhum efeito.

Esta entrega torna a equipe real: o dono convida pessoas, cada uma com um cargo, e o cargo limita de
verdade o que ela alcança — tanto no menu do portal quanto nas rules do Firestore.

O catálogo de planos já vende isso: Starter anuncia "1 admin" e Elite anuncia "usuários ilimitados"
(`arena-plan.model.ts`).

## Decisões do dono (2026-07-31)

1. **Convite por e-mail com estado pendente.** O dono digita o e-mail, o convite nasce `pending` e o
   vínculo é ativado automaticamente quando a pessoa entra com aquele e-mail. Sem etapa de "aceitar".
2. **Enforcement completo**: UI *e* `firestore.rules`. Só UI não funcionaria — hoje as rules negam
   qualquer escrita de quem não é `managerUserId`, então um membro conseguiria logar e não conseguiria
   salvar nada.
3. **Papéis fixos com pacote de permissões** (não permissões ajustáveis por pessoa).
4. **Quatro cargos**: Gestor, Recepção, Financeiro, Manutenção. Dono continua sendo o único com
   Equipe, Planos e saque.
5. **Assentos por plano**: sem plano/Starter = 0 membros · Pro = até 5 · Elite = ilimitado.
6. **Revogação imediata**: plano sem titularidade ou membro removido → acesso cai no mesmo instante.
7. **Entrega do convite por link compartilhável** (copiar / WhatsApp), não por e-mail — não existe
   nenhuma infra de envio de e-mail no backend (nem SendGrid, nem nodemailer, nem a extensão Trigger
   Email; os únicos e-mails que o NexaGO envia hoje são os nativos do Firebase Auth). O documento de
   convite já nasce no formato certo, então plugar envio real depois é só somar a entrega.

## Modelo de dados

### `arenas/{arenaId}/staff/{userId}` — vínculo ativo

```
role: 'gestor' | 'recepcao' | 'financeiro' | 'manutencao'
status: 'active'
email: string          // lowercase, para exibição na tabela
displayName: string
photoUrl: string | null
addedBy: uid
addedAt: timestamp
```

Espelha o formato de `tournaments/{id}/staff/{uid}`, que já roda em produção.

### `arenaStaffInvites/{inviteId}` — convite pendente

Coleção **raiz**, não subcoleção: quem recebe o convite pode ainda não ter uid, e a rota pública de
aceite precisa ler o convite antes de saber a que arena ele pertence.

```
arenaId, arenaName
emailLower: string     // normalizado, é a chave de casamento no aceite
role: mesmo enum
status: 'pending' | 'accepted' | 'revoked' | 'expired'
invitedBy: uid
createdAt: timestamp
expiresAt: timestamp   // TTL de 7 dias
acceptedBy: uid | null
```

### `users/{uid}/arenaStaff/{arenaId}` — espelho (mantido por Cloud Function)

```
role, status, arenaName, arenaLogoUrl, updatedAt
```

O espelho não é redundância: `ArenaContextService` descobre a arena com
`where('managerUserId','==',uid)`, e um membro nunca aparece nessa query. Com o espelho, o serviço lê
duas fontes (dono + espelho) e busca os docs `arenas/{id}` por id — sem collection-group query e sem
mexer na leitura de `arenas`, que já é pública (`allow read: if true`).

Mesmo padrão de `users/{uid}/tournamentStaff/{tournamentId}`.

## A matriz de permissões

Nove áreas, derivadas das 21 rotas do painel. `RW` = ler e escrever, `R` = somente leitura,
`—` = sem acesso (rota some do menu e o guard bloqueia).

| área | cobre | gestor | recepção | financeiro | manutenção |
|---|---|:--:|:--:|:--:|:--:|
| `agenda` | Agenda, Reservas, Horários fixos, Clubinho | RW | RW | — | R |
| `comandas` | Comandas / PDV | RW | RW | R | — |
| `estoque` | Estoque, produtos, movimentações | RW | R | — | RW |
| `financeiro` | Financeiro, Relatórios, Ocupação | R | — | RW | — |
| `promocoes` | Promoções, Cupons | RW | — | RW | — |
| `site` | Links, Meu site | RW | — | — | — |
| `quadras` | Quadras | RW | — | — | RW |
| `perfil` | Perfil da arena, Horários, Contatos | RW | — | — | — |
| `torneios` | Torneios (só leitura, ver nota) | R | — | — | — |
| `comunidade` | Avaliações, Seguidores, Ranking | RW | R | R | — |

**Nota sobre `torneios`**: a tela `/painel/torneios` é somente leitura — a arena apenas sedia e
acompanha; criar e editar torneio é do organizador (`tournaments.managerId`). Logo essa área **não tem
bloco de rules**: o recorte é só de UI (menu + guard). É a única área da matriz nessa condição.

**Exclusivo do dono, nunca concedível a nenhum cargo:** Equipe (`/painel/equipe`), Planos
(`/painel/planos`, `arenas/{id}/billing`, `arenas/{id}/asaas`) e saque de dinheiro
(`arenaWithdrawals` create).

Leitura de `arenaWallets/{arenaId}` (saldo) entra em `financeiro`; **criar saque** não —
`arenaWithdrawals` create continua exigindo o dono.

### Início dinâmico

`/painel` hoje mostra "Faturamento hoje" e um gráfico com aba Faturamento/Reservas
(`panel-home.component.ts`). O KPI de faturamento e a aba de receita passam a exigir `financeiro`;
Recepção e Manutenção veem a versão operacional (reservas do dia, ocupação, próximas reservas).

## Enforcement em `firestore.rules`

### Funções novas

```
function isArenaOwner(arenaId)                  // renomeia/mantém isArenaManagerByArenaId
function arenaStaffRole(arenaId)                // lê o role do doc de staff
function isActiveArenaStaff(arenaId)            // exists + status == 'active' + arenaEntitled(pagos)
function arenaStaffCanWrite(arenaId, area)      // isActiveArenaStaff + mapa de escrita
function arenaStaffCanRead(arenaId, area)       // isActiveArenaStaff + mapa de leitura
function arenaCanWrite(arenaId, area)           // isArenaOwner || arenaStaffCanWrite
function arenaCanRead(arenaId, area)            // isArenaOwner || arenaStaffCanRead
```

A linguagem de rules suporta mapa literal com `.get(chave, default)`, então a matriz vira dado:

```
function arenaWriteAreas(role) {
  return {
    'gestor':     ['agenda','comandas','estoque','promocoes','site','quadras','perfil','comunidade'],
    'recepcao':   ['agenda','comandas','comunidade'],
    'financeiro': ['financeiro','promocoes'],
    'manutencao': ['quadras','estoque'],
  }.get(role, []);
}
function arenaReadAreas(role) {
  return {
    'gestor':     [... escrita do gestor ..., 'financeiro'],
    'recepcao':   ['agenda','comandas','estoque','comunidade'],
    'financeiro': ['financeiro','comandas','promocoes','comunidade'],
    'manutencao': ['quadras','estoque','agenda'],
  }.get(role, []);
}
```

`torneios` fica de fora dos mapas das rules de propósito — não há bloco de rules para ela. A matriz do
portal (`arena-roles.model.ts`) **inclui** `torneios`, porque lá ela serve pro menu e pro guard.

`arenaStaffCanWrite` implica `arenaStaffCanRead` (escrita sem leitura não faz sentido em nenhuma tela).

### Titularidade de plano dentro do gate

`isActiveArenaStaff` chama `arenaEntitled(arenaId, ['pro','elite','parceiro'])` — inclui o id legado
`parceiro`, como as demais rules já fazem. É isso que cumpre o "perde acesso na hora": plano vencido
fora da carência de 7 dias → as rules param de autorizar o membro no mesmo instante, sem sweeper.

O doc do vínculo **não** é apagado quando o plano cai: quando o pagamento volta, o acesso volta
sozinho, sem o dono ter que reconvidar a equipe. Apagar a equipe por causa de uma fatura atrasada
seria destrutivo e não foi pedido. **Remoção pelo dono**, essa sim, apaga o doc — e corta na hora.

Starter tem 0 assentos, então o gate de tier não tira nada de quem legitimamente teria equipe.

### Blocos afetados

Trocar `get(.../arenas/$(arenaId)).data.managerUserId == request.auth.uid` por
`arenaCanWrite(arenaId, '<área>')` (ou `arenaCanRead` no caso de leitura restrita):

| área | blocos |
|---|---|
| `perfil` | `arenas/{arenaId}` (update), `arenas/{arenaId}/metadata` |
| `quadras` | `arenas/{arenaId}/courts` |
| `promocoes` | `arenas/{arenaId}/promotions`, `arenas/{arenaId}/coupons` |
| `estoque` | `arenas/{arenaId}/products`, `stockMovements`, `canManageArenaProducts` |
| `comandas` | `arenaComandas` + subcoleções de itens/pagamentos, `arenas/{arenaId}/sales` |
| `agenda` | `arenaSlots`, `arenaSlotLocks`, `bookings`, `arenaBookings`, `arenaBookingInvites`, `arenaBookingWaitlist`, `arenaRecurringBookings`, `arenaClubs`, `arenaClubSessions`, `clubParticipants`, `arena_blocks` |
| `financeiro` | `arenaWallets` (read) |
| `comunidade` | resposta em `arena_reviews`, `arena_reputation` |
| `site` | `linkPages`, `arenaSites`, `arenaSiteSlugs` |
| `torneios` | *nenhum* — tela só de leitura, recorte apenas na UI |
| **dono só** | `arenas/{arenaId}` (create/delete), `billing`, `asaas`, `arenaWithdrawals` (create), `arenas/{arenaId}/staff` |

`isArenaManagerByArenaId` e `canManageArenaProducts` são usados em vários blocos — reescrever esses
dois helpers já cobre parte da lista.

### Regras da própria equipe

```
match /arenas/{arenaId}/staff/{staffUserId} {
  allow read: if isArenaOwner(arenaId) || request.auth.uid == staffUserId;
  allow write: if false;   // só via Cloud Function (valida assentos e plano)
}
match /arenaStaffInvites/{inviteId} {
  allow read: if isArenaOwner(resource.data.arenaId) ||
                 request.auth.token.email.lower() == resource.data.emailLower;
  allow write: if false;   // só via Cloud Function
}
match /users/{userId}/arenaStaff/{arenaId} {
  allow read: if request.auth.uid == userId;
  allow write: if false;   // espelho, mantido por trigger
}
```

Escrita fechada nas três: criar staff exige contar assentos e checar plano, o que rules não fazem bem.

### Limite de `get()`

O teto do Firestore é **10 acessos a documento por avaliação de rule**. As rules de arena já gastam
1 (`managerUserId`) + 1 (`arenaEntitled`, que reusa o mesmo `get` em cache); somar `exists` + `get` do
doc de staff leva a ~4. Cabe, mas fecha a porta para aninhar novos gates depois sem revisar a conta.
Chamadas `get()` idênticas dentro da mesma avaliação contam uma vez só — manter os helpers lendo
sempre os mesmos dois caminhos (`arenas/{id}` e `arenas/{id}/staff/{uid}`) é o que segura o número.

## Cloud Functions

| função | tipo | responsabilidade |
|---|---|---|
| `inviteArenaStaff` | callable | valida dono + capability `equipe` + assentos livres; se o e-mail já tem conta Firebase Auth, cria o vínculo **ativo** direto e marca o convite `accepted`; senão deixa `pending`. Retorna `{inviteId, link, status}` |
| `acceptArenaStaffInvite` | callable | confere `emailLower == auth.token.email`, confere validade e assentos, cria `arenas/{id}/staff/{uid}`, marca `accepted` |
| `revokeArenaStaffInvite` | callable | dono cancela convite pendente (`status: 'revoked'`) |
| `updateArenaStaffRole` | callable | dono troca o cargo de um membro |
| `removeArenaStaff` | callable | dono remove um membro (a escrita direta está fechada, então remover também passa por function) |
| `onArenaStaffWrittenSyncMirror` | trigger `onDocumentWritten` | espelha em `users/{uid}/arenaStaff/{arenaId}`, notifica na criação, reforça a role `arena` |
| `onArenaDeletedCleanupStaff` | trigger `onDocumentDeleted` | apaga docs de staff e convites da arena |
| `sweepExpiredArenaStaffInvites` | `onSchedule` diária | marca `pending` vencidos como `expired` |

**Concessão da role `arena`**: os dois callables que criam vínculo (`inviteArenaStaff` no caminho
direto e `acceptArenaStaffInvite`) concedem a role **de forma síncrona**, antes de responder. Deixar
isso só para o trigger criaria uma corrida real: quem acabou de aceitar o convite seria mandado ao
portal e `AuthService.assertArenaRole` leria `users/{uid}` antes de o trigger gravar, derrubando o
login. O trigger mantém a concessão como reforço idempotente, para o caso de um doc de staff criado
por fora (script/console).

A role só é **acrescentada**, nunca removida — igual a `ensureOrganizerRole` em
`tournament-staff-sync.ts`. Sair da equipe não revoga o papel porque a pessoa pode ser dona de outra
arena. Quem perde é o acesso *àquela* arena, via rules.

**E-mail não é verificado.** O casamento do convite usa `request.auth.token.email` sem exigir
`email_verified`, porque não existe infra de envio de e-mail para disparar a verificação (mesma razão
que levou o convite a ser por link). O risco é limitado: o Firebase Auth já impede duas contas com o
mesmo e-mail, e o único ganho de criar conta com o e-mail alheio seria entrar numa arena que alguém
deliberadamente convidou aquele e-mail a entrar. Fica registrado como risco aceito — quando houver
envio de e-mail, passar a exigir `email_verified` é uma linha.

**Contagem de assentos**: count query em `arenas/{id}/staff` + convites `pending` no momento do
convite/aceite. Volume máximo é 5 — não justifica contador desnormalizado.

**Nova capability**: `'equipe'` entra em `arenaCapabilitiesFor` (`arena-plan.model.ts`) para `pro` e
`elite` — é o que a UI usa para decidir entre a tela de equipe e o card de upsell. O espelho Dart
(`arena_plan.dart`) **não** é alterado: o app Flutter está fora de escopo e a capability lá seria
código morto.

O limite numérico de assentos vive só no servidor, em `functions/src/arena-staff-roles.ts`, e usa
`arenaEntitledTier(arena, nowMs)` de `arena-entitlement.ts` — que já resolve titularidade e aliases de
tier legado. A UI mostra o contador, mas quem barra é o callable.

## Portal Angular

### Serviços

- **`ArenaAccessService`** (novo) — resolve o papel efetivo do usuário na arena selecionada
  (`'owner'` ou um dos quatro cargos) e expõe `isOwner()`, `canRead(area)`, `canWrite(area)`.
  Fonte única de verdade da UI; a matriz vive num módulo `arena-roles.model.ts` que espelha as rules.
- **`ArenaContextService`** — passa a unir duas fontes: a query de dono que já existe e o espelho
  `users/{uid}/arenaStaff`. Os ids do espelho viram leitura direta de `arenas/{id}`. `notFound` só
  fica `true` quando as duas fontes vêm vazias. Seleção multi-arena continua funcionando igual.

### Rotas e navegação

- **`arenaAreaGuard(area)`** — `CanActivateFn` fabricado, somado a `authGuard` + `arenaSelectionGuard`
  nas ~30 rotas do painel. Sem permissão, redireciona pro Início.
- **`arenaOwnerGuard`** — para `/painel/equipe` e `/painel/planos`.
- **`panel-shell`** — cada `NAV_ITEM` ganha um campo `area` (ou `owner: true`) e o menu é filtrado
  por `ArenaAccessService`.

### Telas

- **`/painel/equipe`** — vira real. Lista membros ativos (`arenas/{id}/staff`) e convites pendentes
  (`arenaStaffInvites`) numa tabela só, com o pill "Convite pendente" que o mock já desenha. O modal
  de convite existente troca o mock pelo callable e passa a exibir o link gerado com botões **copiar**
  e **WhatsApp**. Ações novas: trocar cargo, remover membro, cancelar convite. Contador de assentos
  ("3 de 5") e, quando o plano não permite, o card de upsell no padrão que Estoque/Clubinho já usam.
- **`/convite/:inviteId`** — rota nova, fora do painel. Se o visitante já está logado, chama
  `acceptArenaStaffInvite` e manda pro painel. Se não, oferece **entrar** ou **criar conta**.

  **Ponto de atenção**: o cadastro dessa rota **não pode** passar por `completeArenaSignup`, senão o
  convidado nasce dono de uma arena própria. Precisa de um caminho que só cria a conta Firebase Auth
  e deixa `acceptArenaStaffInvite` conceder a role `arena` via trigger.

- **`/painel`** (Início) — KPI de faturamento e aba de receita do gráfico condicionados a
  `canRead('financeiro')`.

`AuthService.assertArenaRole` não muda: o membro passa a ter a role `arena` graças ao trigger, então
o gate de login continua valendo como está.

## Testes

O repositório já testa rules com o emulador (`functions/test/plan-tier-gates.rules.test.mjs`,
`comanda-add-items.rules.test.mjs`) — a matriz nova entra no mesmo formato.

- **Rules** (`functions/test/arena-staff-rbac.rules.test.mjs`): um caso por cargo × área nas duas
  direções (permitido / negado), mais os casos de contorno: plano sem titularidade derruba o membro,
  membro removido perde na hora, membro de *outra* arena não alcança esta, staff não escreve na
  própria subcoleção `staff`, membro nenhum cria saque.
- **Functions** (`functions/src/arena-staff.test.ts`): matriz de áreas (a função pura), limite de
  assentos por tier, convite para e-mail que já tem conta vs. que não tem, aceite com e-mail
  divergente, convite expirado, `buildArenaStaffMirrorData`.
- **Portal**: teste do `ArenaAccessService` (resolução de papel e `canRead`/`canWrite`) e do
  `arenaAreaGuard`.

## Fora de escopo (explícito)

- **App Flutter.** O app resolve a arena por `managerUserId` (`arena_selection_providers.dart`), então
  um membro simplesmente não encontra arena: sem vazamento, sem acesso. Fica para uma fase seguinte.
- **Envio real de e-mail.** Decidido usar link compartilhável; o doc de convite já nasce no formato
  que uma integração de e-mail consumiria.
- **Permissões ajustáveis por pessoa.** Descartado a favor de cargos fixos.

## Riscos conhecidos

1. **A matriz vive em três lugares** (portal TS, functions TS, rules) e as rules não importam código.
   Mesmo problema que `arena-plan.model.ts` já convive com `arena-plans.ts` — mitigado por comentário
   cruzado em cada cópia e pelos testes de rules, que falham se as cópias divergirem.
2. **Orçamento de `get()` das rules** fica em ~4 de 10 depois desta entrega.
3. **Superfície grande em `firestore.rules`**: ~30 blocos alterados de uma vez. Os testes de emulador
   são a rede de segurança; sem eles a regressão passa despercebida até alguém perder acesso em prod.

## Ordem de deploy

`firestore.rules` → functions → portal.

Invertido, o portal chamaria callables que ainda não existem, e um membro convidado bateria em rules
que ainda negam. Rules primeiro é seguro: elas concedem acesso a docs de staff que ainda não existem.
