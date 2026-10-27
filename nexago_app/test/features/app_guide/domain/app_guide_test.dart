import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/app_guide/domain/app_guide.dart';
import 'package:nexago_app/features/home_banners/domain/home_banner.dart';

Map<String, dynamic> topic(String id, [Map<String, dynamic> over = const {}]) =>
    {
      'id': id,
      'title': 'Guia $id',
      'summary': 'Resumo $id',
      'steps': ['Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete'],
      'destination': 'ranking',
      'ctaLabel': 'Abrir',
      ...over,
    };

List<AppGuideCategory> parse(List<Map<String, dynamic>> categories) =>
    AppGuideCategory.listFromDoc({'categories': categories});

void main() {
  test('lê as categorias na ordem, com até 6 passos por guia', () {
    final list = parse([
      {
        'id': 'reservar',
        'title': 'Reservar',
        'topics': [topic('a')],
      },
      {
        'id': 'jogar',
        'title': 'Jogar',
        'topics': [topic('b')],
      },
    ]);

    expect([for (final c in list) c.id], ['reservar', 'jogar']);
    expect(list.first.topics.single.steps.length, 6);
    expect(list.first.topics.single.destination, HomeBannerDestination.ranking);
  });

  test('categoria sem título ou sem guia que o build conheça fica de fora', () {
    final list = parse([
      {
        'id': 'x',
        'title': '',
        'topics': [topic('a')],
      },
      {
        'id': 'y',
        'title': 'Y',
        'topics': [
          topic('b', {'destination': 'radar'}),
        ],
      },
      {
        'id': 'z',
        'title': 'Z',
        'topics': [topic('c')],
      },
    ]);

    expect([for (final c in list) c.id], ['z']);
  });

  test('acha o guia pelo id e diz a categoria', () {
    final list = parse([
      {
        'id': 'reservar',
        'title': 'Reservar',
        'topics': [topic('a')],
      },
      {
        'id': 'jogar',
        'title': 'Jogar',
        'topics': [topic('b')],
      },
    ]);

    expect(findAppGuideTopic(list, 'b')?.category.title, 'Jogar');
    expect(findAppGuideTopic(list, 'nada'), isNull);
  });

  test(
    'busca sem acento e sem caixa, todas as palavras, em qualquer campo',
    () {
      final list = parse([
        {
          'id': 'reservar',
          'title': 'Reservar',
          'topics': [
            topic('quadra', {
              'title': 'Reservar uma quadra',
              'summary': 'Pague com Pix ou cartão.',
            }),
            topic('cancelar', {
              'title': 'Cancelar reserva',
              'where': 'Agenda › reserva',
            }),
          ],
        },
      ]);

      List<String> ids(String q) => [
        for (final r in searchAppGuide(list, q)) r.topic.id,
      ];

      expect(ids('CARTAO'), ['quadra']);
      expect(ids('reserva'), ['quadra', 'cancelar']);
      expect(ids('agenda cancelar'), ['cancelar']);
      expect(ids('pix agenda'), isEmpty);
      expect(ids('   '), isEmpty);
    },
  );
}
