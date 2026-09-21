import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_medical_timeout_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_medical_timeout.dart';

/// Espelhados em `live-scoring.spec.ts` (mesas web): a contagem do atendimento é DERIVADA do
/// carimbo do servidor, então app, mesas web e telão mostram sempre o mesmo número.
void main() {
  MatchMedicalTimeout timeout({
    DateTime? startedAt,
    int durationSec = medicalTimeoutSeconds,
  }) {
    return MatchMedicalTimeout(
      side: 'A',
      teamId: 'time-a',
      playerSlot: 1,
      playerName: 'Bruno',
      startedAt: startedAt,
      durationSec: durationSec,
      setIndex: 0,
    );
  }

  group('MatchMedicalTimeoutLogic.remainingSeconds', () {
    final started = DateTime.utc(2026, 9, 21, 10);

    test('conta pra trás a partir do carimbo do servidor', () {
      expect(
        MatchMedicalTimeoutLogic.remainingSeconds(
          timeout(startedAt: started),
          started,
        ),
        300,
      );
      expect(
        MatchMedicalTimeoutLogic.remainingSeconds(
          timeout(startedAt: started),
          started.add(const Duration(seconds: 90)),
        ),
        210,
      );
    });

    test('não passa de zero, nem quando a tela fica aberta depois do fim', () {
      expect(
        MatchMedicalTimeoutLogic.remainingSeconds(
          timeout(startedAt: started),
          started.add(const Duration(minutes: 9)),
        ),
        0,
      );
      expect(
        MatchMedicalTimeoutLogic.isEnded(
          timeout(startedAt: started),
          started.add(const Duration(minutes: 9)),
        ),
        isTrue,
      );
    });

    test('sem carimbo mostra o tempo CHEIO — zero pareceria encerrado', () {
      expect(
        MatchMedicalTimeoutLogic.remainingSeconds(timeout(), DateTime.now()),
        300,
      );
    });
  });

  group('cota por atleta', () {
    test('a chave identifica o atleta pela posição na dupla', () {
      expect(MatchMedicalTimeoutLogic.playerKey('A', 2), 'A2');
      expect(MatchMedicalTimeoutLogic.hasUsed(const ['A2'], 'A', 2), isTrue);
      expect(MatchMedicalTimeoutLogic.hasUsed(const ['A2'], 'A', 1), isFalse);
      expect(MatchMedicalTimeoutLogic.hasUsed(const ['A2'], 'B', 2), isFalse);
    });

    test('nega o segundo do mesmo atleta e qualquer um com outro em andamento', () {
      expect(
        MatchMedicalTimeoutLogic.canRequest(
          usedKeys: const [],
          active: null,
          side: 'A',
          slot: 1,
        ),
        isTrue,
      );
      expect(
        MatchMedicalTimeoutLogic.canRequest(
          usedKeys: const ['A1'],
          active: null,
          side: 'A',
          slot: 1,
        ),
        isFalse,
      );
      expect(
        MatchMedicalTimeoutLogic.canRequest(
          usedKeys: const [],
          active: timeout(startedAt: DateTime.now()),
          side: 'B',
          slot: 2,
        ),
        isFalse,
      );
      expect(
        MatchMedicalTimeoutLogic.canRequest(
          usedKeys: const [],
          active: null,
          side: 'A',
          slot: 0,
        ),
        isFalse,
      );
    });

    test('a lista do doc só aceita as quatro chaves válidas', () {
      expect(
        medicalTimeoutPlayerKeysFromRaw(const ['A1', 'b2', 'C3', 42, 'A']),
        const ['A1', 'B2'],
      );
      expect(medicalTimeoutPlayerKeysFromRaw('A1'), isEmpty);
    });
  });

  group('MatchMedicalTimeoutLogic.formatMmSs', () {
    test('formata a contagem do overlay', () {
      expect(MatchMedicalTimeoutLogic.formatMmSs(300), '05:00');
      expect(MatchMedicalTimeoutLogic.formatMmSs(59), '00:59');
      expect(MatchMedicalTimeoutLogic.formatMmSs(-5), '00:00');
    });
  });

  group('MatchMedicalTimeout.fromMap', () {
    test('lê o atendimento gravado', () {
      final parsed = MatchMedicalTimeout.fromMap(const {
        'side': 'b',
        'teamId': 'time-b',
        'playerSlot': 2,
        'playerName': 'Lucas',
        'durationSec': 300,
        'setIndex': 1,
      });
      expect(parsed, isNotNull);
      expect(parsed!.side, 'B');
      expect(parsed.playerSlot, 2);
      expect(parsed.playerName, 'Lucas');
      expect(parsed.setIndex, 1);
    });

    test('recusa mapa sem lado ou sem posição — não dá pra saber quem é', () {
      expect(MatchMedicalTimeout.fromMap(const {'playerSlot': 1}), isNull);
      expect(MatchMedicalTimeout.fromMap(const {'side': 'A'}), isNull);
      expect(
        MatchMedicalTimeout.fromMap(const {'side': 'A', 'playerSlot': 3}),
        isNull,
      );
    });

    test('duração ausente cai nos 5 minutos da regra', () {
      final parsed = MatchMedicalTimeout.fromMap(const {
        'side': 'A',
        'playerSlot': 1,
      });
      expect(parsed?.durationSec, medicalTimeoutSeconds);
    });
  });
}
