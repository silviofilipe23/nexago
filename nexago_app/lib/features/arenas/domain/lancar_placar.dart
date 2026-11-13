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

  /// Jogos com placar (o 0×0 é "ainda não lançado").
  List<ResultGame> get scoredGames => [
        for (final g in games)
          if (g.scoreA > 0 || g.scoreB > 0) g,
      ];
}

/// Por que o passo "Quem jogou?" ainda não avança — `null` quando avança.
String? lancarTeamsMissing(BookingResult result) {
  for (var i = 0; i < result.teams.length; i++) {
    if (result.teams[i].players.isEmpty) {
      return 'Falta escolher quem jogou no Time ${lancarTeamLetter(i)}';
    }
  }
  return null;
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
