import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/user_roles.dart';
import 'package:nexago_app/core/router/routes.dart';

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

    test('claim professor vira o papel Professor (e coach não)', () {
      final roles = mobileRolesFromIdToken(
        _tokenWithRoles(['athlete', 'coach', 'professor']),
      );
      expect(roles, [AppMobileRole.athlete, AppMobileRole.professor]);
      expect(userHasProfessorRole(_tokenWithRoles(['professor'])), isTrue);
      expect(userHasProfessorRole(_tokenWithRoles(['athlete'])), isFalse);
    });

    test('claim center vira o papel Centro de treinamento', () {
      final roles = mobileRolesFromIdToken(
        _tokenWithRoles(['athlete', 'center']),
      );
      expect(roles, [AppMobileRole.athlete, AppMobileRole.center]);
      expect(AppMobileRole.fromClaim('center'), AppMobileRole.center);
      expect(AppMobileRole.fromStorage('center'), AppMobileRole.center);
      expect(AppMobileRole.center.homeRoute, AppRoutes.centerHome);
      expect(AppMobileRole.center.continueLabel, 'centro de treinamento');
    });
  });

  group('AppMobileRole.professor', () {
    test('claim, armazenamento, home e textos do seletor', () {
      expect(AppMobileRole.fromClaim('professor'), AppMobileRole.professor);
      expect(AppMobileRole.fromStorage('professor'), AppMobileRole.professor);
      expect(AppMobileRole.professor.claimValue, 'professor');
      expect(AppMobileRole.professor.homeRoute, AppRoutes.professorHome);
      expect(AppMobileRole.professor.title, 'Professor');
      expect(AppMobileRole.professor.categoryLabel, 'AULAS & ARENAS');
      expect(AppMobileRole.professor.continueLabel, 'professor');
    });

    test('atleta + professor exige escolher o papel', () {
      expect(
        userNeedsRoleSelection(
          availableRoles: [AppMobileRole.athlete, AppMobileRole.professor],
        ),
        isTrue,
      );
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
