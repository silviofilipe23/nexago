import 'package:intl/intl.dart';

import '../../domain/match_history/athlete_match_detail_models.dart';
import '../../domain/match_history/athlete_match_history_models.dart';
import 'mock_athlete_match_history_data.dart';

/// Detalhe mockado da partida (protótipo 09).
AthleteMatchDetail? mockAthleteMatchDetail(String matchId) {
  final campaign = _campaignMatchDetail(matchId);
  if (campaign != null) return campaign;

  final bundle = mockAthleteMatchHistoryBundle();
  final summary = bundle.matches.where((m) => m.id == matchId).firstOrNull;
  if (summary == null) return null;

  if (matchId == 'm1') return _detailM1(summary);
  return _detailFromSummary(summary);
}

AthleteMatchDetail? _campaignMatchDetail(String matchId) {
  return switch (matchId) {
    'camp-copa-quartas' => _campaignDetail(
        id: matchId,
        stage: 'QUARTAS',
        opponent: 'Reis / Andrade',
        score: '2 - 0',
        playedAt: DateTime(2026, 3, 29, 10, 0),
        sets: const [
          MatchSetScore(label: 'SET 1', ourScore: 21, opponentScore: 14),
          MatchSetScore(label: 'SET 2', ourScore: 21, opponentScore: 17),
        ],
      ),
    'camp-copa-semis' => _campaignDetail(
        id: matchId,
        stage: 'SEMIS',
        opponent: 'Mello / Tavares',
        score: '2 - 1',
        playedAt: DateTime(2026, 3, 29, 16, 30),
        sets: const [
          MatchSetScore(label: 'SET 1', ourScore: 21, opponentScore: 19),
          MatchSetScore(label: 'SET 2', ourScore: 18, opponentScore: 21),
          MatchSetScore(label: 'TIE', ourScore: 15, opponentScore: 12),
        ],
      ),
    'camp-copa-final' => _campaignDetail(
        id: matchId,
        stage: 'FINAL',
        opponent: 'Goes / Santiago',
        score: '2 - 0',
        playedAt: DateTime(2026, 3, 30, 18, 0),
        sets: const [
          MatchSetScore(label: 'SET 1', ourScore: 21, opponentScore: 16),
          MatchSetScore(label: 'SET 2', ourScore: 21, opponentScore: 13),
        ],
      ),
    _ => null,
  };
}

AthleteMatchDetail _campaignDetail({
  required String id,
  required String stage,
  required String opponent,
  required String score,
  required DateTime playedAt,
  required List<MatchSetScore> sets,
}) {
  final names = opponent.split('/').map((s) => s.trim()).toList();
  final p1 = names.isNotEmpty ? names[0] : 'Adv';
  final p2 = names.length > 1 ? names[1] : '—';

  return AthleteMatchDetail(
    id: id,
    tournamentId: 'tour-copa-goias-2026',
    result: AthleteMatchResult.win,
    resultBadgeLabel: 'VITÓRIA • $score',
    ourTeam: const MatchTeamSide(
      players: [
        MatchTeamPlayer(
          initials: 'MA',
          avatarColor: 0xFFFF6A1A,
          name: 'Marcelo',
        ),
        MatchTeamPlayer(
          initials: 'EN',
          avatarColor: 0xFF2BD17E,
          name: 'Enzo',
        ),
      ],
      label: 'Marcelo / Enzo',
      roleLabel: 'VOCÊ',
      isCurrentUser: true,
    ),
    opponentTeam: MatchTeamSide(
      players: [
        MatchTeamPlayer(initials: _initials(p1), avatarColor: 0xFF9B59B6),
        MatchTeamPlayer(initials: _initials(p2), avatarColor: 0xFF3498DB),
      ],
      label: '$p1 / $p2',
      roleLabel: 'ADVERSÁRIOS',
    ),
    sets: sets,
    tournamentName: 'Copa Goiás Beach Open',
    dateTimeLabel: _formatDateTimeLabel(playedAt),
    venueLabel: 'Arena ErreJota · Quadra 2',
    categoryLabel: 'Sub 19 · Masculino · $stage',
    durationLabel: '58min',
    mvpSummary: stage == 'FINAL' ? 'Você • 16 ataques • 4 aces · 5 blocks' : null,
  );
}

AthleteMatchDetail _detailM1(AthleteMatchHistoryItem summary) {
  return AthleteMatchDetail(
    id: summary.id,
    tournamentId: 'tour-copa-goias-2026',
    result: summary.result,
    resultBadgeLabel: 'VITÓRIA • 2 - 1',
    ourTeam: const MatchTeamSide(
      players: [
        MatchTeamPlayer(
          initials: 'MA',
          avatarColor: 0xFFFF6A1A,
          name: 'Marcelo',
        ),
        MatchTeamPlayer(
          initials: 'EN',
          avatarColor: 0xFF2BD17E,
          name: 'Enzo',
        ),
      ],
      label: 'Marcelo / Enzo',
      roleLabel: 'VOCÊ',
      isCurrentUser: true,
    ),
    opponentTeam: const MatchTeamSide(
      players: [
        MatchTeamPlayer(initials: 'CO', avatarColor: 0xFF9B59B6),
        MatchTeamPlayer(initials: 'VI', avatarColor: 0xFF3498DB),
      ],
      label: 'Costa / Vieira',
      roleLabel: 'ADVERSÁRIOS',
    ),
    sets: const [
      MatchSetScore(label: 'SET 1', ourScore: 21, opponentScore: 17),
      MatchSetScore(label: 'SET 2', ourScore: 18, opponentScore: 21),
      MatchSetScore(label: 'TIE', ourScore: 15, opponentScore: 12),
    ],
    tournamentName: 'Copa Goiás Beach Open',
    dateTimeLabel: _formatDateTimeLabel(summary.playedAt),
    venueLabel: 'Arena ErreJota · Quadra 2',
    categoryLabel: 'Sub 19 · Masculino · Oitavas',
    durationLabel: '1h 12min',
    mvpSummary: 'Você • 18 ataques • 3 aces • 6 blocks',
  );
}

