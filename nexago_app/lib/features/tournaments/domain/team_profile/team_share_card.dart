import 'package:flutter/foundation.dart';

import '../../../../core/brand/nexa_hashtag.dart';
import '../../../../core/deep_link/app_domains.dart';
import '../../../../core/profiles/app_user_profile.dart';
import '../../../../core/text/safe_display_text.dart';
import '../../../athlete/domain/athlete_profile.dart';
import '../../../athlete/domain/athlete_public_profile_models.dart';
import '../tournament_match.dart';
import '../tournament_match_display.dart';
import '../tournament_match_status.dart';
import 'team_public_profile_logic.dart';
import 'team_public_profile_models.dart';

/// As três direções dos canvas "Card Perfil da Equipe" e "Card Perfil da
/// Dupla" — quem compartilha escolhe na tela. A dupla e a equipe (trio pra
/// cima) têm desenhos próprios em cada uma.
enum TeamShareCardStyle {
  /// A: escudo da equipe / fotos lado a lado da dupla.
  profile,

  /// B: mosaico do elenco / ficha da dupla.
  roster,

  /// C: fundo laranja com a posição no ranking gigante.
  ranking,
}

/// Um atleta no card.
@immutable
class TeamShareMember {
  const TeamShareMember({
    required this.name,
    required this.initials,
    this.avatarUrl,
    this.detail = '',
  });

  final String name;
  final String initials;
  final String? avatarUrl;

  /// Linha embaixo do nome na ficha da dupla ("#12 NO RANKING"); vazia some.
  final String detail;
}

/// Uma etapa recente: torneio e até onde a equipe foi.
@immutable
class TeamShareStage {
  const TeamShareStage({required this.name, required this.result});

  final String name;

  /// "1º", "2º", "SEMI"…
  final String result;

  bool get isTitle => result == '1º';
}

/// Tudo o que os cards escrevem. Sai do perfil público já carregado (equipe,
/// elenco, ranking geral de equipes) e do histórico de partidas.
@immutable
class TeamShareCardData {
  const TeamShareCardData({
    required this.teamId,
    required this.name,
    required this.isDuo,
    required this.monogram,
    required this.hue,
    required this.members,
    required this.rosterSize,
    required this.link,
    this.sportLabel = '',
    this.location = '',
    this.sinceYear,
    this.rank,
    this.points = 0,
    this.games = 0,
    this.wins = 0,
    this.winRatePercent = 0,
    this.titles = 0,
    this.stages = const [],
    this.form = const [],
  });

  final String teamId;

  /// Nome da equipe; na dupla, "Ana / Bruno".
  final String name;

  /// Dupla usa os desenhos de dupla (duas fotos, "A / B"); trio pra cima, os
  /// de equipe (escudo, mosaico).
  final bool isDuo;

  /// Iniciais do escudo ("ACS") — a equipe não tem logo próprio.
  final String monogram;

  /// Matiz do escudo e do brilho de fundo, estável por equipe.
  final double hue;

  final List<TeamShareMember> members;

  /// Tamanho declarado — quarteto com convite pendente segue quarteto.
  final int rosterSize;

  /// "Vôlei de Praia"; vazio sem esporte conhecido.
  final String sportLabel;

  /// "Fortaleza · CE"; vazio sem cidade no elenco.
  final String location;

  final int? sinceYear;

  /// Posição no ranking geral de equipes; `null` fora dele.
  final int? rank;
  final int points;
  final int games;
  final int wins;
  final int winRatePercent;
  final int titles;

  /// Até três, da mais recente para a mais antiga.
  final List<TeamShareStage> stages;

  /// Últimos até cinco jogos decididos, do mais antigo para o mais recente
  /// (`true` = vitória).
  final List<bool> form;

  /// Perfil da equipe no portal (o QR).
  final String link;

  bool get hasRank => rank != null && rank! > 0;

  String get rankLabel => hasRank ? '$rankº' : '—';

  /// O que o QR diz por extenso: só o host — o id da equipe não cabe nem
  /// significa nada para quem lê.
  String get linkLabel => AppDomains.athletePortalHost;

  String get unit => isDuo ? 'dupla' : 'equipe';

  /// "PERFIL DA DUPLA" / "PERFIL DA EQUIPE".
  String get kicker => 'PERFIL DA ${unit.toUpperCase()}';

  /// "SIGA A DUPLA" / "SIGA A EQUIPE".
  String get followLabel => 'SIGA A ${unit.toUpperCase()}';

  /// O ranking do selo é o geral de equipes — o mesmo do selo do perfil.
  String get rankingLabel => 'RANKING DE EQUIPES · GERAL';

  /// "FORTALEZA · CE · DESDE 2024": cidade e há quanto tempo.
  String get originLine {
    final since = sinceYear == null
        ? ''
        : isDuo
            ? 'JUNTOS DESDE $sinceYear'
            : 'DESDE $sinceYear';
    return [location, since]
        .where((s) => s.isNotEmpty)
        .join(' · ')
        .toUpperCase();
  }

  /// Sem posição no ranking não existe o card de ranking.
  List<TeamShareCardStyle> get styles => [
        TeamShareCardStyle.profile,
        TeamShareCardStyle.roster,
        if (hasRank) TeamShareCardStyle.ranking,
      ];

  String styleLabel(TeamShareCardStyle style) => switch (style) {
        TeamShareCardStyle.profile => 'Perfil',
        TeamShareCardStyle.roster => isDuo ? 'Ficha' : 'Elenco',
        TeamShareCardStyle.ranking => 'Ranking',
      };
}

