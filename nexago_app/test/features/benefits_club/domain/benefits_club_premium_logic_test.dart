import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_logic.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_premium_logic.dart';
import 'package:nexago_app/features/benefits_club/domain/my_benefits.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';

final _now = DateTime(2026, 11, 16, 12);

Partner _p(
  String id, {
  String name = 'Parceiro',
  double priority = 0,
  DateTime? startsAt,
  DateTime? validUntil,
  DateTime? createdAt,
  bool featured = false,
  List<PartnerPlacement> placements = const [],
  List<PartnerLocation> locations = const [],
  PartnerRequirement requirement = PartnerRequirement.none,
  String? requirementLabel,
  PartnerCategory category = PartnerCategory.other,
  String highlight = '',
  String title = '',
}) => Partner(
  id: id,
  name: name,
  priority: priority,
  active: true,
  startsAt: startsAt,
  validUntil: validUntil,
  createdAt: createdAt,
  featured: featured,
  placements: placements,
  locations: locations,
  requirement: requirement,
  requirementLabel: requirementLabel,
  category: category,
  benefitHighlight: highlight,
  benefitTitle: title,
);

PartnerLocation _at(double lat, double lng) => PartnerLocation(
  name: 'Loja',
  address: 'Rua',
  latitude: lat,
  longitude: lng,
);

