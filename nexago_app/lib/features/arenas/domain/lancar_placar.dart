import 'booking_result.dart';
import 'booking_result_record.dart';
import 'pelada_live/pelada_live_rules.dart';

/// Regras do "Lançar placar" (canvas "Proposta · lançar placar em 2 passos"):
/// 1) Quem jogou? — cada jogador num time com um toque; 2) Placar — digitado
/// ou ao vivo. Funções puras, sem tela.

/// Mesmos limites do servidor (`booking-result.ts`).
const int kLancarMaxTeams = 8;
const int kLancarMaxTeamPlayers = 6;

/// "Time A", "Time B"… pela posição na lista.
String lancarTeamLetter(int index) =>
    String.fromCharCode('A'.codeUnitAt(0) + index.clamp(0, 25));

/// O que acontece ao tocar um time ao lado do nome.
enum LancarAssignOutcome { assigned, removed, teamFull }

extension LancarPlacarTeams on BookingResult {
  /// O time de [playerId], ou `null` (fora do placar).
  int? teamIdOf(String playerId) => teamOfPlayer(playerId)?.id;

  /// Põe [player] no time [teamId] (tirando de onde estava). Tocar no time em
  /// que ele já está o tira do placar. Time cheio não aceita.
  (BookingResult, LancarAssignOutcome) assignPlayer(
    ResultPlayer player,
    int teamId,
  ) {
    final current = teamIdOf(player.id);
    if (current == teamId) {
      return (_withoutPlayer(player.id), LancarAssignOutcome.removed);
    }
    final target = teamById(teamId);
    if (target == null) return (this, LancarAssignOutcome.teamFull);
    if (target.players.length >= kLancarMaxTeamPlayers) {
      return (this, LancarAssignOutcome.teamFull);
    }
    final cleared = _withoutPlayer(player.id);
    return (
      BookingResult(
        teams: [
          for (final t in cleared.teams)
            t.id == teamId ? t.copyWith(players: [...t.players, player]) : t,
        ],
        games: cleared.games,
      ),
      LancarAssignOutcome.assigned,
    );
  }

  BookingResult _withoutPlayer(String playerId) => BookingResult(
        teams: [
          for (final t in teams)
            t.players.any((p) => p.id == playerId)
                ? t.copyWith(
                    players: [
                      for (final p in t.players)
                        if (p.id != playerId) p,
                    ],
                  )
                : t,
        ],
        games: games,
      );

  /// Mais um time vazio (rei da quadra). Os jogos continuam como estão.
  BookingResult addEmptyTeam() {
    if (teams.length >= kLancarMaxTeams) return this;
    return addTeam(const []);
  }

  /// Tira um time (fica no mínimo com dois); os jogos dele somem e, sem jogo
  /// nenhum, sobra um vazio entre os dois primeiros.
  BookingResult dropTeam(int teamId) {
    if (teams.length <= 2) return this;
    return removeTeam(teamId);
  }

  /// Muda a ordem dos times (a sequência do rei da quadra): a letra é a
  /// posição, então quem sobe vira "A" e os jogadores vão junto. Sem placar
  /// lançado, o primeiro jogo passa a ser entre os dois primeiros da lista.
  BookingResult moveTeam(int from, int to) {
    if (from < 0 || from >= teams.length) return this;
    final target = to.clamp(0, teams.length - 1);
    if (from == target) return this;
    final next = [...teams];
    next.insert(target, next.removeAt(from));
    return BookingResult(
      teams: next,
      games: scoredGames.isEmpty && next.length >= 2
          ? [ResultGame(teamA: next[0].id, teamB: next[1].id)]
          : games,
    );
  }

  /// Jogos com placar (o 0×0 é "ainda não lançado").
  List<ResultGame> get scoredGames => [
        for (final g in games)
          if (g.scoreA > 0 || g.scoreB > 0) g,
      ];
}

