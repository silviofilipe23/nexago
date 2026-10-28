import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';

/// O plugin `cloud_functions` entrega mapas aninhados como
/// `Map<Object?, Object?>`; o repositório só converte o nível de cima.
Map<String, Object?> _top(Map<Object?, Object?> raw) =>
    raw.map((k, v) => MapEntry(k.toString(), v));

/// Resposta realista de `getMySquad` para um Ambassador do piloto.
Map<Object?, Object?> _getMySquadMember() => <Object?, Object?>{
  'member': <Object?, Object?>{
    'tier': 'amb',
    'tierLabel': 'Ambassador',
    'code': 'JOAO10',
    'status': 'active',
    'pausedUntil': null,
    'endsAt': '2026-11-30',
    'start': '2026-09-08T03:00:00.000Z',
    'end': '2026-12-07T02:59:59.000Z',
    'cycleId': 'piloto',
    'commissionPct': 10,
    'followerDiscountPct': 10,
    'followerDiscountFirstOnly': true,
    'pendingAmendment': <Object?, Object?>{
      'at': '2026-10-15T18:00:00.000Z',
      'package': <Object?, Object?>{
        'tier': 'pro',
        'tierLabel': 'Pro Ambassador',
        'commissionPct': <Object?>[10, 15],
        'followerDiscountPct': 15,
        'registrations': <Object?, Object?>{
          'type': 'freeUnlimited',
          'value': null,
        },
        'kit': 'Kit premium + uniforme',
        'events': 'Prioridade + exclusivos',
        'partnerHalfOff': true,
        'campaignFee': true,
        'tournamentOriginBonusCents': null,
      },
    },
    'earnings': <Object?, Object?>{
      // Número inteiro pode chegar como double pela ponte da plataforma.
      'totalCents': 32400.0,
      'availableCents': 4800,
      'pendingCents': 1500,
      'receivedCents': 18000,
      'revenueCents': 216000,
      'nextPayoutDate': '2026-10-20',
      'minPayoutCents': 2000,
    },
    'conversions': 7,
    'athletes': 9,
    'weekly': <Object?>[
      <Object?, Object?>{'weekStart': '2026-10-06', 'cents': 4800},
      <Object?, Object?>{'weekStart': '2026-10-13', 'cents': 1000},
    ],
    'commissions': <Object?>[
      <Object?, Object?>{
        'id': 'c3',
        'at': '2026-10-14T15:00:00.000Z',
        'label': 'Ana P.',
        'tournamentName': 'Copa Sol',
        'categoryName': 'Fem. B',
        'origin': 'link',
        'amountCents': 1000,
        'status': 'canceled',
        'cancelReason': 'refund',
      },
      <Object?, Object?>{
        'id': 'c1',
        'at': '2026-10-10T15:00:00.000Z',
        'label': 'Lucas M.',
        'tournamentName': 'Open Errejota',
        'categoryName': 'Masc. C',
        'origin': 'code',
        'amountCents': 1200,
        'status': 'released',
        'cancelReason': null,
      },
    ],
    'payouts': <Object?>[
      <Object?, Object?>{
        'id': 'p1',
        'at': '2026-10-12T12:00:00.000Z',
        'amountCents': 18000,
      },
    ],
    'points': <Object?, Object?>{
      'total': 1280,
      'level': 'Gold',
      'levels': <Object?>[
        <Object?, Object?>{'name': 'Bronze', 'min': 0},
        <Object?, Object?>{'name': 'Gold', 'min': 1000},
      ],
      'perConversion': 100,
    },
    'progress': <Object?, Object?>{
      'toTier': 'pro',
      'toTierLabel': 'Pro Ambassador',
      'conversions': 7,
      'minConversions': 12,
      'reviewDate': '2026-12-07T02:59:59.000Z',
    },
    'package': <Object?, Object?>{
      'tier': 'amb',
      'tierLabel': 'Ambassador',
      'commissionPct': 10,
      'followerDiscountPct': 10,
      'registrations': <Object?, Object?>{'type': 'freePerMonth', 'value': 1},
      'kit': 'Kit completo',
      'events': 'Prioridade',
      'partnerHalfOff': false,
      'campaignFee': false,
      'tournamentOriginBonusCents': null,
    },
    'nextPackage': null,
  },
  'invite': null,
};

