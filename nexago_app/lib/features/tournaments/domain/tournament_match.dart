import 'tournament_match_live_score.dart';
import 'tournament_match_medical_timeout.dart';
import 'tournament_match_point_action.dart';
import 'tournament_match_serving_players.dart';
import 'tournament_match_set.dart';
import 'tournament_match_status.dart';
import 'tournament_match_type.dart';

/// Partida em `artifacts/{projectId}/public/data/matches`.
class TournamentMatch {
  const TournamentMatch({
    required this.id,
    required this.tournamentId,
    required this.categoryId,
    required this.round,
    required this.matchType,
    required this.poolId,
    required this.teamAId,
    required this.teamBId,
    required this.status,
    required this.resultA,
    required this.resultB,
    required this.isGroupMatch,
    required this.matchNumber,
    this.sets = const [],
    this.lastActions = const [],
    this.currentSetIndex,
    this.winnerId,
    this.scheduleTime,
    this.matchStartedAt,
    this.matchEndedAt,
    this.teamADescription,
    this.teamBDescription,
    this.courtName,
    this.description,
    this.courtId = '',
    this.scheduleEndTime,
    this.dayKey = '',
    this.queueOrder = 0,
    this.queueStatus = '',
    this.checkInTeamAStatus = '',
    this.checkInTeamBStatus = '',
    this.servingTeamId = '',
    this.servingPlayerSlot = 0,
    this.servingPlayers = MatchServingPlayers.none,
    this.medicalTimeout,
    this.medicalTimeoutPlayers = const [],
    this.liveElapsedSec = 0,
    this.pointEventSeq = 0,
    this.reportStatus = '',
    this.reportedByUid = '',
    this.teamAConfirmed = false,
    this.teamBConfirmed = false,
    this.bestOf = 3,
    this.winnerAdvanceMatchNumber,
    this.winnerAdvanceSlot,
    this.loserAdvanceMatchNumber,
    this.loserAdvanceSlot,
    this.liveScore,
    this.kocStandingTeamIds = const [],
    this.kocTeamIds = const [],
    this.kocDurationSec = 0,
  });

  final String id;
  final String tournamentId;
  final String categoryId;
  final int round;
  final String matchType;
  final String poolId;
  final String teamAId;
  final String teamBId;
  final String status;
  final String resultA;
  final String resultB;
  final bool isGroupMatch;
  final int matchNumber;
  final List<TournamentMatchSet> sets;
  final List<TournamentMatchPointAction> lastActions;
  final int? currentSetIndex;
  final String? winnerId;
  final DateTime? scheduleTime;
  final DateTime? matchStartedAt;
  final DateTime? matchEndedAt;
  final String? teamADescription;
  final String? teamBDescription;
  final String? courtName;
  final String? description;
  final String courtId;
  final DateTime? scheduleEndTime;
  final String dayKey;
  final int queueOrder;
  final String queueStatus;
  final String checkInTeamAStatus;
  final String checkInTeamBStatus;
  final String servingTeamId;

  /// Posição (1 ou 2) do atleta no saque dentro da dupla de [servingTeamId]; 0 = não declarada.
  /// Denormalizada no doc pra quem só exibe (telão, cards) não precisar saber o lado — a fonte
  /// é [servingPlayers]. Ver `tournament_match_serving_players.dart`.
  final int servingPlayerSlot;

  /// A ordem de saque declarada por cada dupla no set corrente.
  final MatchServingPlayers servingPlayers;

  /// Atendimento médico em andamento — nulo quando ninguém está sendo atendido.
  final MatchMedicalTimeout? medicalTimeout;

  /// Atletas que já usaram o tempo médico nesta partida ("A1", "B2") — a cota é por atleta.
  final List<String> medicalTimeoutPlayers;

  final int liveElapsedSec;
  final int pointEventSeq;
  final String reportStatus;
  final String reportedByUid;
  final bool teamAConfirmed;
  final bool teamBConfirmed;

  /// Número de sets da partida (formato): 1 = set único, 3 = melhor de 3.
  final int bestOf;

  /// Fiação da chave (plantas de `functions/src/bracket-definitions`): nº do
  /// jogo para onde o vencedor avança e o slot ('A'/'B') que ele ocupa lá.
  /// Nulos em partidas geradas antes da fiação explícita ou sem avanço (Final).
  final int? winnerAdvanceMatchNumber;
  final String? winnerAdvanceSlot;

  /// Para onde vai quem PERDE — só existe na dupla eliminação, onde a derrota
  /// manda o time para a repescagem em vez de eliminá-lo. É o que permite
  /// dizer "você cai para a repescagem, não está eliminado".
  final int? loserAdvanceMatchNumber;
  final String? loserAdvanceSlot;

  /// Placar parcial "ao vivo" do set em andamento (games/sets), gravado por
  /// `updateLiveMatchScore`. Só faz sentido exibir quando [isInProgress].
  final MatchLiveScore? liveScore;