/// Por que o passo "Quem jogou?" ainda não avança — `null` quando avança.
String? lancarTeamsMissing(BookingResult result, {bool upcoming = false}) {
  for (var i = 0; i < result.teams.length; i++) {
    if (result.teams[i].players.isEmpty) {
      return 'Falta escolher quem ${upcoming ? 'joga' : 'jogou'} no Time '
          '${lancarTeamLetter(i)}';
    }
  }
  return null;
}

/// O horário da reserva ainda não acabou: o passo 1 pergunta "Quem vai
/// jogar?" (antes e durante o jogo); depois do fim, "Quem jogou?". Hora da
/// parede de São Paulo; fim antes do início = passa da meia-noite.
bool lancarIsUpcoming({
  required String dateKey,
  required String startTime,
  required String endTime,
  required DateTime now,
}) {
  DateTime? at(String hhmm) => DateTime.tryParse(
        '${dateKey.length >= 10 ? dateKey.substring(0, 10) : dateKey}'
        'T${hhmm.length >= 5 ? hhmm.substring(0, 5) : hhmm}:00-03:00',
      );
  final start = at(startTime);
  var end = at(endTime);
  if (start == null || end == null) return false;
  if (!end.isAfter(start)) end = end.add(const Duration(days: 1));
  return now.isBefore(end);
}

String lancarStepTitle({required bool upcoming}) =>
    upcoming ? 'Quem vai jogar?' : 'Quem jogou?';

/// A sequência do rei da quadra em duas linhas: quem abre ("A × B abrem ·
/// quem vence fica") e a fila ("Fila: C → D → E"). `null` com dois times.
({String opening, String queue})? lancarRotationOrder(BookingResult result) {
  if (!result.isRotation) return null;
  final letters = [
    for (var i = 0; i < result.teams.length; i++) lancarTeamLetter(i),
  ];
  return (
    opening: '${letters[0]} × ${letters[1]} abrem · quem vence fica',
    queue: 'Fila: ${letters.skip(2).join(' → ')}',
  );
}

/// Por que o placar ainda não pode ser enviado — `null` quando pode. O
/// botão diz isso em vez de dar erro depois do toque.
String? lancarScoreMissing(BookingResult result) {
  final unit = result.isRotation ? 'jogo' : 'set';
  final teamsMissing = lancarTeamsMissing(result);
  if (teamsMissing != null) return teamsMissing;
  if (result.games.isEmpty) return 'Falta o placar';
  for (var i = 0; i < result.games.length; i++) {
    final g = result.games[i];
    if (g.scoreA == 0 && g.scoreB == 0) {
      return 'Falta o placar do $unit ${i + 1}';
    }
    if (g.scoreA == g.scoreB) {
      return 'O $unit ${i + 1} está empatado';
    }
  }
  return null;
}

/// "Maria & Enzo vencem 2–1" (dois times) ou "Maria & Enzo na frente" (rei
/// da quadra); `null` sem vencedor ainda.
String? lancarResultHeadline(BookingResult result) {
  if (!result.hasScore) return null;
  if (result.isRotation) {
    final leader = result.leaderId;
    final team = leader == null ? null : result.teamById(leader);
    return team == null ? null : '${team.name} na frente';
  }
  final a = result.teams[0];
  final b = result.teams[1];
  final wa = result.winsOf(a.id);
  final wb = result.winsOf(b.id);
  if (wa == wb) return null;
  final winner = wa > wb ? a : b;
  final verb = winner.players.length == 1 ? 'vence' : 'vencem';
  return '${winner.name} $verb ${wa > wb ? wa : wb}–${wa > wb ? wb : wa}';
}

