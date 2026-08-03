import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_peak_rule.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/slots_page_logic.dart';

// Quarta 05/08/2026; "agora" às 10:00 do mesmo dia.
final qua = DateTime(2026, 8, 5);
final nowCedo = DateTime(2026, 8, 5, 10, 0);

ArenaPeakRule rule({
  int minDurationMinutes = 120,
  int? releaseHoursBefore,
  List<int> weekdays = const [],
  List<String> courtIds = const [],
}) {
  return ArenaPeakRule(
    id: 'r1', active: true, label: 'Pico noturno',
    courtIds: courtIds, weekdays: weekdays,
    startTime: '20:00', endTime: '21:00',
    minDurationMinutes: minDurationMinutes,
    releaseHoursBefore: releaseHoursBefore,
  );
}

// Alinhado ao construtor real de ArenaSlot (ver arena_slot.dart e
// slots_page_logic_test.dart): date=qua, startTime/endTime e rawStatus.
ArenaSlot slot(String start, String end, {String status = 'available'}) {
  return ArenaSlot(
    id: 'q1_$start',
    arenaId: 'arena1',
    courtId: 'q1',
    date: qua,
    startTime: start,
    endTime: end,
    rawStatus: status,
    priceReais: 100,
  );
}

void main() {
  final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];

  test('sem regra: minSlots 1', () {
    final r = peakCheckForRange(
      rules: const [], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 1);
  });

  test('20h avulsa com vizinhas livres exige 2 slots', () {
    final r = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 2);
  });

  test('seleção 19h-21h cumpre o mínimo (sem exigência pendente)', () {
    final r = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 0, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 1); // seleção já cumpre o mínimo → nada pendente
  });

  test('vizinhas ocupadas liberam o avulso', () {
    final cercado = [
      slot('19:00', '20:00', status: 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'blocked'),
    ];
    final r = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: cercado, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 1);
  });

  test('janela de liberação 3h antes', () {
    final dentro = DateTime(2026, 8, 5, 17, 30);
    final fora = DateTime(2026, 8, 5, 16, 59);
    final liberado = peakCheckForRange(
      rules: [rule(releaseHoursBefore: 3)], courtId: 'q1', slots: grade,
      selectedDay: qua, start: 1, end: 1, slotDurationMinutes: 60, now: dentro,
    );
    final bloqueado = peakCheckForRange(
      rules: [rule(releaseHoursBefore: 3)], courtId: 'q1', slots: grade,
      selectedDay: qua, start: 1, end: 1, slotDurationMinutes: 60, now: fora,
    );
    expect(liberado.minSlots, 1);
    expect(bloqueado.minSlots, 2);
  });

  test('vizinha no passado não sustenta cadeia', () {
    final tarde = DateTime(2026, 8, 5, 19, 30);
    final soFrente = [
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'booked'),
    ];
    final r = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: soFrente, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: tarde,
    );
    expect(r.minSlots, 1);
  });

  test('badge devolve mínimo para o chip', () {
    expect(
      peakBadgeMinSlots(
        rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
        index: 1, slotDurationMinutes: 60, now: nowCedo,
      ),
      2,
    );
  });
}