AthleteMatchDetail _detailFromSummary(AthleteMatchHistoryItem summary) {
  final opponentNames = _parseOpponentNames(summary.opponentLabel);
  final sets = _parseSets(summary.setsDisplay);
  final isWin = summary.isWin;
  final resultWord = isWin ? 'VITÓRIA' : 'DERROTA';

  return AthleteMatchDetail(
    id: summary.id,
    tournamentId: _guessTournamentId(summary.competitionLabel),
    result: summary.result,
    resultBadgeLabel: '$resultWord • ${summary.scoreDisplay}',
    ourTeam: const MatchTeamSide(
      players: [
        MatchTeamPlayer(
          initials: 'MA',
          avatarColor: 0xFFFF6A1A,
          name: 'Marcelo',
        ),
        MatchTeamPlayer(
          initials: 'EN',
          avatarColor: 0xFF2BD17E,
          name: 'Enzo',
        ),
      ],
      label: 'Marcelo / Enzo',
      roleLabel: 'VOCÊ',
      isCurrentUser: true,
    ),
    opponentTeam: MatchTeamSide(
      players: [
        MatchTeamPlayer(
          initials: _initials(opponentNames.$1),
          avatarColor: 0xFF9B59B6,
        ),
        MatchTeamPlayer(
          initials: _initials(opponentNames.$2),
          avatarColor: 0xFF3498DB,
        ),
      ],
      label: '${opponentNames.$1} / ${opponentNames.$2}',
      roleLabel: 'ADVERSÁRIOS',
    ),
    sets: sets,
    tournamentName: summary.competitionLabel,
    dateTimeLabel: _formatDateTimeLabel(summary.playedAt),
    venueLabel: 'Arena NexaGO · Quadra 1',
    categoryLabel: 'Dupla mista · Livre',
    durationLabel: _mockDuration(summary.id),
    mvpSummary: summary.isMvp
        ? 'Você • 14 ataques • 2 aces • 4 blocks'
        : null,
  );
}

(String, String) _parseOpponentNames(String opponentLabel) {
  var raw = opponentLabel.trim();
  if (raw.toLowerCase().startsWith('vs ')) {
    raw = raw.substring(3).trim();
  }
  final parts = raw.split('/').map((s) => s.trim()).toList();
  if (parts.length >= 2) return (parts[0], parts[1]);
  if (parts.length == 1) return (parts[0], '—');
  return ('Adversário', '—');
}

String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return '?';
  if (parts.length == 1) {
    final p = parts.first;
    return p.length >= 2
        ? p.substring(0, 2).toUpperCase()
        : p[0].toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

List<MatchSetScore> _parseSets(String? setsDisplay) {
  if (setsDisplay == null || setsDisplay.trim().isEmpty) {
    return const [
      MatchSetScore(label: 'SET 1', ourScore: 21, opponentScore: 18),
    ];
  }

  final segments = setsDisplay.split('·').map((s) => s.trim()).toList();
  final scores = <MatchSetScore>[];
  for (var i = 0; i < segments.length; i++) {
    final seg = segments[i];
    final dash = seg.indexOf('-');
    if (dash <= 0) continue;
    final left = int.tryParse(seg.substring(0, dash).trim());
    final right = int.tryParse(seg.substring(dash + 1).trim());
    if (left == null || right == null) continue;
    final label = switch (i) {
      0 => 'SET 1',
      1 => 'SET 2',
      _ => 'TIE',
    };
    scores.add(
      MatchSetScore(label: label, ourScore: left, opponentScore: right),
    );
  }
  return scores.isEmpty
      ? const [MatchSetScore(label: 'SET 1', ourScore: 21, opponentScore: 18)]
      : scores;
}

String _formatDateTimeLabel(DateTime playedAt) {
  final weekday = DateFormat('EEEE', 'pt_BR').format(playedAt);
  final capitalized =
      weekday.isEmpty ? weekday : '${weekday[0].toUpperCase()}${weekday.substring(1)}';
  final date = DateFormat("d 'de' MMMM", 'pt_BR').format(playedAt);
  final time = DateFormat('HH:mm', 'pt_BR').format(playedAt);
  return '$capitalized · $date · $time';
}

String? _guessTournamentId(String competitionLabel) {
  final lower = competitionLabel.toLowerCase();
  if (lower.contains('copa goiás')) return 'tour-copa-goias-2026';
  if (lower.contains('liga arena')) return 'tour-liga-arena-winter';
  return null;
}

String _mockDuration(String id) {
  final hash = id.codeUnits.fold<int>(0, (a, b) => a + b);
  final minutes = 55 + (hash % 35);
  if (minutes >= 60) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return m == 0 ? '${h}h' : '${h}h ${m}min';
  }
  return '${minutes}min';
}
