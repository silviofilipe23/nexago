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
  });
}
