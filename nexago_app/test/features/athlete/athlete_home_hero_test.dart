import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_hero.dart';

void main() {
  group('athleteHomeHeroAssetFor', () {
    test('esporte com arte por gênero usa a do gênero, e o arquivo existe', () {
      const slugs = {
        'VOLEI_QUADRA': 'volei_quadra',
        'FUTEVOLEI': 'futevolei',
        'BEACH_TENNIS': 'beach_tennis',
        'TENIS': 'tenis',
        'PADEL': 'padel',
        'BASQUETE': 'basquete',
        'FUTEBOL': 'futebol',
        'CORRIDA': 'corrida',
      };
      slugs.forEach((code, slug) {
        for (final (g, suffix) in [
          ('Masculino', 'masculino'),
          ('Feminino', 'feminino'),
        ]) {
          final path = athleteHomeHeroAssetFor(g, sport: code);
          expect(path, 'assets/images/home/sport/${slug}_$suffix.webp');
          expect(File(path).existsSync(), isTrue, reason: path);
        }
      });
    });

    test('futevôlei aceita grafias do rótulo', () {
      for (final sport in ['Futevôlei', 'futevolei']) {
        expect(
          athleteHomeHeroAssetFor('Feminino', sport: sport),
          'assets/images/home/sport/futevolei_feminino.webp',
        );
      }
    });

    test('sem gênero reconhecido usa a arte neutra do esporte', () {
      expect(
        athleteHomeHeroAssetFor(null, sport: 'TENIS'),
        'assets/images/sports/tenis.webp',
      );
      expect(
        athleteHomeHeroAssetFor('Outro', sport: 'FUTEVOLEI'),
        'assets/images/sports/futevolei.webp',
      );
      expect(
        athleteHomeHeroAssetFor(null, sport: 'PADEL'),
        'assets/images/sports/padel.webp',
      );
    });

    test('esporte sem arte segue por gênero', () {
      expect(
        athleteHomeHeroAssetFor('Feminino', sport: 'OUTROS'),
        AthleteHomeHeroArt.feminino,
      );
    });

    test('vôlei de praia e nulo seguem por gênero', () {
      expect(
        athleteHomeHeroAssetFor('Masculino', sport: 'VOLEI_PRAIA'),
        AthleteHomeHeroArt.masculino,
      );
      expect(
        athleteHomeHeroAssetFor('Feminino', sport: null),
        AthleteHomeHeroArt.feminino,
      );
    });

    test('casa masculino por prefixo, sem ligar para caixa ou espaço', () {
      for (final g in ['Masculino', 'masculino', '  MASCULINO  ', 'Masc']) {
        expect(
          athleteHomeHeroAssetFor(g),
          AthleteHomeHeroArt.masculino,
          reason: 'para "$g"',
        );
      }
    });

    test('casa feminino por prefixo', () {
      for (final g in ['Feminino', 'feminino', ' FEM ', 'Fem']) {
        expect(
          athleteHomeHeroAssetFor(g),
          AthleteHomeHeroArt.feminino,
          reason: 'para "$g"',
        );
      }
    });

    test('tudo que não for reconhecido cai no neutro, nunca no masculino', () {
      // `gender` é String? livre: nulo e vazio são reais (perfil antigo ou
      // onboarding que não chegou ao campo), e o resto é valor legado.
      const naoReconhecidos = <String?>[
        null,
        '',
        '   ',
        'Outro',
        'Prefiro não informar',
        'Misto',
        'M',
        'F',
        'não-binário',
      ];

      for (final g in naoReconhecidos) {
        expect(
          athleteHomeHeroAssetFor(g),
          AthleteHomeHeroArt.neutro,
          reason: 'para ${g == null ? 'null' : '"$g"'}',
        );
      }
    });

    test('as três artes são arquivos distintos', () {
      expect(
        {
          AthleteHomeHeroArt.masculino,
          AthleteHomeHeroArt.feminino,
          AthleteHomeHeroArt.neutro,
        },
        hasLength(3),
      );
    });
  });

  group('AthleteHomeHero', () {
    /// Recorte do sistema no topo, que o hero soma à própria altura.
    const topInset = 59.0;

    Widget wrap(
      Widget child, {
      ThemeData? theme,
      double textScale = 1,
      double inset = topInset,
    }) => MaterialApp(
      theme: theme ?? AppTheme.dark,
      home: MediaQuery(
        data: MediaQueryData(
          padding: EdgeInsets.only(top: inset),
          textScaler: TextScaler.linear(textScale),
        ),
        child: Scaffold(body: child),
      ),
    );

    AthleteHomeHero hero({
      String name = 'liga1',
      String? gender = 'Masculino',
      String? tagline = 'O esporte conecta.',
      Widget? leading,
      Widget? topRight,
      Widget? bottomRight,
      VoidCallback? onIdentityTap,
      double bleedBelow = 0,
    }) => AthleteHomeHero(
      name: name,
      gender: gender,
      tagline: tagline,
      leading: leading,
      topRight: topRight,
      bottomRight: bottomRight,
      onIdentityTap: onIdentityTap,
      identitySemanticLabel: onIdentityTap == null ? null : 'Sua conta',
      bleedBelow: bleedBelow,
    );

    String assetOf(WidgetTester tester) {
      final image = tester.widget<Image>(find.byType(Image)).image;
      final provider = image is ResizeImage ? image.imageProvider : image;
      return (provider as AssetImage).assetName;
    }

    testWidgets('mostra só o nome, sem saudação', (tester) async {
      await tester.pumpWidget(wrap(hero()));

      expect(find.text('liga1'), findsOneWidget);
      expect(find.textContaining('Boa '), findsNothing);
      expect(find.textContaining('Bom dia'), findsNothing);
      expect(find.text('O esporte conecta.'), findsOneWidget);
    });

    testWidgets('nome com 18 de corpo', (tester) async {
      await tester.pumpWidget(wrap(hero()));

      final title = tester.widget<Text>(find.text('liga1'));
      expect(title.style!.fontSize, 18);
    });

    testWidgets('sem nome cai em "Atleta"', (tester) async {
      await tester.pumpWidget(wrap(hero(name: '   ')));

      expect(find.text('Atleta'), findsOneWidget);
    });

    testWidgets('troca a arte conforme o gênero', (tester) async {
      await tester.pumpWidget(wrap(hero(gender: 'Masculino')));
      expect(assetOf(tester), AthleteHomeHeroArt.masculino);

      await tester.pumpWidget(wrap(hero(gender: 'Feminino')));
      expect(assetOf(tester), AthleteHomeHeroArt.feminino);

      await tester.pumpWidget(wrap(hero(gender: null)));
      expect(assetOf(tester), AthleteHomeHeroArt.neutro);
    });

    testWidgets('a arte é decorativa para o leitor de tela', (tester) async {
      await tester.pumpWidget(wrap(hero()));

      expect(
        tester.widget<Image>(find.byType(Image)).excludeFromSemantics,
        isTrue,
      );
    });

    testWidgets('encaixa os cantos direitos quando fornecidos', (tester) async {
      await tester.pumpWidget(
        wrap(
          hero(
            topRight: const Icon(Icons.notifications_none_rounded),
            bottomRight: const Text('30/100'),
          ),
        ),
      );

      expect(find.byIcon(Icons.notifications_none_rounded), findsOneWidget);
      expect(find.text('30/100'), findsOneWidget);
    });

    testWidgets('sem os encaixes não sobra widget vazio', (tester) async {
      await tester.pumpWidget(wrap(hero()));

      expect(tester.takeException(), isNull);
      expect(find.byType(Positioned), findsNothing);
    });

    testWidgets('soma o recorte do sistema à altura', (tester) async {
      // Comparar as duas alturas, e não com uma constante: o hero sangra sob a
      // barra de status, então a diferença TEM de ser exatamente o recorte.
      await tester.pumpWidget(wrap(hero(), inset: 0));
      final semRecorte = tester.getSize(find.byType(AthleteHomeHero)).height;

      await tester.pumpWidget(wrap(hero(), inset: topInset));
      final comRecorte = tester.getSize(find.byType(AthleteHomeHero)).height;

      expect(comRecorte - semRecorte, topInset);
    });

    testWidgets('texto fica branco também no tema claro', (tester) async {
      // A arte é escura nos dois temas: `onSurface` sumiria sobre a foto.
      await tester.pumpWidget(wrap(hero(), theme: AppTheme.light));

      final title = tester.widget<Text>(find.text('liga1'));
      expect(title.style!.color, AppColors.white);
    });

    testWidgets('não estoura com fonte ampliada em 2x', (tester) async {
      await tester.pumpWidget(wrap(hero(), textScale: 2));

      expect(tester.takeException(), isNull);
    });

    testWidgets('bleedBelow encolhe a caixa para a seção seguinte subir', (
      tester,
    ) async {
      await tester.pumpWidget(wrap(hero()));
      final cheio = tester.getSize(find.byType(AthleteHomeHero)).height;

      await tester.pumpWidget(wrap(hero(bleedBelow: 56)));
      final encolhido = tester.getSize(find.byType(AthleteHomeHero)).height;

      expect(cheio - encolhido, 56);
    });

    testWidgets('encaixa o leading à esquerda da saudação', (tester) async {
      await tester.pumpWidget(
        wrap(hero(leading: const Icon(Icons.person_rounded))),
      );

      final avatar = tester.getRect(find.byIcon(Icons.person_rounded));
      final saudacao = tester.getRect(find.text('liga1'));
      expect(avatar.right, lessThanOrEqualTo(saudacao.left));
    });

    testWidgets('nome longo quebra em vez de invadir o canto do sino', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          hero(
            name: 'Fernandinha',
            leading: const Icon(Icons.person_rounded),
            topRight: const Icon(Icons.notifications_none_rounded),
          ),
        ),
      );

      expect(tester.takeException(), isNull);
      final saudacao = tester.getRect(find.text('Fernandinha'));
      final sino = tester.getRect(find.byIcon(Icons.notifications_none_rounded));
      expect(saudacao.right, lessThanOrEqualTo(sino.left));
    });
    testWidgets('sem onIdentityTap a saudação não vira botão nem ganha seta',
        (tester) async {
      await tester.pumpWidget(
        wrap(hero(leading: const Icon(Icons.person_rounded))),
      );

      expect(find.byKey(const Key('athlete-home-identity')), findsNothing);
      expect(
        find.byKey(const Key('athlete-home-identity-chevron')),
        findsNothing,
      );
    });

    testWidgets(
        'com onIdentityTap avatar e saudação abrem a conta, com a seta ⌄',
        (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        wrap(
          hero(
            leading: const Icon(Icons.person_rounded),
            onIdentityTap: () => taps++,
          ),
        ),
      );

      expect(
        find.byKey(const Key('athlete-home-identity-chevron')),
        findsOneWidget,
      );
      await tester.tap(find.byIcon(Icons.person_rounded));
      await tester.tap(find.byKey(const Key('athlete-home-identity-chevron')));
      expect(taps, 2);
      expect(
        find.bySemanticsLabel('Sua conta'),
        findsOneWidget,
        reason: 'o leitor de tela anuncia o grupo como um botão só',
      );
    });
  });
}
