import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_story/booking_story_card.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  // `gradient` anula `color` no BoxDecoration: o fundo "Noite" chegou a sair
  // transparente fora do brilho — no Instagram vira preto ou branco.
  for (final theme in BookingStoryTheme.values) {
    testWidgets('fundo ${theme.label} sai opaco em toda a arte', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      final key = GlobalKey();
      await tester.pumpWidget(
        Center(
          child: RepaintBoundary(
            key: key,
            child: Directionality(
              textDirection: TextDirection.ltr,
              child: BookingStoryCard(
                data: bookingStoryDataFrom(
                  arenaName: 'Arena CFC',
                  courtName: 'Quadra 1',
                  dateKey: '2026-05-22',
                  startTime: '09:00',
                  endTime: '10:30',
                ),
                theme: theme,
                infos: const {},
              ),
            ),
          ),
        ),
      );

      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(key),
      );
      final alphas = await tester.runAsync(() async {
        final image = await boundary.toImage();
        final bytes = await image.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        );
        final w = image.width;
        final h = image.height;
        image.dispose();
        int alphaAt(int x, int y) => bytes!.getUint8((y * w + x) * 4 + 3);
        return [
          alphaAt(0, 0),
          alphaAt(w - 1, 0),
          alphaAt(w ~/ 2, h ~/ 2),
          alphaAt(0, h - 1),
          alphaAt(w - 1, h - 1),
        ];
      });

      expect(alphas, everyElement(255));
    });
  }
}
