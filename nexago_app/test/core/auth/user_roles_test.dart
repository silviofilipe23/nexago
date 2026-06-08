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
          rememberChoice: false,
        ),
        isFalse,
      );
    });

    test('returns true for multiple roles without remember', () {
      expect(
        userNeedsRoleSelection(
          availableRoles: [AppMobileRole.athlete, AppMobileRole.arena],
          savedRole: AppMobileRole.athlete,
          rememberChoice: false,
        ),
        isTrue,
      );
    });

    test('returns false when remember matches available role', () {
      expect(
        userNeedsRoleSelection(
          availableRoles: [AppMobileRole.athlete, AppMobileRole.arena],
          savedRole: AppMobileRole.arena,
          rememberChoice: true,
        ),
        isFalse,
      );
    });
  });
}