void main() {
  group('MySquad.fromMap (getMySquad)', () {
    test('membro com Map<Object?, Object?> aninhado em todos os níveis', () {
      final squad = MySquad.fromMap(_top(_getMySquadMember()));
      final m = squad.member!;

      expect(squad.invite, isNull);
      expect(m.tier, SquadTier.amb);
      expect(m.code, 'JOAO10');
      expect(m.paused, isFalse);
      expect(m.pausedUntil, isNull);
      expect(m.endsAt, '2026-11-30');
      expect(m.start, DateTime.utc(2026, 9, 8, 3));
      expect(m.start!.isUtc, isTrue);
      expect(m.end, DateTime.utc(2026, 12, 7, 2, 59, 59));
      expect(m.isPilot, isTrue);
      expect(m.commissionPct, 10);
      expect(m.followerDiscountPct, 10);
      expect(m.followerDiscountFirstOnly, isTrue);
      expect(m.conversions, 7);
      expect(m.athletes, 9);
    });

    test('ganhos (double vira int), semanas, comissões e repasses', () {
      final m = MySquad.fromMap(_top(_getMySquadMember())).member!;

      expect(m.earnings.totalCents, 32400);
      expect(m.earnings.availableCents, 4800);
      expect(m.earnings.pendingCents, 1500);
      expect(m.earnings.receivedCents, 18000);
      expect(m.earnings.revenueCents, 216000);
      expect(m.earnings.nextPayoutDate, '2026-10-20');
      expect(m.earnings.minPayoutCents, 2000);

      expect(m.weekly.map((w) => (w.weekStart, w.cents)), [
        ('2026-10-06', 4800),
        ('2026-10-13', 1000),
      ]);

      final canceled = m.commissions.first;
      expect(canceled.id, 'c3');
      expect(canceled.at, DateTime.utc(2026, 10, 14, 15));
      expect(canceled.label, 'Ana P.');
      expect(canceled.origin, 'link');
      expect(canceled.status, SquadCommissionStatus.canceled);
      expect(canceled.cancelReason, 'refund');
      expect(m.commissions.last.status, SquadCommissionStatus.released);
      expect(m.commissions.last.cancelReason, isNull);

      expect(m.payouts.single.id, 'p1');
      expect(m.payouts.single.amountCents, 18000);
      expect(m.payouts.single.at, DateTime.utc(2026, 10, 12, 12));
    });

    test(
      'pontos, progresso, pacote e aditivo com comissão em faixa [10, 15]',
      () {
        final m = MySquad.fromMap(_top(_getMySquadMember())).member!;

        expect(m.points.total, 1280);
        expect(m.points.level, 'Gold');
        expect(m.points.levels.map((l) => (l.name, l.min)), [
          ('Bronze', 0),
          ('Gold', 1000),
        ]);
        expect(m.points.perConversion, 100);

        final progress = m.progress!;
        expect(progress.toTier, SquadTier.pro);
        expect(progress.remaining, 5);
        expect(progress.fraction, closeTo(7 / 12, 1e-9));
        expect(progress.reviewDate, DateTime.utc(2026, 12, 7, 2, 59, 59));

        expect(m.package.tier, SquadTier.amb);
        expect(m.package.commissionIsRange, isFalse);
        expect(m.package.commissionMin, 10);
        expect(
          m.package.registrationsType,
          SquadRegistrationsType.freePerMonth,
        );
        expect(m.package.registrationsValue, 1);
        expect(m.nextPackage, isNull);

        final amendment = m.pendingAmendment!;
        expect(amendment.at, DateTime.utc(2026, 10, 15, 18));
        expect(amendment.package.tier, SquadTier.pro);
        expect(amendment.package.commissionIsRange, isTrue);
        expect(amendment.package.commissionMin, 10);
        expect(amendment.package.commissionMax, 15);
        expect(
          amendment.package.registrationsType,
          SquadRegistrationsType.freeUnlimited,
        );
        expect(amendment.package.registrationsValue, isNull);
        expect(amendment.package.partnerHalfOff, isTrue);
        expect(amendment.package.campaignFee, isTrue);
        expect(amendment.package.tournamentOriginBonusCents, isNull);
      },
    );

    test(
      'contrato pausado lê a data de retorno; ciclo regular não é piloto',
      () {
        final raw = _getMySquadMember();
        final member = Map<Object?, Object?>.from(raw['member']! as Map)
          ..['status'] = 'paused'
          ..['pausedUntil'] = '2026-11-03'
          ..['endsAt'] = ''
          ..['cycleId'] = '2026-2';

        final m = MySquad.fromMap({'member': member}).member!;

        expect(m.paused, isTrue);
        expect(m.pausedUntil, '2026-11-03');
        // Texto vazio é ausência, não uma data.
        expect(m.endsAt, isNull);
        expect(m.isPilot, isFalse);
      },
    );

    test('sem contrato e com convite em aberto: member null + invite', () {
      final squad = MySquad.fromMap(
        _top(<Object?, Object?>{
          'member': null,
          'invite': <Object?, Object?>{
            'id': 'inv-1',
            'tier': 'pro',
            'tierLabel': 'Pro Ambassador',
            'expiresAt': '2026-10-24T03:00:00.000Z',
          },
        }),
      );

      expect(squad.member, isNull);
      expect(squad.invite!.id, 'inv-1');
      expect(squad.invite!.tier, SquadTier.pro);
      expect(squad.invite!.expiresAt, DateTime.utc(2026, 10, 24, 3));
    });

    test('nada (nem contrato nem convite) e payload vazio', () {
      final none = MySquad.fromMap({'member': null, 'invite': null});
      final empty = MySquad.fromMap(const {});

      for (final squad in [none, empty]) {
        expect(squad.member, isNull);
        expect(squad.invite, isNull);
      }
    });

    test(
      'leitura defensiva: campos ausentes ou de tipo errado não derrubam',
      () {
        final m = SquadMember.fromMap(const {
          'tier': 'xyz',
          'code': 123,
          'earnings': 'oops',
          'weekly': [1, 'dois', null],
          'commissions': null,
          'points': {'levels': 'nada'},
        });

        expect(m.tier, SquadTier.ath);
        expect(m.code, '');
        expect(m.earnings.totalCents, 0);
        expect(m.weekly, isEmpty);
        expect(m.commissions, isEmpty);
        expect(m.points.levels, isEmpty);
        expect(m.progress, isNull);
        expect(m.pendingAmendment, isNull);
        expect(m.start, isNull);
        // Ausente vale como "só na 1ª inscrição" (o padrão do programa).
        expect(m.followerDiscountFirstOnly, isTrue);
      },
    );
  });

  group('SquadPackage.fromMap', () {
    test('commissionPct em lista [10, 15] vira faixa; número vira exato', () {
      final range = SquadPackage.fromMap({
        'commissionPct': <Object?>[10, 15],
      });
      final exact = SquadPackage.fromMap(const {'commissionPct': 12.5});

      expect(range.commissionIsRange, isTrue);
      expect((range.commissionMin, range.commissionMax), (10, 15));
      expect(exact.commissionIsRange, isFalse);
      expect((exact.commissionMin, exact.commissionMax), (12.5, 12.5));
    });

    test('tipo de inscrição desconhecido cai em desconto; tier desconhecido em '
        'Athlete', () {
      final pkg = SquadPackage.fromMap(const {
        'tier': '??',
        'registrations': {'type': 'outro', 'value': 30},
      });

      expect(pkg.tier, SquadTier.ath);
      expect(pkg.registrationsType, SquadRegistrationsType.discount);
      expect(pkg.registrationsValue, 30);
    });

    test('bônus do Captain em centavos', () {
      final pkg = SquadPackage.fromMap(const {
        'tier': 'cap',
        'tournamentOriginBonusCents': 5000,
      });

      expect(pkg.tier, SquadTier.cap);
      expect(pkg.tournamentOriginBonusCents, 5000);
    });
  });

  group('SquadTier', () {
    test('rótulos dos quatro níveis', () {
      expect(SquadTier.values.map((t) => t.label), [
        'Athlete',
        'Ambassador',
        'Pro Ambassador',
        'Captain',
      ]);
    });
  });

  group('SquadProgress', () {
    test('remaining nunca negativo e fraction limitada a 1', () {
      const passed = SquadProgress(
        toTier: SquadTier.pro,
        conversions: 15,
        minConversions: 12,
        reviewDate: null,
      );
      const noGoal = SquadProgress(
        toTier: SquadTier.pro,
        conversions: 0,
        minConversions: 0,
        reviewDate: null,
      );

      expect(passed.remaining, 0);
      expect(passed.fraction, 1);
      expect(noGoal.remaining, 0);
      expect(noGoal.fraction, 1);
    });
  });

  group('SquadRanking.fromMap (getSquadRanking)', () {
    test('entradas, eu, nível e faixas; delta null = entrou na semana', () {
      final ranking = SquadRanking.fromMap(
        _top(<Object?, Object?>{
          'entries': <Object?>[
            <Object?, Object?>{
              'position': 1,
              'name': 'Marina Costa',
              'photoUrl': 'https://cdn.nexago.com.br/marina.jpg',
              'points': 2400,
              'delta': 0,
              'me': false,
            },
            <Object?, Object?>{
              'position': 2,
              'name': 'Caio Lima',
              'photoUrl': '',
              'points': 600,
              'delta': null,
              'me': false,
            },
          ],
          'me': <Object?, Object?>{
            'position': 14,
            'name': 'João Victor',
            'photoUrl': null,
            'points': 300,
            'delta': -2,
            'me': true,
          },
          'level': 'Bronze',
          'levels': <Object?>[
            <Object?, Object?>{'name': 'Bronze', 'min': 0},
          ],
        }),
      );

      expect(ranking.entries, hasLength(2));
      expect(ranking.entries.first.photoUrl, isNotNull);
      expect(ranking.entries.first.delta, 0);
      // Foto vazia é ausência; delta null = novo na semana.
      expect(ranking.entries.last.photoUrl, isNull);
      expect(ranking.entries.last.delta, isNull);
      expect(ranking.me!.position, 14);
      expect(ranking.me!.me, isTrue);
      expect(ranking.me!.delta, -2);
      expect(ranking.level, 'Bronze');
      expect(ranking.levels.single.name, 'Bronze');
    });

    test('fora do ranking: me null', () {
      final ranking = SquadRanking.fromMap(const {'entries': [], 'me': null});

      expect(ranking.entries, isEmpty);
      expect(ranking.me, isNull);
    });
  });

  group('SquadInvite.fromMap (viewSquadInvite)', () {
    Map<String, Object?> invite(Map<String, Object?> extra) => _top({
      'id': 'inv-1',
      'status': 'opened',
      'package': <Object?, Object?>{
        'tier': 'pro',
        'commissionPct': <Object?>[10, 15],
        'registrations': <Object?, Object?>{'type': 'freeUnlimited'},
      },
      'suggestedCode': 'JOAO10',
      'periodStart': '2026-09-08',
      'periodEnd': '2026-12-06',
      'message': 'Bem-vindo ao time!',
      'expiresAt': '2026-10-24T03:00:00.000Z',
      'firstName': 'João',
      'tournaments': 12.0,
      'followerDiscountFirstOnly': false,
      ...extra,
    });

    test('convite aberto com pacote em faixa e os textos do time', () {
      final i = SquadInvite.fromMap(invite(const {}));

      expect(i.id, 'inv-1');
      expect(i.isOpen, isTrue);
      expect(i.package.tier, SquadTier.pro);
      expect(i.package.commissionIsRange, isTrue);
      expect(i.suggestedCode, 'JOAO10');
      expect(i.periodEnd, '2026-12-06');
      expect(i.message, 'Bem-vindo ao time!');
      expect(i.expiresAt, DateTime.utc(2026, 10, 24, 3));
      expect(i.firstName, 'João');
      expect(i.tournaments, 12);
      expect(i.followerDiscountFirstOnly, isFalse);
    });

    test('só sent e opened estão abertos', () {
      bool open(String status) =>
          SquadInvite.fromMap(invite({'status': status})).isOpen;

      expect(open('sent'), isTrue);
      expect(open('opened'), isTrue);
      for (final status in ['accepted', 'expired', 'canceled', 'scheduled']) {
        expect(open(status), isFalse, reason: status);
      }
    });

    test('recado vazio e torneios ausentes viram null', () {
      final i = SquadInvite.fromMap(
        invite(const {'message': '   ', 'tournaments': null}),
      );

      expect(i.message, isNull);
      expect(i.tournaments, isNull);
    });
  });

  group('SquadCodeCheck.fromMap (checkSquadCode)', () {
    test('código digitado não é indicação por link', () {
      final check = SquadCodeCheck.fromMap(
        _top(<Object?, Object?>{
          'ambassadorName': 'João Victor',
          'code': 'JOAO10',
          'origin': 'code',
          'discountPct': 10,
          'feePercent': 8,
        }),
      );

      expect(check.ambassadorName, 'João Victor');
      expect(check.code, 'JOAO10');
      expect(check.discountPct, 10);
      expect(check.feePercent, 8);
      expect(check.viaLink, isFalse);
    });

    test('link e QR são indicação por link', () {
      for (final origin in ['link', 'qr']) {
        final check = SquadCodeCheck.fromMap({
          'code': 'JOAO10',
          'origin': origin,
          'discountPct': 10,
        });
        expect(check.viaLink, isTrue, reason: origin);
      }
    });

    test('sem indicação: tudo null, desconto 0 e sem teto', () {
      final check = SquadCodeCheck.fromMap(const {
        'ambassadorName': null,
        'code': null,
        'origin': null,
        'discountPct': 0,
        'feePercent': null,
      });

      expect(check.code, isNull);
      expect(check.origin, isNull);
      expect(check.discountPct, 0);
      expect(check.feePercent, isNull);
      expect(check.viaLink, isFalse);
      expect(SquadCodeCheck.none.viaLink, isFalse);
    });
  });

  group('SquadOwnPerk (ownPerk do checkSquadCode)', () {
    test('backend antigo, sem o campo: nenhum benefício', () {
      expect(SquadCodeCheck.fromMap(const {}).ownPerk, isNull);
      expect(SquadCodeCheck.none.ownPerk, isNull);
      expect(
        SquadCodeCheck.fromMap(const {'ownPerk': null}).ownPerk,
        isNull,
      );
    });

    test('desconto: % na própria parcela', () {
      final perk = SquadCodeCheck.fromMap(const {
        'ownPerk': {'type': 'discount', 'pct': 15},
      }).ownPerk!;
      expect(perk.isFree, isFalse);
      expect(perk.isDiscount, isTrue);
      expect(perk.pct, 15);
    });

    test('desconto zerado ou tipo desconhecido vira nenhum', () {
      expect(
        SquadOwnPerk.fromRaw(const {'type': 'discount', 'pct': 0}),
        isNull,
      );
      expect(SquadOwnPerk.fromRaw(const {'type': 'outro'}), isNull);
      expect(SquadOwnPerk.fromRaw('free'), isNull);
    });

    test('grátis com teto: disponível e quantas restam', () {
      final perk = SquadOwnPerk.fromRaw(const {
        'type': 'free',
        'available': true,
        'remaining': 2,
      })!;
      expect(perk.isFree, isTrue);
      expect(perk.isDiscount, isFalse);
      expect(perk.available, isTrue);
      expect(perk.remaining, 2);
    });

    test('grátis ilimitado: remaining null (teto oculto)', () {
      final perk = SquadOwnPerk.fromRaw(const {
        'type': 'free',
        'available': true,
        'remaining': null,
      })!;
      expect(perk.available, isTrue);
      expect(perk.remaining, isNull);
    });

    test('grátis esgotado: available false', () {
      final perk = SquadOwnPerk.fromRaw(const {
        'type': 'free',
        'available': false,
        'remaining': 0,
      })!;
      expect(perk.available, isFalse);
    });
  });
}
