import '../tournament_match.dart';
import '../tournament_match_display.dart';
import '../tournament_match_status.dart';
import 'focus_journey_logic.dart';

/// Onde a campanha terminou. Decidido SÓ pelo `matchType`, nunca por rodada: a
/// disputa de 3º lugar recebe o mesmo `round` da final, e decidir por rodada
/// coroaria quem perdeu a semi e venceu o 3º lugar.
enum CampaignPlacement { champion, runnerUp, third, none }

/// A disputa de 3º lugar, com a grafia dos geradores.
bool _isThirdPlaceMatchType(TournamentMatch m) {
  final t = m.matchType.trim().toLowerCase();
  return t == 'third place' || t == 'third_place' || t == '3rd place';
}

CampaignPlacement campaignPlacementOf(
  List<TournamentMatch> matches,
  String categoryId,
  Set<String> myTeamIds,
) {
  final mine = matches
      .where((m) =>
          m.categoryId == categoryId &&
          (myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId)))
      .toList();

  String? outcome(TournamentMatch m) {
    if (!TournamentMatchStatus.isCompleted(m.status)) return null;
    final winner = m.winnerId?.trim() ?? '';
    if (winner.isEmpty) return null;
    return myTeamIds.contains(winner) ? 'win' : 'loss';
  }

  final finals = mine.where(isFinalMatchTypeOf).toList();
  if (finals.any((m) => outcome(m) == 'win')) return CampaignPlacement.champion;
  if (finals.any((m) => outcome(m) == 'loss')) {
    return CampaignPlacement.runnerUp;
  }
  if (mine.where(_isThirdPlaceMatchType).any((m) => outcome(m) == 'win')) {
    return CampaignPlacement.third;
  }
  return CampaignPlacement.none;
}

class CampaignPlayer {
  const CampaignPlayer({required this.initial, this.photo});

  final String initial;
  final String? photo;
}

/// Uma linha do painel de trajetória. Dois desenhos diferentes — partida e
/// resumo do grupo —, então dois tipos: um tipo único com campos anuláveis
/// faria a arte adivinhar qual desenhar.
sealed class CampaignRow {
  const CampaignRow();
}

class CampaignMatchRow extends CampaignRow {
  const CampaignMatchRow({
    required this.won,
    required this.isGroup,
    required this.phaseLabel,
    required this.opponentName,
    required this.setScore,
    required this.partials,
  });

  final bool won;

  /// Campo próprio, não farejado do rótulo: é por ele que o colapso sabe o que
  /// pode juntar, e rótulo é texto de exibição — muda de redação sem aviso.
  final bool isGroup;
  final String phaseLabel;
  final String opponentName;

  /// "2–0", em SETS, na ótica do atleta.
  final String setScore;
  final List<String> partials;
}

class CampaignGroupRow extends CampaignRow {
  const CampaignGroupRow({
    required this.wins,
    required this.losses,
    required this.games,
  });

  final int wins;
  final int losses;
  final int games;
}

class CampaignShareData {
  const CampaignShareData({
    required this.placement,
    required this.categoryLine,
    required this.teamName,
    required this.players,
    required this.wins,
    required this.losses,
    required this.setsWon,
    required this.setsLost,
    required this.winRateLabel,
    required this.rows,
    required this.tournamentName,
    required this.locationName,
    required this.dateRangeLabel,
  });

  final CampaignPlacement placement;

  /// "Masculino B · Duplas".
  final String categoryLine;
  final String teamName;
  final List<CampaignPlayer> players;
  final int wins;
  final int losses;
  final int setsWon;
  final int setsLost;

  /// "Aprov. 83%"; `null` sem partida encerrada — a função não inventa.
  final String? winRateLabel;
  final List<CampaignRow> rows;
  final String tournamentName;
  final String? locationName;

  /// "25–26 ABR 2026"; `null` sem data.
  final String? dateRangeLabel;
}

/// Quantas linhas de partida cabem no painel antes de o grupo ser colapsado num
/// resumo. Acima disso a campanha não caberia desenhada partida a partida.
const int kCampaignMaxRows = 6;

