import 'package:intl/intl.dart';

import '../../../../core/profiles/app_user_profile.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_set.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import '../../../tournaments/domain/tournament_team.dart';
import 'match_share_poster_data.dart';

/// Monta os dados do pôster de compartilhamento.
///
/// Porte de `cardData()` (`match-share-dialog.component.ts`) mais os seletores
/// que ele usa (`tournament-live.selectors.ts`, `tournament-format.ts` e o
/// `TournamentLiveStore`). O pôster é neutro: não existe "nossa dupla" aqui —
/// quem for destacado sai do vencedor, igual ao portal.
///
/// [tournamentMatches] são as partidas do torneio, usadas só para nomear o
/// grupo e numerar a rodada. Lista vazia degrada para o rótulo isolado da
/// partida.
MatchSharePosterData buildMatchSharePosterData({
  required TournamentMatch match,
  required List<TournamentMatch> tournamentMatches,
  String? tournamentName,
  String? categoryName,
  Map<String, TournamentTeam> teams = const {},
  Map<String, AppUserProfile> profiles = const {},
}) {
  final (setWinsA, setWinsB) = matchSharePosterSetWins(match);
  final live = TournamentMatchStatus.isInProgress(match.status);
  final finished = TournamentMatchStatus.isCompleted(match.status);
  final bestOf = matchBestOf(match);
  final winnerId = match.winnerId?.trim() ?? '';

  return MatchSharePosterData(
    tournamentName: _nullIfBlank(tournamentName),
    phaseLabel: _phaseLabel(match, tournamentMatches),
    categoryName: _nullIfBlank(categoryName),
    stage: _stageOf(match),
    live: live,
    finished: finished,
    teamA: _team(
      teamId: match.teamAId,
      description: match.teamADescription,
      teams: teams,
      profiles: profiles,
    ),
    teamB: _team(
      teamId: match.teamBId,
      description: match.teamBDescription,
      teams: teams,
      profiles: profiles,
    ),
    winner: finished && winnerId.isNotEmpty
        ? (winnerId == match.teamAId.trim()
            ? MatchSharePosterSide.teamA
            : MatchSharePosterSide.teamB)
        : null,
    sets: [
      for (final set in matchSharePosterClosedSets(match))
        MatchSharePosterSet(a: set.a, b: set.b),
    ],
    setWinsA: setWinsA,
    setWinsB: setWinsB,
    liveLine: _liveScoreLine(match),
    formatLine: bestOf <= 1 ? 'Set único' : 'Melhor de $bestOf',
    dateLine: _dateLine(match),
  );
}

// --- Placar -----------------------------------------------------------------
// A leitura do placar (sets fechados, set em andamento) vive em
// `tournament_match_display.dart`, espelhando `matchClosedSets` /
// `matchLiveCurrentSet` de `data/matches-repository.ts`: o card da chave, o
// detalhe e o pôster precisam ler o mesmo jogo da mesma forma, senão o mesmo
// jogo sai com números diferentes em cada tela.

/// Sets ganhos por lado. Ao vivo, o set em andamento (que a mesa mantém dentro
/// de `sets[]`) não conta; encerrada, todo set vale.
(int, int) matchSharePosterSetWins(TournamentMatch match) {
  final sets = setsForMatch(match);
  if (sets.isNotEmpty) {
    final closed = matchSharePosterClosedSets(match);
    return (
      closed.where((s) => s.a > s.b).length,
      closed.where((s) => s.b > s.a).length,
    );
  }
  final live = match.liveScore;
  return live != null ? (live.setsA, live.setsB) : (0, 0);
}

/// Sets fechados, já normalizados (`sets[]` ou o formato legado `resultA/B`).
List<TournamentMatchSet> matchSharePosterClosedSets(TournamentMatch match) =>
    matchClosedSets(match);

/// "1–0 · 2º set 14-11".
String? _liveScoreLine(TournamentMatch match) {
  final current = matchLiveCurrentSet(match);
  if (current == null) return null;
  final (a, b) = matchSharePosterSetWins(match);
  return '$a–$b · ${current.setNumber}º set ${current.a}-${current.b}';
}

// --- Fase -------------------------------------------------------------------

/// "Grupo A · rodada 2" nos grupos, rótulo do mata-mata no resto.
String _phaseLabel(TournamentMatch match, List<TournamentMatch> matches) {
  final poolId = match.poolId.trim();
  if (poolId.isEmpty) return _knockoutLabel(match);
  final round = _roundDisplayNumber(matches, poolId, match.round);
  return '${_groupLabel(poolId, matches)} · rodada $round';
}

/// A letra vem da posição do grupo entre os grupos do torneio, ordenados —
/// é o que o portal mostra, e não o id cru do pool.
String _groupLabel(String poolId, List<TournamentMatch> matches) {
  final pools = matches
      .map((m) => m.poolId.trim())
      .where((id) => id.isNotEmpty)
      .toSet()
      .toList()
    ..sort();
  final index = pools.indexOf(poolId.trim());
  return index >= 0 ? 'Grupo ${String.fromCharCode(65 + index)}' : 'Grupo';
}

