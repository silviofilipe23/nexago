import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/features/center_coach/application/center_coach_providers.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_mode_providers.dart';

CenterMembership _m(
  String centerId,
  String name, {
  String status = 'active',
  String role = 'center_owner',
}) =>
    CenterMembership.fromMap(centerId, {
      'centerName': name,
      'role': role,
      'status': status,
    });

/// Papel `center` (modo Centro de treinamento): rodapé do seletor e o refresh
/// do token quando o vínculo fica ativo com o app aberto.
void main() {
  group('centerRoleFooter', () {
    test('um centro: nome e cargo', () {
      expect(
          centerRoleFooter([_m('c1', 'CT Maré Alta')]), 'CT MARÉ ALTA · OWNER');
    });

    test('vários: o primeiro em ordem e quantos', () {
      expect(
        centerRoleFooter([
          _m('c2', 'Norte Beach', role: 'coach'),
          _m('c1', 'CT Maré Alta'),
          _m('c3', 'Antigo', status: 'revoked'),
        ]),
        'CT MARÉ ALTA · 2 CENTROS',
      );
    });

    test('só revogado: sem rodapé', () {
      expect(centerRoleFooter([_m('c1', 'X', status: 'revoked')]), isNull);
    });
  });

  test('centerRoleNeedsRefresh', () {
    expect(
      centerRoleNeedsRefresh(
        tokenRoles: const ['athlete'],
        memberships: [_m('c1', 'X')],
      ),
      isTrue,
    );
    expect(
      centerRoleNeedsRefresh(
        tokenRoles: const ['athlete', 'center'],
        memberships: [_m('c1', 'X')],
      ),
      isFalse,
    );
    expect(
      centerRoleNeedsRefresh(
        tokenRoles: const ['athlete'],
        memberships: [_m('c1', 'X', status: 'revoked')],
      ),
      isFalse,
    );
  });

  group('centerRoleSyncProvider', () {
    late StreamController<List<CenterMembership>> memberships;
    late List<bool> reads;
    late List<List<String>> tokenAnswers;
    late int roleBuilds;

    ProviderContainer container() {
      final c = ProviderContainer(
        overrides: [
          professorLinksUidProvider.overrideWithValue('u1'),
          myCenterMembershipsProvider.overrideWith((ref) => memberships.stream),
          professorRoleRetryDelaysProvider
              .overrideWithValue(const [Duration.zero, Duration.zero]),
          professorTokenRolesReaderProvider.overrideWithValue(({
            required bool forceRefresh,
          }) async {
            reads.add(forceRefresh);
            if (!forceRefresh) return const ['athlete'];
            return tokenAnswers.isEmpty
                ? const ['athlete']
                : tokenAnswers.removeAt(0);
          }),
          availableMobileRolesProvider.overrideWith((ref) async {
            roleBuilds++;
            return const [AppMobileRole.athlete];
          }),
        ],
      );
      addTearDown(c.dispose);
      return c;
    }

    setUp(() {
      memberships = StreamController<List<CenterMembership>>();
      reads = [];
      tokenAnswers = [];
      roleBuilds = 0;
    });

    tearDown(() => memberships.close());

    Future<void> settle() async {
      for (var i = 0; i < 10; i++) {
        await Future<void>.delayed(Duration.zero);
      }
    }

    test('vínculo ativo sem a claim: renova o token e recarrega os papéis',
        () async {
      final c = container();
      c.listen(availableMobileRolesProvider, (_, __) {});
      c.listen(centerRoleSyncProvider, (_, __) {});
      await settle();
      expect(roleBuilds, 1);

      tokenAnswers = [
        const ['athlete'], // o trigger ainda não gravou a claim
        const ['athlete', 'center'],
      ];
      memberships.add([_m('c1', 'CT Maré Alta')]);
      await settle();

      expect(reads, [false, true, true]);
      expect(roleBuilds, 2);
    });

    test('sem vínculo ativo não renova nada', () async {
      final c = container();
      c.listen(centerRoleSyncProvider, (_, __) {});
      memberships.add([_m('c1', 'X', status: 'revoked')]);
      await settle();
      expect(reads, [false]);
    });
  });
}
