// Correções da aba Reservas do gestor (itens 1 a 8 da análise de UX):
// card no tema claro, fonte mono da marca, erro amigável, CTA real no aviso
// do dia, Passadas sem canceladas, "+N" real e meio de pagamento sem
// presumir PIX.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_labels.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_grouping.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_tasks.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_date_utils.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_providers.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_providers.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';
import 'package:nexago_app/features/arena/presentation/arena_bookings_page.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_day_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_court_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arena/domain/arena_free_windows.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_card.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_bookings_insight_card.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

ArenaManagerBooking _booking(
  Map<String, dynamic> data, {
  String id = 'b1',
  String dateKey = '2026-11-18',
}) =>
    ArenaManagerBooking(
      id: id,
      athleteId: 'ath1',
      courtId: 'q1',
      courtName: 'Quadra 1',
      dateKey: dateKey,
      startTime: '19:00',
      endTime: '20:00',
      data: {'athleteId': 'ath1', ...data},
    );

List<Override> _athleteOverrides() => [
      athleteDisplayLabelProvider('ath1').overrideWith(
        (ref) async => 'Lucas Andrade',
      ),
      athleteProfileByIdProvider('ath1').overrideWith(
        (ref) => Stream.value(null),
      ),
    ];

Future<void> _pumpCard(
  WidgetTester tester,
  ThemeData theme,
  ArenaManagerBooking booking,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: _athleteOverrides(),
      child: MaterialApp(
        theme: theme,
        home: Scaffold(body: ArenaBookingCard(booking: booking)),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('meio de pagamento (item 8)', () {
    test('pago no cartão não vira PIX', () {
      final data = {
        'paymentChannel': 'card',
        'paymentStatus': 'paid',
        'amountReais': 160,
      };
      expect(arenaBookingPaymentLabel(data), 'Cartão · Pago integral');
      expect(arenaBookingPaymentShortLabel(data), 'Cartão · Pago integral');
    });

    test('PIX segue PIX, com rótulo curto no card', () {
      final pending = {'paymentChannel': 'pix', 'paymentStatus': 'pending'};
      expect(arenaBookingPaymentLabel(pending), 'PIX · Aguardando pagamento');
      expect(arenaBookingPaymentShortLabel(pending), 'PIX · Aguardando');
      final deposit = {
        'paymentChannel': 'pix',
        'paymentStatus': 'partial',
        'amountReais': 160,
        'amountPaidOnlineReais': 80,
      };
      expect(arenaBookingPaymentShortLabel(deposit), 'PIX · Sinal pago');
    });

    test('Mercado Pago recusado não vira PIX', () {
      final data = {'paymentId': 'mp1', 'paymentStatus': 'rejected'};
      expect(arenaBookingPaymentLabel(data), 'Mercado Pago · Não concluído');
    });
  });

  group('jogadores além do dono (item 7)', () {
    test('usa confirmedParticipants quando não há lista', () {
      expect(
        arenaBookingExtraPlayers(_booking({'confirmedParticipants': 4})),
        3,
      );
      expect(arenaBookingExtraPlayers(_booking(const {})), 0);
    });

    test('lista de convidados vence a contagem menor', () {
      final b = _booking({
        'confirmedParticipants': 1,
        'participants': [
          {'uid': 'g1', 'name': 'Ana'},
          {'uid': 'g2', 'name': 'Bia'},
        ],
        'participantUids': ['g1', 'g2'],
      });
      expect(arenaBookingExtraPlayers(b), 2);
    });
  });

  group('Passadas sem canceladas (item 6)', () {
    test('a soma em R\$ ignora canceladas', () {
      final list = [
        _booking({'status': 'completed', 'amountReais': 100}),
        _booking({'status': 'canceled', 'amountReais': 900}, id: 'b2'),
      ];
      expect(ArenaBookingsGrouping.sumReais(list), 100);
      expect(
        ArenaBookingsGrouping.sectionSubtitleRevenue(list),
        startsWith('1 reserva · '),
      );
    });

    test('o contador de Passadas ignora canceladas', () async {
      final yesterday = arenaDateKey(
        arenaTodayDateOnly().subtract(const Duration(days: 1)),
      );
      final container = ProviderContainer(
        overrides: [
          arenaManagerBookingsStreamProvider.overrideWith(
            (ref) => Stream.value([
              _booking({'status': 'completed'}, dateKey: yesterday),
              _booking(
                {'status': 'cancelled'},
                id: 'b2',
                dateKey: yesterday,
              ),
            ]),
          ),
        ],
      );
      addTearDown(container.dispose);
      final sub = container.listen(arenaBookingsTabCountsProvider, (_, __) {});
      addTearDown(sub.close);
      await container.read(arenaManagerBookingsStreamProvider.future);
      expect(container.read(arenaBookingsTabCountsProvider).past, 1);
    });
  });

  group('card no tema (itens 1, 3 e 7)', () {
    for (final (label, theme) in [
      ('claro', AppTheme.light),
      ('escuro', AppTheme.dark),
    ]) {
      testWidgets('nome, horário e valor seguem o tema $label', (tester) async {
        await _pumpCard(
          tester,
          theme,
          _booking({
            'status': 'active',
            'amountReais': 160,
            'confirmedParticipants': 4,
          }),
        );
        final onSurface = theme.colorScheme.onSurface;

        final name = tester.widget<Text>(find.text('Lucas Andrade'));
        expect(name.style?.color, onSurface);

        final time = tester.widget<Text>(find.text('19:00'));
        expect(time.style?.color, onSurface);
        expect(time.style?.fontFamily, AppTypography.monoFontFamily);

        expect(find.text('+3'), findsOneWidget);
      });
    }

    testWidgets('no claro, nenhum texto usa o branco fixo do escuro',
        (tester) async {
      await _pumpCard(
        tester,
        AppTheme.light,
        _booking({'status': 'active', 'amountReais': 160}),
      );
      final whites = tester
          .widgetList<Text>(find.byType(Text))
          .where((t) => t.style?.color == AppColors.onSurface);
      expect(whites, isEmpty);
    });
  });

  group('aviso do dia (itens 2 e 5)', () {
    testWidgets('fundo segue o tema e o CTA leva à agenda', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: const Scaffold(
            body: ArenaBookingsInsightCard(
              insight: ArenaBookingsTodayInsight(
                message: 'Hoje tá vazio.',
                showPromoCta: true,
              ),
            ),
          ),
        ),
      );
      final box = tester.widget<DecoratedBox>(
        find
            .descendant(
              of: find.byType(ArenaBookingsInsightCard),
              matching: find.byType(DecoratedBox),
            )
            .first,
      );
      final color = (box.decoration as BoxDecoration).color;
      expect(color, isNot(const Color(0xFF2A2418)));
      expect(color!.computeLuminance(), greaterThan(0.5));
      expect(find.text('Ver horários livres na agenda →'), findsOneWidget);
      expect(find.textContaining('promoção'), findsNothing);
    });
  });

  // Erro de carga (item 4): a mensagem passa por friendlyErrorMessage.
  testWidgets('erro de carga não mostra a exceção crua', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          managedArenaIdProvider.overrideWith(
            (ref) => const AsyncValue<String?>.data('a1'),
          ),
          managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
          arenaCanWriteProvider.overrideWith((ref, area) => false),
          arenaManagerBookingsStreamProvider.overrideWith(
            (ref) => Stream<List<ArenaManagerBooking>>.error(
              FirebaseException(
                plugin: 'cloud_firestore',
                code: 'internal',
                message: 'INTERNAL ASSERTION FAILED',
              ),
            ),
          ),
          arenaBookingsTodayInsightProvider.overrideWith((ref) => null),
          arenaBookingsTasksProvider.overrideWith(
            (ref) => const <ArenaBookingTask>[],
          ),
          arenaBookingsStripSlotsProvider.overrideWith(
            (ref) => Stream.value(const <ArenaSlot>[]),
          ),
          arenaBookingsDayFreeWindowsProvider.overrideWith(
            (ref) => const <ArenaFreeWindow>[],
          ),
          arenaManagedCourtsProvider.overrideWith(
            (ref) => Stream.value(const <ArenaCourt>[]),
          ),
          managedArenaClassesProvider.overrideWith(
            (ref) => Stream.value(const <ArenaClass>[]),
          ),
          arenaClassSessionsOnDayProvider.overrideWith(
            (ref, dateKey) => Stream.value(const <ArenaClassSession>[]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaBookingsPage(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(
      find.textContaining('Não foi possível carregar as reservas'),
      findsOneWidget,
    );
    expect(find.textContaining('INTERNAL'), findsNothing);
    expect(find.textContaining('cloud_firestore'), findsNothing);
  });
}
