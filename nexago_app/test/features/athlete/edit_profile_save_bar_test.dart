// O CTA "Salvar alterações" de Editar perfil mora no rodapé fixo
// (`bottomNavigationBar`), não no fim da Column rolável: o formulário é longo
// (identidade, contato, bio, destaques, conta) e o atleta era obrigado a rolar
// a tela inteira só para enviar uma alteração feita no topo.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/edit_profile/edit_profile_save_bar.dart';

Widget _wrap({
  required bool saving,
  required VoidCallback onSave,
  Widget? body,
}) {
  return MaterialApp(
    home: Scaffold(
      body: body ?? const SizedBox.expand(),
      bottomNavigationBar: EditProfileSaveBar(saving: saving, onSave: onSave),
    ),
  );
}

void main() {
  testWidgets('mostra o CTA e dispara onSave no toque', (tester) async {
    var taps = 0;
    await tester.pumpWidget(_wrap(saving: false, onSave: () => taps++));

    expect(find.text('Salvar alterações'), findsOneWidget);
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);

    await tester.tap(find.text('Salvar alterações'));
    expect(taps, 1);
  });

  testWidgets('salvando: rótulo de progresso e botão desabilitado', (
    tester,
  ) async {
    var taps = 0;
    await tester.pumpWidget(_wrap(saving: true, onSave: () => taps++));

    expect(find.text('Salvando…'), findsOneWidget);
    expect(find.text('Salvar alterações'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );

    await tester.tap(find.text('Salvando…'), warnIfMissed: false);
    expect(taps, 0);
  });

  testWidgets(
    'formulário longo: o CTA continua na tela sem precisar rolar',
    (tester) async {
      tester.view.physicalSize = const Size(390, 700);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      var taps = 0;
      await tester.pumpWidget(
        _wrap(
          saving: false,
          onSave: () => taps++,
          body: ListView(
            children: [
              for (var i = 0; i < 40; i++)
                SizedBox(height: 80, child: Text('campo $i')),
            ],
          ),
        ),
      );

      // Nenhum scroll: o CTA já está visível, colado no rodapé.
      final bar = tester.getRect(find.byType(EditProfileSaveBar));
      expect(bar.bottom, closeTo(700, 0.5));
      expect(find.text('campo 39'), findsNothing);

      await tester.tap(find.text('Salvar alterações'));
      expect(taps, 1);
    },
  );
}
