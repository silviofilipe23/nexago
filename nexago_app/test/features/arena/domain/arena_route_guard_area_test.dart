import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_route_guard.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';

void main() {
  group('arenaAreaForPath', () {
    test('agenda', () {
      expect(arenaAreaForPath('/arena/schedule'), ArenaArea.agenda);
      expect(arenaAreaForPath('/arena/schedule/slot/s1'), ArenaArea.agenda);
      expect(arenaAreaForPath('/arena/bookings'), ArenaArea.agenda);
      expect(arenaAreaForPath('/arena/bookings/recurring/new'), ArenaArea.agenda);
      expect(arenaAreaForPath('/arena/clubs/c1/edit'), ArenaArea.agenda);
      expect(arenaAreaForPath('/arena/settings/availability'), ArenaArea.agenda);
    });

    test('comandas, estoque e quadras', () {
      expect(arenaAreaForPath('/arena/comandas'), ArenaArea.comandas);
      expect(arenaAreaForPath('/arena/comandas/c1'), ArenaArea.comandas);
      expect(arenaAreaForPath('/arena/products'), ArenaArea.estoque);
      expect(arenaAreaForPath('/arena/products/p1/restock'), ArenaArea.estoque);
      expect(arenaAreaForPath('/arena/courts'), ArenaArea.quadras);
    });

    test('perfil e comunidade — o especifico vence o generico', () {
      expect(arenaAreaForPath('/arena/profile'), ArenaArea.perfil);
      expect(arenaAreaForPath('/arena/profile/edit'), ArenaArea.perfil);
      expect(arenaAreaForPath('/arena/profile/updated'), ArenaArea.perfil);
      // Seguidores moram sob /arena/profile mas sao comunidade: se o prefixo
      // generico casar antes, o cargo errado recebe a tela.
      expect(arenaAreaForPath('/arena/profile/followers'), ArenaArea.comunidade);
      expect(arenaAreaForPath('/arena/reviews'), ArenaArea.comunidade);
    });

    test('financeiro — pagamentos e mais especifico que settings', () {
      expect(arenaAreaForPath('/arena/settings/payments'), ArenaArea.financeiro);
      expect(arenaAreaForPath('/arena/relatorios'), ArenaArea.financeiro);
    });

    test('rotas sem area', () {
      expect(arenaAreaForPath('/arena/dashboard'), isNull);
      expect(arenaAreaForPath('/arena/settings'), isNull);
      expect(arenaAreaForPath('/arena/settings/plan'), isNull);
      // Rota de atleta, nao do painel.
      expect(arenaAreaForPath('/arena/abc123'), isNull);
    });

    test('clubs e subpaths sao reconhecidos como painel e mapeiam para agenda',
        () {
      // Conforme ruling: arenaClubs precisa estar em isArenaManagerPanelPath
      expect(arenaAreaForPath('/arena/clubs'), ArenaArea.agenda);
      expect(arenaAreaForPath('/arena/clubs/c1/edit'), ArenaArea.agenda);
    });
  });

  group('isArenaOwnerOnlyPath', () {
    test('plano e assinatura sao do dono', () {
      expect(isArenaOwnerOnlyPath('/arena/settings/plan'), isTrue);
      expect(isArenaOwnerOnlyPath('/arena/settings/plan/activated'), isTrue);
      expect(isArenaOwnerOnlyPath('/arena/settings/plan/pending'), isTrue);
    });

    test('o resto nao e', () {
      expect(isArenaOwnerOnlyPath('/arena/settings'), isFalse);
      expect(isArenaOwnerOnlyPath('/arena/settings/payments'), isFalse);
      expect(isArenaOwnerOnlyPath('/arena/dashboard'), isFalse);
    });
  });
}
