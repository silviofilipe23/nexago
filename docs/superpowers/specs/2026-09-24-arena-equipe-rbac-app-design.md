# Equipe da arena no app Flutter (RBAC — fase 2)

**Data:** 2026-09-24 · **Status:** aprovado pelo dono (decisões registradas abaixo) · **Escopo:** `nexago_app/` apenas — nenhuma mudança em `firestore.rules`, `functions/` ou no portal Angular

## Objetivo

A fase 1 (`2026-07-31-arena-equipe-rbac-design.md`) tornou a equipe real no portal web e nas rules,
e deixou o app Flutter explicitamente **fora de escopo**:

> **App Flutter.** O app resolve a arena por `managerUserId` (`arena_selection_providers.dart`), então
> um membro simplesmente não encontra arena: sem vazamento, sem acesso. Fica para uma fase seguinte.

Esta é a fase seguinte. O sintoma que a motivou: um membro adicionado pelo portal com cargo `gestor`,
vínculo ativo, espelho gravado e claim `arena` presente, entra no app, escolhe o papel Arena e cai num
painel vazio com a mensagem *"Nenhuma arena vinculada ao seu usuário como gestor"*
(`arena_schedule_page.dart:39`). O backend está correto; o app é que nunca foi ligado no espelho.

## Decisões do dono (2026-09-24)

1. **RBAC completo no app**, não apenas destravar o acesso. Destravar sem a matriz faria recepção e
   manutenção enxergarem financeiro, plano e carteira no celular — regressão de segurança em relação
   ao que o portal e as rules já impõem.
2. **Os quatro cargos de uma vez** (gestor, recepção, financeiro, manutenção), não gestor primeiro.
   Matriz incompleta exigiria uma segunda passada e deixaria as cópias fora de sincronia.
3. **Abas sem acesso somem do bottom nav** (em vez de aparecerem bloqueadas).
4. **No Painel, quem não lê `financeiro` não vê faturamento nem gráfico de receita** — os demais cards
   (ocupação, horário de pico, reputação, seguidores) continuam para todos. Isso é mais restritivo que
   o portal, onde o Início não tem guard nenhum, e fecha essa brecha do lado do app.

## Como o app descobre a arena hoje

Uma única via, em dois providers:

- `managedArenaIdProvider` (`arena_schedule_providers.dart:108`) — `arenas.where('managerUserId' == uid).limit(1)`,
  consumido por ~35 providers e telas do painel.
- `managedArenasBriefProvider` (`arena_selection_providers.dart:16`) — mesma query, `limit(30)`.

Membro de equipe nunca casa com essa query: o vínculo dele mora em `arenas/{arenaId}/staff/{uid}`,
espelhado em `users/{uid}/arenaStaff/{arenaId}` pelo trigger `onArenaStaffWrittenSyncMirror`. As rules
já liberam o app a ler o espelho (`firestore.rules:1883`, `allow read: if request.auth.uid == userId`),
então **não há deploy de backend nesta entrega**.

Três pontas de código morto aparecem no caminho e saem junto, para não virarem fontes de verdade
fantasma:

- `arena_manager_user.dart` (`ArenaManagerUser`/`arenaIds`) — definido, nunca usado.
- `ArenaSelectionGate` — existe, completo, e não é montado em lugar nenhum.
- `currentArenaIdProvider` — a seleção é gravada e `managedArenaIdProvider` a ignora.

As duas últimas deixam de ser código morto e passam a ser usadas de verdade: com equipe, ser vinculado
a duas arenas deixa de ser hipótese.

## Arquitetura

### `domain/arena_staff_role.dart` — a matriz em Dart

Enum dos 4 cargos, enum das 10 áreas (`agenda`, `comandas`, `estoque`, `financeiro`, `promocoes`,
`site`, `quadras`, `perfil`, `torneios`, `comunidade`) e os dois mapas (`write`, `readOnly`) copiados de
`frontend/projects/arena/src/app/painel/data/arena-roles.model.ts`, com `canRead`/`canWrite` puros.

Este arquivo é o **5º espelho manual** da matriz. Os comentários "ESPELHO MANUAL — esta matriz existe
em três lugares" em `arena-roles.model.ts`, `functions/src/arena-staff-roles.ts`, `firestore.rules` e
`arena-access.service.spec.ts` passam a citar cinco e a nomear este arquivo. Nada automatiza o
espelhamento; o que segura a divergência é o corpo de casos de teste compartilhado (ver Testes).

