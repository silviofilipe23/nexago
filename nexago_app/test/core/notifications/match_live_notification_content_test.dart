import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/match_live_notification_content.dart';

/// Espelha o `data` que `buildMatchLiveMessages` monta em
/// `functions/src/match-live-follow-notify.ts` — todos os valores em string,
/// como o FCM exige.
Map<String, dynamic> payload({
  String type = 'match_live_score',
  String action = 'score',
  String matchId = 'm1',
  String teamA = 'Ana / Bia',
  String teamB = 'Carla / Dani',
  String scoreLine = '20 x 15',
  String setsLine = '1 x 0',
  String statusLabel = 'Set 2',
  String courtName = 'Quadra 3',
  String pointAlertSide = '',
  String pointAlertClosesMatch = 'false',
  String? updatedAt,
}) {
  return <String, dynamic>{
    'type': type,
    'action': action,
    'matchId': matchId,
    'tournamentId': 't1',
    'teamA': teamA,
    'teamB': teamB,
    'scoreLine': scoreLine,
    'setsLine': setsLine,
    'statusLabel': statusLabel,
    'courtName': courtName,
    'pointAlertSide': pointAlertSide,
    'pointAlertClosesMatch': pointAlertClosesMatch,
    'updatedAt': updatedAt ?? '0',
    'url': '/torneios/t1/ao-vivo/m1',
  };
}

/// `updatedAt` a [secondsAgo] de [now], no formato que chega do FCM.
String updatedAtSecondsAgo(DateTime now, int secondsAgo) {
  return now
      .subtract(Duration(seconds: secondsAgo))
      .millisecondsSinceEpoch
      .toString();
}

