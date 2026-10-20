import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/role_route_guard.dart';
import 'package:nexago_app/core/router/routes.dart';

void main() {
  group('redirectForActiveRole', () {
    test('sends multi-role users without active role to selection', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.discover,
          activeRole: null,
          availableRoles: [AppMobileRole.athlete, AppMobileRole.arena],
          needsRoleSelection: true,
        ),
        AppRoutes.roleSelection,
      );
    });

    test('blocks athlete routes when active role is arena', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.discover,
          activeRole: AppMobileRole.arena,
          availableRoles: [AppMobileRole.athlete, AppMobileRole.arena],
          needsRoleSelection: false,
        ),
        AppRoutes.arenaDashboard,
      );
    });

    test('blocks arena panel when active role is athlete', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.arenaDashboard,
          activeRole: AppMobileRole.athlete,
          availableRoles: [AppMobileRole.athlete, AppMobileRole.arena],
          needsRoleSelection: false,
        ),
        AppRoutes.discover,
      );
    });

    test('allows role selection page while choosing', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.roleSelection,
          activeRole: null,
          availableRoles: [AppMobileRole.athlete, AppMobileRole.organizer],
          needsRoleSelection: true,
        ),
        isNull,
      );
    });

    test('redirects organizer home for organizer role on root', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.home,
          activeRole: AppMobileRole.organizer,
          availableRoles: [AppMobileRole.athlete, AppMobileRole.organizer],
          needsRoleSelection: false,
        ),
        AppRoutes.organizerHome,
      );
    });

    test('blocks organizer tournament routes for athlete without staff', () {
      expect(
        redirectForActiveRole(
          path: '/organizer/tournaments/t1',
          activeRole: AppMobileRole.athlete,
          availableRoles: [AppMobileRole.athlete],
          needsRoleSelection: false,
        ),
        AppRoutes.discover,
      );
    });

    test('allows tournament operation routes for athlete staff', () {
      for (final path in [
        '/organizer/tournaments/t1',
        '/organizer/tournaments/t1/operations',
        '/organizer/tournaments/t1/categories/c1/payments',
      ]) {
        expect(
          redirectForActiveRole(
            path: path,
            activeRole: AppMobileRole.athlete,
            availableRoles: [AppMobileRole.athlete],
            needsRoleSelection: false,
            canOperateStaffTournaments: true,
          ),
          isNull,
          reason: path,
        );
      }
    });

    test('staff access does not open organizer home nor creation', () {
      for (final path in [
        AppRoutes.organizerHome,
        '/organizer/tournaments/new/express',
        '/organizer/wallet',
      ]) {
        expect(
          redirectForActiveRole(
            path: path,
            activeRole: AppMobileRole.athlete,
            availableRoles: [AppMobileRole.athlete],
            needsRoleSelection: false,
            canOperateStaffTournaments: true,
          ),
          AppRoutes.discover,
          reason: path,
        );
      }
    });

    test('membro sem a area cai no Painel da arena', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.arenaPayments,
          activeRole: AppMobileRole.arena,
          availableRoles: const [AppMobileRole.arena],
          needsRoleSelection: false,
          arenaAreaAllowed: false,
        ),
        AppRoutes.arenaDashboard,
      );
    });

    test('membro com a area segue', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.arenaPayments,
          activeRole: AppMobileRole.arena,
          availableRoles: const [AppMobileRole.arena],
          needsRoleSelection: false,
          arenaAreaAllowed: true,
        ),
        isNull,
      );
    });

    test('o Painel nunca redireciona para si mesmo', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.arenaDashboard,
          activeRole: AppMobileRole.arena,
          availableRoles: const [AppMobileRole.arena],
          needsRoleSelection: false,
          arenaAreaAllowed: false,
        ),
        isNull,
      );
    });
  });

  group('isOrganizerStaffOperablePath', () {
    test('matches tournament operation paths only', () {
      expect(isOrganizerStaffOperablePath('/organizer/tournaments/t1'), isTrue);
      expect(
        isOrganizerStaffOperablePath('/organizer/tournaments/t1/staff'),
        isTrue,
      );
      expect(
        isOrganizerStaffOperablePath('/organizer/tournaments/new/express'),
        isFalse,
      );
      expect(isOrganizerStaffOperablePath('/organizer/home'), isFalse);
      expect(isOrganizerStaffOperablePath('/torneios'), isFalse);
    });
  });

  // Loja (`/loja` e filhas): área do atleta, como o cashback.
  group('Loja', () {
    test('vitrine e subpáginas são rotas do atleta', () {
      expect(isAthleteExperiencePath(AppRoutes.store), isTrue);
      expect(isAthleteExperiencePath('/loja/produto/bola'), isTrue);
      expect(isAthleteExperiencePath(AppRoutes.storeCart), isTrue);
      expect(isAthleteExperiencePath(AppRoutes.storeAddress), isTrue);
      expect(isAthleteExperiencePath(AppRoutes.storeOrders), isTrue);
      expect(isAthleteExperiencePath('/loja/pedidos/ord_1'), isTrue);
      expect(isAthleteExperiencePath('/lojas'), isFalse);
    });

    // Com a Loja na barra inferior, a Comunidade virou página própria.
    test('Comunidade como página própria é rota do atleta', () {
      expect(isAthleteExperiencePath(AppRoutes.community), isTrue);
    });
  });

  // `/cashback` é o destino do push `cashback_released`/`cashback_expiring`:
  // fora da área do atleta, um organizador ativo abriria a tela do atleta.
  group('Meu cashback', () {
    test('é rota do atleta', () {
      expect(isAthleteExperiencePath(AppRoutes.athleteCashback), isTrue);
    });

    test('atleta abre; outro papel ativo volta para a própria home', () {
      expect(
        redirectForActiveRole(
          path: AppRoutes.athleteCashback,
          activeRole: AppMobileRole.athlete,
          availableRoles: const [AppMobileRole.athlete],
          needsRoleSelection: false,
        ),
        isNull,
      );
      expect(
        redirectForActiveRole(
          path: AppRoutes.athleteCashback,
          activeRole: AppMobileRole.organizer,
          availableRoles: const [
            AppMobileRole.athlete,
            AppMobileRole.organizer,
          ],
          needsRoleSelection: false,
        ),
        AppRoutes.organizerHome,
      );
    });
  });

  group('modo Professor', () {
    const both = [AppMobileRole.athlete, AppMobileRole.professor];

    String? go(String path, AppMobileRole active) => redirectForActiveRole(
          path: path,
          activeRole: active,
          availableRoles: both,
          needsRoleSelection: false,
        );

    test('home do Professor só no papel Professor', () {
      expect(go(AppRoutes.professorHome, AppMobileRole.professor), isNull);
      expect(
        go(AppRoutes.professorHome, AppMobileRole.athlete),
        AppRoutes.discover,
      );
      expect(
        redirectForActiveRole(
          path: AppRoutes.professorHome,
          activeRole: AppMobileRole.arena,
          availableRoles: const [AppMobileRole.arena, AppMobileRole.professor],
          needsRoleSelection: false,
        ),
        AppRoutes.arenaDashboard,
      );
    });

    test('Professor não abre o fluxo do atleta (volta para a home dele)', () {
      for (final path in [
        AppRoutes.discover,
        AppRoutes.home,
        AppRoutes.myBookings,
        AppRoutes.athleteCashback,
      ]) {
        expect(
          go(path, AppMobileRole.professor),
          AppRoutes.professorHome,
          reason: path,
        );
      }
    });

    test('Professor reserva pelas telas de arena do atleta', () {
      for (final path in [
        '/arena/a1',
        '/arena/a1/slots',
        '/arena/a1/book/confirm',
        '/arena/a1/book/pix',
        '/arena/a1/book/success',
      ]) {
        expect(go(path, AppMobileRole.professor), isNull, reason: path);
      }
      // O painel do gestor continua só do papel Gestor.
      expect(
        go(AppRoutes.arenaDashboard, AppMobileRole.professor),
        AppRoutes.professorHome,
      );
    });

    test('vínculos e chamada abrem em qualquer papel (push sem trocar)', () {
      for (final path in [
        '/athlete/professor/arenas',
        '/athlete/professor/arenas/a1_u1',
        '/athlete/professor/arenas/a1_u1/enviada',
        '/athlete/professor/aulas/class_c1_2026-10-20',
      ]) {
        for (final role in AppMobileRole.values) {
          expect(
            redirectForActiveRole(
              path: path,
              activeRole: role,
              availableRoles: AppMobileRole.values,
              needsRoleSelection: false,
            ),
            isNull,
            reason: '$path · $role',
          );
        }
      }
    });
  });
}
