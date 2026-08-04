import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_peak_rule.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/slots_page_logic.dart';

// Quarta 05/08/2026; "agora" às 10:00 do mesmo dia.
final qua = DateTime(2026, 8, 5);
final nowCedo = DateTime(2026, 8, 5, 10, 0);

ArenaPeakRule rule({
  String id = 'r1',
  int minDurationMinutes = 120,
  int? releaseHoursBefore,
  List<int> weekdays = const [],
  List<String> courtIds = const [],
}) {
  return ArenaPeakRule(
    id: id, active: true, label: 'Pico noturno',
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

  test('regras sobrepostas: vale o maior mínimo', () {
    final grade4 = [
      slot('18:00', '19:00'),
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00'),
    ];
    final r = peakCheckForRange(
      rules: [rule(), rule(id: 'r2', minDurationMinutes: 180)],
      courtId: 'q1', slots: grade4, selectedDay: qua,
      start: 2, end: 2, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 3);
    expect(r.rule?.id, 'r2');
  });

  test('cadeia assimétrica: uma vizinha livre basta para manter a exigência', () {
    final parcial = [
      slot('19:00', '20:00', status: 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00'),
    ];
    final r = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: parcial, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 2);
  });

  test('slot de 30min: mínimo de 120min exige 4 slots', () {
    final meia = [
      slot('19:00', '19:30'),
      slot('19:30', '20:00'),
      slot('20:00', '20:30'),
      slot('20:30', '21:00'),
      slot('21:00', '21:30'),
      slot('21:30', '22:00'),
    ];
    final avulso = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: meia, selectedDay: qua,
      start: 2, end: 2, slotDurationMinutes: 30, now: nowCedo,
    );
    expect(avulso.minSlots, 4);

    final completo = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: meia, selectedDay: qua,
      start: 0, end: 3, slotDurationMinutes: 30, now: nowCedo,
    );
    expect(completo.minSlots, 1); // 19h-21h já cumpre o mínimo
  });

  test('minimumChainContaining prefere a cadeia que começa na seleção', () {
    final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];
    final chain = minimumChainContaining(
      slots: grade, selectionStart: 1, selectionEnd: 1, minSlots: 2,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain?.start, 1);
    expect(chain?.end, 2);
  });

  test('minimumChainContaining recua quando a cadeia para frente não existe', () {
    final grade = [
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'booked'),
    ];
    final chain = minimumChainContaining(
      slots: grade, selectionStart: 1, selectionEnd: 1, minSlots: 2,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain?.start, 0);
    expect(chain?.end, 1);
  });

  test('minimumChainContaining devolve null sem cadeia possível', () {
    final cercado = [
      slot('19:00', '20:00', status: 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'blocked'),
    ];
    final chain = minimumChainContaining(
      slots: cercado, selectionStart: 1, selectionEnd: 1, minSlots: 2,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain, isNull);
  });

  test('minimumChainContaining engloba todo o intervalo selecionado', () {
    final grade = [
      slot('18:00', '19:00'), slot('19:00', '20:00'),
      slot('20:00', '21:00'), slot('21:00', '22:00'),
    ];
    final chain = minimumChainContaining(
      slots: grade, selectionStart: 1, selectionEnd: 2, minSlots: 3,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain?.start, 1);
    expect(chain?.end, 3);
  });

  test(
      'minimumChainContaining recua além da tentativa ancorada e ainda '
      'cobre selectionEnd', () {
    final grade = [
      slot('18:00', '19:00'),
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'booked'),
      slot('22:00', '23:00'),
    ];
    final chain = minimumChainContaining(
      slots: grade, selectionStart: 1, selectionEnd: 2, minSlots: 3,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain?.start, 0);
    expect(chain?.end, 2);
  });

  test(
      'minimumChainContaining devolve null quando minSlots é menor que o '
      'comprimento da seleção', () {
    final grade = [
      slot('15:00', '16:00'),
      slot('16:00', '17:00'),
      slot('17:00', '18:00'),
      slot('18:00', '19:00'),
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
    ];
    final chain = minimumChainContaining(
      slots: grade, selectionStart: 2, selectionEnd: 5, minSlots: 2,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain, isNull);
  });

  test('peakPromptForSelection abre no slot de pico restrito', () {
    final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];
    final prompt = peakPromptForSelection(
      rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNotNull);
    expect(prompt!.minSlots, 2);
    expect(prompt.start, 1);
    expect(prompt.end, 2);
    expect(prompt.rule.id, 'r1');
  });

  test('peakPromptForSelection não abre quando a seleção já cumpre o mínimo', () {
    final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];
    final prompt = peakPromptForSelection(
      rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 0, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNull);
  });

  test('peakPromptForSelection não abre em slot liberado', () {
    final cercado = [
      slot('19:00', '20:00', status: 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'blocked'),
    ];
    final prompt = peakPromptForSelection(
      rules: [rule()], courtId: 'q1', slots: cercado, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNull);
  });

  test('peakPromptForSelection não abre sem regra', () {
    final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];
    final prompt = peakPromptForSelection(
      rules: const [], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNull);
  });
}
