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

  // Gravação lenta (cold start, ou a segunda tentativa por conexão nova)
  // enquanto o atleta segue digitando o nome: sem fila, "SIL" e "SILVIO"
  // viajavam juntos e o que chegasse POR ÚLTIMO no servidor ficava — às vezes
  // o nome pela metade.
  group('uma gravação por vez', () {
    const sil = TournamentUniformSelection(sizeTop: 'M', jerseyName: 'SIL');
    const silv = TournamentUniformSelection(sizeTop: 'M', jerseyName: 'SILV');
    const silvio =
        TournamentUniformSelection(sizeTop: 'M', jerseyName: 'SILVIO');

    late List<TournamentUniformSelection> started;
    late List<Completer<void>> inFlight;
    late List<UniformSaveState> seen;

    UniformAutoSaver buildSlow() {
      started = [];
      inFlight = [];
      seen = [];
      return UniformAutoSaver(
        debounce: const Duration(milliseconds: 5),
        save: (value) {
          started.add(value);
          final completer = Completer<void>();
          inFlight.add(completer);
          return completer.future;
        },
        onStateChange: seen.add,
      );
    }

    Future<void> settle() =>
        Future<void>.delayed(const Duration(milliseconds: 20));

    test('nova escolha espera a gravação em voo; só a última vai depois',
        () async {
      final saver = buildSlow();
      addTearDown(saver.dispose);

      saver.schedule(sil);
      await settle();
      expect(started, [sil]);

      saver.schedule(silv);
      await settle();
      saver.schedule(silvio);
      await settle();
      expect(started, [sil], reason: 'nada sai enquanto uma está no ar');

      inFlight.single.complete();
      await settle();

      expect(started, [sil, silvio], reason: 'SILV ficou para trás');
      expect(seen.last, UniformSaveState.saving);

      inFlight.last.complete();
      await settle();
      expect(seen.last, UniformSaveState.saved);
    });

    test('voltar ao valor em voo não regrava depois que ele confirma',
        () async {
      final saver = buildSlow();
      addTearDown(saver.dispose);

      saver.schedule(sil);
      await settle();
      saver.schedule(silvio);
      saver.schedule(sil);
      await settle();

      inFlight.single.complete();
      await settle();

      expect(started, [sil]);
      expect(seen.last, UniformSaveState.saved);
    });

    test('falha da gravação velha com uma nova na fila: tenta a nova',
        () async {
      final saver = buildSlow();
      addTearDown(saver.dispose);

      saver.schedule(sil);
      await settle();
      saver.schedule(silvio);
      await settle();

      inFlight.single.completeError(StateError('sem rede'));
      await settle();
      expect(started, [sil, silvio]);

      inFlight.last.complete();
      await settle();
      expect(seen.last, UniformSaveState.saved);
    });

    // "Salvar e continuar" grava por fora do autosave: precisa esperar o que
    // está no ar, senão o valor velho pode chegar DEPOIS do confirmado.
    test('whenIdle espera a gravação em voo (e a fila) terminar', () async {
      final saver = buildSlow();
      addTearDown(saver.dispose);

      saver.schedule(sil);
      await settle();
      saver.schedule(silvio);
      await settle();

      var idle = false;
      unawaited(saver.whenIdle().then((_) => idle = true));
      await settle();
      expect(idle, isFalse);

      inFlight.first.complete();
      await settle();
      expect(idle, isFalse, reason: 'SILVIO ainda está gravando');

      inFlight.last.complete();
      await settle();
      expect(idle, isTrue);
    });

    test('whenIdle sem nada no ar resolve na hora', () async {
      final saver = buildSlow();
      addTearDown(saver.dispose);

      await saver.whenIdle().timeout(const Duration(milliseconds: 50));
    });

    test('saveNow com gravação em voo também entra na fila', () async {
      final saver = buildSlow();
      addTearDown(saver.dispose);

      saver.saveNow(sil);
      await settle();
      saver.saveNow(silvio);
      await settle();
      expect(started, [sil]);

      inFlight.single.complete();
      await settle();
      expect(started, [sil, silvio]);
    });
  });

  test('dispose cancela o que estava agendado', () async {
    final saver = build();

    saver.schedule(a);
    saver.dispose();
    await Future<void>.delayed(const Duration(milliseconds: 30));

    expect(saved, isEmpty);
  });
}
