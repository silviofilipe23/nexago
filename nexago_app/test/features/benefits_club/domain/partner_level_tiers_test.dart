import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_logic.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_premium_logic.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';

Map<String, Object?> _tier(String rank, String highlight, [String? title]) => {
  'minRank': rank,
  'benefitHighlight': highlight,
  'benefitTitle': title ?? '$highlight em tudo',
};

/// Base 10% OFF; Competidor 15%, Elite 20%, Lenda 30%.
final Partner _tiered = Partner.fromFirestore('fast-acai', {
  'name': 'Fast Açaí',
  'benefitHighlight': '10% OFF',
  'benefitTitle': '10% de desconto em todo pedido',
  'couponMode': 'fixed',
  'couponCode': 'NEXAGO10',
  'active': true,
  'levelTiers': [
    _tier('LENDA', '30% OFF'),
    _tier('COMPETIDOR', '15% OFF'),
    _tier('ELITE', '20% OFF'),
  ],
});

void main() {
  group('levelTiers (leitura defensiva)', () {
    test('ordena pela escada e ignora item malformado e elo repetido', () {
      final tiers = readPartnerLevelTiers([
        _tier('MESTRE', '25% OFF'),
        'lixo',
        null,
        {'minRank': 'COMPETIDOR'},
        _tier('INICIANTE', '5% OFF'),
        _tier('OURO', '50% OFF'),
        {'minRank': 3, 'benefitHighlight': 'x', 'benefitTitle': 'x'},
        _tier('DESAFIANTE', 'selo grande demais para o card'),
        _tier('ELITE', '20% OFF', '   '),
        _tier('ELITE', '20% OFF', 'x' * 81),
        _tier('COMPETIDOR', '15% OFF'),
        _tier('COMPETIDOR', '99% OFF'),
      ]);

      expect(tiers.map((t) => t.minRank), ['COMPETIDOR', 'MESTRE']);
      expect(tiers.first.benefitHighlight, '15% OFF');
      expect(tiers.last.benefitTitle, '25% OFF em tudo');
    });

    test('ausente ou com tipo errado vira lista vazia', () {
      expect(readPartnerLevelTiers(null), isEmpty);
      expect(readPartnerLevelTiers({'minRank': 'ELITE'}), isEmpty);
      expect(Partner.fromFirestore('p', {}).levelTiers, isEmpty);
    });

    test('só parceiro com cupom fixo tem faixas', () {
      final athlete = Partner.fromFirestore('p', {
        'couponMode': 'athlete',
        'levelTiers': [_tier('ELITE', '20% OFF')],
      });
      expect(athlete.levelTiers, isEmpty);
      expect(_tiered.levelTiers.map((t) => t.minRank), [
        'COMPETIDOR',
        'ELITE',
        'LENDA',
      ]);
    });
  });

  group('elo do atleta', () {
    test(
      'pelo degrau do espelho; sem degrau ou fora da trilha = Iniciante',
      () {
        expect(sandRankCodeForTrackIndex(null), 'INICIANTE');
        expect(sandRankCodeForTrackIndex(2), 'INICIANTE');
        expect(sandRankCodeForTrackIndex(3), 'COMPETIDOR');
        expect(sandRankCodeForTrackIndex(15), 'LENDA');
        expect(sandRankCodeForTrackIndex(99), 'INICIANTE');
        expect(sandRankCodeForTrackIndex(-1), 'INICIANTE');
      },
    );

    test('o perfil lê o degrau de users/{uid}.sandRank', () {
      final withMirror = AthleteProfile.fromMap('u', {
        'sandRank': {'code': 'ELITE', 'division': 3, 'trackIndex': 9},
      });
      expect(withMirror.sandRankTrackIndex, 9);
      expect(withMirror.copyWith(city: 'Goiânia').sandRankTrackIndex, 9);
      expect(AthleteProfile.fromMap('u', {}).sandRankTrackIndex, isNull);
    });
  });

  group('partnerForSandRank', () {
    test('Iniciante (e quem não tem elo) fica com o benefício-base', () {
      final p = partnerForSandRank(_tiered, sandRankCodeForTrackIndex(null));

      expect(p.benefitHighlight, '10% OFF');
      expect(p.benefitTitle, '10% de desconto em todo pedido');
      final ladder = p.levelLadder;
      expect(ladder?.currentRank, 'INICIANTE');
      expect(ladder?.rungs.map((r) => r.minRank), [
        'INICIANTE',
        'COMPETIDOR',
        'ELITE',
        'LENDA',
      ]);
      expect(ladder?.rungs.first.benefitHighlight, '10% OFF');
    });

    test('elo entre faixas fica com a mais alta que alcança', () {
      final desafiante = partnerForSandRank(_tiered, 'DESAFIANTE');
      expect(desafiante.benefitHighlight, '15% OFF');
      expect(desafiante.levelLadder?.currentRank, 'COMPETIDOR');

      final mestre = partnerForSandRank(_tiered, 'MESTRE');
      expect(mestre.benefitHighlight, '20% OFF');
      expect(mestre.benefitTitle, '20% OFF em tudo');
      expect(mestre.levelLadder?.currentRank, 'ELITE');
    });

    test('topo da escada fica com a última faixa', () {
      final p = partnerForSandRank(_tiered, 'LENDA');
      expect(p.benefitHighlight, '30% OFF');
      expect(p.levelLadder?.currentRank, 'LENDA');
      // Cupom público e o resto do parceiro não mudam.
      expect(p.couponCode, 'NEXAGO10');
      expect(p.name, 'Fast Açaí');
      expect(p.levelTiers, _tiered.levelTiers);
    });

    test('resolver de novo não troca a base; sem faixas volta igual', () {
      final once = partnerForSandRank(_tiered, 'LENDA');
      expect(identical(partnerForSandRank(once, 'INICIANTE'), once), isTrue);

      const plain = Partner(id: 'p', name: 'P', benefitHighlight: '5% OFF');
      final same = partnerForSandRank(plain, 'LENDA');
      expect(identical(same, plain), isTrue);
      expect(same.levelLadder, isNull);
    });
  });

  group('couponViaClaim', () {
    test('sem requisito e sem faixas o cupom é o público', () {
      const plain = Partner(
        id: 'p',
        name: 'P',
        couponMode: PartnerCouponMode.fixed,
        couponCode: 'NEXAGO10',
      );
      expect(couponViaClaim(plain), isFalse);
    });

    test('com faixas ou com requisito o cupom sai da claimBenefit', () {
      expect(couponViaClaim(_tiered), isTrue);
      expect(couponViaClaim(partnerForSandRank(_tiered, 'ELITE')), isTrue);
      const squad = Partner(
        id: 's',
        name: 'S',
        couponMode: PartnerCouponMode.fixed,
        requirement: PartnerRequirement(type: PartnerRequirementType.squad),
      );
      expect(couponViaClaim(squad), isTrue);
    });

    test('faixa não bloqueia ninguém', () {
      expect(isPartnerLocked(_tiered, null), isFalse);
    });
  });
}
