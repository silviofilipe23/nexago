# Bora Jogar — frontend Flutter multi-participante

## Contexto

O backend (`functions/src/friendly-match-*.ts`) já foi migrado de convite 1:1
para N participantes (ver
`docs/superpowers/specs/2026-07-09-bora-jogar-multi-participante-design.md`
e `docs/superpowers/plans/2026-07-09-bora-jogar-multi-participante-backend.md`,
implementado, revisado e commitado — 18 tasks + 1 fix, 526 testes passando).
O app Flutter (`nexago_app/lib/features/friendly_match/`) ainda fala o schema
antigo em toda parte:

- **Modelo** (`friendly_match_models.dart`): `FriendlyMatch` tem
  `fromUid`/`fromName`/`fromPhotoUrl` e `toUid`/`toName`/`toPhotoUrl` fixos
  (par), métodos `otherUid`/`otherName`/`otherPhotoUrl`/`nameOf`/
  `responderUid`/`isParticipant` todos assumem exatamente 2 lados.
  `FriendlyMatchStatus` ainda tem `sent`/`countered` (viraram `filling` no
  backend) e não tem `unfilled` (novo).
- **Lógica** (`friendly_match_logic.dart`): `nextActionFor` e
  `friendlyMatchTimelineSteps` são escritos em termos de "eu" vs "o outro".
- **Repositório** (`friendly_match_repository.dart`): queries usam
  `fromUid`/`toUid` diretamente (`incomingInvites`, `sentWaiting`, etc.) —
  campos que não existem mais no doc.
- **Serviço** (`friendly_match_service.dart`): chama as Cloud Functions
  antigas por nome (`acceptFriendlyMatchInvite`, `declineFriendlyMatchInvite`)
  e com payload 1:1 (`toUid` singular, `submitReview` sem `revieweeUid`) —
  confirmado que é o **único** ponto de acoplamento com nomes de callable em
  todo o `lib/` (grep não achou nenhum outro lugar).
- **UI**: builder de convite recebe `toUid`/`toName` únicos (populados via
  query params da rota `/bora-jogar/novo`, vindos do card de descoberta de
  1 atleta); tela de detalhe, card do hub e sheets de avaliação/contraproposta
  assumem "o outro" no singular em toda parte.

Esta spec cobre só o app Flutter — o backend não muda aqui.

## Decisão

Generalizar o frontend pro schema novo, **preservando pixel a pixel o visual
atual para o caso `slotsTotal == 1`** (o uso real do recurso hoje) — a
generalização visual (lista de vagas, N-1 avaliações, etc.) só aparece
quando `slotsTotal > 1`. Reaproveitar `PartnerSearchService`/
`UsersRepository` (já usado no fluxo de parceiro de torneio) para a busca de
"adicionar mais convidados" — sem construir busca de atletas do zero.

Decisões de UX validadas em brainstorming:

1. Fluxo de descoberta não muda (tocar "Convidar" no card de 1 atleta abre o
   builder com essa pessoa). O builder ganha seção **"Convidados"**: chips
   dos já escolhidos + "Adicionar mais" (sheet de busca, multi-select,
   exclui quem já foi escolhido).
2. Avaliação vira lista de pendências (uma linha por participante ainda não
   avaliado + botão "Avaliar" que abre a mesma sheet de hoje, parametrizada
   pela pessoa) — sem ordem forçada.
3. Card de participantes no detalhe: **igual a hoje quando `slotsTotal==1`**;
   vira lista de vagas (avatar + nome + selo de status; organizador
   identificado; vaga aberta ganha "Repor vaga" pro organizador, reaproveitando
   a mesma sheet de busca em modo single-select) quando `slotsTotal>1`.
4. Cards do hub: iguais a hoje pra 1:1; título vira "Ana, Bia e mais 1" pra
   N>2 (2 primeiros nomes + contagem do resto).

## Escopo

### Dentro do escopo

- Modelo: `FriendlyMatch` reescrito (`organizerUid`/`slots[]`/
  `participantUids`/`pendingSlotUids`), `FriendlyMatchSlot` novo,
  `FriendlySlotStatus` novo, `FriendlyMatchStatus` com os valores novos do
  backend (`filling`, `unfilled`; remove `sent`/`countered`/`declined`/
  `expired` como status do jogo).
- Lógica (`friendly_match_logic.dart`): `nextActionFor` e timeline
  reescritos pra unanimidade/grupo; helpers de rótulo de grupo novos.
- Repositório: queries reescritas pra `organizerUid`/`participantUids`/
  `pendingSlotUids` (espelhando a rule nova do backend).
