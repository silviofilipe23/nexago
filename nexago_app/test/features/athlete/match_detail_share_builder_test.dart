import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_detail_share_builder.dart';

void main() {
  group('buildMatchDetailShareInfo', () {
    test('vitória do participante', () {
      final detail = _baseDetail(
        phase: MatchDetailPhase.completed,
        result: AthleteMatchResult.win,
        isParticipantView: true,
        ourSetsWon: 2,
        opponentSetsWon: 0,
      );
      final share = buildMatchDetailShareInfo(detail)!;

      expect(share.variant, MatchDetailShareVariant.victory);
      expect(share.heroTitle, 'VITÓRIA');
      expect(share.heroScoreLabel, '2 — 0');
      expect(share.emphasizeTopRow, isTrue);
      expect(share.emphasizeBottomRow, isFalse);
      expect(share.winnersLabel, detail.ourTeam.label);
    });

    test('derrota do participante mantém nossa dupla em cima', () {
      final detail = _baseDetail(
        phase: MatchDetailPhase.completed,
        result: AthleteMatchResult.loss,
        isParticipantView: true,
        ourSetsWon: 1,
        opponentSetsWon: 2,
      );
      final share = buildMatchDetailShareInfo(detail)!;

      expect(share.variant, MatchDetailShareVariant.defeat);
      expect(share.heroTitle, 'FIM DE\nJOGO');
      expect(share.winnersLabel, detail.ourTeam.label);
      expect(share.opponentsLabel, detail.opponentTeam.label);
      expect(share.emphasizeTopRow, isFalse);
      expect(share.emphasizeBottomRow, isTrue);
    });

    test('ao vivo com set atual', () {
      final detail = _baseDetail(
        phase: MatchDetailPhase.live,
        result: AthleteMatchResult.win,
        isParticipantView: true,
        ourSetsWon: 1,
        opponentSetsWon: 0,
        sets: const [
          MatchSetScore(label: 'SET 1', ourScore: 21, opponentScore: 15),
          MatchSetScore(
            label: 'SET 2',
            ourScore: 14,
            opponentScore: 11,
            isCurrentSet: true,
          ),
        ],
      );
      final share = buildMatchDetailShareInfo(detail)!;

      expect(share.variant, MatchDetailShareVariant.live);
      expect(share.heroTitle, 'AO VIVO');
      expect(share.showLiveBadge, isTrue);
      expect(share.setPoints.any((s) => s.isCurrentSet), isTrue);
      expect(
        share.setPoints.firstWhere((s) => s.isCurrentSet).displayLabel,
        'AGORA',
      );
    });

    test('agendada sem grid de sets', () {
      final detail = _baseDetail(
        phase: MatchDetailPhase.scheduled,
        result: AthleteMatchResult.win,
        isParticipantView: true,
        dateTimeLabel: '26 ABR 2026 08:00',
      );
      final share = buildMatchDetailShareInfo(detail)!;

      expect(share.variant, MatchDetailShareVariant.scheduled);
      expect(share.heroTitle, 'BORA?');
      expect(share.showSetGrid, isFalse);
      expect(share.showDiagonalStripes, isTrue);
    });

    test('espectador em partida finalizada', () {
      final detail = _baseDetail(
        phase: MatchDetailPhase.completed,
        result: AthleteMatchResult.loss,
        isParticipantView: false,
        ourSetsWon: 2,
        opponentSetsWon: 1,
        winnerTeamId: 'team_a',
      );
      final share = buildMatchDetailShareInfo(detail)!;

      expect(share.variant, MatchDetailShareVariant.spectator);
      expect(share.heroTitle, 'FIM DE JOGO');
      expect(share.emphasizeTopRow, isTrue);
      expect(share.emphasizeBottomRow, isTrue);
    });

    test('cancelada retorna null', () {
      final detail = _baseDetail(phase: MatchDetailPhase.canceled);
      expect(buildMatchDetailShareInfo(detail), isNull);
    });
  });
}

AthleteMatchDetail _baseDetail({
  required MatchDetailPhase phase,
  AthleteMatchResult result = AthleteMatchResult.win,
  bool isParticipantView = true,
  int ourSetsWon = 2,
  int opponentSetsWon = 0,
  List<MatchSetScore> sets = const [
    MatchSetScore(label: 'SET 1', ourScore: 21, opponentScore: 15),
    MatchSetScore(label: 'SET 2', ourScore: 21, opponentScore: 18),
  ],
  String dateTimeLabel = '26 ABR 2026 • 08:00',
  String? winnerTeamId,
}) {
  return AthleteMatchDetail(
    id: 'm-test',
    phase: phase,
    result: result,
    resultBadgeLabel: '—',
    stageLabel: 'ETAPA TESTE',
    ourSetsWon: ourSetsWon,
    opponentSetsWon: opponentSetsWon,
    ourTeam: const MatchTeamSide(
      teamId: 'team_a',
      players: [
        MatchTeamPlayer(initials: 'BR', avatarColor: 0xFF3366CC),
        MatchTeamPlayer(initials: 'DB', avatarColor: 0xFF225533),
      ],
      label: 'Bruninho / Diego Barros',
      roleLabel: 'VOCÊ',
      isCurrentUser: true,
    ),
    opponentTeam: const MatchTeamSide(
      teamId: 'team_b',
      players: [
        MatchTeamPlayer(initials: 'GB', avatarColor: 0xFF666666),
        MatchTeamPlayer(initials: 'EF', avatarColor: 0xFF8844AA),
      ],
      label: 'Guilherme Batista / Eduardo Freitas',
      roleLabel: 'ADV',
    ),
    sets: sets,
    tournamentName: 'Copa Teste',
    dateTimeLabel: dateTimeLabel,
    venueLabel: 'Arena',
    categoryLabel: 'WB1',
    durationLabel: '—',
    isParticipantView: isParticipantView,
    winnerTeamId:
        winnerTeamId ??
        (isParticipantView && result == AthleteMatchResult.win
            ? 'team_a'
            : 'team_b'),
  );
}