/// A rodada exibida é a posição da rodada dentro do grupo (1-based), não o
/// campo `round` cru — grupos gerados com rodadas começando em 0 ou com saltos
/// mostrariam número errado.
int _roundDisplayNumber(
  List<TournamentMatch> matches,
  String poolId,
  int round,
) {
  final rounds = matches
      .where((m) => m.poolId.trim() == poolId.trim())
      .map((m) => m.round)
      .toSet()
      .toList()
    ..sort();
  final index = rounds.indexOf(round);
  return index >= 0 ? index + 1 : round + 1;
}

const _knockoutLabels = <String, String>{
  'final': 'Final',
  'grand final': 'Grand final',
  'grand_final': 'Grand final',
  'third place': '3º lugar',
  'third_place': '3º lugar',
  'semi-final': 'Semifinal',
  'semifinal': 'Semifinal',
  'quarter-final': 'Quartas',
  'quarterfinal': 'Quartas',
  'round of 16': 'Oitavas',
  'round of 32': '16 avos',
};

String _knockoutLabel(TournamentMatch match) {
  final type = match.matchType.trim();
  final key = type.toLowerCase();
  final known = _knockoutLabels[key];
  if (known != null) return known;
  if (type.isEmpty) return 'Rodada ${match.round}';
  return '${type[0].toUpperCase()}${type.substring(1)}';
}

/// Final e 3º lugar ganham a paleta ouro/bronze.
MatchSharePosterStage _stageOf(TournamentMatch match) {
  if (match.poolId.trim().isNotEmpty) return MatchSharePosterStage.game;
  return switch (_knockoutLabel(match)) {
    'Final' || 'Grand final' => MatchSharePosterStage.finalMatch,
    '3º lugar' => MatchSharePosterStage.thirdPlace,
    _ => MatchSharePosterStage.game,
  };
}

// --- Rodapé -----------------------------------------------------------------

/// "Sáb 02/08 · 17:30 · Quadra 1"; `null` quando não há nada a dizer (o pôster
/// cai em "Acompanhe no nexaGO").
String? _dateLine(TournamentMatch match) {
  final time = match.scheduleTime;
  final court = formatCourtLabelForCard(match.courtName);
  final parts = <String>[
    if (time != null) _dayLabel(time),
    if (time != null) DateFormat('HH:mm', 'pt_BR').format(time),
    if (court.isNotEmpty) court,
  ];
  return parts.isEmpty ? null : parts.join(' · ');
}

/// "Sáb 02/08".
String _dayLabel(DateTime time) {
  final raw = DateFormat('EEE', 'pt_BR').format(time).replaceAll('.', '');
  final weekday =
      raw.isEmpty ? '' : '${raw[0].toUpperCase()}${raw.substring(1)}';
  return '$weekday ${DateFormat('dd/MM', 'pt_BR').format(time)}'.trim();
}

// --- Duplas -----------------------------------------------------------------

/// Porte de `duoNameOf` + `duoPlayersOf`: nome do time quando existe, senão os
/// primeiros nomes da dupla; foto e inicial sempre na ordem player1/player2.
MatchSharePosterTeam _team({
  required String teamId,
  required String? description,
  required Map<String, TournamentTeam> teams,
  required Map<String, AppUserProfile> profiles,
}) {
  final id = teamId.trim();
  final fallback = _nullIfBlank(description);
  final team = id.isEmpty ? null : teams[id];
  if (team == null) {
    return MatchSharePosterTeam(
      name: fallback ?? (id.isEmpty ? 'A definir' : 'Dupla'),
      players: const [
        MatchSharePosterPlayer(initial: '—'),
        MatchSharePosterPlayer(initial: '—'),
      ],
    );
  }

  final p1 = profiles[team.player1Id];
  final p2 = profiles[team.player2Id];
  return MatchSharePosterTeam(
    name: _duoName(team: team, p1: p1, p2: p2, fallback: fallback),
    players: [
      MatchSharePosterPlayer(
        initial: _initials(p1),
        photoUrl: _nullIfBlank(p1?.profilePhotoUrl),
      ),
      MatchSharePosterPlayer(
        initial: _initials(p2),
        photoUrl: _nullIfBlank(p2?.profilePhotoUrl),
      ),
    ],
  );
}

String _duoName({
  required TournamentTeam team,
  required AppUserProfile? p1,
  required AppUserProfile? p2,
  required String? fallback,
}) {
  final teamName = _nullIfBlank(team.teamName);
  if (teamName != null) return teamName;

  final first1 = _firstName(p1);
  final first2 = _firstName(p2);
  if (first1 == null && first2 == null) return fallback ?? 'Dupla';
  // Dupla ainda procurando parceiro grava o mesmo uid nos dois slots.
  if (team.player1Id == team.player2Id) return first1 ?? fallback ?? 'Dupla';
  return '${first1 ?? 'Atleta'} / ${first2 ?? 'Atleta'}';
}

String? _firstName(AppUserProfile? profile) {
  if (profile == null) return null;
  final name = appUserDisplayName(profile).trim();
  if (name.isEmpty) return null;
  return name.split(RegExp(r'\s+')).first;
}

/// Iniciais como no portal: primeira letra do primeiro e do último nome.
String _initials(AppUserProfile? profile) {
  if (profile == null) return '—';
  final parts = appUserDisplayName(
    profile,
  ).trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '—';
  final first = parts.first[0];
  final last = parts.length > 1 ? parts.last[0] : '';
  return '$first$last'.toUpperCase();
}

String? _nullIfBlank(String? value) {
  final trimmed = value?.trim() ?? '';
  return trimmed.isEmpty ? null : trimmed;
}
