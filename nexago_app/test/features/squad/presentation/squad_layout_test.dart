import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';

import '../squad_test_support.dart';

/// Guarda de layout com as fontes reais: as telas do Squad cabem num Android
/// comum (360 de largura) sem estouro. Um RenderFlex estourado derruba o teste.
void main() {
  setUpAll(loadSquadFonts);

  final routes = {
    'Squad': AppRoutes.squad,
    'Compartilhar': AppRoutes.squadShare,
    'Ganhos': AppRoutes.squadEarnings,
    'Ranking': AppRoutes.squadRanking,
    'Benefícios': AppRoutes.squadBenefits,
    'Convite': AppRoutes.squadInvite.replaceAll(':inviteId', 'inv-1'),
  };

  for (final MapEntry(key: name, value: route) in routes.entries) {
    testWidgets('$name cabe em 360 de largura', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(
            squadMember(
              pendingAmendment: {
                'at': '2026-10-15T18:00:00.000Z',
                'package': squadPackagePayload('pro'),
              },
            ),
          ),
        ),
        location: route,
        size: const Size(360, 1600),
      );

      expect(find.byType(Scaffold), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  }
}