TeamShareCardData teamShareCardDataFrom({
  required TeamPublicProfile profile,
  required List<TournamentMatch> matches,
  required List<TeamCampaignEntry> campaigns,
  required TeamProfileStats stats,
  Map<String, String> memberDetails = const {},
}) {
  final teamId = profile.teamId;
  final isDuo = !profile.isLargeRoster;
  final members = [
    for (final member in profile.members)
      _memberOf(member, memberDetails[member.uid] ?? ''),
  ];
  final name = isDuo
      ? members.map((m) => m.name).join(' / ')
      : teamProfileDisplayName(
          team: profile.team,
          player1: profile.player1,
          player2: profile.player2,
        );
  final sport = teamProfileHeaderSportLabel(profile);
  final decided = _decidedMatches(matches);

  return TeamShareCardData(
    teamId: teamId,
    name: name,
    isDuo: isDuo,
    monogram: teamShareMonogram(name),
    hue: teamShareHue(teamId),
    members: members,
    rosterSize: teamProfileRosterSize(profile),
    link: AppShareLinks.teamProfile(teamId),
    sportLabel: sport == '—' ? '' : sport,
    location: _locationOf(profile),
    sinceYear: profile.team.createdAt?.year,
    rank: profile.ranking.hasRank ? profile.ranking.rank : null,
    points: profile.ranking.points,
    games: stats.games,
    wins: decided.where((m) => m.athleteTeamWon(teamId)).length,
    winRatePercent: stats.winRatePercent,
    titles: stats.titles,
    stages: [
      for (final c in campaigns.take(3))
        TeamShareStage(
          name: c.tournamentName,
          result: teamShareStageResult(c.resultLabel),
        ),
    ],
    form: [
      for (final m in decided.reversed.take(5).toList().reversed)
        m.athleteTeamWon(teamId),
    ],
  );
}

/// Iniciais do escudo: a primeira letra das três primeiras palavras que
/// contam ("Arena Costa Sul" → "ACS"); palavra única dá duas letras.
String teamShareMonogram(String name) {
  const skip = {'de', 'da', 'do', 'das', 'dos', 'e', '/', '&'};
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty && !skip.contains(w.toLowerCase()))
      .toList();
  if (words.isEmpty) return '?';
  if (words.length == 1) return firstGraphemesUpper(words.first, 2);
  return words.take(3).map((w) => firstGraphemesUpper(w, 1)).join();
}

/// Matiz estável por equipe: o mesmo id sempre dá a mesma cor.
double teamShareHue(String teamId) {
  var hash = 0;
  for (final unit in teamId.codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  return (hash % 360).toDouble();
}

/// O resultado da campanha por extenso para quem não conhece a sigla da
/// chave: vice vira "2º", semifinal vira "SEMI".
String teamShareStageResult(String label) => switch (label) {
      'F' => '2º',
      'SF' => 'SEMI',
      'QF' => 'QUARTAS',
      'O16' => 'OITAVAS',
      _ => label,
    };

/// Legenda que vai junto do PNG.
String teamShareCardText(TeamShareCardData data, TeamShareCardStyle style) {
  final unit = '${data.unit} ${data.name}';
  final lead = style == TeamShareCardStyle.ranking && data.hasRank
      ? '${data.rank}º no ranking de equipes do nexaGO! Perfil da $unit'
      : 'Conheça a $unit no nexaGO';
  return withNexaHashtag('$lead: ${data.link}');
}

TeamShareMember _memberOf(TeamMemberEntry member, String detail) {
  final profile = member.profile;
  final name = profile == null ? 'Atleta' : teamShareMemberName(profile);
  final url = profile?.avatarUrl?.trim() ?? '';
  return TeamShareMember(
    name: name,
    initials: initialsFromDisplayName(name),
    avatarUrl: url.isEmpty ? null : url,
    detail: detail,
  );
}

/// Apelido quando tem; senão primeiro e último nome — "Maria Eduarda Santos
/// Oliveira" não cabe ao lado do parceiro.
String teamShareMemberName(AthleteProfile profile) {
  final nickname = profile.nickname?.trim() ?? '';
  if (nickname.isNotEmpty) return nickname;
  final parts = profile.name.trim().split(RegExp(r'\s+'));
  final words = parts.where((p) => p.isNotEmpty).toList();
  if (words.isEmpty) return 'Atleta';
  if (words.length == 1) return words.first;
  return '${words.first} ${words.last}';
}

/// Cidade do capitão; sem ela, a do primeiro do elenco que tiver.
String _locationOf(TeamPublicProfile profile) {
  final ordered = [
    ...profile.members.where((m) => m.isCaptain),
    ...profile.members.where((m) => !m.isCaptain),
  ];
  for (final member in ordered) {
    final p = member.profile;
    if (p == null) continue;
    final label = athleteLocationLabel(p);
    if (label.isNotEmpty) return label;
  }
  return '';
}

/// Jogos encerrados com vencedor, do mais antigo para o mais recente (sem
/// data vão para o começo).
List<TournamentMatch> _decidedMatches(List<TournamentMatch> matches) {
  final decided = matches
      .where(
        (m) =>
            TournamentMatchStatus.isCompleted(m.status) &&
            (m.winnerId?.trim().isNotEmpty ?? false),
      )
      .toList();
  final epoch = DateTime.fromMillisecondsSinceEpoch(0);
  decided.sort(
    (a, b) =>
        (playedAtForMatch(a) ?? epoch).compareTo(playedAtForMatch(b) ?? epoch),
  );
  return decided;
}