- Serviço: `sendInvite` recebe `List<String> toUids`; `acceptInvite`/
  `declineInvite` chamam os nomes novos das callables
  (`acceptFriendlyMatchInviteSlot`/`declineFriendlyMatchInviteSlot`);
  `submitReview` ganha `revieweeUid` obrigatório; `fillSlot` novo
  (`fillFriendlyMatchSlot`).
- Providers: ajustados ao novo shape de dados (forma/assinatura pública
  majoritariamente preservada).
- UI: builder (seção "Convidados" + sheet de busca), detalhe (card de
  participantes com os dois modos), avaliação (lista de pendências), hub
  cards (rótulo de grupo), status chip (`filling`/`unfilled`), sheet de
  contraproposta (só aparece quando `slotsTotal==1`).
- Rastreamento local (client-side, por sessão) de quem já avaliei nesta
  tela, compensando a ausência do campo público antigo (ver "Limitação
  técnica" abaixo).

### Fora do escopo

- Qualquer mudança na tela de descoberta de atletas (`athlete_discover_page`/
  `athlete_discover_card`) além de nada — ela continua chamando a rota com 1
  `toUid`/`toName`, papel que o builder já assume ao abrir.
- Deploy do backend / app para dev ou prod.
- Corrigir a limitação técnica da avaliação no backend (adicionar de volta
  um campo público tipo `reviewSubmittedUids`) — o app compensa client-side;
  se a imperfeição for considerada inaceitável depois de testar, vira uma
  spec/patch de backend à parte.
- Redesenho visual do caso 1:1 — permanece bit-a-bit igual ao que existe.
- Testes de integração/emulador (a suíte atual usa `flutter_test` puro,
  unit/widget tests — sem Firestore real).

## Arquitetura

### Modelo (`friendly_match_models.dart`)

```dart
enum FriendlyMatchStatus {
  filling, confirmed, unfilled, cancelled, noShow, completed, reviewed
  // remove: sent, countered, declined, expired
}

enum FriendlySlotStatus {
  invited, accepted, declined, expired, countered
}

class FriendlyMatchSlot {
  final String uid;
  final String name;
  final String? photoUrl;
  final FriendlySlotStatus status;
  final DateTime invitedAt;
  final DateTime? respondedAt;
  final DateTime expiresAt;
  final int? scoreAtSend;
  final FriendlyMatchCounterProposal? counterProposal; // só quando slotsTotal==1
}

class FriendlyMatch {
  // organizerUid/organizerName/organizerPhotoUrl substituem fromUid/fromName/fromPhotoUrl
  // slots substitui toUid/toName/toPhotoUrl (lista, não par)
  final String organizerUid;
  final String organizerName;
  final String? organizerPhotoUrl;
  final int slotsTotal;
  final List<FriendlyMatchSlot> slots;
  final List<String> participantUids;   // organizador + aceitos
  final List<String> pendingSlotUids;   // convidados aguardando resposta
  // sport/objective/status/scheduledAt/alternativeTimes/location/message/
  // scoreAtSend (removido, vira por-slot)/confirmedTime/checkInOpenAt/
  // checkInCloseAt/checkIns/cancelledByUid/cancelPenalized/noShowUids/
  // completedAt/reviewRevealAt/reviews/createdAt — mantêm forma e semântica
  // já existentes (reviews vira Map<String, Map<String, FriendlyMatchReview>>
  // aninhado, espelhando o backend).
}
```

Helpers generalizados (substituem `otherUid`/`otherName`/`otherPhotoUrl`/
`nameOf`/`responderUid`):

- `bool isParticipant(String uid)` — organizador OU está em `slots` (qualquer
  status) OU em `participantUids`.
- `String nameOf(String uid)` — organizador ou o nome do slot daquele uid.
- `FriendlyMatchSlot? mySlot(String uid)` — o slot que pertence a esse uid
  (null se for o organizador ou não participar).
- `List<FriendlyMatchSlot> openSlots` — slots com status `declined`/`expired`
  (vagas que o organizador pode repor).
- `String otherParticipantsLabel(String uid, {int maxNames = 2})` — quando
  `slotsTotal == 1`, devolve o nome único do outro lado (comportamento
  idêntico ao `otherName` de hoje). Quando `slotsTotal > 1`, junta até
  `maxNames` nomes de quem já aceitou (+ organizador, excluindo `uid`) e
  anexa "e mais N" se sobrar gente — usado tanto no card do hub quanto em
  textos do detalhe.
- `String slotResponderUid` — mantém a mesma ideia de hoje
  (`responderUid`), mas por-slot: quem responde uma vaga é o próprio uid do
  slot, exceto quando o slot está `countered` (aí é o organizador) — espelha
  `slotResponderUid` do backend.
- `List<String> pendingRevieweeUids(String uid)` — participantes (exceto
  `uid`) que ainda não têm entrada em `reviews[uid]` — é a lista de
  pendência de avaliação, calculada só a partir do doc (sem depender do
  rastreio local da sessão, que é só um reforço otimista na UI). Substitui
  `hasReviewed(uid)` (que lia `reviewSubmittedUids`, campo que não existe
  mais) — qualquer call site que antes checava `!match.hasReviewed(uid)`
  passa a checar `match.pendingRevieweeUids(uid).isNotEmpty` (é o caso de
  `friendlyMatchPendingCountProvider` em `friendly_match_providers.dart`).

### Lógica (`friendly_match_logic.dart`)

- `nextActionFor(uid, match, now)`: passa a olhar `match.mySlot(uid)` em vez
  de comparar com `fromUid`/`toUid`. Unanimidade de check-in já funciona sem
  mudança (já é `Map<uid, DateTime>`). Avaliação: `reviewWaitingOther` é
  removido do enum (não existe mais um "o outro" único pra esperar); `review`
  passa a significar "`status==completed` e
  `match.pendingRevieweeUids(uid)` não está vazia" — quando a lista de
  pendências zera, a ação vira `finished` (nada a fazer agora, mesmo que
  reveals de outros pares ainda estejam pendentes). A tela de detalhe usa
  `pendingRevieweeUids` diretamente pra montar a lista (não só um booleano),
  então o enum só precisa saber "tem algo pendente ou não".
- Timeline: generaliza "aguardando resposta de {outro}" pra usar
  `otherParticipantsLabel`; passos de check-in idem.

### Repositório (`friendly_match_repository.dart`)

Queries trocam de campo, mantendo a mesma forma de rules (organizerUid ==,
participantUids array-contains, pendingSlotUids array-contains — os três
disjuntos que a rule nova do backend exige):

```dart
Stream<List<FriendlyMatch>> incomingInvites(String uid) => _matches
    .where('pendingSlotUids', arrayContains: uid)
    .where('status', isEqualTo: 'filling')
    .orderBy('createdAt', descending: true)
    .snapshots().map(_parse);

Stream<List<FriendlyMatch>> sentWaiting(String uid) => _matches
    .where('organizerUid', isEqualTo: uid)
    .where('status', isEqualTo: 'filling')
    .orderBy('createdAt', descending: true)
    .snapshots().map(_parse);
```

`countersToRespond`/`countersWaiting` (contraproposta) somem como streams
separadas — contraproposta só existe dentro de um jogo `slotsTotal==1` que
já está em `incomingInvites`/`sentWaiting` (status `filling`, slot
`countered`); a UI decide o rótulo/ação a partir do `slot.status`, não de
uma query própria. `activeMatches`/`historyMatches` só trocam a lista de
status do `whereIn` pros valores novos (`confirmed`/`completed` /
`reviewed`/`no_show`/`cancelled`/`unfilled`), campo `participantUids`
inalterado.

**Índices do Firestore**: os índices compostos pra essas queries (`
pendingSlotUids CONTAINS + status`, `organizerUid + status`) precisam
existir em `firestore.indexes.json` antes do app rodar contra o dev migrado
— ver nota "Fora do documento".

### Serviço (`friendly_match_service.dart`)

```dart
Future<String> sendInvite({
  required List<String> toUids,   // era toUid único
  required String sport,
  required FriendlyMatchObjective objective,
  required DateTime scheduledAt,
  List<DateTime> alternativeTimes = const [], // só enviado quando toUids.length==1
  required FriendlyMatchLocation location,
  String? message,
}) => _call<...>('sendFriendlyMatchInvite', {'toUids': toUids, ...});

Future<void> acceptInvite(String matchId, {DateTime? chosenTime}) =>
    _call<Object?>('acceptFriendlyMatchInviteSlot', {...}); // nome novo

Future<void> declineInvite(String matchId, {String? reason}) =>
    _call<Object?>('declineFriendlyMatchInviteSlot', {...}); // nome novo

Future<void> fillSlot({
  required String matchId,
  required int slotIndex,
  required String toUid,
}) => _call<Object?>('fillFriendlyMatchSlot', {...}); // novo

Future<void> submitReview({
  required String matchId,
  required String revieweeUid,   // novo, obrigatório
  required int stars,
  List<String> tags = const [],
  String? comment,
}) => _call<Object?>('submitFriendlyMatchReview', {...});
```

`counterInvite`/`cancelMatch`/`checkIn` mantêm assinatura (payload já
compatível — `counterInvite` continua só sendo chamada pela UI quando
`slotsTotal==1`, o backend já rejeita caso contrário).

### UI

- **Builder** (`friendly_match_invite_builder_page.dart` +
  `friendly_match_invite_builder_sections.dart`): construtor ganha
  `initialToUid`/`initialToName` (em vez de obrigatórios únicos) e estado
  `List<({String uid, String name})> _invitees`. Nova seção
  `InviteBuilderInviteesSection` (chips + "Adicionar mais"), nova sheet
  `showFriendlyMatchAthletePickerSheet` (multi-select, reaproveita
  `PartnerSearchService(categoryGenderType: null)`/
  `TournamentRegistrationPartnerCandidateTile` como referência de padrão
  visual, exclui uids já em `_invitees`). `alternativeTimes`/contraproposta
  só ficam visíveis/habilitados quando `_invitees.length == 1`.
- **Detalhe** (`friendly_match_detail_page.dart` +
  `friendly_match_detail_sections.dart`): `FriendlyMatchDetailProfileCard`
  bifurca — `slotsTotal==1` renderiza exatamente como hoje (usando
  `otherParticipantsLabel`/`mySlot` no lugar de `otherName`/`otherUid`, sem
  diferença visual); `slotsTotal>1` renderiza
  `FriendlyMatchDetailSlotsList` (novo) — uma linha por slot + organizador,
  com selo de status e "Repor vaga" (reaproveita a mesma sheet de busca do
  builder, em modo single-select) nas vagas abertas, visível só pro
  organizador.
- **Avaliação**: `_RevealedReviews`/bloco de ação viram
  `FriendlyMatchPendingReviewsList` (novo) — itera
  `match.participantUids.where((p) => p != uid && !_locallyReviewed.contains(p) && match.reviews[uid]?[p] == null)`,
  uma linha "Avaliar {nome}" por pendência, abre a mesma
  `showFriendlyMatchReviewSheet` de hoje passando `revieweeUid`. Ao suceder,
  adiciona a `_locallyReviewed` (Set local do State) — ver limitação
  técnica abaixo.
- **Hub cards** (`friendly_match_card.dart`,
  `friendly_match_summary_card.dart`): trocam `otherName(uid)`/
  `otherPhotoUrl(uid)` por `otherParticipantsLabel(uid)` e o avatar do
  primeiro participante confirmado (organizador se `uid` não for ele, senão
  o primeiro slot aceito) — sem mudança visual quando `slotsTotal==1`.
- **Status chip** (`friendly_match_status_chip.dart`): mapa de cores/labels
  ganha `filling` (mesma cor/rótulo de `sent` hoje — "Aguardando resposta"
  quando `slotsTotal==1`, "Faltam N vagas" quando `slotsTotal>1`) e
  `unfilled` (cor neutra, rótulo "Não fechou a tempo"); remove `sent`/
  `countered`/`declined`/`expired` do switch (não são mais status do jogo).

### Limitação técnica: rastreio de avaliação enviada

O backend não expõe mais publicamente "este uid já enviou todas as
avaliações que devia" (o campo `reviewSubmittedUids` foi removido na
migração pairwise — cada avaliação é `privateReviews/{reviewer}_{reviewee}`,
ilegível até o par revelar). O app mantém um `Set<String>` local (estado da
`FriendlyMatchDetailPage`, não persistido) marcando quem já avaliei nesta
sessão, assim que a callable retorna sucesso. Se o app fechar antes do
reveal do par e reabrir, a pendência pode reaparecer (o backend recusa
reenvio com erro amigável, sem duplicar dado) — imperfeição aceitável dado
que a feature ainda é só dev, registrada aqui para não ser "descoberta" como
bug depois.

## Fora do documento (decisões de implementação livres)

- Nome exato dos widgets novos além dos citados (`InviteBuilderInviteesSection`,
  `FriendlyMatchDetailSlotsList`, `FriendlyMatchPendingReviewsList`,
  `showFriendlyMatchAthletePickerSheet` são âncoras, não contratos rígidos).
- Textos exatos de copy além dos já citados.
- Se `firestore.indexes.json` precisa de entradas novas pras queries do
  repositório — checar contra o que a Task 17 do plano de backend já
  adicionou (índices de `pendingSlotUids`/`organizerUid` foram acrescentados
  pensando no backend; confirmar que cobrem também as queries do app antes
  de assumir que sim).