### `domain/arena_access_providers.dart` — fonte única de acesso

- `ArenaMembership` — `arenaId`, `name`, `isOwner`, `role` (nulo para dono).
- `arenaMembershipsProvider` — stream que une as duas fontes: `arenas.where(managerUserId == uid)`
  (entra com `isOwner: true`) e `users/{uid}/arenaStaff` (entra com o cargo do espelho, **somente**
  quando `status == 'active'`). Deduplica por `arenaId` com o vínculo de dono vencendo.
- `arenaAccessProvider` — a membership ativa, resolvida por `currentArenaIdProvider` quando há mais de
  uma. Expõe `canRead(area)` / `canWrite(area)`; dono responde `true` para tudo.
- `managedArenaIdProvider` passa a **derivar** de `arenaAccessProvider`, mantendo a assinatura
  `StreamProvider<String?>`. Os ~35 consumidores existentes não mudam uma linha.

Manter listener (e não uma callable de resolução) é deliberado: é o que dá revogação imediata — membro
removido no portal perde o painel no mesmo instante, como já acontece na web.

### Seleção de arena

`ArenaSelectionGate` é montado no shell do painel e `arenaAccessProvider` respeita
`currentArenaIdProvider`. Sem isso, quem for staff de duas arenas cai numa arena arbitrária (a primeira
do `limit(1)`).

## Mapa rota→área

Função pura `arenaAreaForPath(String path)` + `isArenaOwnerOnlyPath(String path)` em
`arena_route_guard.dart`, onde já mora `isArenaManagerPanelPath`. Espelha o guard do portal
(`app.routes.ts`), que é a referência autoritativa:

| Área | Rotas do app |
|---|---|
| `agenda` | `/arena/schedule`, `/arena/schedule/slot/:slotId`, `/arena/bookings/**` (detalhe, recorrentes, cancelada), `/arena/clubs/**`, `/arena/settings/availability**` |
| `comandas` | `/arena/comandas/**` |
| `estoque` | `/arena/products/**` |
| `quadras` | `/arena/courts` |
| `perfil` | `/arena/profile`, `/arena/profile/edit`, `/arena/profile/updated` |
| `comunidade` | `/arena/profile/followers`, `/arena/reviews` |
| `financeiro` | `/arena/relatorios`, `/arena/settings/payments` |
| só dono | `/arena/settings/plan`, `/arena/settings/plan/activated`, `/arena/settings/subscription-pending` |
| sem área | `/arena/dashboard`, `/arena/settings` |

**O casamento vai do mais específico para o mais genérico.** `/arena/profile/followers` é `comunidade`,
não `perfil`; um `startsWith('/arena/profile')` avaliado antes engole os seguidores e entrega a tela ao
cargo errado. Mesma armadilha em `/arena/settings/payments` (`financeiro`) contra `/arena/settings`
(sem área).

`agenda` para `/arena/settings/availability` não é escolha de gosto: as rules exigem
`arenaCanWrite(arenaId, 'agenda')` para escrever em `arenaSlots` (`firestore.rules:1419`), que é
exatamente o que essa tela faz.

## Gating por superfície

### Router

Em `resolveAuthenticatedRedirect` (`post_login_destination.dart`), quando `isArenaManagerPanelPath(path)`,
consulta o acesso e redireciona para **o Painel** se a área não for legível — não para o login, porque a
pessoa tem painel, só não tem aquela tela. Mesmo padrão já usado pelo staff de torneio
(`canOperateStaffTournaments` / `hasActiveTournamentStaffAccess`): a checagem só roda quando a rota a
exige, e `redirectForActiveRole` continua função pura, recebendo o acesso por parâmetro.

### Bottom nav

`ArenaShellPage` monta `_tabs` e `_navItems` filtrados por `canRead`:

| Aba | Condição |
|---|---|
| Painel | sempre |
| Agenda | `canRead(agenda)` |
| Comandas | `canRead(comandas)` |
| Reservas | `canRead(agenda)` |
| Ajustes | sempre |

Resultado por cargo: dono e gestor 5 abas · recepção 5 · manutenção 4 (sem Comandas) · financeiro 3
(Painel, Comandas, Ajustes).

O `StatefulNavigationShell` indexa branches por posição fixa, então é preciso um mapa
índice-visível→branch para o `goBranch` e o inverso para o `currentIndex`. Aba atual fora da lista
visível (deep link, ou cargo alterado com o app aberto) cai no Painel.

### Ajustes

