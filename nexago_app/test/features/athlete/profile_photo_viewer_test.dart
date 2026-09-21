import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';

void main() {
  Widget abridor(List<String> urls, {int initialIndex = 0}) => MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => openProfilePhotoViewer(
                context,
                photoUrls: urls,
                initialIndex: initialIndex,
              ),
              child: const Text('abrir'),
            ),
          ),
        ),
      );

  testWidgets('abre em tela cheia com foto', (tester) async {
    await tester.pumpWidget(abridor(['https://x/a.jpg']));
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePhotoViewer), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsWidgets);
  });

  testWidgets('avatar de iniciais não abre tela preta', (tester) async {
    // Sem foto o avatar mostra iniciais. Tocar não deve levar a lugar nenhum.
    for (final urls in [
      <String>[],
      [''],
      ['   ']
    ]) {
      await tester.pumpWidget(abridor(urls));
      await tester.tap(find.text('abrir'));
      await tester.pumpAndSettle();

      expect(find.byType(ProfilePhotoViewer), findsNothing, reason: '$urls');
    }
  });

  testWidgets('índice fora da lista não quebra', (tester) async {
    // A lista é filtrada antes (urls vazias caem fora), então o índice que
    // veio de fora pode não existir mais.
    await tester.pumpWidget(abridor(['', 'https://x/b.jpg'], initialIndex: 1));
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byType(ProfilePhotoViewer), findsOneWidget);
  });

  testWidgets('fecha no botão', (tester) async {
    await tester.pumpWidget(abridor(['https://x/a.jpg']));
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePhotoViewer), findsNothing);
  });
}
