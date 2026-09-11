import '../../../athlete/domain/athlete_profile.dart';
import '../team_discover_models.dart';
import '../tournament_match.dart';
import '../tournament_team.dart';

enum TeamProfileTab { overview, history, headToHead }

/// Um integrante do elenco. O perfil público pode não ter carregado (ou nem
/// existir): a linha aparece mesmo assim — um elenco menor do que a equipe
/// realmente é seria pior que um nome genérico.
class TeamMemberEntry {
  const TeamMemberEntry({
    required this.uid,
    this.profile,
    this.isCaptain = false,
  });

  final String uid;
  final AthleteProfile? profile;
  final bool isCaptain;
}

class TeamPublicProfile {
  const TeamPublicProfile({
    required this.team,
    this.members = const [],
    this.ranking = const TeamDiscoverRankingSnapshot(),
    this.isCurrentUserTeam = false,
  });

  final TournamentTeam team;

  /// Elenco inteiro, na ordem de `team.memberIds` — 1 na dupla à procura de
  /// parceiro, 2 na dupla formada, 3–5 nas equipes nomeadas.
  final List<TeamMemberEntry> members;

  final TeamDiscoverRankingSnapshot ranking;
  final bool isCurrentUserTeam;

  String get teamId => team.id;

  bool get isLookingForPartner => team.isLookingForPartner;

  /// Equipe nomeada (trio pra cima) — o cabeçalho e os rótulos falam de
  /// "equipe" em vez de "dupla".
  bool get isLargeRoster => team.isLargeRoster;

  /// Espelho legado dos dois primeiros integrantes: nome da dupla, esporte e
  /// tags ainda são derivados deles.
  AthleteProfile? get player1 =>
      members.isNotEmpty ? members.first.profile : null;

  AthleteProfile? get player2 =>
      members.length > 1 ? members[1].profile : null;

  /// Perfis carregados, em ordem — para rótulos que precisam de dados reais.
  List<AthleteProfile> get loadedProfiles => [
        for (final member in members)
          if (member.profile != null) member.profile!,
      ];
}

class TeamProfileStats {
  const TeamProfileStats({
    this.games = 0,
    this.winRatePercent = 0,
    this.titles = 0,
    this.points = 0,
  });

  final int games;
  final int winRatePercent;
  final int titles;
  final int points;
}

class TeamCampaignEntry {
  const TeamCampaignEntry({
    required this.tournamentId,
    required this.tournamentName,
    required this.resultLabel,
    required this.wins,
    required this.losses,
    this.playedAt,
    this.locationLabel = '',
  });

  final String tournamentId;
  final String tournamentName;
  final String resultLabel;
  final int wins;
  final int losses;
  final DateTime? playedAt;
  final String locationLabel;

  String get recordLabel => '${wins}V · ${losses}D';
}

class TeamHeadToHeadEntry {
  const TeamHeadToHeadEntry({
    required this.opponentTeamId,
    required this.opponentLabel,
    required this.wins,
    required this.losses,
    this.lastPlayedAt,
  });

  final String opponentTeamId;
  final String opponentLabel;
  final int wins;
  final int losses;
  final DateTime? lastPlayedAt;

  int get totalMatches => wins + losses;
  String get recordLabel => '${wins}V · ${losses}D';
}

class TeamMatchHistoryBundle {
  const TeamMatchHistoryBundle({
    this.matches = const [],
    this.tournamentNames = const {},
    this.teamDisplayNames = const {},
  });

  final List<TournamentMatch> matches;
  final Map<String, String> tournamentNames;
  final Map<String, String> teamDisplayNames;
}
