import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/application/professor_mode_providers.dart';

ArenaProfessorLink _link(ArenaProfessorLinkStatus status) => ArenaProfessorLink(
      id: 'a1_u1',
      arenaId: 'a1',
      professorUserId: 'u1',
      type: ArenaProfessorLinkType.independent,
      status: status,
      permissions: ArenaProfessorPermissions.none,
    );

/// Vínculo virou ACTIVE com o app aberto: o token é renovado para a claim
/// `professor` chegar e o papel aparecer sem relogar.
void main() {
  late StreamController<List<ArenaProfessorLink>> links;
  late List<bool> reads;
  late List<List<String>> tokenAnswers;
  late int roleBuilds;

  ProviderContainer container() {
    final c = ProviderContainer(
      overrides: [
        myProfessorLinksProvider.overrideWith((ref) => links.stream),
        professorLinksClockProvider
            .overrideWithValue(() => DateTime(2026, 10, 20, 12)),
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
    links = StreamController<List<ArenaProfessorLink>>();
    reads = [];
    tokenAnswers = [];
    roleBuilds = 0;
  });

  tearDown(() => links.close());

  Future<void> settle() async {
    for (var i = 0; i < 10; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  test('vínculo ativo sem a claim: renova o token e recarrega os papéis',
      () async {
    final c = container();
    c.listen(availableMobileRolesProvider, (_, __) {});
    c.listen(professorRoleSyncProvider, (_, __) {});
    await settle();
    expect(roleBuilds, 1);

    tokenAnswers = [
      const ['athlete'], // a claim ainda não chegou na 1ª tentativa
      const ['athlete', 'professor'],
    ];
    links.add([_link(ArenaProfessorLinkStatus.active)]);
    await settle();

    expect(reads, [false, true, true]);
    expect(roleBuilds, 2);
  });

  test('sem vínculo ativo não renova nada', () async {
    final c = container();
    c.listen(professorRoleSyncProvider, (_, __) {});
    links.add([_link(ArenaProfessorLinkStatus.pending)]);
    await settle();
    expect(reads, [false]);
  });
}