  /// Duplas da rodada King of the Court em ordem de colocação, gravadas no
  /// encerramento. É o RESULTADO da rodada, como `winnerId` e `sets` são o de um
  /// duelo — e é de onde sai o pódio, já que a rodada final não tem dois lados.
  /// Vazia em toda partida de duelo.
  final List<String> kocStandingTeamIds;

  /// Elenco da rodada King of the Court, na ordem de entrada (o primeiro abre no
  /// trono). É o análogo dos dois lados de um duelo: sem ele o atleta NUNCA
  /// encontraria a própria rodada, porque `teamAId`/`teamBId` vêm vazios.
  /// Vazia em toda partida de duelo.
  final List<String> kocTeamIds;

  /// Duração de JOGO da rodada, do snapshot `kocConfig` gravado na geração.
  /// Varia por fase (a final costuma ser mais longa). Zero em toda partida de
  /// duelo, que usa o padrão do torneio.
  final int kocDurationSec;

  /// Duplas que a partida ocupa naquele horário.
  ///
  /// A rodada KOTC grava `teamAId`/`teamBId` VAZIOS e põe o elenco em
  /// `kocTeamIds`: colher só os dois lados deixaria a rodada sem marcar ninguém
  /// ocupado, e a mesma dupla cairia em dois lugares no mesmo horário.
  /// Espelha `matchTeamIds` do servidor.
  List<String> get scheduleTeamIds {
    final out = <String>[];
    for (final raw in [teamAId, teamBId, ...kocTeamIds]) {
      final id = raw.trim();
      if (id.isNotEmpty && !out.contains(id)) out.add(id);
    }
    return out;
  }

  /// Quanto tempo de quadra a partida ocupa, em minutos. Espelha
  /// `matchDurationMin` do servidor — que é quem IMPÕE essa janela ao gravar.
  int scheduleSlotMin(int fallbackMin) {
    if (kocDurationSec <= 0) return fallbackMin;
    return (kocDurationSec / 60).ceil() + kocChangeoverMin;
  }

  String get effectiveCourtLabel {
    if (courtId.isNotEmpty) return courtId;
    final name = courtName?.trim();
    if (name != null && name.isNotEmpty) return name;
    return '';
  }

  bool get isOnCourt => queueStatus == 'on_court';

  bool get isWaitingQueue =>
      queueStatus == 'waiting' || queueStatus == 'on_deck';

  /// Rodada King of the Court — 3 a 5 duplas na mesma quadra, sem lados fixos.
  /// `teamAId`/`teamBId` vêm VAZIOS: quem consome os dois lados tem de sair por
  /// [isDuel] antes (ver `tournament_match_type.dart`).
  bool get isKingOfCourt => TournamentMatchType.isKingOfCourt(matchType);

  /// Partida de duelo: dois lados e um vencedor.
  bool get isDuel => TournamentMatchType.isDuel(matchType);

  bool get isBracketMatch {
    if (isKingOfCourt) return false;
    if (isGroupMatch) return false;
    final t = matchType.toLowerCase();
    if (t == 'group') return false;
    if (poolId.trim().isNotEmpty) return false;
    return true;
  }

  /// Atenção: a rodada KOTC usa `poolId` para a quadra lógica da fase, então
  /// sem a saída por [isKingOfCourt] ela cairia aqui como partida de grupo e
  /// entraria na tabela de classificação de grupos.
  bool get isPoolMatch =>
      !isKingOfCourt &&
      (isGroupMatch || matchType.toLowerCase() == 'group' || poolId.isNotEmpty);

  bool get isCompleted => TournamentMatchStatus.isCompleted(status);

  bool get isInProgress => TournamentMatchStatus.isInProgress(status);

  bool get isCanceled => TournamentMatchStatus.isCanceled(status);

  String get scoreLabel {
    if (sets.isNotEmpty) {
      final a = sets.map((s) => '${s.a}-${s.b}').join(', ');
      final b = sets.map((s) => '${s.b}-${s.a}').join(', ');
      if (a.isNotEmpty && b.isNotEmpty) return '$a × $b';
    }
    if (resultA.isNotEmpty && resultB.isNotEmpty) {
      return '$resultA × $resultB';
    }
    return 'A definir';
  }

  String get teamsLabel {
    final a = teamADescription?.trim().isNotEmpty == true
        ? teamADescription!.trim()
        : (teamAId.isNotEmpty ? teamAId : 'TBD');
    final b = teamBDescription?.trim().isNotEmpty == true
        ? teamBDescription!.trim()
        : (teamBId.isNotEmpty ? teamBId : 'TBD');
    return '$a vs $b';
  }

  bool athleteTeamWon(String teamId) {
    final winner = winnerId?.trim() ?? '';
    final id = teamId.trim();
    return winner.isNotEmpty && id.isNotEmpty && winner == id;
  }

  String? opponentTeamIdFor(String teamId) {
    final id = teamId.trim();
    if (id.isEmpty) return null;
    if (teamAId == id) return teamBId.isNotEmpty ? teamBId : null;
    if (teamBId == id) return teamAId.isNotEmpty ? teamAId : null;
    return null;
  }
}
