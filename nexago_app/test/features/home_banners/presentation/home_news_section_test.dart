import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_shell_providers.dart';
import 'package:nexago_app/features/home_banners/application/home_banners_providers.dart';
import 'package:nexago_app/features/home_banners/domain/home_banner.dart';
import 'package:nexago_app/features/home_banners/presentation/widgets/home_news_carousel.dart';
import 'package:nexago_app/features/home_banners/presentation/widgets/home_news_section.dart';

class _FakeRepository implements HomeBannersRepository {
  _FakeRepository(this.banners, this.marks);

  final List<HomeBanner> banners;
  final Map<String, HomeBannerMarks> marks;
  final calls = <String>[];

  @override
  Stream<List<HomeBanner>> watchBanners() => Stream.value(banners);

  @override
  Stream<Map<String, HomeBannerMarks>> watchMarks(String uid) =>
      Stream.value(marks);

  @override
  Future<void> mark(String uid, String bannerId, HomeBannerMark mark) async {
    calls.add('$bannerId:${mark.name}');
  }
}

HomeBanner banner(
  String id, {
  HomeBannerFormat format = HomeBannerFormat.carousel,
  HomeBannerDestination destination = HomeBannerDestination.ranking,
  bool dismissible = true,
}) =>
    HomeBanner(
      id: id,
      format: format,
      title: 'Novidade $id',
      description: 'Uma linha com o benefício.',
      ctaLabel: 'Abrir $id',
      destination: destination,
      audience: HomeBannerAudience.all,
      dismissible: dismissible,
    );

Future<_FakeRepository> pump(
  WidgetTester tester,
  List<HomeBanner> banners, {
  Map<String, HomeBannerMarks> marks = const {},
}) async {
  final repo = _FakeRepository(banners, marks);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        homeBannersRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(
          body: SingleChildScrollView(child: HomeNewsSection()),
        ),
      ),
    ),
  );
  // Sessão → banners → marcas: um quadro por stream, mais o pós-quadro do
  // "visto".
  for (var i = 0; i < 4; i++) {
    await tester.pump();
  }
  return repo;
}

void main() {
  testWidgets(
      'carrossel: título, contador e o primeiro card marcado como visto', (
    tester,
  ) async {
    final repo = await pump(tester, [banner('a'), banner('b')]);

    expect(find.text('Novidades no app'), findsOneWidget);
    expect(find.text('1 de 2'), findsOneWidget);
    expect(find.text('Novidade a'), findsOneWidget);
    expect(repo.calls, ['a:seen']);
  });

  testWidgets('troca sozinho a cada 5 s e marca o novo card', (tester) async {
    final repo = await pump(tester, [banner('a'), banner('b')]);

    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('2 de 2'), findsOneWidget);
    expect(repo.calls, ['a:seen', 'b:seen']);
  });

  testWidgets('X dispensa: grava a marca e o card some na hora', (
    tester,
  ) async {
    final repo = await pump(tester, [banner('a'), banner('b')]);

    await tester.tap(find.byKey(const Key('home-news-dismiss-a')));
    await tester.pump();
    await tester.pump();

    expect(repo.calls, containsAllInOrder(['a:seen', 'a:dismissed']));
    expect(find.byKey(const Key('home-news-card-a')), findsNothing);
    expect(find.text('Novidade b'), findsOneWidget);
    // Um card só: sem contador.
    expect(find.text('1 de 1'), findsNothing);
    expect(repo.calls.last, 'b:seen');
  });

  testWidgets('botão abre o destino: Reservar troca para a aba e marca o toque',
      (
    tester,
  ) async {
    final repo = await pump(tester, [
      banner('r', destination: HomeBannerDestination.reservar),
    ]);

    await tester.tap(find.text('Abrir r'));
    await tester.pump();

    final container = ProviderScope.containerOf(
      tester.element(find.byType(HomeNewsSection)),
    );
    expect(container.read(athleteShellTabIndexProvider),
        athleteShellReservarTabIndex);
    expect(repo.calls, ['r:seen', 'r:clicked']);
  });

  testWidgets('sem card de carrossel, o compacto ocupa o lugar',
      (tester) async {
    await pump(tester, [
      banner('c', format: HomeBannerFormat.compact),
      banner('d', format: HomeBannerFormat.compact),
    ]);

    expect(find.byType(HomeNewsCarousel), findsNothing);
    expect(find.byKey(const Key('home-news-compact-c')), findsOneWidget);
    expect(find.byKey(const Key('home-news-compact-d')), findsNothing);
  });

  testWidgets('sem X quando o banner não é dispensável', (tester) async {
    await pump(tester, [banner('a', dismissible: false)]);

    expect(find.byType(HomeNewsDismissButton), findsNothing);
  });

  testWidgets('dispensado antes não volta; sem novidade, nenhum bloco', (
    tester,
  ) async {
    final repo = await pump(
      tester,
      [banner('a')],
      marks: {'a': const HomeBannerMarks(seen: true, dismissed: true)},
    );

    expect(find.text('Novidades no app'), findsNothing);
    expect(tester.getSize(find.byType(HomeNewsSection)).height, 0);
    expect(repo.calls, isEmpty);
  });
}
