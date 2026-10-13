import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_mesa.dart';

void main() {
  Future<int Function()> pump(WidgetTester tester, {String? photoUrl}) async {
    var swaps = 0;
    // `setSurfaceSize` não atualiza o MediaQuery (cairia em paisagem): a view física sim.
    tester.view.physicalSize = const Size(420, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LiveTableMesaScreen(
            courtLabel: 'Quadra 1',
            titleLabel: 'Semifinal',
            elapsedLabel: '00:10',
            top: LiveTableMesaTeam(
              label: 'Dupla A',
              score: '3',
              isServing: true,
              onTap: () {},
              onMinus: () {},
              servingPlayerName: 'Ana',
              servingPlayerPhotoUrl: photoUrl,
              onTapServingPlayer: () => swaps++,
            ),
            bottom: LiveTableMesaTeam(
              label: 'Dupla B',
              score: '2',
              isServing: false,
              onTap: () {},
              onMinus: () {},
            ),
            net: const LiveTableMesaNet(),
            enabled: true,
            onBack: () {},
            onMore: () {},
            onUndo: () {},
            onTimeout: () {},
          ),
        ),
      ),
    );
    return () => swaps;
  }

  testWidgets('sem foto: pill mostra a inicial e o toque troca o sacador', (
    tester,
  ) async {
    final swaps = await pump(tester);
    expect(find.byKey(const ValueKey('serve-pill-avatar-zoom')), findsNothing);
    await tester.tap(find.textContaining('Saque · Ana'));
    expect(swaps(), 1);
    expect(find.byType(ProfilePhotoViewer), findsNothing);
  });

  testWidgets('com foto: o avatar amplia a imagem em vez de trocar o sacador', (
    tester,
  ) async {
    final swaps = await pump(tester, photoUrl: 'https://example.com/ana.jpg');
    await tester.tap(find.byKey(const ValueKey('serve-pill-avatar-zoom')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(ProfilePhotoViewer), findsOneWidget);
    expect(swaps(), 0);
  });
}
