// Folha "Filtrar reservas": rodapé fixo com contagem ao vivo, contexto do
// dia, "Limpar" sempre no lugar, tique e ícones nos chips, aviso dos
// horários livres. O comportamento não muda: cada toque aplica na hora,
// OU dentro do grupo / E entre grupos, e o botão só fecha a folha.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_day_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_filter.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_court_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_bookings_filter_sheet.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';

ArenaManagerBooking _b(String id, String sport) => ArenaManagerBooking(
      id: id,
      athleteId: 'a',
      courtId: 'q1',
      courtName: 'Quadra 1',
      dateKey: '2026-11-18',
      startTime: '19:00',
      endTime: '20:00',
      data: {'status': 'active', 'sport': sport},
    );

Future<ProviderContainer> _open(
  WidgetTester tester, {
  ThemeData? theme,
  int? count = 5,
  int courts = 3,
}) async {
  tester.view.physicalSize = const Size(402, 874);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        arenaManagedCourtsProvider.overrideWith(
          (ref) => Stream.value([
            for (var i = 1; i <= courts; i++)
              ArenaCourt(id: 'q$i', name: 'Quadra $i'),
          ]),
        ),
        arenaManagerBookingsStreamProvider.overrideWith(
          (ref) => Stream.value([_b('1', 'beach_tennis')]),
        ),
        arenaBookingsFilteredCountProvider.overrideWith((ref) => count),
      ],
      child: MaterialApp(
        theme: theme ?? AppTheme.dark,
        home: Scaffold(
          body: Builder(
            builder: (c) => Center(
              child: TextButton(
                onPressed: () => showArenaBookingsFilterSheet(c),
                child: const Text('abrir'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(
    tester.element(find.byType(ArenaBookingsFilterSheet)),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('textos', () {
    test('botão com a contagem', () {
      expect(arenaBookingsFilterDoneLabel(null), 'Ver reservas');
      expect(arenaBookingsFilterDoneLabel(0), 'Fechar');
      expect(arenaBookingsFilterDoneLabel(1), 'Ver 1 reserva');
      expect(arenaBookingsFilterDoneLabel(7), 'Ver 7 reservas');
    });

    test('contexto: dia aberto e busca', () {
      final today = DateTime(2026, 11, 18);
      expect(
        arenaBookingsFilterScopeLabel(today, today),
        'Hoje, 18 de nov · vale também para a busca',
      );
      expect(
        arenaBookingsFilterScopeLabel(DateTime(2026, 11, 20), today),
        'Sexta, 20 de nov · vale também para a busca',
      );
    });
  });

  testWidgets('botão fixo no rodapé, mesmo com muitas quadras', (tester) async {
    await _open(tester, courts: 30);
    final done = find.byKey(const Key('arena-bookings-filter-done'));
    expect(done, findsOneWidget);
    // Na tela, sem rolar: os grupos rolam, o rodapé fica.
    expect(tester.getBottomLeft(done).dy, lessThanOrEqualTo(874));
    expect(find.text('Ver 5 reservas'), findsOneWidget);
    // A folha não passa de 85% da tela.
    final sheet = tester.getRect(find.byType(ArenaBookingsFilterSheet));
    expect(sheet.height, lessThanOrEqualTo(874 * 0.85 + 1));
  });

  testWidgets('cada toque aplica na hora; o botão só fecha', (tester) async {
    final container = await _open(tester);
    await tester.tap(find.text('Falta receber'));
    await tester.pump();
    expect(
      container.read(arenaBookingsFilterProvider).payments,
      {ArenaPaymentFilter.due},
    );
    await tester.tap(find.text('Quadra 2'));
    await tester.pump();
    final applied = container.read(arenaBookingsFilterProvider);
    expect(applied.courtIds, {'q2'});

    await tester.tap(find.byKey(const Key('arena-bookings-filter-done')));
    await tester.pumpAndSettle();
    expect(find.byType(ArenaBookingsFilterSheet), findsNothing);
    expect(container.read(arenaBookingsFilterProvider), applied);
  });

  testWidgets('zero reservas: aviso e "Fechar"', (tester) async {
    await _open(tester, count: 0);
    expect(
        find.byKey(const Key('arena-bookings-filter-empty')), findsOneWidget);
    expect(find.text('Fechar'), findsOneWidget);
  });

  testWidgets('contexto do dia aparece sob o título', (tester) async {
    await _open(tester);
    expect(
        find.byKey(const Key('arena-bookings-filter-scope')), findsOneWidget);
    expect(find.textContaining('vale também para a busca'), findsOneWidget);
  });

  for (final (label, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    testWidgets('"Limpar" sempre no lugar e no laranja de texto ($label)',
        (tester) async {
      await _open(tester, theme: theme);
      final clear = find.byKey(const Key('arena-bookings-filter-clear'));
      expect(clear, findsOneWidget);
      expect(tester.widget<TextButton>(clear).onPressed, isNull);

      await tester.tap(find.text('Pago'));
      await tester.pump();
      final button = tester.widget<TextButton>(clear);
      expect(button.onPressed, isNotNull);
      final colors = AppThemeColors(theme.colorScheme);
      expect(button.style!.foregroundColor!.resolve({}), colors.brandText);
    });
  }

  testWidgets('marcado ganha tique; pagamento e tipo têm ícone',
      (tester) async {
    await _open(tester);
    FilterChip chip(String label) => tester.widget<FilterChip>(
          find.ancestor(
            of: find.text(label),
            matching: find.byType(FilterChip),
          ),
        );
    expect(chip('Pago').avatar, isNotNull);
    expect(chip('Horário fixo').avatar, isNotNull);
    expect(chip('Quadra 1').avatar, isNull);
    expect(chip('Pago').showCheckmark, isTrue);

    await tester.tap(find.text('Pago'));
    await tester.pump();
    // Marcado, o tique entra no lugar do ícone.
    expect(chip('Pago').selected, isTrue);
    expect(chip('Pago').avatar, isNull);
    expect(find.text('Aguardando online'), findsOneWidget);
  });

  testWidgets('aviso dos horários livres só com filtro que os esconde',
      (tester) async {
    await _open(tester);
    final note = find.byKey(const Key('arena-bookings-filter-free-note'));
    expect(note, findsNothing);

    await tester.tap(find.text('Quadra 1'));
    await tester.pump();
    expect(note, findsNothing);

    await tester.tap(find.text('Beach tennis'));
    await tester.pump();
    expect(note, findsOneWidget);
  });
}