void main() {
  group('validade', () {
    test('antes de startsAt e a partir de validUntil o parceiro some', () {
      final visible = visiblePartners(
        [
          _p('ok'),
          _p('cedo', startsAt: _now.add(const Duration(minutes: 1))),
          _p('comecou', startsAt: _now),
          _p('acabou', validUntil: _now),
          _p('acaba', validUntil: _now.add(const Duration(minutes: 1))),
        ],
        tester: false,
        now: _now,
      );
      expect(visible.map((p) => p.id), ['acaba', 'comecou', 'ok']);
    });

    test('selo "Termina": hoje, 1 dia, N dias e nada fora de 7 dias', () {
      String? badge(Duration d) =>
          endingBadge(_p('x', validUntil: _now.add(d)), _now);
      expect(badge(const Duration(hours: 5)), 'Termina hoje');
      expect(badge(const Duration(days: 1)), 'Termina em 1 dia');
      expect(badge(const Duration(days: 3)), 'Termina em 3 dias');
      expect(badge(const Duration(days: 7)), 'Termina em 7 dias');
      expect(badge(const Duration(days: 8)), isNull);
      expect(endingBadge(_p('sem'), _now), isNull);
      expect(endingBadge(_p('vencido', validUntil: _now), _now), isNull);
    });

    test('"Novo" nos primeiros 14 dias de createdAt', () {
      bool isNew(Duration ago) =>
          isNewPartner(_p('x', createdAt: _now.subtract(ago)), _now);
      expect(isNew(const Duration(days: 1)), isTrue);
      expect(isNew(const Duration(days: 13, hours: 23)), isTrue);
      expect(isNew(const Duration(days: 14)), isFalse);
      expect(isNewPartner(_p('sem'), _now), isFalse);
    });
  });

  test('destaque da semana: o featured de maior prioridade', () {
    final visible = visiblePartners(
      [
        _p('a', featured: true, priority: 1),
        _p('b', featured: true, priority: 5),
        _p('c', priority: 9),
      ],
      tester: false,
      now: _now,
    );
    expect(featuredPartner(visible)?.id, 'b');
    expect(featuredPartner([_p('c')]), isNull);
  });

  group('momento do jogo', () {
    test('maior prioridade com o placement e sem requisito', () {
      final visible = visiblePartners(
        [
          _p('dia', placements: [PartnerPlacement.tournamentDay], priority: 9),
          _p('pos1', placements: [PartnerPlacement.postGame], priority: 1),
          _p('pos5', placements: [PartnerPlacement.postGame], priority: 5),
          _p(
            'squad',
            placements: [PartnerPlacement.postGame],
            priority: 50,
            requirement: const PartnerRequirement(
              type: PartnerRequirementType.squad,
            ),
          ),
        ],
        tester: false,
        now: _now,
      );
      expect(gameMomentPartner(visible, PartnerPlacement.postGame)?.id, 'pos5');
      expect(
        gameMomentPartner(visible, PartnerPlacement.tournamentDay)?.id,
        'dia',
      );
      expect(gameMomentPartner(const [], PartnerPlacement.postGame), isNull);
    });

    test('título e linha', () {
      final food = _p(
        'f',
        name: 'Fast Açaí',
        category: PartnerCategory.food,
        highlight: '10% OFF',
      );
      expect(gameMomentTitle(food), 'Bateu a fome?');
      expect(gameMomentLine(food), '10% OFF na Fast Açaí');
      final other = _p('o', name: 'Loja', title: 'Brinde');
      expect(gameMomentTitle(other), 'Vantagem do clube');
      expect(gameMomentLine(other), 'Brinde na Loja');
    });
  });

  group('busca', () {
    final acai = _p(
      'a',
      name: 'Fast Açaí',
      category: PartnerCategory.food,
      highlight: '10% OFF',
      title: 'Desconto em todo pedido',
    );
    test('nome, categoria e benefício, sem acento e sem caixa', () {
      expect(partnerMatchesQuery(acai, 'acai'), isTrue);
      expect(partnerMatchesQuery(acai, 'ALIMENTACAO'), isTrue);
      expect(partnerMatchesQuery(acai, '10%'), isTrue);
      expect(partnerMatchesQuery(acai, 'fast pedido'), isTrue);
      expect(partnerMatchesQuery(acai, 'fast pizza'), isFalse);
      expect(partnerMatchesQuery(acai, '   '), isTrue);
    });

    test('8+ parceiros liga a descoberta', () {
      expect(discoveryEnabled(7), isFalse);
      expect(discoveryEnabled(benefitsDiscoveryMinPartners), isTrue);
    });
  });

  group('distância', () {
    test('a unidade mais perto e a ordenação (sem unidade no fim)', () {
      final far = _p('far', priority: 9, locations: [_at(-16.80, -49.25)]);
      final near = _p(
        'near',
        locations: [_at(-15.0, -47.0), _at(-16.69, -49.25)],
      );
      final none = _p('none', priority: 20);
      expect(nearestDistanceKm(none, -16.68, -49.25), isNull);
      expect(nearestDistanceKm(near, -16.68, -49.25), lessThan(2));
      expect(
        sortByDistance([none, far, near], -16.68, -49.25).map((p) => p.id),
        ['near', 'far', 'none'],
      );
    });

    test('formato: metros, uma casa e inteiro', () {
      expect(formatDistanceKm(0.85), '850 m');
      expect(formatDistanceKm(1.24), '1,2 km');
      expect(formatDistanceKm(12.4), '12 km');
    });
  });

  group('cupom na URL', () {
    test('acrescenta &<param>=<cupom> só com os dois', () {
      expect(
        trackedPartnerUrl(
          'https://fast.example/c?loja=1',
          'NEXA-ABCD',
          couponParam: 'cupom',
          coupon: 'NEXAGO10',
        ),
        'https://fast.example/c?loja=1&utm_source=nexago&utm_medium=app'
        '&utm_campaign=clube_vantagens&ref=NEXA-ABCD&cupom=NEXAGO10',
      );
      expect(
        trackedPartnerUrl('https://f.example', 'NEXA-ABCD', couponParam: 'c'),
        isNot(contains('&c=')),
      );
      expect(
        trackedPartnerUrl('https://f.example', 'NEXA-ABCD', coupon: 'ZZ9'),
        isNot(contains('ZZ9')),
      );
    });
  });

  group('bloqueio por requisito', () {
    const squad = PartnerRequirement(type: PartnerRequirementType.squad);
    test('sem requisito nunca bloqueia; com requisito, só quem é elegível', () {
      expect(isPartnerLocked(_p('a'), null), isFalse);
      expect(isPartnerLocked(_p('s', requirement: squad), null), isTrue);
      expect(isPartnerLocked(_p('s', requirement: squad), {'outro'}), isTrue);
      expect(isPartnerLocked(_p('s', requirement: squad), {'s'}), isFalse);
    });

    test('frase: o label do parceiro ou o padrão por tipo', () {
      expect(
        requirementText(
          _p('s', requirement: squad, requirementLabel: 'Só VIP'),
        ),
        'Só VIP',
      );
      expect(
        requirementText(_p('s', requirement: squad)),
        'Exclusivo para embaixadores do Squad.',
      );
      expect(
        requirementText(
          _p(
            't',
            requirement: const PartnerRequirement(
              type: PartnerRequirementType.tournament,
              tournamentIds: ['t1'],
            ),
          ),
        ),
        'Exclusivo para inscritos do torneio.',
      );
      expect(
        requirementText(
          _p(
            'l',
            requirement: const PartnerRequirement(
              type: PartnerRequirementType.minLevel,
              minLevel: 'intermediario_2',
            ),
          ),
        ),
        'Exclusivo para atletas a partir do nível Intermediário 2.',
      );
    });
  });

  group('textos', () {
    test('membro desde, nível e iniciais', () {
      expect(memberSinceLabel(DateTime(2025, 3, 2)), 'Membro desde mar/2025');
      expect(
        memberSportLevelLabel(sport: 'Beach Tennis', level: 'Iniciante 2'),
        'Beach Tennis · Iniciante 2',
      );
      expect(memberSportLevelLabel(sport: 'Vôlei', level: ''), 'Vôlei');
      expect(memberInitials('Marina Costa Lima'), 'ML');
      expect(memberInitials(''), '?');
    });

    test('uso, resposta e economia', () {
      final use = BenefitUse(
        partnerId: 'a',
        useCount: 1,
        lastUsedAt: DateTime(2026, 11, 5),
      );
      expect(
        benefitUseLabel(use, isLead: false),
        'Usado 1 vez · último em 05/11',
      );
      expect(benefitUseLabel(use, isLead: true), 'Contato enviado em 05/11');
      expect(benefitAnswerLabel(BenefitUseAnswer.used), 'Deu certo');
      expect(benefitAnswerLabel(BenefitUseAnswer.notUsed), 'Não deu certo');
      expect(benefitAnswerLabel(null), 'Sem resposta');
      expect(savingsCountLabel(1), 'em 1 resgate confirmado');
    });

    test('pergunta pendente: cupom e "ontem"', () {
      final partner = _p('a', name: 'Fast Açaí');
      expect(
        pendingQuestionSubtitle(
          partner: partner,
          coupon: 'NEXAGO10',
          lastUsedAt: _now.subtract(const Duration(days: 1)),
          now: _now,
        ),
        'Você usou o cupom NEXAGO10 ontem. Sua resposta ajuda a manter no '
        'clube só o que funciona.',
      );
      expect(
        pendingQuestionSubtitle(partner: partner, now: _now),
        startsWith('Você abriu o benefício da Fast Açaí.'),
      );
    });

    test('usos visíveis, mais recente primeiro', () {
      final uses = visibleUses(
        [
          BenefitUse(partnerId: 'a', useCount: 1, lastUsedAt: DateTime(2026)),
          BenefitUse(
            partnerId: 'b',
            useCount: 2,
            lastUsedAt: DateTime(2026, 5),
          ),
          const BenefitUse(partnerId: 'c', useCount: 1),
          const BenefitUse(partnerId: 'a0'),
        ],
        {'a', 'b', 'a0'},
      );
      expect(uses.map((u) => u.partnerId), ['b', 'a']);
    });
  });

  group('leitura do Firestore', () {
    test('campos v2 do parceiro, tolerante a lixo', () {
      final p = Partner.fromFirestore('x', {
        'name': 'X',
        'coverUrl': 'https://cdn.example/c.jpg',
        'startsAt': Timestamp.fromDate(DateTime(2026, 11, 1)),
        'validUntil': DateTime(2026, 12, 1),
        'createdAt': DateTime(2026, 11, 10).millisecondsSinceEpoch,
        'featured': true,
        'placements': ['post_game', 'nada', 'post_game'],
        'couponUrlParam': 'cupom',
        'termsTags': ['online', 'one_per_person', 'x'],
        'locations': [
          {'name': 'A', 'address': 'Rua A', 'lat': -16.7, 'lng': -49.2},
          {'name': 'Sem coord', 'address': 'Rua'},
          {'name': 'B', 'address': 'Rua B', 'lat': 91, 'lng': 0},
          {'name': 'C', 'address': 'Rua C', 'lat': 0, 'lng': double.nan},
          'lixo',
        ],
        'requirement': {
          'type': 'tournament',
          'tournamentIds': ['t1', 3],
        },
        'requirementLabel': 'Só inscritos',
      });
      expect(p.coverUrl, 'https://cdn.example/c.jpg');
      expect(p.startsAt, DateTime(2026, 11, 1));
      expect(p.validUntil, DateTime(2026, 12, 1));
      expect(p.createdAt, DateTime(2026, 11, 10));
      expect(p.featured, isTrue);
      expect(p.placements, [PartnerPlacement.postGame]);
      expect(p.couponUrlParam, 'cupom');
      expect(p.termsTags, [
        PartnerTermsTag.online,
        PartnerTermsTag.onePerPerson,
      ]);
      expect(p.locations.map((l) => l.name), ['A']);
      expect(p.requirement.type, PartnerRequirementType.tournament);
      expect(p.requirement.tournamentIds, ['t1']);
      expect(p.requirementLabel, 'Só inscritos');
    });

    test('valores inválidos viram o padrão', () {
      final p = Partner.fromFirestore('x', {
        'coverUrl': 'http://inseguro.example/c.jpg',
        'couponUrlParam': 'cupom com espaço',
        'requirement': {'type': 'vip'},
        'placements': 'post_game',
      });
      expect(p.coverUrl, isNull);
      expect(p.couponUrlParam, isNull);
      expect(p.requirement.isNone, isTrue);
      expect(p.placements, isEmpty);
    });

    test('config: hubSponsorPartnerId', () {
      expect(
        BenefitsClubConfig.fromMap({
          'hubSponsorPartnerId': ' linq ',
        }).hubSponsorPartnerId,
        'linq',
      );
      expect(
        BenefitsClubConfig.fromMap({
          'hubSponsorPartnerId': '',
        }).hubSponsorPartnerId,
        isNull,
      );
    });

    test('getMyBenefits: datas em ms e economia só confirmada', () {
      final mine = MyBenefits.fromMap({
        'uses': [
          {
            'partnerId': 'fast',
            'useCount': 2,
            'firstUsedAt': 1000,
            'lastUsedAt': 2000,
            'lastAnswer': 'not_used',
            'saved': true,
          },
          {'useCount': 1},
        ],
        'pendingQuestion': {'partnerId': 'fast'},
        'savings': {
          'confirmedCount': 2,
          'totalDiscountCents': 1500,
          'byPartner': [
            {'partnerId': 'fast', 'count': 2, 'discountCents': 1500},
          ],
        },
        'eligiblePartnerIds': ['squad', 4],
      });
      expect(mine.uses.single.partnerId, 'fast');
      expect(
        mine.uses.single.lastUsedAt,
        DateTime.fromMillisecondsSinceEpoch(2000),
      );
      expect(mine.uses.single.lastAnswer, BenefitUseAnswer.notUsed);
      expect(mine.uses.single.saved, isTrue);
      expect(mine.pendingQuestionPartnerId, 'fast');
      expect(mine.savings.hasConfirmed, isTrue);
      expect(mine.savings.byPartner, {'fast': 1500});
      expect(mine.eligiblePartnerIds, {'squad'});

      expect(MyBenefits.fromMap(null).savings.hasConfirmed, isFalse);
      expect(
        MyBenefits.fromMap({
          'savings': {'confirmedCount': 0, 'totalDiscountCents': 900},
        }).savings.hasConfirmed,
        isFalse,
      );
    });
  });
}
