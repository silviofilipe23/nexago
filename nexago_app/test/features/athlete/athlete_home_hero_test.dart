import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_hero.dart';

void main() {
  group('athleteHomeHeroAssetFor', () {
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

  group('athleteHomeGreetingByHour', () {
    test('vira nas fronteiras de 12h e 18h', () {
      DateTime at(int h, [int m = 0]) => DateTime(2026, 9, 11, h, m);

      expect(athleteHomeGreetingByHour(at(0)), 'Bom dia');
      expect(athleteHomeGreetingByHour(at(11, 59)), 'Bom dia');
      expect(athleteHomeGreetingByHour(at(12)), 'Boa tarde');
      expect(athleteHomeGreetingByHour(at(17, 59)), 'Boa tarde');
      expect(athleteHomeGreetingByHour(at(18)), 'Boa noite');
      expect(athleteHomeGreetingByHour(at(23, 59)), 'Boa noite');
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
      double bleedBelow = 0,
      DateTime? now,
    }) => AthleteHomeHero(
      name: name,
      gender: gender,
      tagline: tagline,
      leading: leading,
      topRight: topRight,
      bottomRight: bottomRight,
      bleedBelow: bleedBelow,
      now: now ?? DateTime(2026, 9, 11, 22),
    );

    String assetOf(WidgetTester tester) {
      final image = tester.widget<Image>(find.byType(Image)).image;
      final provider = image is ResizeImage ? image.imageProvider : image;
      return (provider as AssetImage).assetName;
    }

    testWidgets('monta a saudação com a hora e o nome', (tester) async {
      await tester.pumpWidget(wrap(hero()));

      expect(find.text('Boa noite, liga1.'), findsOneWidget);
      expect(find.text('O esporte conecta.'), findsOneWidget);
    });

    testWidgets('sem nome não deixa vírgula solta', (tester) async {
      await tester.pumpWidget(wrap(hero(name: '   ')));

      expect(find.text('Boa noite.'), findsOneWidget);
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

      final title = tester.widget<Text>(find.text('Boa noite, liga1.'));
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
      final saudacao = tester.getRect(find.text('Boa noite, liga1.'));
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
      final saudacao = tester.getRect(find.text('Boa noite, Fernandinha.'));
      final sino = tester.getRect(find.byIcon(Icons.notifications_none_rounded));
      expect(saudacao.right, lessThanOrEqualTo(sino.left));
    });
  });
}
