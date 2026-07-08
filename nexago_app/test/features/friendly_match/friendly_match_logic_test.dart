import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/friendly_match/domain/friendly_match_logic.dart';
import 'package:nexago_app/features/friendly_match/domain/friendly_match_models.dart';

void main() {
  final now = DateTime.utc(2026, 7, 10, 12);
  final gameTime = now.add(const Duration(hours: 48));

  FriendlyMatch match({
    FriendlyMatchStatus status = FriendlyMatchStatus.sent,
    DateTime? scheduledAt,
    DateTime? expiresAt,
    DateTime? checkInOpenAt,
    DateTime? checkInCloseAt,
    Map<String, DateTime> checkIns = const {},
    List<String> reviewSubmittedUids = const [],
  }) {
    return FriendlyMatch(
      id: 'm1',
      fromUid: 'a',
      fromName: 'Ana',
      toUid: 'b',
      toName: 'Bia',
      sport: 'volei_praia',
      objective: FriendlyMatchObjective.friendly,
      status: status,
      scheduledAt: scheduledAt ?? gameTime,
      location: const FriendlyMatchLocation(freeText: 'Praia'),
      expiresAt: expiresAt,
      checkInOpenAt: checkInOpenAt,
      checkInCloseAt: checkInCloseAt,
      checkIns: checkIns,
      reviewSubmittedUids: reviewSubmittedUids,
    );
  }

  group('isClientExpired', () {
    test('convite pendente vencido expira na UI antes do sweeper', () {
      final m = match(expiresAt: now.subtract(const Duration(minutes: 1)));
      expect(isClientExpired(m, now), isTrue);
    });

    test('dentro do prazo ou já respondido não expira', () {
      expect(
        isClientExpired(match(expiresAt: now.add(const Duration(hours: 1))), now),
        isFalse,
      );
      expect(
        isClientExpired(
          match(
            status: FriendlyMatchStatus.confirmed,
            expiresAt: now.subtract(const Duration(hours: 1)),
          ),
          now,
        ),
        isFalse,
      );
    });
  });

  group('checkInWindowState', () {
    final open = gameTime.subtract(const Duration(minutes: 30));
    final close = gameTime.add(const Duration(hours: 24));

    test('antes, dentro e depois da janela', () {
      final m = match(
        status: FriendlyMatchStatus.confirmed,
        checkInOpenAt: open,
        checkInCloseAt: close,
      );
      expect(
        checkInWindowState(m, open.subtract(const Duration(minutes: 1))),
        FriendlyMatchCheckInWindow.notOpen,
      );
      expect(checkInWindowState(m, gameTime), FriendlyMatchCheckInWindow.open);
      expect(
        checkInWindowState(m, close.add(const Duration(minutes: 1))),
        FriendlyMatchCheckInWindow.closed,
      );
    });
  });

  group('cancellationIsPenalized', () {
    const config = FriendlyMatchConfig.defaults;

    test('com mais de 6h de antecedência não penaliza; dentro penaliza', () {
      final m = match(status: FriendlyMatchStatus.confirmed);
      expect(
        cancellationIsPenalized(m, config, gameTime.subtract(const Duration(hours: 7))),
        isFalse,
      );
      expect(
        cancellationIsPenalized(m, config, gameTime.subtract(const Duration(hours: 5))),
        isTrue,
      );
    });
  });

  group('nextActionFor', () {
    test('convite sent: destinatário responde, remetente aguarda', () {
      final m = match(expiresAt: now.add(const Duration(hours: 12)));
      expect(nextActionFor('b', m, now), FriendlyMatchNextAction.respond);
      expect(nextActionFor('a', m, now), FriendlyMatchNextAction.waitingResponse);
    });

    test('contraproposta inverte quem responde', () {
      final m = match(
        status: FriendlyMatchStatus.countered,
        expiresAt: now.add(const Duration(hours: 12)),
      );
      expect(nextActionFor('a', m, now), FriendlyMatchNextAction.respond);
      expect(nextActionFor('b', m, now), FriendlyMatchNextAction.waitingResponse);
    });

    test('pendente vencido mostra expirado para ambos', () {
      final m = match(expiresAt: now.subtract(const Duration(hours: 1)));
      expect(nextActionFor('a', m, now), FriendlyMatchNextAction.expired);
      expect(nextActionFor('b', m, now), FriendlyMatchNextAction.expired);
    });

    test('confirmado: aguarda janela, faz check-in, aguarda o outro', () {
      final m = match(
        status: FriendlyMatchStatus.confirmed,
        checkInOpenAt: gameTime.subtract(const Duration(minutes: 30)),
        checkInCloseAt: gameTime.add(const Duration(hours: 24)),
      );
      expect(nextActionFor('a', m, now), FriendlyMatchNextAction.waitingCheckInWindow);
      expect(nextActionFor('a', m, gameTime), FriendlyMatchNextAction.checkInAvailable);
      final checked = match(
        status: FriendlyMatchStatus.confirmed,
        checkInOpenAt: gameTime.subtract(const Duration(minutes: 30)),
        checkInCloseAt: gameTime.add(const Duration(hours: 24)),
        checkIns: {'a': gameTime},
      );
      expect(
        nextActionFor('a', checked, gameTime),
        FriendlyMatchNextAction.checkInWaitingOther,
      );
      expect(
        nextActionFor('b', checked, gameTime),
        FriendlyMatchNextAction.checkInAvailable,
      );
    });

    test('realizado: avalia ou aguarda a avaliação do outro', () {
      final m = match(status: FriendlyMatchStatus.completed);
      expect(nextActionFor('a', m, now), FriendlyMatchNextAction.review);
      final submitted = match(
        status: FriendlyMatchStatus.completed,
        reviewSubmittedUids: ['a'],
      );
      expect(
        nextActionFor('a', submitted, now),
        FriendlyMatchNextAction.reviewWaitingOther,
      );
      expect(nextActionFor('b', submitted, now), FriendlyMatchNextAction.review);
    });

    test('estados terminais não pedem ação', () {
      for (final status in [
        FriendlyMatchStatus.declined,
        FriendlyMatchStatus.cancelled,
        FriendlyMatchStatus.expired,
        FriendlyMatchStatus.noShow,
        FriendlyMatchStatus.reviewed,
      ]) {
        expect(
          nextActionFor('a', match(status: status), now),
          FriendlyMatchNextAction.finished,
        );
      }
    });
  });

  group('compatibilityLabel', () {
    test('formata o score congelado; nulo fica nulo', () {
      expect(compatibilityLabel(94), '94% compatível');
      expect(compatibilityLabel(null), isNull);
    });
  });
}
