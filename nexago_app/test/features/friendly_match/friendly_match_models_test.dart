import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/friendly_match/domain/friendly_match_models.dart';

void main() {
  final scheduled = DateTime.utc(2026, 7, 20, 18, 30);
  final alt1 = DateTime.utc(2026, 7, 21, 9);
  final alt2 = DateTime.utc(2026, 7, 22, 19);

  Timestamp ts(DateTime d) => Timestamp.fromDate(d);

  Map<String, dynamic> minimalDoc() => {
        'status': 'sent',
        'objective': 'friendly',
        'scheduledAt': ts(scheduled),
      };

  group('FriendlyMatch.fromDoc', () {
    test('parseia doc completo com todos os campos do backend', () {
      final expires = scheduled.subtract(const Duration(hours: 24));
      final checkInOpen = scheduled.subtract(const Duration(minutes: 30));
      final checkInClose = scheduled.add(const Duration(hours: 24));
      final completedAt = scheduled.add(const Duration(hours: 2));
      final revealAt = completedAt.add(const Duration(hours: 72));
      final createdAt = scheduled.subtract(const Duration(days: 3));

      final match = FriendlyMatch.fromDoc('fm1', {
        'fromUid': 'uid_ana',
        'fromName': 'Ana',
        'fromPhotoUrl': 'https://cdn/ana.jpg',
        'toUid': 'uid_bia',
        'toName': 'Bia',
        'toPhotoUrl': 'https://cdn/bia.jpg',
        'sport': 'beach_tennis',
        'objective': 'training',
        'status': 'completed',
        'scheduledAt': ts(scheduled),
        'alternativeTimes': [ts(alt1), ts(alt2)],
        'location': {
          'arenaId': 'arena1',
          'arenaName': 'Arena Sol',
          'freeText': 'Quadra 2',
        },
        'message': 'Bora jogar?',
        'scoreAtSend': 94,
        'expiresAt': ts(expires),
        'counterProposal': {
          'scheduledAt': ts(alt1),
          'alternativeTimes': [ts(alt2)],
          'location': {'freeText': 'Praia Central'},
          'message': 'Pode ser de manhã?',
          'proposedByUid': 'uid_bia',
        },
        'confirmedTime': ts(alt1),
        'checkInOpenAt': ts(checkInOpen),
        'checkInCloseAt': ts(checkInClose),
        'checkIns': {'uid_ana': ts(checkInOpen), 'uid_bia': ts(scheduled)},
        'cancelledByUid': 'uid_ana',
        'cancelPenalized': true,
        'noShowUids': ['uid_ana'],
        'completedAt': ts(completedAt),
        'reviewRevealAt': ts(revealAt),
        'reviewSubmittedUids': ['uid_ana', 'uid_bia'],
        'reviews': {
          'uid_ana': {
            'stars': 5,
            'tags': ['pontual', 'fair_play'],
            'comment': 'Ótimo jogo',
          },
          'uid_bia': {'stars': 4.0},
        },
        'createdAt': ts(createdAt),
      });

      expect(match, isNotNull);
      final m = match!;
      expect(m.id, 'fm1');
      expect(m.fromUid, 'uid_ana');
      expect(m.fromName, 'Ana');
      expect(m.fromPhotoUrl, 'https://cdn/ana.jpg');
      expect(m.toUid, 'uid_bia');
      expect(m.toName, 'Bia');
      expect(m.toPhotoUrl, 'https://cdn/bia.jpg');
      expect(m.sport, 'beach_tennis');
      expect(m.objective, FriendlyMatchObjective.training);
      expect(m.status, FriendlyMatchStatus.completed);
      expect(m.scheduledAt.isAtSameMomentAs(scheduled), isTrue);
      expect(m.alternativeTimes, hasLength(2));
      expect(m.alternativeTimes[0].isAtSameMomentAs(alt1), isTrue);
      expect(m.alternativeTimes[1].isAtSameMomentAs(alt2), isTrue);
      expect(m.location.arenaId, 'arena1');
      expect(m.location.hasArena, isTrue);
      expect(m.location.displayLabel, 'Arena Sol');
      expect(m.message, 'Bora jogar?');
      expect(m.scoreAtSend, 94);
      expect(m.expiresAt!.isAtSameMomentAs(expires), isTrue);

      final counter = m.counterProposal!;
      expect(counter.scheduledAt.isAtSameMomentAs(alt1), isTrue);
      expect(counter.alternativeTimes, hasLength(1));
      expect(counter.alternativeTimes.first.isAtSameMomentAs(alt2), isTrue);
      expect(counter.location!.displayLabel, 'Praia Central');
      expect(counter.message, 'Pode ser de manhã?');
      expect(counter.proposedByUid, 'uid_bia');

      expect(m.confirmedTime!.isAtSameMomentAs(alt1), isTrue);
      expect(m.checkInOpenAt!.isAtSameMomentAs(checkInOpen), isTrue);
      expect(m.checkInCloseAt!.isAtSameMomentAs(checkInClose), isTrue);
      expect(m.checkIns.keys, containsAll(['uid_ana', 'uid_bia']));
      expect(m.checkIns['uid_ana']!.isAtSameMomentAs(checkInOpen), isTrue);
      expect(m.checkIns['uid_bia']!.isAtSameMomentAs(scheduled), isTrue);
      expect(m.cancelledByUid, 'uid_ana');
      expect(m.cancelPenalized, isTrue);
      expect(m.noShowUids, ['uid_ana']);
      expect(m.completedAt!.isAtSameMomentAs(completedAt), isTrue);
      expect(m.reviewRevealAt!.isAtSameMomentAs(revealAt), isTrue);
      expect(m.reviewSubmittedUids, ['uid_ana', 'uid_bia']);
      expect(m.reviews['uid_ana']!.stars, 5);
      expect(m.reviews['uid_ana']!.tags, ['pontual', 'fair_play']);
      expect(m.reviews['uid_ana']!.comment, 'Ótimo jogo');
      expect(m.reviews['uid_bia']!.stars, 4);
      expect(m.reviews['uid_bia']!.tags, isEmpty);
      expect(m.reviews['uid_bia']!.comment, isNull);
      expect(m.createdAt!.isAtSameMomentAs(createdAt), isTrue);
    });

    test('retorna null sem dados ou sem campos obrigatórios válidos', () {
      expect(FriendlyMatch.fromDoc('fm1', null), isNull);
      expect(FriendlyMatch.fromDoc('fm1', minimalDoc()..remove('status')), isNull);
      expect(
        FriendlyMatch.fromDoc('fm1', minimalDoc()..['status'] = 'jogando'),
        isNull,
      );
      expect(
        FriendlyMatch.fromDoc('fm1', minimalDoc()..remove('objective')),
        isNull,
      );
      expect(
        FriendlyMatch.fromDoc('fm1', minimalDoc()..['objective'] = 'ranqueada'),
        isNull,
      );
      expect(
        FriendlyMatch.fromDoc('fm1', minimalDoc()..remove('scheduledAt')),
        isNull,
      );
      expect(
        FriendlyMatch.fromDoc('fm1', minimalDoc()..['scheduledAt'] = '2026-07-20'),
        isNull,
      );
    });

    test('defaults seguros quando os campos opcionais estão ausentes', () {
      final m = FriendlyMatch.fromDoc('fm2', minimalDoc())!;
      expect(m.fromUid, '');
      expect(m.fromName, 'Atleta');
      expect(m.fromPhotoUrl, isNull);
      expect(m.toUid, '');
      expect(m.toName, 'Atleta');
      expect(m.sport, '');
      expect(m.alternativeTimes, isEmpty);
      expect(m.location.hasArena, isFalse);
      expect(m.location.displayLabel, 'Local a combinar');
      expect(m.message, isNull);
      expect(m.scoreAtSend, isNull);
      expect(m.expiresAt, isNull);
      expect(m.counterProposal, isNull);
      expect(m.confirmedTime, isNull);
      expect(m.checkInOpenAt, isNull);
      expect(m.checkInCloseAt, isNull);
      expect(m.checkIns, isEmpty);
      expect(m.cancelledByUid, isNull);
      expect(m.cancelPenalized, isFalse);
      expect(m.noShowUids, isEmpty);
      expect(m.completedAt, isNull);
      expect(m.reviewRevealAt, isNull);
      expect(m.reviewSubmittedUids, isEmpty);
      expect(m.reviews, isEmpty);
      expect(m.createdAt, isNull);
    });

    test('entradas malformadas são descartadas sem quebrar o parse', () {
      final m = FriendlyMatch.fromDoc('fm3', {
        ...minimalDoc(),
        'alternativeTimes': ['amanhã', ts(alt1), 42],
        'checkIns': {'uid_ana': 'agora', 'uid_bia': ts(alt1)},
        'reviews': {
          'uid_ana': {'tags': ['pontual']},
          'uid_bia': 'ótimo',
          'uid_carla': {'stars': 3, 'tags': ['pontual', 7]},
        },
        'noShowUids': [1, 'uid_ana', null],
        'reviewSubmittedUids': ['uid_bia', 99],
        'cancelPenalized': 'true',
        'counterProposal': {'message': 'contraproposta sem horário'},
      })!;

      expect(m.alternativeTimes, hasLength(1));
      expect(m.alternativeTimes.first.isAtSameMomentAs(alt1), isTrue);
      expect(m.checkIns.keys, ['uid_bia']);
      expect(m.reviews.keys, ['uid_carla']);
      expect(m.reviews['uid_carla']!.stars, 3);
      expect(m.reviews['uid_carla']!.tags, ['pontual']);
      expect(m.noShowUids, ['uid_ana']);
      expect(m.reviewSubmittedUids, ['uid_bia']);
      expect(m.cancelPenalized, isFalse);
      expect(m.counterProposal, isNull);
    });
  });

  group('helpers de participante', () {
    FriendlyMatch build({
      FriendlyMatchStatus status = FriendlyMatchStatus.sent,
      Map<String, DateTime> checkIns = const {},
      List<String> reviewSubmittedUids = const [],
    }) {
      return FriendlyMatch(
        id: 'fm',
        fromUid: 'a',
        fromName: 'Ana',
        toUid: 'b',
        toName: 'Bia',
        sport: 'volei_praia',
        objective: FriendlyMatchObjective.partner,
        status: status,
        scheduledAt: scheduled,
        location: const FriendlyMatchLocation(),
        checkIns: checkIns,
        reviewSubmittedUids: reviewSubmittedUids,
      );
    }

    test('otherUid/otherName enxergam o outro lado', () {
      final m = build();
      expect(m.otherUid('a'), 'b');
      expect(m.otherUid('b'), 'a');
      expect(m.otherName('a'), 'Bia');
      expect(m.otherName('b'), 'Ana');
      expect(m.isParticipant('a'), isTrue);
      expect(m.isParticipant('b'), isTrue);
      expect(m.isParticipant('c'), isFalse);
    });

    test('responderUid: destinatário em sent, remetente em countered', () {
      expect(build().responderUid, 'b');
      expect(build(status: FriendlyMatchStatus.countered).responderUid, 'a');
    });

    test('hasCheckedIn e hasReviewed refletem apenas quem registrou', () {
      final m = build(
        checkIns: {'a': scheduled},
        reviewSubmittedUids: ['b'],
      );
      expect(m.hasCheckedIn('a'), isTrue);
      expect(m.hasCheckedIn('b'), isFalse);
      expect(m.hasReviewed('b'), isTrue);
      expect(m.hasReviewed('a'), isFalse);
    });
  });

  group('FriendlyMatchLocation.displayLabel', () {
    test('prioriza arena, cai para texto livre, senão "Local a combinar"', () {
      expect(
        const FriendlyMatchLocation(arenaName: 'Arena Sol', freeText: 'Praia')
            .displayLabel,
        'Arena Sol',
      );
      expect(const FriendlyMatchLocation(freeText: 'Praia').displayLabel, 'Praia');
      expect(
        const FriendlyMatchLocation(arenaName: '', freeText: '').displayLabel,
        'Local a combinar',
      );
      expect(
        FriendlyMatchLocation.fromMap('não é mapa').displayLabel,
        'Local a combinar',
      );
    });
  });

  group('FriendlyMatchConfig.fromMap', () {
    test('null usa os defaults do backend (feature desligada)', () {
      final c = FriendlyMatchConfig.fromMap(null);
      expect(c.enabled, isFalse);
      expect(c.inviteExpirationHours, 24);
      expect(c.cancellationPenaltyWindowHours, 6);
      expect(c.reviewRevealHours, 72);
      expect(c.checkInBeforeMinutes, 30);
      expect(c.checkInAfterHours, 24);
    });

    test('campos inválidos caem individualmente no default', () {
      final c = FriendlyMatchConfig.fromMap({
        'enabled': 'sim',
        'inviteExpirationHours': 0,
        'cancellationPenaltyWindowHours': -3,
        'reviewRevealHours': 'muito',
        'checkInWindow': 'não é mapa',
      });
      expect(c.enabled, isFalse);
      expect(c.inviteExpirationHours, 24);
      expect(c.cancellationPenaltyWindowHours, 6);
      expect(c.reviewRevealHours, 72);
      expect(c.checkInBeforeMinutes, 30);
      expect(c.checkInAfterHours, 24);
    });

    test('NaN e infinito não passam pela validação', () {
      final c = FriendlyMatchConfig.fromMap({
        'inviteExpirationHours': double.nan,
        'reviewRevealHours': double.infinity,
      });
      expect(c.inviteExpirationHours, 24);
      expect(c.reviewRevealHours, 72);
    });

    test('overrides válidos são aplicados (double positivo trunca)', () {
      final c = FriendlyMatchConfig.fromMap({
        'enabled': true,
        'inviteExpirationHours': 48,
        'cancellationPenaltyWindowHours': 12,
        'reviewRevealHours': 96.9,
        'checkInWindow': {'beforeMinutes': 60, 'afterHours': 48},
      });
      expect(c.enabled, isTrue);
      expect(c.inviteExpirationHours, 48);
      expect(c.cancellationPenaltyWindowHours, 12);
      expect(c.reviewRevealHours, 96);
      expect(c.checkInBeforeMinutes, 60);
      expect(c.checkInAfterHours, 48);
    });
  });

  group('tryParse dos enums', () {
    test('status aceita só os valores do Firestore', () {
      expect(FriendlyMatchStatus.tryParse('sent'), FriendlyMatchStatus.sent);
      expect(FriendlyMatchStatus.tryParse('no_show'), FriendlyMatchStatus.noShow);
      expect(FriendlyMatchStatus.tryParse('reviewed'), FriendlyMatchStatus.reviewed);
      expect(FriendlyMatchStatus.tryParse('noShow'), isNull);
      expect(FriendlyMatchStatus.tryParse(''), isNull);
      expect(FriendlyMatchStatus.tryParse(null), isNull);
      expect(FriendlyMatchStatus.tryParse(42), isNull);
    });

    test('objective aceita só os valores do Firestore', () {
      expect(
        FriendlyMatchObjective.tryParse('training'),
        FriendlyMatchObjective.training,
      );
      expect(
        FriendlyMatchObjective.tryParse('friendly'),
        FriendlyMatchObjective.friendly,
      );
      expect(
        FriendlyMatchObjective.tryParse('partner'),
        FriendlyMatchObjective.partner,
      );
      expect(FriendlyMatchObjective.tryParse('ranked'), isNull);
      expect(FriendlyMatchObjective.tryParse(null), isNull);
      expect(FriendlyMatchObjective.tryParse(1), isNull);
    });

    test('isPendingResponse e isTerminal cobrem a máquina de estados', () {
      expect(FriendlyMatchStatus.sent.isPendingResponse, isTrue);
      expect(FriendlyMatchStatus.countered.isPendingResponse, isTrue);
      expect(FriendlyMatchStatus.confirmed.isPendingResponse, isFalse);

      const terminal = {
        FriendlyMatchStatus.declined,
        FriendlyMatchStatus.expired,
        FriendlyMatchStatus.cancelled,
        FriendlyMatchStatus.noShow,
        FriendlyMatchStatus.reviewed,
      };
      for (final status in FriendlyMatchStatus.values) {
        expect(status.isTerminal, terminal.contains(status), reason: '$status');
      }
    });
  });
}