Cada item do menu aparece pela área da sua rota; Plano e Equipe só para dono; Trocar papel e Sair
sempre. O item "Equipe" segue levando à tela que ainda não existe no app — fora de escopo aqui, mas
deixa de ser oferecido a quem não é dono.

### Ações de escrita

`canWrite` esconde a ação. Áreas só de leitura precisam perder o botão, não apenas a rota — sem isso o
membro aperta e leva `permission-denied` cru:

- **Agenda / Reservas**: bloquear e liberar slot, criar reserva, cancelar, criar horário fixo — somem
  para manutenção (lê `agenda`, não escreve).
- **Comandas**: abrir, fechar, adicionar item — somem para financeiro (lê `comandas`, não escreve).
- **Estoque**: novo produto, repor, registrar movimento — somem para recepção (lê `estoque`, não escreve).
- **Perfil**: botão de editar — some para quem só lê.
- **Pagamentos**: chave PIX e botão de saque **só para o dono**. As rules congelam
  `payoutPixKey`/`payoutPixKeyType`/`paymentReceiver` para não-donos (`firestore.rules:996`) e
  `requestArenaWithdrawal` recusa membro. Gestor e financeiro veem saldo e extrato, sem sacar.

### Painel

KPI de faturamento e gráfico de receita só com `canRead(financeiro)`. Os atalhos rápidos
(`ArenaDashboardQuickActions`) são filtrados por `canWrite` da área de cada atalho — um atalho para uma
ação que a pessoa não pode executar é a mesma falha de silêncio, só que na tela de abertura.

## Testes

- **Matriz Dart** (unitário puro): os 4 cargos × 10 áreas nos dois sentidos, com o **mesmo corpo de
  casos** de `functions/src/arena-staff.test.ts` e `functions/test/arena-staff-rbac.rules.test.mjs`. É o
  único mecanismo que impede a 5ª cópia de divergir das outras quatro.
- **`arenaAreaForPath`** (unitário puro): uma asserção por rota da tabela, incluindo os dois casos-armadilha
  (`/arena/profile/followers` → `comunidade`, `/arena/settings/payments` → `financeiro`) e
  `/arena/bookings/recurring/new` → `agenda`.
- **`arenaMembershipsProvider`** (unitário com fake Firestore): dono sozinho, staff sozinho, dono+staff
  deduplicados, staff com `status != 'active'` ignorado, seleção entre duas arenas.
- **Widget**: bottom nav nos 4 cargos + dono; menu de Ajustes nos 4 cargos; Painel sem cards de dinheiro
  para recepção; uma tela de agenda sem ações de escrita para manutenção.
- **`role_route_guard_test.dart`**: caso novo de deep link para rota fora da área → Painel.

Nos widget tests, cuidado com `pumpAndSettle` em telas do painel que tenham indicador "AO VIVO":
a animação do pulso nunca assenta e o teste trava no timeout. Usar `pump()` com duração fixa.

## Fora de escopo (explícito)

- **Plano vencido.** As rules derrubam o membro quando a arena perde titularidade de plano, e nem o
  portal nem o app espelham essa cláusula na UI: o menu continua cheio e as escritas falham em silêncio.
  Resolver isso é trabalho das duas superfícies juntas, em entrega própria.
- **Tela de Equipe no app.** Convidar, trocar cargo e remover seguem só no portal.
- **Áreas que o app não tem tela** (`promocoes`, `site`, `torneios`): entram na matriz Dart por
  completude, sem consumidor.
- **Qualquer mudança de backend.** Rules, functions e espelho já estão no ar desde 01/08.

## Riscos conhecidos

1. **A matriz agora vive em cinco lugares.** O teste compartilhado de casos é a mitigação; o comentário
   cruzado em cada cópia é o aviso.
2. **Remapeamento de índice do `StatefulNavigationShell`.** Errar o mapa índice-visível→branch leva a
   aba errada sem erro nenhum — é o ponto da entrega com maior chance de bug silencioso, e o widget test
   por cargo existe por causa disso.
3. **Superfície ampla de ações de escrita.** São muitos botões em muitas telas; um esquecido não vaza
   dado, mas devolve `permission-denied` cru ao membro.

## Entrega

Entrega 100% de app: **a correção só alcança o membro quando sair build novo na loja** (e, pelo gate de
versão, quando o `minBuildNumber` subir, se for o caso). Até lá o paliativo é o portal web, que já
funciona hoje para quem tem vínculo ativo.
