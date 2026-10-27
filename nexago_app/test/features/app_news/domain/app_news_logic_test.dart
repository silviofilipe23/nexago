import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/app_news/domain/app_news.dart';
import 'package:nexago_app/features/app_news/domain/app_news_logic.dart';
import 'package:nexago_app/features/home_banners/domain/home_banner.dart';

Map<String, dynamic> feature(
  String id, [
  Map<String, dynamic> over = const {},
]) => {
  'id': id,
  'title': ' Novidade $id ',
  'summary': 'Uma linha.',
  'description': 'O parágrafo.',
  'steps': ['Um', ' ', 'Dois', 'Três'],
  'where': 'Início › Atalhos',
  'ctaLabel': 'Abrir',
  'destination': 'ranking',
  ...over,
};

Map<String, dynamic> release(
  String version,
  int build, {
  String date = '2026-10-27',
  List<Map<String, dynamic>>? features,
  Map<String, dynamic> over = const {},
}) => {
  'version': version,
  'build': build,
  'date': date,
  'features': features ?? [feature('a-$build'), feature('b-$build')],
  'improvements': ['Mais rápido', ''],
  ...over,
};

List<AppNewsRelease> parse(List<Map<String, dynamic>> releases) =>
    AppNewsRelease.listFromDoc({'releases': releases});

void main() {
  group('parse', () {
    test('lê a versão, ordena pela mais nova e limpa o que vem vazio', () {
      final list = parse([release('1.0.14', 112), release('1.0.15', 113)]);

      expect([for (final r in list) r.version], ['1.0.15', '1.0.14']);
      final f = list.first.features.first;
      expect(f.title, 'Novidade a-113');
      expect(f.steps, ['Um', 'Dois', 'Três']);
      expect(f.destination, HomeBannerDestination.ranking);
      expect(f.hasAction, isTrue);
      expect(list.first.improvements, ['Mais rápido']);
      expect(list.first.stories, isTrue);
    });

    test('versão sem número, build ou data válida fica de fora', () {
      final list = parse([
        release('', 113),
        release('1.0.15', 113, date: '27/10/2026'),
        release('1.0.15', 113, over: {'build': '113'}),
        release('1.0.16', 114),
      ]);

      expect([for (final r in list) r.version], ['1.0.16']);
    });

    test('destino desconhecido esconde a funcionalidade; sem destino, '
        'fica sem botão', () {
      final r = parse([
        release(
          '1.0.15',
          113,
          features: [
            feature('nova', {'destination': 'radar'}),
            feature('info', {'destination': null, 'ctaLabel': ''}),
            feature('link', {'destination': 'url', 'url': 'http://x.com'}),
          ],
        ),
      ]).single;

      expect([for (final f in r.features) f.id], ['info']);
      expect(r.features.single.hasAction, isFalse);
    });

    test('imagem só https; ícone conhecido; stories desligado por item', () {
      final f = AppNewsFeature.fromMap(
        feature('a', {
          'imageUrl': 'http://inseguro.png',
          'icon': 'invite',
          'stories': false,
        }),
      )!;

      expect(f.imageUrl, isNull);
      expect(f.icon, AppNewsIcon.invite);
      expect(f.inStories, isFalse);
    });
  });

  group('appNewsForBuild', () {
    final releases = parse([
      release('1.0.16', 114),
      release('1.0.15', 113),
      release('1.0.14', 112, features: []),
      release('1.0.13', 111),
    ]);

    test('a atual é a mais nova que o build instalado conhece', () {
      final view = appNewsForBuild(releases, 113)!;

      expect(view.current.version, '1.0.15');
      expect([for (final r in view.previous) r.version], ['1.0.14', '1.0.13']);
      expect(view.feature('a-111')?.title, 'Novidade a-111');
      expect(view.releaseOf('a-111')?.version, '1.0.13');
    });

    test('versão sem funcionalidade não vira a atual', () {
      expect(appNewsForBuild(releases, 112)!.current.version, '1.0.13');
    });

    test('build anterior a todas: nada para mostrar', () {
      expect(appNewsForBuild(releases, 110), isNull);
    });

    test('destino indisponível tira a funcionalidade', () {
      final view = appNewsForBuild(
        parse([
          release(
            '1.0.15',
            113,
            features: [
              feature('loja', {'destination': 'loja'}),
              feature('ranking'),
            ],
          ),
        ]),
        113,
        destinationAvailable: (d) => d != HomeBannerDestination.loja,
      )!;

      expect([for (final f in view.current.features) f.id], ['ranking']);
    });
  });

  group('pendingAppNewsStories', () {
    final current = parse([
      release(
        '1.0.15',
        113,
        features: [
          feature('radar'),
          feature('rateio'),
          feature('dupla', {'stories': false}),
        ],
      ),
    ]).single;
    final before = DateTime.utc(2026, 9, 1);

    AppNewsStories? pending({
      AppNewsRelease? r,
      String? seen,
      Set<String> used = const {},
      DateTime? createdAt,
    }) => pendingAppNewsStories(
      release: r ?? current,
      seenVersion: seen,
      used: used,
      accountCreatedAt: createdAt ?? before,
    );

    test('primeira abertura depois de atualizar: o que não usou e entra '
        'nos stories', () {
      final stories = pending(seen: '1.0.14', used: {'rateio'})!;

      expect(stories.release.version, '1.0.15');
      expect([for (final f in stories.features) f.id], ['radar']);
    });

    test('uma vez por versão', () {
      expect(pending(seen: '1.0.15'), isNull);
    });

    test(
      'quem criou a conta no dia da versão ou depois não atualizou nada',
      () {
        // 27/10 às 0h30 em São Paulo.
        expect(pending(createdAt: DateTime.utc(2026, 10, 27, 3, 30)), isNull);
        // 26/10 às 23h em São Paulo.
        expect(pending(createdAt: DateTime.utc(2026, 10, 27, 2)), isNotNull);
      },
    );

    test('versão sem stories, tudo usado ou conta sem data: nada', () {
      final noStories = parse([
        release('1.0.15', 113, over: {'stories': false}),
      ]).single;

      expect(pending(r: noStories), isNull);
      expect(pending(used: {'radar', 'rateio'}), isNull);
      expect(
        pendingAppNewsStories(
          release: current,
          seenVersion: null,
          used: const {},
          accountCreatedAt: null,
        ),
        isNull,
      );
    });
  });

  test('datas por extenso, sem ponto no mês', () {
    expect(appNewsShortDate('2026-10-27'), '27 out 2026');
    expect(appNewsLongDate('2026-10-05'), '5 de outubro');
    expect(appNewsShortDate('ontem'), 'ontem');
  });

  test('conta o que falta usar', () {
    final r = parse([release('1.0.15', 113)]).single;
    expect(appNewsUnusedCount(r, {'a-113'}), 1);
  });
}