void main() {
  final now = DateTime.utc(2026, 10, 24, 15, 30);

  group('matchLiveNotificationContentFrom', () {
    test('ignora notificação que não é de placar ao vivo', () {
      // Não pode sequestrar convite, lembrete de reserva ou qualquer outra.
      final content = matchLiveNotificationContentFrom(
        payload(type: 'friendly_match_invite'),
        now: now,
      );

      expect(content, isNull);
    });

    test('ignora payload sem matchId', () {
      final content = matchLiveNotificationContentFrom(
        payload(matchId: ''),
        now: now,
      );

      expect(content, isNull);
    });

    test('ignora ação desconhecida em vez de adivinhar', () {
      final content = matchLiveNotificationContentFrom(
        payload(action: 'algo_novo_do_servidor'),
        now: now,
      );

      expect(content, isNull);
    });

    test('título traz as duas duplas', () {
      final content = matchLiveNotificationContentFrom(payload(), now: now);

      expect(content!.title, 'Ana / Bia x Carla / Dani');
    });

    test('corpo usa o placar que veio do servidor, sem recalcular', () {
      final content = matchLiveNotificationContentFrom(payload(), now: now);

      expect(content!.body, contains('20 x 15'));
      expect(content.body, contains('1 x 0'));
      expect(content.body, contains('Set 2'));
    });
  });

  group('id da notificação', () {
    test('é estável para a mesma partida', () {
      final first = matchLiveNotificationContentFrom(payload(), now: now)!;
      final second = matchLiveNotificationContentFrom(
        payload(scoreLine: '21 x 15'),
        now: now,
      )!;

      // Mesmo id => o push seguinte SUBSTITUI a notificação em vez de empilhar.
      expect(first.notificationId, second.notificationId);
    });

    test('difere entre partidas', () {
      final a = matchLiveNotificationContentFrom(payload(), now: now)!;
      final b = matchLiveNotificationContentFrom(
        payload(matchId: 'm2'),
        now: now,
      )!;

      expect(a.notificationId, isNot(b.notificationId));
    });

    test('é positivo e cabe em 32 bits, como o Android exige', () {
      final content = matchLiveNotificationContentFrom(
        payload(matchId: 'partida-com-id-bem-comprido-123456'),
        now: now,
      )!;

      expect(content.notificationId, greaterThanOrEqualTo(0));
      expect(content.notificationId, lessThanOrEqualTo(0x7fffffff));
    });

    test('o alerta transitório usa id próprio e não derruba a fixa', () {
      final content = matchLiveNotificationContentFrom(payload(), now: now)!;

      expect(content.alertNotificationId, isNot(content.notificationId));
      expect(content.alertNotificationId, greaterThanOrEqualTo(0));
    });
  });

  group('quando vibra', () {
    test('ponto comum atualiza calado', () {
      final content = matchLiveNotificationContentFrom(
        payload(action: 'score'),
        now: now,
      )!;

      expect(content.alerts, isFalse);
    });

    test('derrubar a notificação não alerta', () {
      final content = matchLiveNotificationContentFrom(
        payload(action: 'dismiss'),
        now: now,
      )!;

      expect(content.alerts, isFalse);
    });

    test('momento-chave alerta', () {
      for (final action in ['start', 'set', 'matchPoint', 'end']) {
        final content = matchLiveNotificationContentFrom(
          payload(action: action),
          now: now,
        )!;

        expect(content.alerts, isTrue, reason: action);
      }
    });
  });

  group('match point', () {
    test('nomeia a dupla e diz que fecha a partida', () {
      final content = matchLiveNotificationContentFrom(
        payload(
          action: 'matchPoint',
          pointAlertSide: 'A',
          pointAlertClosesMatch: 'true',
        ),
        now: now,
      )!;

      expect(content.body, contains('Match point'));
      expect(content.body, contains('Ana / Bia'));
    });

    test('set point não vira match point', () {
      final content = matchLiveNotificationContentFrom(
        payload(
          action: 'matchPoint',
          pointAlertSide: 'B',
          pointAlertClosesMatch: 'false',
        ),
        now: now,
      )!;

      expect(content.body, contains('Set point'));
      expect(content.body, contains('Carla / Dani'));
      expect(content.body, isNot(contains('Match point')));
    });
  });

  group('freshnessSuffix', () {
    test('placar recente não ganha rótulo', () {
      expect(freshnessSuffix(now.subtract(const Duration(seconds: 5)), now), '');
      expect(
        freshnessSuffix(now.subtract(const Duration(seconds: 20)), now),
        '',
      );
    });

    test('a fronteira é exatamente 60s', () {
      expect(
        freshnessSuffix(now.subtract(const Duration(seconds: 59)), now),
        '',
      );
      expect(
        freshnessSuffix(now.subtract(const Duration(seconds: 60)), now),
        'há 1min',
      );
    });

    test('minutos arredondam para baixo', () {
      expect(
        freshnessSuffix(now.subtract(const Duration(seconds: 90)), now),
        'há 1min',
      );
      expect(
        freshnessSuffix(now.subtract(const Duration(minutes: 7)), now),
        'há 7min',
      );
    });

    test('acima de uma hora muda de unidade', () {
      expect(
        freshnessSuffix(now.subtract(const Duration(minutes: 65)), now),
        'há 1h',
      );
    });

    test('relógio adiantado não vira rótulo negativo', () {
      // O `updatedAt` vem do servidor; o relógio do aparelho pode estar atrás.
      expect(freshnessSuffix(now.add(const Duration(minutes: 5)), now), '');
    });
  });

  group('frescor no corpo', () {
    test('placar velho avisa que está velho em vez de mentir', () {
      final content = matchLiveNotificationContentFrom(
        payload(updatedAt: updatedAtSecondsAgo(now, 180)),
        now: now,
      )!;

      expect(content.body, contains('há 3min'));
    });

    test('placar fresco não polui o corpo', () {
      final content = matchLiveNotificationContentFrom(
        payload(updatedAt: updatedAtSecondsAgo(now, 5)),
        now: now,
      )!;

      expect(content.body, isNot(contains('há ')));
    });

    test('resultado final não envelhece', () {
      // Partida encerrada não fica "desatualizada" — o placar é definitivo.
      final content = matchLiveNotificationContentFrom(
        payload(action: 'end', updatedAt: updatedAtSecondsAgo(now, 3600)),
        now: now,
      )!;

      expect(content.body, isNot(contains('há ')));
    });
  });
}
