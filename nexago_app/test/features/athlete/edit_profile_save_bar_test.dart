import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/edit_profile/edit_profile_save_bar.dart';

void main() {
  const bodyKey = Key('corpo');

  /// Monta a barra no mesmo slot em que a tela de editar perfil a usa.
  Future<void> pumpAsBottomBar(WidgetTester tester, {bool saving = false}) {
    return tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          appBar: AppBar(title: const Text('Editar perfil')),
          body: const SizedBox.expand(
              child: ColoredBox(color: Colors.blue, key: bodyKey)),
          bottomNavigationBar: EditProfileSaveBar(
            saving: saving,
            onSave: () {},
          ),
        ),
      ),
    );
  }

  testWidgets('cabe num rodapé em vez de ocupar a tela inteira', (
    tester,
  ) async {
    await pumpAsBottomBar(tester);

    final tela = tester.getSize(find.byType(Scaffold));
    final barra = tester.getSize(find.byType(EditProfileSaveBar));

    // O Scaffold dá altura FROUXA (0..tela) ao slot bottomNavigationBar. Um
    // `Center` sem heightFactor se expande até o máximo e come a tela inteira.
    expect(
      barra.height,
      lessThan(tela.height / 3),
      reason:
          'a barra é rodapé: ${barra.height} de ${tela.height} é a tela toda',
    );
  });

  testWidgets('deixa altura real para o corpo do formulário', (tester) async {
    await pumpAsBottomBar(tester);

    // Com a barra inflada, o Scaffold entrega h=0 ao body e o formulário some
    // — foi exatamente o que o app mostrou.
    expect(tester.getSize(find.byKey(bodyKey)).height, greaterThan(0));
  });

  testWidgets('não engole a tela nem no estado salvando', (tester) async {
    await pumpAsBottomBar(tester, saving: true);

    final tela = tester.getSize(find.byType(Scaffold));
    final barra = tester.getSize(find.byType(EditProfileSaveBar));

    expect(barra.height, lessThan(tela.height / 3));
    expect(find.text('Salvando…'), findsOneWidget);
  });

  testWidgets('mantém o CTA centrado e limitado em tela larga', (tester) async {
    // Motivo do `Center`: em tablet o botão não deve esticar para fora da
    // coluna de campos. A correção não pode perder isso.
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await pumpAsBottomBar(tester);

    final botao = tester.getRect(find.byType(FilledButton));
    expect(botao.width, lessThanOrEqualTo(420));
    expect((botao.center.dx - 600).abs(), lessThan(1));
  });
}
