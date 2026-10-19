import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
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

Future<void> abrirAgenda(
  WidgetTester tester,
  AthleteAgendaTimelineRow row,
) async {
  tester.view.physicalSize = const Size(400, 1000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        bookingStorySourceProvider('b1').overrideWith((ref) => null),
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

  testWidgets('aluguel que já passou: "Postar resultado" abre o pós-jogo', (
    tester,
  ) async {
    await abrirAgenda(
      tester,
      aluguel(status: 'confirmed', stage: AthleteAgendaBookingStage.past),
    );

    expect(find.byKey(const Key('agenda-booking-story-b1')), findsNothing);
    await tester.tap(find.byKey(const Key('agenda-booking-result-b1')));
    await tester.pumpAndSettle();

    expect(find.byType(BookingResultPage), findsOneWidget);
    expect(find.text('Pós-jogo'), findsOneWidget);
  });

  testWidgets('aluguel passado cancelado: sem pós-jogo', (tester) async {
    await abrirAgenda(
      tester,
      aluguel(status: 'cancelled', stage: AthleteAgendaBookingStage.canceled),
    );

    expect(find.byKey(const Key('agenda-booking-result-b1')), findsNothing);
  });
}
