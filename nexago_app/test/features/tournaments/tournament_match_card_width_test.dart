import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_spacing.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_match_card_premium_skin.dart';

/// A casca do card não reserva espaçamento próprio: quem monta a lista aplica
/// o padding de tela. Se voltar a ter margem embutida, ela soma com o padding
/// e o card encolhe para metade do respiro esperado — foi o bug desta tela.
void main() {
  const viewport = 393.0;

  Widget host({required Widget child}) {
    return MaterialApp(
      home: Scaffold(
        body: ListView(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenH,
          ),
          children: [child],
        ),
      ),
    );
  }

  testWidgets('card ocupa a largura da tela menos o padding padrão',
      (tester) async {
    tester.view.physicalSize = const Size(viewport, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      host(
        child: const TournamentMatchCardSkin(
          stage: null,
          isLive: false,
          isMine: false,
          child: SizedBox(height: 80),
        ),
      ),
    );

    // Mede a caixa que de fato pinta o card, não o widget externo: `getSize`
    // no skin devolveria a largura toda mesmo com margem embutida.
    final painted = find
        .descendant(
          of: find.byType(TournamentMatchCardSkin),
          matching: find.byType(DecoratedBox),
        )
        .first;

    expect(tester.getTopLeft(painted).dx, AppSpacing.screenH);
    expect(tester.getSize(painted).width, viewport - AppSpacing.screenH * 2);
  });
}
