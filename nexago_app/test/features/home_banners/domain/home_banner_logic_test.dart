import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/home_banners/domain/home_banner.dart';
import 'package:nexago_app/features/home_banners/domain/home_banner_logic.dart';

Map<String, dynamic> raw([Map<String, dynamic> over = const {}]) => {
      'id': 'bora-jogar',
      'format': 'carousel',
      'title': ' Bora Jogar ',
      'description': 'Monte o jogo e chame a galera.',
      'ctaLabel': 'Montar jogo',
      'imageUrl': null,
      'destination': 'bora-jogar',
      'url': null,
      'audience': 'all',
      'startDate': '2026-10-20',
      'endDate': '2026-11-20',
      'hideAfterClick': true,
      'dismissible': true,
      ...over,
    };

HomeBanner banner(String id, [Map<String, dynamic> over = const {}]) =>
    HomeBanner.fromMap(raw({'id': id, ...over}))!;

// 26/10/2026 às 9h em São Paulo.
final now = DateTime.utc(2026, 10, 26, 12);

List<String> ids(List<HomeBanner> list) => [for (final b in list) b.id];

void main() {
  group('HomeBanner.fromMap', () {
    test('lê o banner do backoffice, textos aparados', () {
      final b = HomeBanner.fromMap(raw())!;
      expect(b.title, 'Bora Jogar');
      expect(b.destination, HomeBannerDestination.boraJogar);
      expect(b.audience, HomeBannerAudience.all);
      expect(b.format, HomeBannerFormat.carousel);
      expect(b.hideAfterClick, isTrue);
    });

    test('chaves da chuva: Minhas reservas e Créditos de chuva', () {
      expect(
          HomeBanner.fromMap(raw({'destination': 'minhas-reservas'}))!
              .destination,
          HomeBannerDestination.minhasReservas);
      expect(
          HomeBanner.fromMap(raw({'destination': 'creditos-chuva'}))!
              .destination,
          HomeBannerDestination.creditosChuva);
    });

    test('chave desconhecida para este build esconde o banner', () {
      expect(HomeBanner.fromMap(raw({'destination': 'radar'})), isNull);
      expect(HomeBanner.fromMap(raw({'audience': 'inativos'})), isNull);
      expect(HomeBanner.fromMap(raw({'format': 'story'})), isNull);
    });

    test('sem título, descrição ou botão (carrossel) não entra', () {
      expect(HomeBanner.fromMap(raw({'title': '  '})), isNull);
      expect(HomeBanner.fromMap(raw({'description': ''})), isNull);
      expect(HomeBanner.fromMap(raw({'ctaLabel': ''})), isNull);
      expect(
        HomeBanner.fromMap(raw({'format': 'compact', 'ctaLabel': ''})),
        isNotNull,
      );
    });

    test('link externo só com https', () {
      expect(
        HomeBanner.fromMap(raw({'destination': 'url', 'url': 'http://x.com'})),
        isNull,
      );
      expect(
        HomeBanner.fromMap(
          raw({'destination': 'url', 'url': 'https://nexago.app'}),
        )!
            .url,
        'https://nexago.app',
      );
    });

    test('lista do doc pula item quebrado e mantém a ordem', () {
      final list = HomeBanner.listFromDoc({
        'banners': [
          raw({'id': 'b'}),
          'lixo',
          raw({'id': 'x', 'destination': 'radar'}),
          raw({'id': 'a'}),
        ],
      });
      expect(ids(list), ['b', 'a']);
      expect(HomeBanner.listFromDoc(null), isEmpty);
    });

    test('marca vale pela chave, mesmo com o serverTimestamp ainda nulo', () {
      final m = HomeBannerMarks.fromMap({'seenAt': null, 'dismissedAt': null});
      expect(m.seen, isTrue);
      expect(m.dismissed, isTrue);
      expect(m.clicked, isFalse);
    });
  });

  group('saoPauloDateKey', () {
    test('é a data de São Paulo, não a UTC', () {
      expect(saoPauloDateKey(DateTime.utc(2026, 10, 27, 2, 59)), '2026-10-26');
      expect(saoPauloDateKey(DateTime.utc(2026, 10, 27, 3)), '2026-10-27');
    });
  });

  group('eligibleHomeBanners', () {
    const athlete = HomeBannerAthlete(hasBookings: false);

    List<String> eligible(
      List<HomeBanner> banners, {
      Map<String, HomeBannerMarks> marks = const {},
      HomeBannerAthlete who = athlete,
      bool Function(HomeBannerDestination d)? available,
    }) =>
        ids(
          eligibleHomeBanners(
            banners: banners,
            marks: marks,
            athlete: who,
            now: now,
            destinationAvailable: available,
          ),
        );

    test('período inclusivo: agendado espera, encerrado sai', () {
      expect(
        eligible([
          banner('no-ar'),
          banner('agendado', {'startDate': '2026-10-27'}),
          banner('encerrado', {'endDate': '2026-10-25'}),
          banner('comeca-hoje', {'startDate': '2026-10-26'}),
          banner('acaba-hoje', {'endDate': '2026-10-26'}),
          banner('sem-prazo', {'startDate': null, 'endDate': null}),
        ]),
        ['no-ar', 'comeca-hoje', 'acaba-hoje', 'sem-prazo'],
      );
    });

    test('dispensado não volta; tocado some só com "esconder depois"', () {
      final marks = {
        'dispensado': const HomeBannerMarks(seen: true, dismissed: true),
        'tocado': const HomeBannerMarks(seen: true, clicked: true),
        'tocado-fica': const HomeBannerMarks(seen: true, clicked: true),
      };
      expect(
        eligible([
          banner('dispensado'),
          banner('tocado'),
          banner('tocado-fica', {'hideAfterClick': false}),
          banner('visto'),
        ], marks: marks),
        ['tocado-fica', 'visto'],
      );
    });

    test('público: novos até 30 dias pela criação da conta', () {
      final novo = banner('novo', {'audience': 'new'});
      expect(
        eligible([novo],
            who: HomeBannerAthlete(
                accountCreatedAt: now.subtract(const Duration(days: 29)))),
        ['novo'],
      );
      expect(
        eligible([novo],
            who: HomeBannerAthlete(
                accountCreatedAt: now.subtract(const Duration(days: 31)))),
        isEmpty,
      );
      expect(eligible([novo], who: const HomeBannerAthlete()), isEmpty);
    });

    test('público: reserva e torneio; sem o dado ainda, espera', () {
      final semReserva = banner('sem-reserva', {'audience': 'no-booking'});
      final reservou = banner('reservou', {'audience': 'booked'});
      final semTorneio = banner('sem-torneio', {'audience': 'no-tournament'});
      final all = [semReserva, reservou, semTorneio];
      expect(
        eligible(all,
            who: const HomeBannerAthlete(
                hasBookings: false, hasTournaments: false)),
        ['sem-reserva', 'sem-torneio'],
      );
      expect(
        eligible(all,
            who: const HomeBannerAthlete(
                hasBookings: true, hasTournaments: true)),
        ['reservou'],
      );
      expect(eligible(all, who: const HomeBannerAthlete()), isEmpty);
    });

    test('destino indisponível (Loja desligada) esconde o banner', () {
      expect(
        eligible(
          [
            banner('loja', {'destination': 'loja'}),
            banner('ranking', {'destination': 'ranking'})
          ],
          available: (d) => d != HomeBannerDestination.loja,
        ),
        ['ranking'],
      );
    });
  });

  group('homeBannerSlot', () {
    test('carrossel com os cards de carrossel, até o teto', () {
      final list = [
        banner('compacto', {'format': 'compact', 'ctaLabel': ''}),
        for (var i = 0; i < 8; i++) banner('c$i'),
      ];
      final slot = homeBannerSlot(list)!;
      expect(slot.format, HomeBannerFormat.carousel);
      expect(ids(slot.banners), ['c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
    });

    test('sem carrossel, o primeiro compacto; sem nada, nenhum bloco', () {
      final slot = homeBannerSlot([
        banner('c1', {'format': 'compact'}),
        banner('c2', {'format': 'compact'}),
      ])!;
      expect(slot.format, HomeBannerFormat.compact);
      expect(ids(slot.banners), ['c1']);
      expect(homeBannerSlot(const []), isNull);
    });
  });
}
