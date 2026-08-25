import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_uniform_selection.dart';

/// O que já está gravado na inscrição manda na tela. Sem isso o app abria o
/// cartão de uniforme nos padrões (M/10/sobrenome) mesmo para quem escolheu GG
/// pelo portal web — e salvar de novo apagava a escolha real.
void main() {
  const defaults = TournamentUniformSelection(
    sizeTop: 'M',
    sizeShorts: 'M',
    jerseyNumber: 10,
    jerseyName: 'Silva',
  );

  group('hydrateUniformSelection', () {
    test('sem nada gravado, valem os padrões', () {
      final result = hydrateUniformSelection(stored: null, defaults: defaults);

      expect(result.sizeTop, 'M');
      expect(result.sizeShorts, 'M');
      expect(result.jerseyNumber, 10);
      expect(result.jerseyName, 'Silva');
    });

    test('slot vazio equivale a nada gravado', () {
      final result = hydrateUniformSelection(
        stored: const TournamentUniformSelection(),
        defaults: defaults,
      );

      expect(result.sizeTop, 'M');
      expect(result.jerseyNumber, 10);
    });

    test('o que está gravado ganha do padrão', () {
      final result = hydrateUniformSelection(
        stored: const TournamentUniformSelection(
          sizeTop: 'GG',
          sizeShorts: 'G',
          jerseyNumber: 7,
          jerseyName: 'Bia',
        ),
        defaults: defaults,
      );

      expect(result.sizeTop, 'GG');
      expect(result.sizeShorts, 'G');
      expect(result.jerseyNumber, 7);
      expect(result.jerseyName, 'Bia');
    });

    // Gravação parcial acontece: o app cria a vaga com `uniform: null` e o
    // atleta pode ter salvo só parte pelo web. Cada campo cai no padrão por
    // conta própria, em vez de o slot inteiro ser descartado.
    test('gravação parcial completa com o padrão campo a campo', () {
      final result = hydrateUniformSelection(
        stored: const TournamentUniformSelection(sizeTop: 'GG'),
        defaults: defaults,
      );

      expect(result.sizeTop, 'GG');
      expect(result.sizeShorts, 'M');
      expect(result.jerseyNumber, 10);
      expect(result.jerseyName, 'Silva');
    });

    test('nome em branco não sobrescreve o padrão', () {
      final result = hydrateUniformSelection(
        stored: const TournamentUniformSelection(sizeTop: 'GG', jerseyName: '  '),
        defaults: defaults,
      );

      expect(result.jerseyName, 'Silva');
    });

    // Número 0 é escolha válida e não pode ser lido como "vazio".
    test('camisa 0 é preservada', () {
      final result = hydrateUniformSelection(
        stored: const TournamentUniformSelection(jerseyNumber: 0),
        defaults: defaults,
      );

      expect(result.jerseyNumber, 0);
    });
  });

  // Três caminhos do backend criam a inscrição de jeitos diferentes; a regra de
  // qual slot é "o meu" mora numa função só, usada pela lista de inscrições e
  // pela tela de inscrição.
  group('uniformSlotFor', () {
    const p1 = TournamentUniformSelection(sizeTop: 'P');
    const p2 = TournamentUniformSelection(sizeTop: 'GG');

    test('titular pelo player1Id', () {
      expect(
        uniformSlotFor(
          uid: 'a',
          player1Id: 'a',
          participantUids: const ['a', 'b'],
          uniformPlayer1: p1,
          uniformPlayer2: p2,
        ).sizeTop,
        'P',
      );
    });

    test('parceiro cai no slot 2', () {
      expect(
        uniformSlotFor(
          uid: 'b',
          player1Id: 'a',
          participantUids: const ['a', 'b'],
          uniformPlayer1: p1,
          uniformPlayer2: p2,
        ).sizeTop,
        'GG',
      );
    });

    // Aceite sem solo prévio grava participantUids e nenhum player1Id.
    test('sem player1Id, o primeiro participante é o slot 1', () {
      expect(
        uniformSlotFor(
          uid: 'a',
          participantUids: const ['a', 'b'],
          uniformPlayer1: p1,
          uniformPlayer2: p2,
        ).sizeTop,
        'P',
      );
    });

    test('categoria de equipe lê uniformByUid', () {
      expect(
        uniformSlotFor(
          uid: 'c',
          teamSize: 4,
          uniformByUid: const {'c': TournamentUniformSelection(sizeTop: 'XGG')},
          uniformPlayer1: p1,
        ).sizeTop,
        'XGG',
      );
    });

    test('atleta sem slot devolve seleção vazia', () {
      expect(
        uniformSlotFor(uid: 'z', teamSize: 4, uniformByUid: const {}).sizeTop,
        isNull,
      );
    });
  });

  group('TournamentRegistrationSnapshot uniformFor', () {
    // Shape REAL gravado pelo backend na dupla: campos ACHATADOS
    // (`sizeTopPlayer1`, `jerseyNumberPlayer1`, …), nunca um mapa
    // `uniformPlayer1` — ver `registrationUniformForSlot` em
    // `functions/src/tournament-partner-invite.ts`. Confirmado no dev: a
    // inscrição criada por `registerSoloTournament` + `setRegistrationUniform`
    // sai com `sizeTopPlayer1: "G"` e nenhum campo `uniformPlayer1`.
    test('lê o slot do titular dos campos achatados que o backend grava', () {
      final snap = TournamentRegistrationSnapshot.fromDoc('reg-1', {
        'player1Id': 'a',
        'participantUids': ['a', 'b'],
        'sizeTopPlayer1': 'G',
        'jerseyNumberPlayer1': 7,
        'sizeShortsPlayer1': 'M',
        'jerseyNamePlayer1': 'Ana',
        'sizeTopPlayer2': 'M',
        'jerseyNumberPlayer2': 3,
      });

      expect(snap.uniformFor('a').sizeTop, 'G');
      expect(snap.uniformFor('a').jerseyNumber, 7);
      expect(snap.uniformFor('a').sizeShorts, 'M');
      expect(snap.uniformFor('a').jerseyName, 'Ana');
      expect(snap.uniformFor('b').sizeTop, 'M');
      expect(snap.uniformFor('b').jerseyNumber, 3);
    });

    test('lê o slot do titular do doc da inscrição', () {
      final snap = TournamentRegistrationSnapshot.fromDoc('reg-1', {
        'player1Id': 'a',
        'participantUids': ['a', 'b'],
        'uniformPlayer1': {'sizeTop': 'GG', 'jerseyNumber': 7},
        'uniformPlayer2': {'sizeTop': 'P'},
      });

      expect(snap.uniformFor('a').sizeTop, 'GG');
      expect(snap.uniformFor('a').jerseyNumber, 7);
      expect(snap.uniformFor('b').sizeTop, 'P');
    });

    test('lê o slot da equipe por uid', () {
      final snap = TournamentRegistrationSnapshot.fromDoc('reg-1', {
        'teamSize': 4,
        'participantUids': ['a', 'c'],
        'uniformByUid': {
          'c': {'sizeTop': 'XGG'},
        },
      });

      expect(snap.uniformFor('c').sizeTop, 'XGG');
      expect(snap.uniformFor('a').sizeTop, isNull);
    });

    test('inscrição sem uniforme nenhum devolve seleção vazia', () {
      final snap = TournamentRegistrationSnapshot.fromDoc('reg-1', {
        'player1Id': 'a',
      });

      expect(snap.uniformFor('a').sizeTop, isNull);
      expect(snap.uniformFor('a').jerseyNumber, isNull);
    });
  });
}