/// Monta o card a partir das partidas da categoria.
///
/// Quando a campanha tem mais linhas do que cabe, as partidas de GRUPO viram um
/// resumo ("3V 1D · 4 jogos") e o mata-mata é preservado inteiro: é o
/// mata-mata que conta a história, e o grupo é contexto.
CampaignShareData buildCampaignShareData({
  required List<TournamentMatch> matches,
  required String categoryId,
  required Set<String> myTeamIds,
  required String teamName,
  required List<CampaignPlayer> players,
  required String categoryLine,
  required String tournamentName,
  String? locationName,
  String? dateRangeLabel,
  required String Function(String teamId) duoNameOf,
}) {
  final categoryMatches =
      matches.where((m) => m.categoryId == categoryId).toList();
  final mine = categoryMatches
      .where((m) =>
          (myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId)) &&
          TournamentMatchStatus.isCompleted(m.status))
      .toList()
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));

  var wins = 0;
  var losses = 0;
  var setsWon = 0;
  var setsLost = 0;
  final matchRows = <CampaignMatchRow>[];

  for (final m in mine) {
    final iAmA = myTeamIds.contains(m.teamAId);
    final winner = m.winnerId?.trim() ?? '';
    final won = winner.isNotEmpty && myTeamIds.contains(winner);
    won ? wins++ : losses++;

    var mySets = 0;
    var theirSets = 0;
    final partials = <String>[];
    for (final s in matchClosedSets(m)) {
      final my = iAmA ? s.a : s.b;
      final their = iAmA ? s.b : s.a;
      if (my > their) {
        mySets++;
      } else if (their > my) {
        theirSets++;
      }
      partials.add('$my-$their');
    }
    setsWon += mySets;
    setsLost += theirSets;

    final opponentId = iAmA ? m.teamBId : m.teamAId;
    matchRows.add(CampaignMatchRow(
      won: won,
      isGroup: m.poolId.isNotEmpty,
      phaseLabel: matchPhaseDisplayLabel(m, categoryMatches: categoryMatches),
      opponentName: duoNameOf(opponentId),
      setScore: '$mySets–$theirSets',
      partials: partials,
    ));
  }

  final total = wins + losses;
  final rows = _fitRows(matchRows);

  return CampaignShareData(
    placement: campaignPlacementOf(categoryMatches, categoryId, myTeamIds),
    categoryLine: categoryLine,
    teamName: teamName,
    players: players,
    wins: wins,
    losses: losses,
    setsWon: setsWon,
    setsLost: setsLost,
    winRateLabel:
        total > 0 ? 'Aprov. ${(wins / total * 100).round()}%' : null,
    rows: rows,
    tournamentName: tournamentName,
    locationName: locationName,
    dateRangeLabel: dateRangeLabel,
  );
}

/// Colapsa o grupo num resumo quando a campanha não cabe. O mata-mata nunca é
/// colapsado — é ele que conta a história da campanha.
List<CampaignRow> _fitRows(List<CampaignMatchRow> rows) {
  if (rows.length <= kCampaignMaxRows) return List<CampaignRow>.from(rows);

  final group = rows.where((r) => r.isGroup).toList();
  final knockout = rows.where((r) => !r.isGroup).toList();
  if (group.isEmpty) {
    // Só mata-mata e ainda não cabe: mantém as ÚLTIMAS, que são as fases mais
    // avançadas — cortar o fim apagaria a final.
    return List<CampaignRow>.from(
      knockout.sublist(knockout.length - kCampaignMaxRows),
    );
  }

  final groupWins = group.where((r) => r.won).length;
  final summary = CampaignGroupRow(
    wins: groupWins,
    losses: group.length - groupWins,
    games: group.length,
  );
  final remaining = kCampaignMaxRows - 1;
  final kept = knockout.length <= remaining
      ? knockout
      : knockout.sublist(knockout.length - remaining);
  return [summary, ...kept];
}
