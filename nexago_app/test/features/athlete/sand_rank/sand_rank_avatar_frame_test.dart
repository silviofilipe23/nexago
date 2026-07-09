import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/features/athlete/presentation/sand_rank/widgets/sand_rank_avatar_frame.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  group('sandRankFrameSpec', () {
    test('decodifica ids base e dourados', () {
      expect(
        sandRankFrameSpec('FRAME_DESAFIANTE'),
        (rankCode: 'DESAFIANTE', gold: false),
      );
      expect(
        sandRankFrameSpec('FRAME_MESTRE_GOLD'),
        (rankCode: 'MESTRE', gold: true),
      );
      expect(
        sandRankFrameSpec('FRAME_LENDA'),
        (rankCode: 'LENDA', gold: false),
      );
    });

    test('rejeita ids desconhecidos, títulos e vazios', () {
      expect(sandRankFrameSpec(null), isNull);
      expect(sandRankFrameSpec(''), isNull);
      expect(sandRankFrameSpec('TITLE_MESTRE'), isNull);
      expect(sandRankFrameSpec('FRAME_TUBARAO'), isNull);
      expect(sandRankFrameSpec('FRAME__GOLD'), isNull);
    });
  });

  testWidgets('sem frameId renderiza só o child (sem anel)', (tester) async {
    await tester.pumpWidget(
      _wrap(
        const SandRankAvatarFrame(
          frameId: null,
          size: 48,
          child: SizedBox(key: Key('avatar'), width: 48, height: 48),
        ),
      ),
    );
    expect(find.byKey(const Key('avatar')), findsOneWidget);
    expect(
      find.ancestor(
        of: find.byKey(const Key('avatar')),
        matching: find.byType(Container),
      ),
      findsNothing,
    );
  });

  testWidgets('com moldura equipada desenha anel em gradiente',
      (tester) async {
    await tester.pumpWidget(
      _wrap(
        const SandRankAvatarFrame(
          frameId: 'FRAME_ELITE',
          size: 48,
          child: SizedBox(key: Key('avatar'), width: 48, height: 48),
        ),
      ),
    );

    final ring = tester.widget<Container>(
      find
          .ancestor(
            of: find.byKey(const Key('avatar')),
            matching: find.byType(Container),
          )
          .first,
    );
    final decoration = ring.decoration as BoxDecoration;
    expect(decoration.shape, BoxShape.circle);
    expect(decoration.gradient, isA<SweepGradient>());
  });

  testWidgets('moldura de Lenda tem glow animado', (tester) async {
    await tester.pumpWidget(
      _wrap(
        const SandRankAvatarFrame(
          frameId: 'FRAME_LENDA',
          size: 48,
          child: SizedBox(width: 48, height: 48),
        ),
      ),
    );
    // Glow pulsante = AnimatedBuilder acima do anel.
    expect(
      find.descendant(
        of: find.byType(SandRankAvatarFrame),
        matching: find.byType(AnimatedBuilder),
      ),
      findsWidgets,
    );
    // Anima sem lançar exceções.
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pump(const Duration(milliseconds: 800));
  });
}
