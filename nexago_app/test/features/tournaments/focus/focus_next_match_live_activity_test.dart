import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/live_activity/next_match_live_activity_service.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/tournament_predictions_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_shell_page.dart';

class _NoBackend implements NextMatchLiveActivityBackend {
  @override
  Future<NextMatchActivityStart?> requestStart({
    required String tournamentId,
    required List<String> teamIds,
  }) async =>
      null;

  @override
  Future<void> saveToken({
    required String tournamentId,
    required String liveActivityToken,
  }) async {}
}

class _RecordingLiveActivity extends NextMatchLiveActivityService {
  _RecordingLiveActivity()
      : super(backend: _NoBackend(), isSupportedPlatform: false);

  final starts = <({String tournamentId, Set<String> teamIds})>[];

  @override
  Future<void> startForFocus({
    required String tournamentId,
    required Set<String> teamIds,
  }) async {
    starts.add((tournamentId: tournamentId, teamIds: teamIds));
  }
}

TournamentDetail _tournament() {
  final today = DateTime.now();
  return TournamentDetail(
    id: 't1',
    name: 'Copa Teste',
    location: 'Arena X',
    city: 'Goiânia',
    dateLabel: '',
    startDate: today,
    endDate: today,
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 90',
    priceValue: 90,
    spotsLeft: 10,
    spotsTotal: 32,
    status: TournamentListingStatus.live,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
  );
}

Widget _app(
  _RecordingLiveActivity liveActivity,
  Map<String, String> teamIdsByCategory,
) {
  return ProviderScope(
    overrides: [
      nextMatchLiveActivityServiceProvider.overrideWithValue(liveActivity),
      tournamentDetailProvider('t1')
          .overrideWith((ref) => Stream.value(_tournament())),
      tournamentMatchCardsProvider('t1')
          .overrideWith((ref) => Stream.value(const [])),
      tournamentUserTeamIdsByCategoryProvider('t1')
          .overrideWith((ref) => Stream.value(teamIdsByCategory)),
      myTournamentPredictionEntryProvider('t1')
          .overrideWith((ref) async => null),
    ],
    child: MaterialApp(
      theme: ThemeData(platform: TargetPlatform.iOS),
      home: const FocusShellPage(tournamentId: 't1'),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  testWidgets('abrir o Focus pede a Live Activity com as duplas do atleta, uma vez',
      (tester) async {
    final liveActivity = _RecordingLiveActivity();
    await tester.pumpWidget(
      _app(liveActivity, const {'cat-a': 'team-a', 'cat-b': 'team-b'}),
    );
    await tester.pumpAndSettle();

    expect(liveActivity.starts, hasLength(1));
    expect(liveActivity.starts.single.tournamentId, 't1');
    expect(liveActivity.starts.single.teamIds, {'team-a', 'team-b'});
  });

  testWidgets('quem não está inscrito não pede nada', (tester) async {
    final liveActivity = _RecordingLiveActivity();
    await tester.pumpWidget(_app(liveActivity, const {}));
    await tester.pumpAndSettle();

    expect(liveActivity.starts, isEmpty);
  });
}
