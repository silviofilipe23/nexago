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

  test('minimumChainContaining não devolve janela que deixa selectionEnd de fora', () {
    // Gap de horário entre os índices 4 e 5 (22:00 ≠ 23:00): a única janela de
    // 4 slots contígua e disponível é [2..5], mas ela quebra em 4→5 e falha;
    // uma fórmula que ignorasse selectionEnd chegaria em [1..4], que não cobre
    // selectionEnd = 5.
    final grade = [
      slot('17:00', '18:00'),
      slot('18:00', '19:00'),
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00'),
      slot('23:00', '00:00'),
    ];
    final chain = minimumChainContaining(
      slots: grade, selectionStart: 3, selectionEnd: 5, minSlots: 4,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain, isNull);
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

  test(
      'peakPromptForSelection expande (fixpoint) quando a cadeia oferecida cai '
      'na faixa de outra regra com mínimo maior', () {
    // r1 20:00–21:00 mín 2h vizinha de r2 21:00–22:00 mín 3h: a cadeia de 2
    // slots que satisfaz r1 (20:00–22:00) ainda viola r2, que exige 3
    // (20:00–23:00).
    final grade = [
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00'),
      slot('22:00', '23:00'),
    ];
    final r1 = rule(id: 'r1', minDurationMinutes: 120);
    final r2 = ArenaPeakRule(
      id: 'r2', active: true, label: 'Pico noturno',
      courtIds: const [], weekdays: const [],
      startTime: '21:00', endTime: '22:00',
      minDurationMinutes: 180, releaseHoursBefore: null,
    );
    final prompt = peakPromptForSelection(
      rules: [r1, r2], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNotNull);
    expect(prompt!.start, 1);
    expect(prompt.end, 3);
    expect(prompt.minSlots, 3);
    expect(prompt.rule.id, 'r2');
  });

  test(
      'peakPromptForSelection devolve null quando a expansão para a segunda '
      'regra é impossível (vizinha ocupada, sem recuo)', () {
    // Grade começa no próprio slot tocado (sem recuo possível) e a vizinha
    // que fecharia o mínimo de r1 já está ocupada: nem a primeira cadeia
    // existe.
    final grade = [
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'booked'),
    ];
    final r1 = rule(id: 'r1', minDurationMinutes: 120);
    final r2 = ArenaPeakRule(
      id: 'r2', active: true, label: 'Pico noturno',
      courtIds: const [], weekdays: const [],
      startTime: '21:00', endTime: '22:00',
      minDurationMinutes: 180, releaseHoursBefore: null,
    );
    final prompt = peakPromptForSelection(
      rules: [r1, r2], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 0, end: 0, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNull);
  });
}
