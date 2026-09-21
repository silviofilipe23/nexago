import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_about_section.dart';

void main() {
  Widget wrap(String bio, {ThemeData? theme}) => MaterialApp(
        theme: theme ?? AppTheme.dark,
        home: Scaffold(body: PublicProfileAboutSection(bio: bio)),
      );

  testWidgets('mostra o título e a bio', (tester) async {
    await tester.pumpWidget(wrap('Apaixonado por vôlei de praia.'));

    expect(find.text('Sobre'), findsOneWidget);
    expect(find.text('Apaixonado por vôlei de praia.'), findsOneWidget);
  });

  testWidgets('some por completo quando não há bio', (tester) async {
    // Mesmo critério das outras seções: sem placeholder para o que o atleta
    // não preencheu. Some de verdade, não vira card vazio.
    for (final vazio in ['', '   ', '\n']) {
      await tester.pumpWidget(wrap(vazio));

      expect(find.text('Sobre'), findsNothing);
      expect(
        tester.getSize(find.byType(PublicProfileAboutSection)),
        Size.zero,
        reason: 'para ${vazio.isEmpty ? 'vazio' : '"$vazio"'}',
      );
    }
  });

  testWidgets('bio longa não estoura', (tester) async {
    await tester.pumpWidget(wrap('Apaixonado por vôlei de praia. ' * 30));

    expect(tester.takeException(), isNull);
  });

  testWidgets('funciona no tema claro', (tester) async {
    // A seção fica FORA da capa, sobre o fundo da página — aqui as cores do
    // tema são as certas, ao contrário do texto sobre a foto no header.
    await tester.pumpWidget(wrap('Bio.', theme: AppTheme.light));

    final titulo = tester.widget<Text>(find.text('Sobre'));
    expect(
      titulo.style!.color,
      AppTheme.light.colorScheme.onSurface,
    );
  });
}
