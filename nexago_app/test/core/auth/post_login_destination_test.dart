import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/core/auth/post_login_destination.dart';
import 'package:nexago_app/core/router/routes.dart';

void main() {
  group('routeIsTournamentPartnerInvitePath', () {
    test('aceita convite com id', () {
      expect(
        routeIsTournamentPartnerInvitePath('/torneios-convite/abc123'),
        isTrue,
      );
    });

    test('aceita caminho gerado a partir da constante de rota', () {
      final path =
          AppRoutes.tournamentPartnerInvite.replaceAll(':inviteId', 'inv1');
      expect(routeIsTournamentPartnerInvitePath(path), isTrue);
    });

    test('rejeita prefixo sem id (barra final)', () {
      // Sem id não há convite a exibir: o redirect de onboarding deve valer.
      expect(routeIsTournamentPartnerInvitePath('/torneios-convite/'), isFalse);
    });

    test('rejeita prefixo sem barra final', () {
      expect(routeIsTournamentPartnerInvitePath('/torneios-convite'), isFalse);
    });

    test('rejeita caminhos nao relacionados', () {
      expect(routeIsTournamentPartnerInvitePath('/descobrir'), isFalse);
      expect(routeIsTournamentPartnerInvitePath('/convite/xyz'), isFalse);
      // '/torneios/...' (detalhe de torneio) NAO pode cair na isencao.
      expect(routeIsTournamentPartnerInvitePath('/torneios/abc'), isFalse);
      expect(routeIsTournamentPartnerInvitePath('/'), isFalse);
      expect(routeIsTournamentPartnerInvitePath(''), isFalse);
    });
  });
}
