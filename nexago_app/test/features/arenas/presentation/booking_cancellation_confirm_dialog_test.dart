import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_cancellation_confirm_dialog.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final start = DateTime(2026, 10, 31, 18, 0);

  /// Abre o diálogo por um botão e guarda o que ele devolveu.
  Future<List<bool>> pumpOpener(
    WidgetTester tester, {
    required DateTime Function() clock,
  }) async {
    final results = <bool>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                results.add(
                  await confirmBookingCancellation(
                    context,
                    arenaName: 'Arena Sol',
                    courtName: 'Quadra 2',
                    startAt: start,
                    clock: clock,
                  ),
                );
              },
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
    return results;
  }

  testWidgets('mostra a reserva e a política, sem falar em estorno',
      (tester) async {
    await pumpOpener(tester,
        clock: () => start.subtract(const Duration(days: 1)));

    expect(find.text('Cancelar reserva?'), findsOneWidget);
    expect(find.textContaining('Quadra 2'), findsOneWidget);
    expect(find.textContaining('18:00'), findsOneWidget);
    expect(
      find.text(
        'Cancelamento grátis até 6h antes do horário. '
        'Depois disso, a Arena Sol retém 50% do valor pago.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('estorn'), findsNothing);
  });

  testWidgets('"Manter reserva" devolve false', (tester) async {
    final results = await pumpOpener(
      tester,
      clock: () => start.subtract(const Duration(days: 1)),
    );

    await tester.tap(find.byKey(const Key('booking-cancel-keep')));
    await tester.pumpAndSettle();

    expect(results, [false]);
    expect(find.text('Cancelar reserva?'), findsNothing);
  });

  testWidgets('confirmar no prazo devolve true', (tester) async {
    final results = await pumpOpener(
      tester,
      clock: () => start.subtract(const Duration(days: 1)),
    );

    await tester.tap(find.byKey(const Key('booking-cancel-confirm')));
    await tester.pumpAndSettle();

    expect(results, [true]);
  });

  testWidgets('prazo acabou com o diálogo aberto: avisa e devolve false',
      (tester) async {
    var now = start.subtract(const Duration(hours: 7));
    final results = await pumpOpener(tester, clock: () => now);

    now = start.subtract(const Duration(hours: 5));
    await tester.tap(find.byKey(const Key('booking-cancel-confirm')));
    await tester.pump();

    expect(results, [false]);
    expect(find.textContaining('fale com Arena Sol'), findsOneWidget);
  });
}
