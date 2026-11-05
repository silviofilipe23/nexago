// Agenda do gestor sem `limit(256)` cego: a consulta das reservas da arena é
// por intervalo de datas. Com mais de 256 reservas antigas, a de hoje sumia.
//
// Não há `fake_cloud_firestore` no projeto: o [BookingService] falso abaixo
// simula as duas consultas (a antiga, que corta em 256 sem olhar a data, e a
// nova, por intervalo) e o teste prova que o provider usa a nova com uma
// janela que cobre hoje e o dia escolhido na grade.
import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_date_utils.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_bookings_window.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/data/courts_repository.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';

class _NoopFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}

class _NoopFunctions implements FirebaseFunctions {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}

ArenaManagerBooking _booking(String id, String dateKey) => ArenaManagerBooking(
      id: id,
      athleteId: 'u-$id',
      courtId: 'q1',
      courtName: 'Quadra 1',
      dateKey: dateKey,
      startTime: '19:00',
      endTime: '20:00',
      data: const <String, dynamic>{'status': 'confirmed'},
    );

/// Simula o Firestore: a consulta antiga devolve os 256 primeiros por ID
/// (as antigas vêm antes da de hoje); a nova filtra por `date`.
class _FakeBookingService extends BookingService {
  _FakeBookingService(this.all)
      : super(_NoopFirestore(), functions: _NoopFunctions());

  final List<ArenaManagerBooking> all;
  final ranges = <({String fromKey, String toKey})>[];

  @override
  Stream<List<ArenaManagerBooking>> watchBookingsForArena(String arenaId) =>
      Stream.value(all.take(256).toList());

  @override
  Stream<List<ArenaManagerBooking>> watchBookingsForArenaInRange(
    String arenaId, {
    required String fromKey,
    required String toKey,
  }) {
    ranges.add((fromKey: fromKey, toKey: toKey));
    return Stream.value([
      for (final b in all)
        if (b.dateKey.compareTo(fromKey) >= 0 && b.dateKey.compareTo(toKey) <= 0)
          b,
    ]);
  }
}

class _FakeCourtsRepository extends CourtsRepository {
  _FakeCourtsRepository() : super(_NoopFirestore());

  @override
  Stream<List<ArenaCourt>> watchCourts(String arenaId) =>
      Stream.value(const <ArenaCourt>[]);
}

void main() {
  group('arenaManagerBookingsWindow', () {
    final today = DateTime(2026, 11, 5);

    test('cobre um mês para trás e dois meses à frente de hoje', () {
      final w = arenaManagerBookingsWindow(today);
      expect(w.fromKey, '2026-10-06');
      expect(w.toKey, '2027-01-04');
    });

    test('dia escolhido na grade fora da janela estica a janela', () {
      final ahead = arenaManagerBookingsWindow(today, focus: DateTime(2027, 3, 1));
      expect(ahead.fromKey, '2026-10-06');
      expect(ahead.toKey, '2027-03-08');

      final back = arenaManagerBookingsWindow(today, focus: DateTime(2026, 6, 10));
      expect(back.fromKey, '2026-06-03');
      expect(back.toKey, '2027-01-04');
    });

    test('dia escolhido dentro da janela não mexe nela', () {
      expect(
        arenaManagerBookingsWindow(today, focus: DateTime(2026, 11, 20)),
        arenaManagerBookingsWindow(today),
      );
    });
  });

  group('arenaManagerBookingsStreamProvider', () {
    late _FakeBookingService service;
    late String todayKey;

    setUp(() {
      todayKey = arenaDateKey(arenaTodayDateOnly());
      service = _FakeBookingService([
        // 300 reservas de mensalista de um ano atrás, IDs antes do de hoje.
        for (var i = 0; i < 300; i++)
          _booking('a${i.toString().padLeft(3, '0')}', '2025-0${1 + i % 9}-10'),
        _booking('z-hoje', todayKey),
      ]);
    });

    ProviderContainer container() {
      final c = ProviderContainer(overrides: [
        bookingServiceProvider.overrideWithValue(service),
        courtsRepositoryProvider.overrideWithValue(_FakeCourtsRepository()),
        managedArenaIdProvider.overrideWithValue(const AsyncValue.data('a1')),
      ]);
      addTearDown(c.dispose);
      return c;
    }

    test('com mais de 256 reservas antigas, a de hoje aparece', () async {
      final c = container();
      final list = await c.read(arenaManagerBookingsStreamProvider.future);
      expect(list.map((b) => b.id), contains('z-hoje'));
      expect(list.where((b) => b.dateKey.startsWith('2025-')), isEmpty);
    });

    test('dia escolhido na grade longe de hoje entra na consulta', () async {
      final c = container();
      final sub = c.listen(arenaManagerBookingsStreamProvider, (_, __) {});
      addTearDown(sub.close);
      await c.read(arenaManagerBookingsStreamProvider.future);

      final far = arenaTodayDateOnly().add(const Duration(days: 200));
      c.read(arenaScheduleSelectedDateProvider.notifier).state = far;
      await c.read(arenaManagerBookingsStreamProvider.future);

      final farKey = arenaDateKey(far);
      expect(service.ranges.last.toKey.compareTo(farKey), greaterThanOrEqualTo(0));
      expect(service.ranges.last.fromKey.compareTo(todayKey), lessThanOrEqualTo(0));
    });
  });
}
