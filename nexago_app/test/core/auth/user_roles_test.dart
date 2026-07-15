import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/user_roles.dart';

IdTokenResult _tokenWithRoles(List<String> roles) {
  return _FakeIdTokenResult(roles);
}

class _FakeIdTokenResult implements IdTokenResult {
  _FakeIdTokenResult(this._roles);

  final List<String> _roles;

  @override
  Map<String, dynamic>? get claims => {'roles': _roles};

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('userDocHasAthleteRole', () {
    test('uses roles array when present', () {
      expect(
        userDocHasAthleteRole(roles: ['arena', 'athlete']),
        isTrue,
      );
      expect(
        userDocHasAthleteRole(roles: ['athlete', 'organizer']),
        isTrue,
      );
      expect(
        userDocHasAthleteRole(roles: ['arena']),
        isFalse,
      );
      expect(
        userDocHasAthleteRole(roles: ['organizer']),
        isFalse,
      );
    });

    test('userDocHasRole supports any app role', () {
      expect(
        userDocHasRole(
          requiredRole: kOrganizerAppRole,
          roles: ['organizer', 'athlete'],
        ),
        isTrue,
      );
    });

    test('roles vazio nao vira atleta implicitamente no doc', () {
      expect(userDocHasAthleteRole(roles: []), isFalse);
    });

    test('doc com roles decide sozinho, sem legado', () {
      expect(userDocHasAthleteRole(roles: ['athlete']), isTrue);
      expect(userDocHasAthleteRole(roles: ['arena']), isFalse);
    });
  });

  group('mobileRolesFromIdToken', () {
    test('maps athlete, arena and organizer claims', () {
      final roles = mobileRolesFromIdToken(
        _tokenWithRoles(['athlete', 'arena', 'organizer']),
      );
      expect(roles, [
        AppMobileRole.athlete,
        AppMobileRole.arena,
        AppMobileRole.organizer,
      ]);
    });

    test('ignores admin claim', () {
      final roles = mobileRolesFromIdToken(
        _tokenWithRoles(['admin', 'athlete']),
      );
      expect(roles, [AppMobileRole.athlete]);
    });

    test('defaults to athlete when no mobile claims', () {
      final roles = mobileRolesFromIdToken(_tokenWithRoles([]));
      expect(roles, [AppMobileRole.athlete]);
    });
  });

  group('userNeedsRoleSelection', () {
    test('returns false for single role', () {
      expect(
        userNeedsRoleSelection(
          availableRoles: [AppMobileRole.athlete],
          savedRole: null,
        ),
        isFalse,
      );
    });

    test('returns true for multiple roles without saved preference', () {
      expect(
        userNeedsRoleSelection(
          availableRoles: [AppMobileRole.athlete, AppMobileRole.arena],
          savedRole: null,
        ),
        isTrue,
      );
    });

    test('returns false when saved role is available', () {
      expect(
        userNeedsRoleSelection(
          availableRoles: [
            AppMobileRole.athlete,
            AppMobileRole.arena,
            AppMobileRole.organizer,
          ],
          savedRole: AppMobileRole.organizer,
        ),
        isFalse,
      );
    });
  });
}
