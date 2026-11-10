import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/waitlist_repository.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_waitlist_entry.dart';
import 'package:nexago_app/features/arenas/domain/waitlist_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_waitlist_section.dart';

class _FakeWaitlistRepository implements WaitlistRepository {
  final left = <String>[];

  @override
  Future<void> leave(String waitlistId) async => left.add(waitlistId);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ArenaBookingWaitlistEntry _entry(String id, DateTime day, String start) =>
    ArenaBookingWaitlistEntry(
      id: id,
      arenaId: 'a1',
      courtId: 'q1',
      dateKey:
          '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}',
      startTime: start,
      endTime: '23:59',
      athleteId: 'u1',
      status: ArenaBookingWaitlistStatus.waiting,
      arenaName: id == 'futura' ? 'Arena Sol' : 'Arena Velha',
      courtName: 'Quadra 1',
    );

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  test('slotStarted compara data e hora de início', () {
    final now = DateTime(2026, 11, 10, 18);
    expect(
        _entry('x', DateTime(2026, 11, 10), '17:00').slotStarted(now), isTrue);
    expect(
        _entry('x', DateTime(2026, 11, 10), '19:00').slotStarted(now), isFalse);
    expect(
        _entry('x', DateTime(2026, 11, 9), '23:00').slotStarted(now), isTrue);
  });

  testWidgets('esconde horário já começado e sai da lista após confirmar',
      (tester) async {
    final repo = _FakeWaitlistRepository();
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    final yesterday = DateTime.now().subtract(const Duration(days: 1));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          waitlistRepositoryProvider.overrideWithValue(repo),
          myWaitlistStreamProvider.overrideWith(
            (ref) => Stream.value([
              _entry('futura', tomorrow, '08:00'),
              _entry('passada', yesterday, '08:00'),
            ]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: AgendaWaitlistSection()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Arena Sol'), findsOneWidget);
    expect(find.text('Arena Velha'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('waitlist-leave-futura')));
    await tester.pumpAndSettle();
    expect(find.text('Sair da lista de espera?'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('waitlist-leave-confirm')));
    await tester.pumpAndSettle();

    expect(repo.left, ['futura']);
    expect(find.text('Você saiu da lista de espera.'), findsOneWidget);
  });

  testWidgets('"Continuar na lista" não chama o servidor', (tester) async {
    final repo = _FakeWaitlistRepository();
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          waitlistRepositoryProvider.overrideWithValue(repo),
          myWaitlistStreamProvider.overrideWith(
            (ref) => Stream.value([_entry('futura', tomorrow, '08:00')]),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: AgendaWaitlistSection()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('waitlist-leave-futura')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continuar na lista'));
    await tester.pumpAndSettle();
    expect(repo.left, isEmpty);
  });
}
