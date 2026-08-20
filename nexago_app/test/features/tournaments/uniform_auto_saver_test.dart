import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_uniform_selection.dart';
import 'package:nexago_app/features/tournaments/domain/uniform_auto_saver.dart';

/// Sem botão: a escolha do uniforme grava sozinha, como no portal do atleta.
void main() {
  const a = TournamentUniformSelection(sizeTop: 'M', jerseyNumber: 10);
  const b = TournamentUniformSelection(sizeTop: 'GG', jerseyNumber: 7);

  late List<TournamentUniformSelection> saved;
  late List<UniformSaveState> states;
  late Completer<void>? pending;

  UniformAutoSaver build({bool failFirst = false}) {
    saved = [];
    states = [];
    pending = null;
    var failures = failFirst ? 1 : 0;
    return UniformAutoSaver(
      debounce: const Duration(milliseconds: 10),
      save: (value) async {
        saved.add(value);
        if (failures > 0) {
          failures--;
          throw StateError('falhou');
        }
        final completer = Completer<void>();
        pending = completer;
        completer.complete();
        return completer.future;
      },
      onStateChange: states.add,
    );
  }

  test('escolher grava sozinho, depois do debounce', () async {
    final saver = build();
    addTearDown(saver.dispose);

    saver.schedule(a);
    expect(saved, isEmpty, reason: 'não grava a cada tecla');

    await Future<void>.delayed(const Duration(milliseconds: 30));

    expect(saved, [a]);
    expect(states.last, UniformSaveState.saved);
  });

  test('mudanças seguidas gravam só a última', () async {
    final saver = build();
    addTearDown(saver.dispose);

    saver.schedule(a);
    saver.schedule(b);
    await Future<void>.delayed(const Duration(milliseconds: 30));

    expect(saved, [b]);
  });

  // Meia escolha não vira gravação — e nem vira erro enquanto o atleta ainda
  // está decidindo.
  test('cancelPending desiste da gravação agendada', () async {
    final saver = build();
    addTearDown(saver.dispose);

    saver.schedule(a);
    saver.cancelPending();
    await Future<void>.delayed(const Duration(milliseconds: 30));

    expect(saved, isEmpty);
    expect(states.last, UniformSaveState.idle);
  });

  test('gravar o mesmo valor de novo não repete a chamada', () async {
    final saver = build();
    addTearDown(saver.dispose);

    saver.schedule(a);
    await Future<void>.delayed(const Duration(milliseconds: 30));
    saver.schedule(a);
    await Future<void>.delayed(const Duration(milliseconds: 30));

    expect(saved, [a]);
  });

  test('markSaved semeia o valor já gravado sem chamar o servidor', () async {
    final saver = build();
    addTearDown(saver.dispose);

    saver.markSaved(a);
    saver.schedule(a);
    await Future<void>.delayed(const Duration(milliseconds: 30));

    expect(saved, isEmpty);
    expect(states.last, UniformSaveState.saved);
  });

  test('falha acende o estado de erro e retry regrava', () async {
    final saver = build(failFirst: true);
    addTearDown(saver.dispose);

    saver.saveNow(a);
    await Future<void>.delayed(const Duration(milliseconds: 10));
    expect(states.last, UniformSaveState.failed);

    saver.retry();
    await Future<void>.delayed(const Duration(milliseconds: 10));

    expect(saved, [a, a]);
    expect(states.last, UniformSaveState.saved);
  });

  test('retry sem nada pendente não faz nada', () async {
    final saver = build();
    addTearDown(saver.dispose);

    saver.retry();
    await Future<void>.delayed(const Duration(milliseconds: 20));

    expect(saved, isEmpty);
  });

  // Trocar de categoria zera o estado: o que estava gravado não vale para a
  // categoria nova.
  test('reset limpa o valor semeado', () async {
    final saver = build();
    addTearDown(saver.dispose);

    saver.markSaved(a);
    saver.reset();
    saver.schedule(a);
    await Future<void>.delayed(const Duration(milliseconds: 30));

    expect(saved, [a]);
  });

  test('dispose cancela o que estava agendado', () async {
    final saver = build();

    saver.schedule(a);
    saver.dispose();
    await Future<void>.delayed(const Duration(milliseconds: 30));

    expect(saved, isEmpty);
  });
}