/// Atalhos do teclado do placar pelo esporte: os placares que mais aparecem.
List<int> lancarQuickScores(String? sport, {required int gameIndex}) {
  final rules = PeladaLiveRules.forSport(sport);
  final out = <int>[];
  void add(int v) {
    if (v > 0 && v <= 99 && !out.contains(v)) out.add(v);
  }

  switch (rules.mode) {
    case PeladaLiveMode.setsPoints:
      final target = rules.bestOf > 1 && gameIndex == rules.bestOf - 1
          ? rules.decidingSetTarget
          : rules.setTarget;
      add(target);
      add(target - 2);
      add(target - 3);
      add(target == rules.setTarget
          ? rules.decidingSetTarget
          : rules.setTarget);
    case PeladaLiveMode.setsGames:
      add(rules.gamesPerSet);
      add(rules.gamesPerSet - 2);
      add(rules.gamesPerSet - 3);
      add(rules.gamesPerSet + 1);
    case PeladaLiveMode.goals:
      for (final v in const [1, 2, 3, 4]) {
        add(v);
      }
    case PeladaLiveMode.baskets:
      for (final v in [rules.limit ?? 21, 11, 15, 10]) {
        add(v);
      }
    case PeladaLiveMode.points:
      for (final v in const [10, 15, 21, 25]) {
        add(v);
      }
  }
  return out.take(4).toList();
}

/// Rótulo do jogo pelo esporte: "Set" nos esportes de set, "Jogo" no resto e
/// no rei da quadra.
String lancarGameUnit(BookingResult result, String? sport) {
  if (result.isRotation) return 'Jogo';
  return PeladaLiveRules.forSport(sport).usesSets ? 'Set' : 'Jogo';
}

/// Os jogadores que confirmam o placar enviado por [ownerId]: todos os do
/// placar menos quem envia (a mesma regra do servidor).
List<ResultPlayer> lancarConfirmers(BookingResult result, String? ownerId) =>
    bookingResultConfirmers(result, ownerId);

/// "Enzo, Rafael e Lia" — nomes curtos para o botão de enviar.
String lancarNamesLine(List<ResultPlayer> players, {int max = 3}) {
  final names = [for (final p in players) p.firstName];
  if (names.isEmpty) return '';
  if (names.length > max) {
    return '${names.take(max - 1).join(', ')} e mais ${names.length - max + 1}';
  }
  if (names.length == 1) return names.single;
  return '${names.sublist(0, names.length - 1).join(', ')} e ${names.last}';
}

/// "Convidar quem não tem conta" no lançar placar: o convite é para entrar
/// no placar do jogo, não para "confirmar vaga" (o texto do convite de antes
/// do jogo). [when] = "sexta, 13/11 às 09:00".
String lancarInviteMessage({
  required String arenaName,
  required String when,
  required String url,
}) {
  final arena = arenaName.trim();
  final where = arena.isEmpty ? '' : ' na $arena';
  return 'Bora pôr nosso jogo$where ($when) no nexaGO? Entra por este link '
      'pra ficar no placar e nas suas estatísticas: $url';
}

/// Sem link de convite (jogo encerrado ou lotado): baixar o app e mandar o @.
String lancarInviteFallbackMessage({
  required String arenaName,
  required String downloadUrl,
}) {
  final arena = arenaName.trim();
  final pelada = arena.isEmpty ? 'nossa pelada' : 'a pelada da $arena';
  return 'Bora registrar $pelada no nexaGO? Baixa o app ($downloadUrl), cria '
      'sua conta e me manda seu @ pra eu te pôr no placar.';
}

String _firstName(String? name) =>
    (name ?? '').trim().split(RegExp(r'\s+')).first;

/// Botão do convidado: o placar vai para quem reservou conferir.
String lancarGuestSendLabel(String? hostName) {
  final first = _firstName(hostName);
  return first.isEmpty
      ? 'Mandar para quem reservou'
      : 'Mandar para $first conferir';
}

/// Rodapé do convidado: o que acontece depois de mandar.
String lancarGuestSendNote(String? hostName) {
  final first = _firstName(hostName);
  return '${first.isEmpty ? 'Quem reservou' : first} confere e envia para '
      'todos confirmarem.';
}
