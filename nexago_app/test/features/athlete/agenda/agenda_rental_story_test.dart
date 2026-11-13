import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/pelada_live_draft_store.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_match.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_rules.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_session.dart';
import 'package:nexago_app/features/arenas/presentation/lancar_placar/lancar_placar_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_story_page.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_timeline_widgets.dart';

AthleteAgendaTimelineRow aluguel({
  required String status,
  bool needsPayment = false,
  AthleteAgendaBookingStage stage = AthleteAgendaBookingStage.future,
}) {
  final start = DateTime.now().add(
    Duration(days: stage == AthleteAgendaBookingStage.past ? -2 : 2),
  );
  final end = start.add(const Duration(hours: 1));
  return AthleteAgendaTimelineRow.item(
    AthleteAgendaItem(
      id: 'rental-b1',
      kind: AthleteAgendaItemKind.rental,
      startsAt: start,
      endsAt: end,
      title: 'Arena Sol',
      subtitle: 'Quadra 2',
      statusLabel: 'Em 2 dias',
      accentColor: AppColors.brand,
      rental: AthleteAgendaRentalPayload(
        bookingId: 'b1',
        arenaName: 'Arena Sol',
        courtName: 'Quadra 2',
        startAt: start,
        endAt: end,
        rawStatus: status,
        confirmedParticipants: 1,
        stage: stage,
        needsPayment: needsPayment,
      ),
    ),
    isFirst: true,
    isLast: true,
  );
}

/// Marcação ao vivo guardada (ou não) para a reserva b1.
class _Drafts implements PeladaLiveDraftStore {
  _Drafts([this.draft]);

  final PeladaLiveSession? draft;

  @override
  Future<void> clear(String key) async {}
  @override
  Future<PeladaLiveSession?> load(String key) async => draft;
  @override
  Future<void> save(String key, PeladaLiveSession session) async {}
  @override
  Future<PeladaLiveRules?> lastRules(String sportKey) async => null;
  @override
  Future<void> saveRules(String sportKey, PeladaLiveRules rules) async {}
}

Future<void> abrirAgenda(
  WidgetTester tester,
  AthleteAgendaTimelineRow row, {
  PeladaLiveSession? draft,
}) async {
  tester.view.physicalSize = const Size(400, 1000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        bookingStorySourceProvider('b1').overrideWith((ref) => null),
        peladaLiveDraftStoreProvider.overrideWithValue(_Drafts(draft)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: ListView(
            children: [
              AgendaTimelineRow(
                row: row,
                highlightNextId: null,
                onCancelBooking: (_) async {},
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('aluguel confirmado: "Postar no story" abre o editor da reserva',
      (
    tester,
  ) async {
    await abrirAgenda(tester, aluguel(status: 'confirmed'));

    await tester.tap(find.byKey(const Key('agenda-booking-story-b1')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(BookingStoryPage), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(BookingStoryPage),
        matching: find.textContaining(
          'Arena Sol · Quadra 2',
          findRichText: true,
        ),
      ),
      findsOneWidget,
    );
  });

  testWidgets('aluguel esperando pagamento: só "Pagar", sem story', (
    tester,
  ) async {
    await abrirAgenda(
      tester,
      aluguel(status: 'pending_payment', needsPayment: true),
    );

    expect(find.byKey(const Key('agenda-booking-story-b1')), findsNothing);
    expect(find.textContaining('Pagar'), findsOneWidget);
  });

  testWidgets('aluguel futuro: story, mas ainda sem "Postar resultado"', (
    tester,
  ) async {
    await abrirAgenda(tester, aluguel(status: 'confirmed'));

    expect(find.byKey(const Key('agenda-booking-result-b1')), findsNothing);
  });

  testWidgets('aluguel que já passou: "Postar no story" abre o pós-jogo', (
    tester,
  ) async {
    await abrirAgenda(
      tester,
      aluguel(status: 'confirmed', stage: AthleteAgendaBookingStage.past),
    );

    expect(find.byKey(const Key('agenda-booking-story-b1')), findsNothing);
    // Jogo encerrado: "Lançar placar" em primeiro, sem "Marcar ao vivo".
    expect(find.byKey(const Key('agenda-booking-live-b1')), findsNothing);
    expect(find.text('Lançar placar'), findsOneWidget);
    await tester.tap(find.byKey(const Key('agenda-booking-result-b1')));
    await tester.pumpAndSettle();

    expect(find.byType(BookingResultPage), findsOneWidget);
    expect(find.text('Pós-jogo'), findsOneWidget);
  });

  testWidgets(
      'aluguel em andamento: "Marcar ao vivo" em cima, "Digitar o placar" '
      'embaixo, um por linha', (tester) async {
    await abrirAgenda(
      tester,
      aluguel(status: 'confirmed', stage: AthleteAgendaBookingStage.current),
    );
    await tester.pump();

    expect(find.text('Marcar ao vivo'), findsOneWidget);
    expect(find.text('Digitar o placar'), findsOneWidget);
    final live =
        tester.getRect(find.byKey(const Key('agenda-booking-live-b1')));
    final typed = tester.getRect(
      find.byKey(const Key('agenda-booking-type-b1')),
    );
    expect(typed.top, greaterThan(live.bottom));
    expect(typed.width, live.width);

    await tester.tap(find.byKey(const Key('agenda-booking-live-b1')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final page = tester.widget<LancarPlacarPage>(
      find.byType(LancarPlacarPage),
    );
    expect(page.mode, LancarPlacarMode.live);
  });

  testWidgets('marcação guardada: o card vira "Continuar marcação"', (
    tester,
  ) async {
    var draft = PeladaLiveSession.start(
      const BookingResult(
        teams: [
          ResultTeam(id: 0, players: [ResultPlayer(id: 'u1', name: 'Maria')]),
          ResultTeam(id: 1, players: [ResultPlayer(id: 'u2', name: 'Enzo')]),
        ],
        games: [ResultGame(teamA: 0, teamB: 1)],
      ),
      PeladaLiveRules.forSport('beachVolleyball'),
      now: DateTime(2026, 11, 13),
    );
    for (var i = 0; i < 3; i++) {
      draft = draft.point(LiveSide.a, now: DateTime(2026, 11, 13));
    }
    await abrirAgenda(
      tester,
      aluguel(status: 'confirmed', stage: AthleteAgendaBookingStage.current),
      draft: draft,
    );
    await tester.pump();

    expect(find.text('Continuar marcação'), findsOneWidget);
    expect(
      find.text('Marcação em andamento · Set 1 · 3–0'),
      findsOneWidget,
    );
  });

  testWidgets('aluguel passado cancelado: sem pós-jogo', (tester) async {
    await abrirAgenda(
      tester,
      aluguel(status: 'cancelled', stage: AthleteAgendaBookingStage.canceled),
    );

    expect(find.byKey(const Key('agenda-booking-result-b1')), findsNothing);
  });
}
