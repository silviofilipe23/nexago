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

    test('aulas e a chamada sao painel e mapeiam para agenda', () {
      // Sem a rota em isArenaManagerPanelPath, /arena/classes cairia no
      // perfil publico /arena/:arenaId e ninguem checaria a area.
      expect(isArenaManagerPanelPath('/arena/classes'), isTrue);
      expect(arenaAreaForPath('/arena/classes'), ArenaArea.agenda);
      expect(
        arenaAreaForPath('/arena/classes/session/class_c1_2026-10-19'),
        ArenaArea.agenda,
      );
    });

    test('mensalidades das aulas: agenda ou financeiro; o resto so agenda',
        () {
      expect(arenaAreaForPath('/arena/classes/charges'), ArenaArea.agenda);
      expect(
        arenaAlternateAreaForPath('/arena/classes/charges'),
        ArenaArea.financeiro,
      );
      // Aluno e matricula leem turma/chamada: financeiro nao entra.
      expect(arenaAreaForPath('/arena/classes/student/u1'), ArenaArea.agenda);
      expect(arenaAlternateAreaForPath('/arena/classes/student/u1'), isNull);
      expect(arenaAlternateAreaForPath('/arena/classes/enroll'), isNull);
      expect(arenaAlternateAreaForPath('/arena/classes'), isNull);
      // Conversas com os alunos: o "Cobrar" do financeiro abre aqui.
      expect(arenaAreaForPath('/arena/classes/messages/s_1'), ArenaArea.agenda);
      expect(
        arenaAlternateAreaForPath('/arena/classes/messages/s_1'),
        ArenaArea.financeiro,
      );
    });

    test('repasse dos professores e so do financeiro (recepcao fora)', () {
      expect(arenaAreaForPath('/arena/classes/payouts'), ArenaArea.financeiro);
      expect(
        arenaAreaForPath('/arena/classes/payouts/t1'),
        ArenaArea.financeiro,
      );
      expect(arenaAlternateAreaForPath('/arena/classes/payouts/t1'), isNull);
    });

    test('profissionais (vinculos com professores) sao painel e area perfil',
        () {
      // Sem a rota em isArenaManagerPanelPath, /arena/professionals cairia
      // no perfil publico /arena/:arenaId e recepcao/financeiro entrariam.
      expect(isArenaManagerPanelPath('/arena/professionals'), isTrue);
      expect(arenaAreaForPath('/arena/professionals'), ArenaArea.perfil);
      expect(
        arenaAreaForPath('/arena/professionals/arena-cfc_prof-1'),
        ArenaArea.perfil,
      );
      expect(arenaAlternateAreaForPath('/arena/professionals'), isNull);
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
