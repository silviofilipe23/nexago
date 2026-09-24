# RBAC de equipe da arena no app Flutter — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o app Flutter reconhecer membros de equipe da arena (hoje ele só enxerga o dono) e limitar cada um ao que o cargo permite, espelhando o RBAC que o portal e as `firestore.rules` já aplicam.

**Architecture:** Um `arenaAccessProvider` vira a fonte única de "qual arena e o que posso nela", alimentado pela união de duas streams — a query de dono (`arenas.where(managerUserId == uid)`) e o espelho de equipe (`users/{uid}/arenaStaff`). `managedArenaIdProvider` passa a derivar dele, mantendo a API que ~35 telas já consomem. A matriz cargo→área é portada para Dart como função pura, e o gating acontece em quatro camadas: guard de rota, bottom nav, menu de Ajustes e ações de escrita nas telas.

**Tech Stack:** Flutter · Dart 3.11 · flutter_riverpod 2.6.1 · go_router (`StatefulNavigationShell`) · cloud_firestore · flutter_test

**Spec:** `docs/superpowers/specs/2026-09-24-arena-equipe-rbac-app-design.md`

## Global Constraints

- **Todo comando roda com `cd <worktree>/nexago_app &&` embutido.** Worktrees deste repo ficam aninhados dentro do checkout principal e o `flutter` sobe diretórios até achar outra árvore — testes ficam verdes rodando código que não é o seu. O `cd` não persiste entre chamadas: repetir em cada comando.
- **Prova de que o teste novo está rodando na sua árvore:** ao adicionar o primeiro teste de cada task, confira que a contagem de testes sobe. Se não subir, plante `expect(1, 2);` dentro do teste novo e rode de novo — se passar, você está rodando outra árvore.
- Rodar testes: `flutter test test/<caminho>` · suíte inteira: `flutter test` · lint: `flutter analyze`.
- **Português nas strings/UI, inglês no código** (convenção do repo).
- **Nenhuma mudança fora de `nexago_app/`**, exceto os comentários de espelho da Task 1. Rules, functions e o trigger de espelho já estão no ar desde 01/08 — nada de backend para deployar.
- **Nenhuma dependência nova.** O app não tem `fake_cloud_firestore`; a testabilidade vem de providers-folha sobrescritos com `Stream.value(...)`.
- A matriz cargo→área é cópia literal de `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts`. Divergir dela é bug, mesmo que "faça mais sentido".

---

## Estrutura de arquivos

**Criar:**
- `lib/features/arena/domain/arena_staff_role.dart` — enums de cargo e área + matriz pura. Sem imports de Firebase ou Flutter.
- `lib/features/arena/domain/arena_access_providers.dart` — `ArenaMembership`, `ArenaAccess`, providers-folha das duas fontes, combinador e as famílias `arenaCanRead/arenaCanWriteProvider`.

**Modificar:**
- `lib/features/arena/domain/arena_schedule_providers.dart:108-121` — `managedArenaIdProvider` passa a derivar.
- `lib/features/arena/domain/arena_selection_providers.dart` — `managedArenasBriefProvider` sai; `needsArenaSelectionProvider` passa a ler memberships.
- `lib/features/arena/domain/arena_route_guard.dart` — ganha `arenaAreaForPath` e `isArenaOwnerOnlyPath`.
- `lib/core/auth/role_route_guard.dart:40-48` — `redirectForActiveRole` ganha o parâmetro de área.
- `lib/core/auth/post_login_destination.dart:137-150` — consulta o acesso quando a rota exige.
- `lib/features/arena/presentation/arena_shell_page.dart` — abas por cargo + montagem do seletor.
- `lib/features/arena/presentation/arena_settings_page.dart:145-245` — itens por área.
- `lib/features/arena/presentation/arena_dashboard_page.dart:30+` e `widgets/arena_dashboard_quick_actions.dart` — cards de dinheiro e atalhos.
- `lib/features/arena/presentation/arena_slot_detail_page.dart:450-490`, `arena_bookings_page.dart:125,180`, `arena_recurring_list_page.dart:103`, `arena_booking_details_page.dart`, `comandas/arena_comandas_page.dart:105`, `products/arena_products_list_page.dart:119,122`, `arena_payments_page.dart`, `arena_profile_page.dart` — ações de escrita.
- `lib/features/auth/domain/role_selection_providers.dart:25-33` — rodapé do card de papel.
- Comentários "ESPELHO MANUAL … três lugares" em `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts`, `functions/src/arena-staff-roles.ts`, `firestore.rules`, `frontend/projects/arena/src/app/auth/arena-access.service.spec.ts`.

**Deletar:**
- `lib/features/arena/domain/arena_manager_user.dart` — `ArenaManagerUser`/`arenaIds` nunca foram usados.

---

### Task 1: Matriz cargo→área em Dart

**Files:**
- Create: `nexago_app/lib/features/arena/domain/arena_staff_role.dart`
- Test: `nexago_app/test/features/arena/domain/arena_staff_role_test.dart`
- Modify (só comentário): `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts:3`, `functions/src/arena-staff-roles.ts`, `firestore.rules`, `frontend/projects/arena/src/app/auth/arena-access.service.spec.ts`

**Interfaces:**
- Produces: `enum ArenaStaffRole { gestor, recepcao, financeiro, manutencao }`; `enum ArenaArea { agenda, comandas, estoque, financeiro, promocoes, site, quadras, perfil, torneios, comunidade }`; `ArenaStaffRole? arenaStaffRoleFromValue(String? value)`; `bool arenaRoleCanRead(ArenaStaffRole role, ArenaArea area)`; `bool arenaRoleCanWrite(ArenaStaffRole role, ArenaArea area)`; `String arenaStaffRoleLabel(ArenaStaffRole role)`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/arena/domain/arena_staff_role_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';

/// Espelho do corpo de casos de `functions/src/arena-staff.test.ts` e
/// `functions/test/arena-staff-rbac.rules.test.mjs`. Se divergir das outras
/// quatro cópias da matriz, é aqui que tem de quebrar.
void main() {
  const writeAreas = <ArenaStaffRole, Set<ArenaArea>>{
    ArenaStaffRole.gestor: {
      ArenaArea.agenda, ArenaArea.comandas, ArenaArea.estoque,
      ArenaArea.promocoes, ArenaArea.site, ArenaArea.quadras,
      ArenaArea.perfil, ArenaArea.comunidade,
    },
    ArenaStaffRole.recepcao: {ArenaArea.agenda, ArenaArea.comandas},
    ArenaStaffRole.financeiro: {ArenaArea.promocoes},
    ArenaStaffRole.manutencao: {ArenaArea.quadras, ArenaArea.estoque},
  };

  const readAreas = <ArenaStaffRole, Set<ArenaArea>>{
    ArenaStaffRole.gestor: {
      ArenaArea.agenda, ArenaArea.comandas, ArenaArea.estoque,
      ArenaArea.promocoes, ArenaArea.site, ArenaArea.quadras,
      ArenaArea.perfil, ArenaArea.comunidade,
      ArenaArea.financeiro, ArenaArea.torneios,
    },
    ArenaStaffRole.recepcao: {
      ArenaArea.agenda, ArenaArea.comandas,
      ArenaArea.estoque, ArenaArea.comunidade,
    },
    ArenaStaffRole.financeiro: {
      ArenaArea.promocoes, ArenaArea.financeiro,
      ArenaArea.comandas, ArenaArea.comunidade,
    },
    ArenaStaffRole.manutencao: {
      ArenaArea.quadras, ArenaArea.estoque, ArenaArea.agenda,
    },
  };

  group('matriz cargo x area', () {
    for (final role in ArenaStaffRole.values) {
      for (final area in ArenaArea.values) {
        final canWrite = writeAreas[role]!.contains(area);
        final canRead = readAreas[role]!.contains(area);

        test('$role escreve em $area: $canWrite', () {
          expect(arenaRoleCanWrite(role, area), canWrite);
        });

        test('$role le $area: $canRead', () {
          expect(arenaRoleCanRead(role, area), canRead);
        });
      }
    }
  });

  test('escrita implica leitura em todas as combinacoes', () {
    for (final role in ArenaStaffRole.values) {
      for (final area in ArenaArea.values) {
        if (arenaRoleCanWrite(role, area)) {
          expect(arenaRoleCanRead(role, area), isTrue,
              reason: '$role escreve em $area mas nao le');
        }
      }
    }
  });

  group('arenaStaffRoleFromValue', () {
    test('casa os quatro valores do Firestore', () {
      expect(arenaStaffRoleFromValue('gestor'), ArenaStaffRole.gestor);
      expect(arenaStaffRoleFromValue('recepcao'), ArenaStaffRole.recepcao);
      expect(arenaStaffRoleFromValue('financeiro'), ArenaStaffRole.financeiro);
      expect(arenaStaffRoleFromValue('manutencao'), ArenaStaffRole.manutencao);
    });

    test('devolve null para desconhecido, vazio e null', () {
      expect(arenaStaffRoleFromValue('dono'), isNull);
      expect(arenaStaffRoleFromValue(''), isNull);
      expect(arenaStaffRoleFromValue(null), isNull);
    });
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_staff_role_test.dart
```
Esperado: FAIL — `Target of URI doesn't exist: '.../arena_staff_role.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/arena/domain/arena_staff_role.dart`:

```dart
/// Matriz de acesso por cargo da equipe da arena.
///
/// ESPELHO MANUAL — esta matriz existe em CINCO lugares e os cinco precisam
/// andar juntos:
///  1. este arquivo (app Flutter: abas, guard de rota, telas);
///  2. `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts` (portal);
///  3. `functions/src/arena-staff-roles.ts` (validacao dos callables);
///  4. o mapa literal em `firestore.rules` (a autoridade de verdade);
///  5. `frontend/projects/arena/src/app/auth/arena-access.service.spec.ts`.
///
/// Nada automatiza o espelhamento. O que segura a divergencia e o corpo de
/// casos compartilhado entre os testes das copias — ver
/// `test/features/arena/domain/arena_staff_role_test.dart`.
enum ArenaStaffRole { gestor, recepcao, financeiro, manutencao }

enum ArenaArea {
  agenda,
  comandas,
  estoque,
  financeiro,
  promocoes,
  site,
  quadras,
  perfil,
  torneios,
  comunidade,
}

/// Areas em que o cargo pode escrever. Escrita implica leitura.
const Map<ArenaStaffRole, Set<ArenaArea>> _writeAreas = {
  ArenaStaffRole.gestor: {
    ArenaArea.agenda,
    ArenaArea.comandas,
    ArenaArea.estoque,
    ArenaArea.promocoes,
    ArenaArea.site,
    ArenaArea.quadras,
    ArenaArea.perfil,
    ArenaArea.comunidade,
  },
  ArenaStaffRole.recepcao: {ArenaArea.agenda, ArenaArea.comandas},
  ArenaStaffRole.financeiro: {ArenaArea.promocoes},
  ArenaStaffRole.manutencao: {ArenaArea.quadras, ArenaArea.estoque},
};

/// Areas so de leitura, somadas as de escrita.
const Map<ArenaStaffRole, Set<ArenaArea>> _readOnlyAreas = {
  ArenaStaffRole.gestor: {ArenaArea.financeiro, ArenaArea.torneios},
  ArenaStaffRole.recepcao: {ArenaArea.estoque, ArenaArea.comunidade},
  ArenaStaffRole.financeiro: {
    ArenaArea.financeiro,
    ArenaArea.comandas,
    ArenaArea.comunidade,
  },
  ArenaStaffRole.manutencao: {ArenaArea.agenda},
};

bool arenaRoleCanWrite(ArenaStaffRole role, ArenaArea area) {
  return _writeAreas[role]?.contains(area) ?? false;
}

bool arenaRoleCanRead(ArenaStaffRole role, ArenaArea area) {
  return arenaRoleCanWrite(role, area) ||
      (_readOnlyAreas[role]?.contains(area) ?? false);
}

/// Valor gravado em `arenas/{id}/staff/{uid}.role` e no espelho.
ArenaStaffRole? arenaStaffRoleFromValue(String? value) {
  switch (value?.trim()) {
    case 'gestor':
      return ArenaStaffRole.gestor;
    case 'recepcao':
      return ArenaStaffRole.recepcao;
    case 'financeiro':
      return ArenaStaffRole.financeiro;
    case 'manutencao':
      return ArenaStaffRole.manutencao;
    default:
      return null;
  }
}

String arenaStaffRoleLabel(ArenaStaffRole role) => switch (role) {
      ArenaStaffRole.gestor => 'Gestor',
      ArenaStaffRole.recepcao => 'Recepção',
      ArenaStaffRole.financeiro => 'Financeiro',
      ArenaStaffRole.manutencao => 'Manutenção',
    };
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_staff_role_test.dart
```
Esperado: PASS, 83 testes (80 da matriz + 3 dos demais grupos).

- [ ] **Step 5: Atualizar os quatro comentários de espelho**

Em cada um dos quatro arquivos, trocar "existe em três lugares" por "existe em CINCO lugares" e acrescentar a linha do arquivo Dart à lista. Achar as ocorrências:

```bash
cd <worktree> && grep -rn "ESPELHO MANUAL" frontend/projects/arena/src/app functions/src firestore.rules
```

Em `arena-roles.model.ts` a lista passa a ser:

```ts
/** Matriz de acesso por cargo da equipe da arena.
 *
 *  ESPELHO MANUAL — esta matriz existe em cinco lugares e os cinco precisam andar juntos:
 *   1. este arquivo (UI: menu, guards, telas);
 *   2. `functions/src/arena-staff-roles.ts` (validação server-side dos callables);
 *   3. o mapa literal em `firestore.rules` (a autoridade de verdade);
 *   4. `nexago_app/lib/features/arena/domain/arena_staff_role.dart` (app Flutter);
 *   5. este spec: `arena-access.service.spec.ts`.
 *  `functions/test/arena-staff-rbac.rules.test.mjs` quebra se 2 e 3 divergirem; o teste
 *  `arena_staff_role_test.dart` cobre a cópia Dart. */
```

- [ ] **Step 6: Commit**

```bash
cd <worktree> && git add nexago_app/lib/features/arena/domain/arena_staff_role.dart nexago_app/test/features/arena/domain/arena_staff_role_test.dart frontend/projects/arena/src/app/painel/data/arena-roles.model.ts frontend/projects/arena/src/app/auth/arena-access.service.spec.ts functions/src/arena-staff-roles.ts firestore.rules && git commit -m "feat(arena-app): matriz cargo x area em Dart"
```

---

### Task 2: `ArenaMembership` e as duas fontes de vínculo

**Files:**
- Create: `nexago_app/lib/features/arena/domain/arena_access_providers.dart`
- Test: `nexago_app/test/features/arena/domain/arena_memberships_test.dart`

**Interfaces:**
- Consumes: `ArenaStaffRole`, `ArenaArea`, `arenaRoleCanRead`, `arenaRoleCanWrite`, `arenaStaffRoleFromValue` (Task 1).
- Produces: `class ArenaMembership` com `String arenaId`, `String name`, `bool isOwner`, `ArenaStaffRole? role`, `bool canRead(ArenaArea)`, `bool canWrite(ArenaArea)`; `List<ArenaMembership> mergeArenaMemberships({required List<ArenaMembership> owned, required List<ArenaMembership> staff})`; `ownedArenaMembershipsProvider` e `staffArenaMembershipsProvider` (ambos `StreamProvider<List<ArenaMembership>>`); `arenaMembershipsProvider` (`Provider<AsyncValue<List<ArenaMembership>>>`).

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/arena/domain/arena_memberships_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';

ArenaMembership owner(String id, String name) =>
    ArenaMembership(arenaId: id, name: name, isOwner: true);

ArenaMembership staff(String id, String name, ArenaStaffRole role) =>
    ArenaMembership(arenaId: id, name: name, isOwner: false, role: role);

void main() {
  group('mergeArenaMemberships', () {
    test('une as duas fontes ordenadas por nome', () {
      final merged = mergeArenaMemberships(
        owned: [owner('a1', 'Vegeton')],
        staff: [staff('a2', 'Areia Nobre', ArenaStaffRole.recepcao)],
      );
      expect(merged.map((m) => m.arenaId), ['a2', 'a1']);
    });

    test('dono vence quando a mesma arena aparece nas duas fontes', () {
      final merged = mergeArenaMemberships(
        owned: [owner('a1', 'Vegeton')],
        staff: [staff('a1', 'Vegeton', ArenaStaffRole.recepcao)],
      );
      expect(merged, hasLength(1));
      expect(merged.single.isOwner, isTrue);
      expect(merged.single.role, isNull);
    });

    test('lista vazia quando nao ha vinculo', () {
      expect(mergeArenaMemberships(owned: const [], staff: const []), isEmpty);
    });
  });

  group('ArenaMembership.canRead/canWrite', () {
    test('dono alcanca tudo', () {
      final m = owner('a1', 'Vegeton');
      for (final area in ArenaArea.values) {
        expect(m.canRead(area), isTrue);
        expect(m.canWrite(area), isTrue);
      }
    });

    test('manutencao le agenda e nao escreve', () {
      final m = staff('a1', 'Vegeton', ArenaStaffRole.manutencao);
      expect(m.canRead(ArenaArea.agenda), isTrue);
      expect(m.canWrite(ArenaArea.agenda), isFalse);
      expect(m.canRead(ArenaArea.comandas), isFalse);
    });
  });

  group('arenaMembershipsProvider', () {
    ProviderContainer containerWith({
      required Stream<List<ArenaMembership>> owned,
      required Stream<List<ArenaMembership>> staffStream,
    }) {
      final container = ProviderContainer(overrides: [
        ownedArenaMembershipsProvider.overrideWith((ref) => owned),
        staffArenaMembershipsProvider.overrideWith((ref) => staffStream),
      ]);
      addTearDown(container.dispose);
      return container;
    }

    test('fica em loading enquanto uma das fontes nao emitiu', () async {
      final container = containerWith(
        owned: Stream.value(const <ArenaMembership>[]),
        staffStream: const Stream<List<ArenaMembership>>.empty(),
      );
      container.listen(arenaMembershipsProvider, (_, __) {});
      await Future<void>.delayed(Duration.zero);
      expect(container.read(arenaMembershipsProvider).isLoading, isTrue);
    });

    test('combina as duas fontes depois das duas emissoes', () async {
      final container = containerWith(
        owned: Stream.value([owner('a1', 'Vegeton')]),
        staffStream:
            Stream.value([staff('a2', 'Areia Nobre', ArenaStaffRole.gestor)]),
      );
      container.listen(arenaMembershipsProvider, (_, __) {});
      await Future<void>.delayed(Duration.zero);
      final value = container.read(arenaMembershipsProvider).valueOrNull;
      expect(value?.map((m) => m.arenaId), ['a2', 'a1']);
    });
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_memberships_test.dart
```
Esperado: FAIL — `Target of URI doesn't exist: '.../arena_access_providers.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/arena/domain/arena_access_providers.dart` (a parte desta task; `ArenaAccess` entra na Task 3):

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import 'arena_staff_role.dart';

/// Vinculo do usuario logado com uma arena — como dono (`managerUserId`) ou
/// como membro de equipe (`users/{uid}/arenaStaff/{arenaId}`, espelho mantido
/// pela Cloud Function `onArenaStaffWrittenSyncMirror`).
class ArenaMembership {
  const ArenaMembership({
    required this.arenaId,
    required this.name,
    required this.isOwner,
    this.role,
  });

  final String arenaId;
  final String name;
  final bool isOwner;

  /// Cargo na equipe; `null` para o dono, que nao tem cargo.
  final ArenaStaffRole? role;

  bool canRead(ArenaArea area) {
    if (isOwner) return true;
    final r = role;
    return r != null && arenaRoleCanRead(r, area);
  }

  bool canWrite(ArenaArea area) {
    if (isOwner) return true;
    final r = role;
    return r != null && arenaRoleCanWrite(r, area);
  }
}

/// Une dono e equipe. Se a mesma arena vier das duas fontes, o vinculo de dono
/// vence — dono tem acesso total e nao pode ser rebaixado por um cargo.
List<ArenaMembership> mergeArenaMemberships({
  required List<ArenaMembership> owned,
  required List<ArenaMembership> staff,
}) {
  final byId = <String, ArenaMembership>{};
  for (final m in staff) {
    byId[m.arenaId] = m;
  }
  for (final m in owned) {
    byId[m.arenaId] = m;
  }
  final list = byId.values.toList(growable: false)
    ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  return list;
}

/// Arenas em que o usuario e dono.
final ownedArenaMembershipsProvider =
    StreamProvider<List<ArenaMembership>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) {
    return Stream.value(const <ArenaMembership>[]);
  }
  return ref
      .watch(firestoreProvider)
      .collection('arenas')
      .where('managerUserId', isEqualTo: uid)
      .limit(30)
      .snapshots()
      .map((snap) => snap.docs
          .map((doc) => ArenaMembership(
                arenaId: doc.id,
                name: (doc.data()['name'] as String?)?.trim() ?? '',
                isOwner: true,
              ))
          .toList(growable: false));
});

/// Arenas em que o usuario e equipe ATIVA. Le o espelho, nunca
/// `arenas/{id}/staff` — a query por `managerUserId` jamais traria estas, e o
/// espelho e a unica fonte que o cliente alcanca (`firestore.rules:1883`).
final staffArenaMembershipsProvider =
    StreamProvider<List<ArenaMembership>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) {
    return Stream.value(const <ArenaMembership>[]);
  }
  return ref
      .watch(firestoreProvider)
      .collection('users/$uid/arenaStaff')
      .snapshots()
      .map((snap) {
    final list = <ArenaMembership>[];
    for (final doc in snap.docs) {
      final data = doc.data();
      if ((data['status'] as String?) != 'active') continue;
      final role = arenaStaffRoleFromValue(data['role'] as String?);
      if (role == null) continue;
      list.add(ArenaMembership(
        arenaId: doc.id,
        name: (data['arenaName'] as String?)?.trim() ?? '',
        isOwner: false,
        role: role,
      ));
    }
    return list;
  });
});

/// Todos os vinculos do usuario. Fica em `loading` ate as DUAS fontes
/// emitirem: e o que impede a UI de decidir acesso com metade da resposta.
/// Erro numa fonte vira lista vazia daquela fonte — a outra continua valendo,
/// e a fronteira de verdade sao as rules, nao esta tela.
final arenaMembershipsProvider =
    Provider<AsyncValue<List<ArenaMembership>>>((ref) {
  final owned = ref.watch(ownedArenaMembershipsProvider);
  final staff = ref.watch(staffArenaMembershipsProvider);
  if (owned.isLoading || staff.isLoading) {
    return const AsyncValue<List<ArenaMembership>>.loading();
  }
  return AsyncValue.data(mergeArenaMemberships(
    owned: owned.valueOrNull ?? const [],
    staff: staff.valueOrNull ?? const [],
  ));
});
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_memberships_test.dart && flutter analyze lib/features/arena/domain/arena_access_providers.dart
```
Esperado: PASS (7 testes) e `No issues found`.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add nexago_app/lib/features/arena/domain/arena_access_providers.dart nexago_app/test/features/arena/domain/arena_memberships_test.dart && git commit -m "feat(arena-app): vinculos de arena (dono + equipe) em um provider"
```

---

### Task 3: `ArenaAccess` e `managedArenaIdProvider` derivado

**Files:**
- Modify: `nexago_app/lib/features/arena/domain/arena_access_providers.dart`
- Modify: `nexago_app/lib/features/arena/domain/arena_schedule_providers.dart:107-121`
- Test: `nexago_app/test/features/arena/domain/arena_access_test.dart`

**Interfaces:**
- Consumes: tudo da Task 2 + `currentArenaIdProvider` (de `arena_selection_providers.dart`).
- Produces: `class ArenaAccess` com `ArenaMembership? membership`, `String? arenaId`, `bool isOwner`, `ArenaStaffRole? role`, `bool canRead(ArenaArea)`, `bool canWrite(ArenaArea)`, `static const ArenaAccess none`; `arenaAccessProvider` (`Provider<AsyncValue<ArenaAccess>>`); `arenaCanReadProvider` e `arenaCanWriteProvider` (`Provider.family<bool, ArenaArea>`); `Future<ArenaAccess> resolveArenaAccess(Ref ref)`. `managedArenaIdProvider` passa de `StreamProvider<String?>` para `Provider<AsyncValue<String?>>` (mesma API nos pontos de uso: `.valueOrNull`, `.when`).

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/arena/domain/arena_access_test.dart`:

```dart
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_selection_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';

ArenaMembership owner(String id, String name) =>
    ArenaMembership(arenaId: id, name: name, isOwner: true);

ArenaMembership staff(String id, String name, ArenaStaffRole role) =>
    ArenaMembership(arenaId: id, name: name, isOwner: false, role: role);

ProviderContainer containerWith(List<ArenaMembership> memberships,
    {bool loading = false}) {
  final container = ProviderContainer(overrides: [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => loading
          ? const Stream<List<ArenaMembership>>.empty()
          : Stream.value(memberships.where((m) => m.isOwner).toList()),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(memberships.where((m) => !m.isOwner).toList()),
    ),
  ]);
  addTearDown(container.dispose);
  container.listen(arenaMembershipsProvider, (_, __) {});
  return container;
}

void main() {
  test('sem vinculo o acesso nega tudo e nao tem arenaId', () async {
    final container = containerWith(const []);
    await Future<void>.delayed(Duration.zero);
    final access = container.read(arenaAccessProvider).valueOrNull;
    expect(access?.arenaId, isNull);
    expect(access?.canRead(ArenaArea.agenda), isFalse);
  });

  test('vinculo unico vira o acesso ativo', () async {
    final container = containerWith([staff('a1', 'Vegeton', ArenaStaffRole.recepcao)]);
    await Future<void>.delayed(Duration.zero);
    final access = container.read(arenaAccessProvider).valueOrNull;
    expect(access?.arenaId, 'a1');
    expect(access?.canWrite(ArenaArea.comandas), isTrue);
    expect(access?.canRead(ArenaArea.financeiro), isFalse);
  });

  test('com duas arenas, a selecao manda', () async {
    final container = containerWith([
      staff('a1', 'Vegeton', ArenaStaffRole.recepcao),
      owner('a2', 'Areia Nobre'),
    ]);
    await Future<void>.delayed(Duration.zero);
    container.read(currentArenaIdProvider.notifier).selectArena('a1');
    final access = container.read(arenaAccessProvider).valueOrNull;
    expect(access?.arenaId, 'a1');
    expect(access?.isOwner, isFalse);
  });

  test('selecao inexistente cai na primeira arena', () async {
    final container = containerWith([owner('a2', 'Areia Nobre')]);
    await Future<void>.delayed(Duration.zero);
    container.read(currentArenaIdProvider.notifier).selectArena('sumiu');
    expect(container.read(arenaAccessProvider).valueOrNull?.arenaId, 'a2');
  });

  test('enquanto carrega, canRead e canWrite respondem false', () async {
    final container = containerWith(const [], loading: true);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(arenaCanReadProvider(ArenaArea.financeiro)), isFalse);
    expect(container.read(arenaCanWriteProvider(ArenaArea.agenda)), isFalse);
  });

  test('dono responde true em canRead/canWrite de qualquer area', () async {
    final container = containerWith([owner('a1', 'Vegeton')]);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(arenaCanReadProvider(ArenaArea.financeiro)), isTrue);
    expect(container.read(arenaCanWriteProvider(ArenaArea.perfil)), isTrue);
  });

  // Revogacao ao vivo: o portal remove o membro e o espelho perde o doc. Como
  // a fonte e um listener, o painel tem de cair no mesmo instante — e isso que
  // o spec promete e o que um resolvedor por callable NAO daria.
  test('membro removido no meio da sessao perde o acesso', () async {
    final staffController =
        StreamController<List<ArenaMembership>>.broadcast();
    addTearDown(staffController.close);
    final container = ProviderContainer(overrides: [
      ownedArenaMembershipsProvider
          .overrideWith((ref) => Stream.value(const <ArenaMembership>[])),
      staffArenaMembershipsProvider
          .overrideWith((ref) => staffController.stream),
    ]);
    addTearDown(container.dispose);
    container.listen(arenaMembershipsProvider, (_, __) {});

    staffController.add([staff('a1', 'Vegeton', ArenaStaffRole.gestor)]);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(arenaAccessProvider).valueOrNull?.arenaId, 'a1');

    staffController.add(const []);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(arenaAccessProvider).valueOrNull?.arenaId, isNull);
    expect(container.read(arenaCanReadProvider(ArenaArea.agenda)), isFalse);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_access_test.dart
```
Esperado: FAIL — `Undefined name 'arenaAccessProvider'`.

- [ ] **Step 3: Implementar — acrescentar ao fim de `arena_access_providers.dart`**

```dart
/// O que o usuario logado pode na arena ATIVA.
class ArenaAccess {
  const ArenaAccess._(this.membership);

  factory ArenaAccess.of(ArenaMembership membership) =>
      ArenaAccess._(membership);

  /// Sem vinculo: nega tudo. Tambem e o valor usado enquanto o espelho nao
  /// emitiu, para nenhuma tela decidir acesso com resposta pela metade.
  static const ArenaAccess none = ArenaAccess._(null);

  final ArenaMembership? membership;

  String? get arenaId => membership?.arenaId;
  String get arenaName => membership?.name ?? '';
  bool get isOwner => membership?.isOwner ?? false;
  ArenaStaffRole? get role => membership?.role;

  bool canRead(ArenaArea area) => membership?.canRead(area) ?? false;
  bool canWrite(ArenaArea area) => membership?.canWrite(area) ?? false;
}

/// Acesso na arena ativa: a selecionada quando ha mais de uma, senao a unica.
final arenaAccessProvider = Provider<AsyncValue<ArenaAccess>>((ref) {
  final selected = ref.watch(currentArenaIdProvider)?.trim();
  return ref.watch(arenaMembershipsProvider).whenData((list) {
    if (list.isEmpty) return ArenaAccess.none;
    if (selected != null && selected.isNotEmpty) {
      for (final m in list) {
        if (m.arenaId == selected) return ArenaAccess.of(m);
      }
    }
    return ArenaAccess.of(list.first);
  });
});

/// Atalhos para a UI. Enquanto o acesso nao resolveu, respondem `false` — e o
/// que impede o faturamento de piscar na tela de quem nao pode ve-lo no cold
/// start (mesma armadilha ja documentada em
/// `organizerSeesTournamentMoneyProvider`).
final arenaCanReadProvider = Provider.family<bool, ArenaArea>((ref, area) {
  return ref.watch(arenaAccessProvider).valueOrNull?.canRead(area) ?? false;
});

final arenaCanWriteProvider = Provider.family<bool, ArenaArea>((ref, area) {
  return ref.watch(arenaAccessProvider).valueOrNull?.canWrite(area) ?? false;
});

/// Aguarda a primeira emissao das duas fontes e devolve o acesso resolvido.
/// Usado pelo guard de rota, que precisa de resposta antes de deixar navegar.
/// Mesmo formato de `hasActiveTournamentStaffAccess`.
Future<ArenaAccess> resolveArenaAccess(Ref ref) async {
  try {
    await ref.read(ownedArenaMembershipsProvider.future);
    await ref.read(staffArenaMembershipsProvider.future);
  } catch (_) {
    // Uma fonte que falha nao pode travar a outra; o combinador ja trata
    // erro como lista vazia.
  }
  return ref.read(arenaAccessProvider).valueOrNull ?? ArenaAccess.none;
}
```

Acrescentar no topo do arquivo: `import 'arena_selection_providers.dart';`

- [ ] **Step 4: Derivar `managedArenaIdProvider`**

Em `nexago_app/lib/features/arena/domain/arena_schedule_providers.dart`, substituir o bloco das linhas 107-121 por:

```dart
/// Arena ativa do painel. Deriva de [arenaAccessProvider], que une dono e
/// equipe — antes era `arenas.where(managerUserId == uid).limit(1)`, query que
/// nunca casava com membro de equipe.
///
/// Continua entregando `AsyncValue<String?>`: os ~35 pontos de uso leem
/// `.valueOrNull` e `.when`, entao nada muda para eles.
final managedArenaIdProvider = Provider<AsyncValue<String?>>((ref) {
  return ref.watch(arenaAccessProvider).whenData((access) => access.arenaId);
});
```

Acrescentar o import `import 'arena_access_providers.dart';` no arquivo.

- [ ] **Step 5: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_access_test.dart && flutter analyze lib/features/arena && flutter test
```
Esperado: PASS nos 7 testes novos, `No issues found` e a suíte inteira verde — se algum ponto de uso de `managedArenaIdProvider` usar `.stream`/`.future`, é aqui que aparece.

- [ ] **Step 6: Commit**

```bash
cd <worktree> && git add nexago_app/lib/features/arena/domain/ nexago_app/test/features/arena/domain/arena_access_test.dart && git commit -m "feat(arena-app): arenaAccessProvider como fonte unica da arena ativa"
```

---

### Task 4: Seleção de arena e remoção do código morto

**Files:**
- Modify: `nexago_app/lib/features/arena/domain/arena_selection_providers.dart`
- Modify: `nexago_app/lib/features/arena/presentation/widgets/arena_selection_gate.dart`
- Modify: `nexago_app/lib/features/auth/domain/role_selection_providers.dart:25-33`
- Delete: `nexago_app/lib/features/arena/domain/arena_manager_user.dart`
- Test: `nexago_app/test/features/arena/domain/arena_selection_test.dart`

**Interfaces:**
- Consumes: `arenaMembershipsProvider`, `ArenaMembership` (Task 2), `currentArenaIdProvider`.
- Produces: `needsArenaSelectionProvider` (`Provider<bool>`) passa a ler memberships; `managedArenasBriefProvider` deixa de existir.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/arena/domain/arena_selection_test.dart`:

```dart
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_selection_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';

ProviderContainer containerWith(List<ArenaMembership> all) {
  final container = ProviderContainer(overrides: [
    ownedArenaMembershipsProvider
        .overrideWith((ref) => Stream.value(all.where((m) => m.isOwner).toList())),
    staffArenaMembershipsProvider
        .overrideWith((ref) => Stream.value(all.where((m) => !m.isOwner).toList())),
  ]);
  addTearDown(container.dispose);
  container.listen(arenaMembershipsProvider, (_, __) {});
  return container;
}

void main() {
  test('uma arena nao exige selecao', () async {
    final container = containerWith([
      const ArenaMembership(arenaId: 'a1', name: 'Vegeton', isOwner: true),
    ]);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(needsArenaSelectionProvider), isFalse);
  });

  test('duas arenas sem escolha exigem selecao', () async {
    final container = containerWith([
      const ArenaMembership(arenaId: 'a1', name: 'Vegeton', isOwner: true),
      const ArenaMembership(
          arenaId: 'a2',
          name: 'Areia Nobre',
          isOwner: false,
          role: ArenaStaffRole.gestor),
    ]);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(needsArenaSelectionProvider), isTrue);

    container.read(currentArenaIdProvider.notifier).selectArena('a2');
    expect(container.read(needsArenaSelectionProvider), isFalse);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_selection_test.dart
```
Esperado: FAIL — o teste ainda compila contra o provider antigo, mas `needsArenaSelectionProvider` lê `managedArenasBriefProvider`, que toca o Firestore e nunca emite; o segundo caso falha por `false` onde se espera `true`.

- [ ] **Step 3: Reescrever `arena_selection_providers.dart`**

O arquivo inteiro passa a ser:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'arena_access_providers.dart';

final currentArenaIdProvider =
    StateNotifierProvider<CurrentArenaIdController, String?>(
  (ref) => CurrentArenaIdController(),
);

class CurrentArenaIdController extends StateNotifier<String?> {
  CurrentArenaIdController() : super(null);

  void selectArena(String arenaId) {
    final id = arenaId.trim();
    state = id.isEmpty ? null : id;
  }
}

/// Bloqueia o painel ate escolher, quando o usuario alcanca mais de uma arena
/// (dono de uma e equipe de outra, por exemplo).
final needsArenaSelectionProvider = Provider<bool>((ref) {
  final arenas = ref.watch(arenaMembershipsProvider).valueOrNull ?? const [];
  if (arenas.length <= 1) return false;
  final selected = ref.watch(currentArenaIdProvider);
  if (selected == null || selected.trim().isEmpty) return true;
  return !arenas.any((m) => m.arenaId == selected.trim());
});
```

`managedArenasBriefProvider` sai daqui. Atenção ao ciclo de import: `arena_access_providers.dart` importa este arquivo (por `currentArenaIdProvider`) e este importa aquele — Dart aceita imports mútuos entre bibliotecas, então isso compila; se `flutter analyze` reclamar, mover `currentArenaIdProvider` para dentro de `arena_access_providers.dart` e deixar este arquivo só com `needsArenaSelectionProvider`.

- [ ] **Step 4: Repontar os dois consumidores**

Em `arena_selection_gate.dart`, trocar a lista de `ArenaListItem` por `ArenaMembership`: `ref.watch(arenaMembershipsProvider)` no lugar de `ref.watch(managedArenasBriefProvider)`, `_ArenaList` recebendo `List<ArenaMembership>` e usando `a.arenaId` / `a.name`. Remover o `export '../../domain/arena_selection_providers.dart';` se quebrar import de terceiros — rodar `flutter analyze` para saber.

Em `role_selection_providers.dart:25-33`, o case `AppMobileRole.arena` passa a:

```dart
    case AppMobileRole.arena:
      final arenas =
          ref.watch(arenaMembershipsProvider).valueOrNull ?? const [];
      if (arenas.isEmpty) return null;
      final first = arenas.first;
      if (arenas.length > 1) {
        return '${first.name.toUpperCase()} · ${arenas.length} ARENAS';
      }
      return first.name.toUpperCase();
```

- [ ] **Step 5: Deletar o código morto**

```bash
cd <worktree> && git rm nexago_app/lib/features/arena/domain/arena_manager_user.dart
```

- [ ] **Step 6: Montar o seletor no shell**

Em `arena_shell_page.dart`, logo no início do `build`:

```dart
    if (ref.watch(needsArenaSelectionProvider)) {
      return const ArenaSelectionGate();
    }
```

com `import '../domain/arena_selection_providers.dart';` e `import 'widgets/arena_selection_gate.dart';`.

- [ ] **Step 7: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_selection_test.dart && flutter analyze && flutter test
```
Esperado: PASS nos 2 testes novos, `No issues found`, suíte verde.

- [ ] **Step 8: Commit**

```bash
cd <worktree> && git add -A nexago_app && git commit -m "feat(arena-app): seletor de arena real e remocao do codigo morto"
```

---

### Task 5: Mapa rota→área

**Files:**
- Modify: `nexago_app/lib/features/arena/domain/arena_route_guard.dart`
- Test: `nexago_app/test/features/arena/domain/arena_route_guard_area_test.dart`

**Interfaces:**
- Consumes: `ArenaArea` (Task 1).
- Produces: `ArenaArea? arenaAreaForPath(String path)`; `bool isArenaOwnerOnlyPath(String path)`.

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/arena/domain/arena_route_guard_area_test.dart`:

```dart
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
  });

  group('isArenaOwnerOnlyPath', () {
    test('plano e assinatura sao do dono', () {
      expect(isArenaOwnerOnlyPath('/arena/settings/plan'), isTrue);
      expect(isArenaOwnerOnlyPath('/arena/settings/plan/activated'), isTrue);
      expect(isArenaOwnerOnlyPath('/arena/settings/subscription-pending'), isTrue);
    });

    test('o resto nao e', () {
      expect(isArenaOwnerOnlyPath('/arena/settings'), isFalse);
      expect(isArenaOwnerOnlyPath('/arena/settings/payments'), isFalse);
      expect(isArenaOwnerOnlyPath('/arena/dashboard'), isFalse);
    });
  });
}
```

Antes de escrever a implementação, confirmar o path exato de `arenaSubscriptionPending`:

```bash
cd <worktree>/nexago_app && grep -n "arenaSubscriptionPending\|arenaPlanActivated" lib/core/router/routes.dart
```
Se o literal diferir de `/arena/settings/subscription-pending`, ajustar teste e implementação para o valor real.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_route_guard_area_test.dart
```
Esperado: FAIL — `Undefined name 'arenaAreaForPath'`.

- [ ] **Step 3: Implementar — acrescentar a `arena_route_guard.dart`**

```dart
import 'arena_staff_role.dart';

/// Rota do painel -> area do RBAC. Espelha os guards do portal
/// (`frontend/projects/arena/src/app/app.routes.ts`), que e a referencia.
///
/// A ORDEM IMPORTA: o casamento vai do mais especifico para o mais generico.
/// `/arena/profile/followers` e comunidade, nao perfil; `/arena/settings/payments`
/// e financeiro, nao "sem area". Inverter a ordem entrega a tela ao cargo errado
/// sem erro nenhum na tela.
const List<MapEntry<String, ArenaArea>> _arenaAreaByPrefix = [
  MapEntry('/arena/profile/followers', ArenaArea.comunidade),
  MapEntry('/arena/settings/payments', ArenaArea.financeiro),
  MapEntry('/arena/settings/availability', ArenaArea.agenda),
  MapEntry('/arena/profile', ArenaArea.perfil),
  MapEntry('/arena/reviews', ArenaArea.comunidade),
  MapEntry('/arena/relatorios', ArenaArea.financeiro),
  MapEntry('/arena/schedule', ArenaArea.agenda),
  MapEntry('/arena/bookings', ArenaArea.agenda),
  MapEntry('/arena/clubs', ArenaArea.agenda),
  MapEntry('/arena/comandas', ArenaArea.comandas),
  MapEntry('/arena/products', ArenaArea.estoque),
  MapEntry('/arena/courts', ArenaArea.quadras),
];

const List<String> _arenaOwnerOnlyPrefixes = [
  AppRoutes.arenaPlan,
  AppRoutes.arenaSubscriptionPending,
];

bool _matches(String path, String prefix) {
  return path == prefix || path.startsWith('$prefix/');
}

/// Area exigida pela rota; `null` quando a rota nao tem area (Painel, Ajustes)
/// ou quando nao e rota do painel.
ArenaArea? arenaAreaForPath(String path) {
  if (!isArenaManagerPanelPath(path)) return null;
  for (final entry in _arenaAreaByPrefix) {
    if (_matches(path, entry.key)) return entry.value;
  }
  return null;
}

/// Plano e assinatura: so o dono. Mesma fronteira do `arenaOwnerGuard` do portal.
bool isArenaOwnerOnlyPath(String path) {
  for (final prefix in _arenaOwnerOnlyPrefixes) {
    if (_matches(path, prefix)) return true;
  }
  return false;
}
```

`AppRoutes.arenaPlanActivated` é `/arena/settings/plan/activated`, então `_matches` com o prefixo `arenaPlan` já o cobre.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_route_guard_area_test.dart
```
Esperado: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add nexago_app/lib/features/arena/domain/arena_route_guard.dart nexago_app/test/features/arena/domain/arena_route_guard_area_test.dart && git commit -m "feat(arena-app): mapa rota para area do painel"
```

---

### Task 6: Guard de rota por área

**Files:**
- Modify: `nexago_app/lib/core/auth/role_route_guard.dart:40-48,66-70`
- Modify: `nexago_app/lib/core/auth/post_login_destination.dart:137-150`
- Test: `nexago_app/test/core/auth/role_route_guard_test.dart` (acrescentar casos)

**Interfaces:**
- Consumes: `arenaAreaForPath`, `isArenaOwnerOnlyPath` (Task 5), `resolveArenaAccess` (Task 3).
- Produces: `redirectForActiveRole` ganha `bool arenaAreaAllowed = true`; `Future<bool> hasArenaAreaAccess(Ref ref, String path)` em `post_login_destination.dart`.

- [ ] **Step 1: Escrever o teste que falha — acrescentar ao fim do `group` existente**

```dart
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
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/core/auth/role_route_guard_test.dart
```
Esperado: FAIL — `No named parameter with the name 'arenaAreaAllowed'`.

- [ ] **Step 3: Implementar em `role_route_guard.dart`**

Acrescentar o parâmetro à assinatura:

```dart
String? redirectForActiveRole({
  required String path,
  required AppMobileRole? activeRole,
  required List<AppMobileRole> availableRoles,
  required bool needsRoleSelection,
  bool canOperateStaffTournaments = false,
  bool arenaAreaAllowed = true,
}) {
```

E, logo DEPOIS do bloco `if (isArenaManagerPanelPath(path) && activeRole != AppMobileRole.arena)`:

```dart
  // Membro de equipe no painel: o cargo nao alcanca a area desta rota. Volta
  // ao Painel, que nao tem area — nao ao login, porque a pessoa TEM painel.
  // Fail-closed de proposito: erro ao resolver o acesso tambem cai aqui, e o
  // pior caso e abrir na tela inicial.
  if (isArenaManagerPanelPath(path) &&
      activeRole == AppMobileRole.arena &&
      !arenaAreaAllowed &&
      path != AppRoutes.arenaDashboard) {
    return AppRoutes.arenaDashboard;
  }
```

- [ ] **Step 4: Ligar em `post_login_destination.dart`**

Acrescentar antes da chamada a `redirectForActiveRole`:

```dart
  // Area do painel da arena: so consulta quando a rota exige, como ja e feito
  // com o staff de torneio logo acima.
  var arenaAreaAllowed = true;
  if (activeRole == AppMobileRole.arena && isArenaManagerPanelPath(path)) {
    arenaAreaAllowed = await hasArenaAreaAccess(ref, path);
  }
```

e passar `arenaAreaAllowed: arenaAreaAllowed` na chamada. No fim do arquivo:

```dart
/// A rota do painel da arena e alcancavel pelo vinculo atual? Aguarda a
/// primeira emissao das duas fontes — decidir com o espelho ainda vazio
/// mandaria o dono para o Painel no primeiro frame de um deep link.
Future<bool> hasArenaAreaAccess(Ref ref, String path) async {
  final area = arenaAreaForPath(path);
  final ownerOnly = isArenaOwnerOnlyPath(path);
  if (area == null && !ownerOnly) return true;
  final access = await resolveArenaAccess(ref);
  if (ownerOnly) return access.isOwner;
  return access.canRead(area!);
}
```

Imports novos: `import '../../features/arena/domain/arena_access_providers.dart';` e `import '../../features/arena/domain/arena_staff_role.dart';` (o de `arena_route_guard.dart` já existe via `role_route_guard.dart`; conferir com `flutter analyze`).

- [ ] **Step 5: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/core/auth/role_route_guard_test.dart && flutter analyze
```
Esperado: PASS com 3 testes a mais que antes, `No issues found`.

- [ ] **Step 6: Commit**

```bash
cd <worktree> && git add nexago_app/lib/core/auth nexago_app/test/core/auth && git commit -m "feat(arena-app): guard de rota por area do cargo"
```

---

### Task 7: Bottom nav por cargo

**Files:**
- Modify: `nexago_app/lib/features/arena/presentation/arena_shell_page.dart`
- Create: `nexago_app/lib/features/arena/domain/arena_tab_visibility.dart`
- Test: `nexago_app/test/features/arena/domain/arena_tab_visibility_test.dart`
- Test: `nexago_app/test/features/arena/arena_shell_tabs_test.dart`

**Interfaces:**
- Consumes: `ArenaAccess`, `arenaAccessProvider` (Task 3), `ArenaTab` (`arena_tab.dart`).
- Produces: `List<ArenaTab> visibleArenaTabs(ArenaAccess access, {required bool accessLoaded})`.

- [ ] **Step 1: Escrever o teste puro que falha**

`nexago_app/test/features/arena/domain/arena_tab_visibility_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/arena_tab.dart';
import 'package:nexago_app/features/arena/domain/arena_tab_visibility.dart';

ArenaAccess accessFor(ArenaStaffRole role) => ArenaAccess.of(
      ArenaMembership(
          arenaId: 'a1', name: 'Vegeton', isOwner: false, role: role),
    );

void main() {
  test('dono ve as cinco abas', () {
    final tabs = visibleArenaTabs(
      ArenaAccess.of(
          const ArenaMembership(arenaId: 'a1', name: 'V', isOwner: true)),
      accessLoaded: true,
    );
    expect(tabs, ArenaTab.values);
  });

  test('gestor ve as cinco abas', () {
    expect(visibleArenaTabs(accessFor(ArenaStaffRole.gestor), accessLoaded: true),
        ArenaTab.values);
  });

  test('recepcao ve as cinco abas', () {
    expect(
        visibleArenaTabs(accessFor(ArenaStaffRole.recepcao), accessLoaded: true),
        ArenaTab.values);
  });

  test('manutencao perde Comandas', () {
    expect(
      visibleArenaTabs(accessFor(ArenaStaffRole.manutencao), accessLoaded: true),
      [ArenaTab.dashboard, ArenaTab.schedule, ArenaTab.bookings, ArenaTab.settings],
    );
  });

  test('financeiro perde Agenda e Reservas', () {
    expect(
      visibleArenaTabs(accessFor(ArenaStaffRole.financeiro), accessLoaded: true),
      [ArenaTab.dashboard, ArenaTab.comandas, ArenaTab.settings],
    );
  });

  test('enquanto o acesso carrega, mostra tudo', () {
    expect(visibleArenaTabs(ArenaAccess.none, accessLoaded: false),
        ArenaTab.values);
  });

  test('sem vinculo resolvido, so Painel e Ajustes', () {
    expect(visibleArenaTabs(ArenaAccess.none, accessLoaded: true),
        [ArenaTab.dashboard, ArenaTab.settings]);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_tab_visibility_test.dart
```
Esperado: FAIL — `Target of URI doesn't exist: '.../arena_tab_visibility.dart'`.

- [ ] **Step 3: Implementar**

`nexago_app/lib/features/arena/domain/arena_tab_visibility.dart`:

```dart
import 'arena_access_providers.dart';
import 'arena_staff_role.dart';
import 'arena_tab.dart';

/// Abas que o cargo alcanca, na ordem do shell.
///
/// `accessLoaded: false` devolve TODAS as abas de proposito. A barra nao e
/// fronteira de seguranca — o guard de rota (fail-closed) e as rules sao — e
/// esconder abas no primeiro frame faria o dono ver duas abas piscarem antes
/// das cinco. O inverso vale para dado na tela: numero de dinheiro nega
/// enquanto carrega (ver `arenaCanReadProvider`).
List<ArenaTab> visibleArenaTabs(
  ArenaAccess access, {
  required bool accessLoaded,
}) {
  if (!accessLoaded) return ArenaTab.values;
  return [
    for (final tab in ArenaTab.values)
      if (_isVisible(tab, access)) tab,
  ];
}

bool _isVisible(ArenaTab tab, ArenaAccess access) => switch (tab) {
      ArenaTab.dashboard => true,
      ArenaTab.settings => true,
      ArenaTab.schedule => access.canRead(ArenaArea.agenda),
      ArenaTab.bookings => access.canRead(ArenaArea.agenda),
      ArenaTab.comandas => access.canRead(ArenaArea.comandas),
    };
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/domain/arena_tab_visibility_test.dart
```
Esperado: PASS, 7 testes.

- [ ] **Step 5: Ligar no shell**

Em `arena_shell_page.dart`, dentro do `build`, depois do gate de seleção da Task 4:

```dart
    final accessAsync = ref.watch(arenaAccessProvider);
    final visible = visibleArenaTabs(
      accessAsync.valueOrNull ?? ArenaAccess.none,
      accessLoaded: accessAsync.hasValue,
    );
    // Indice do branch (posicao fixa no StatefulShell) -> posicao na barra.
    final branchOf = [for (final tab in visible) ArenaTab.values.indexOf(tab)];
    final currentVisibleIndex = branchOf.indexOf(navigationShell.currentIndex);
```

e o `NexaBottomNavBar` passa a receber:

```dart
                items: [for (final tab in visible) _navItemFor(tab)],
                currentIndex: currentVisibleIndex < 0 ? 0 : currentVisibleIndex,
                ...
                onTap: (i) {
                  final branch = branchOf[i];
                  scrollRegistry.tabBarCollapse.expand();
                  ref.read(arenaShellScrollRegistryProvider).scrollToTop(branch);
                  navigationShell.goBranch(
                    branch,
                    initialLocation: branch == navigationShell.currentIndex,
                  );
                },
```

`_navItemFor` é um `switch` sobre `ArenaTab` devolvendo o `NexaBottomNavItem` que hoje está na lista `_navItems` — mover cada item para o case correspondente e apagar a lista `_navItems` e a lista `_tabs`, que deixam de ter uso.

Quando a aba atual não está visível (`currentVisibleIndex < 0`), a barra marca o Painel; quem efetivamente tira a pessoa da tela é o guard da Task 6.

- [ ] **Step 6: Escrever o widget test do shell**

`nexago_app/test/features/arena/arena_shell_tabs_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_shell_page.dart';

/// Overrides das duas fontes-folha: nenhuma ida ao Firestore.
List<Override> overridesForRole(ArenaStaffRole? role, {bool owner = false}) {
  final membership = ArenaMembership(
    arenaId: 'a1',
    name: 'Vegeton',
    isOwner: owner,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? [membership] : const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? const <ArenaMembership>[] : [membership]),
    ),
  ];
}

void main() {
  Future<void> pumpShell(WidgetTester tester, List<Override> overrides) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.dark,
          // O shell real precisa do StatefulNavigationShell do go_router; aqui
          // exercitamos so a barra, montando a pagina com um shell de teste.
          home: const ArenaShellTabBarHarness(),
        ),
      ),
    );
    // Sem pumpAndSettle: telas do painel tem indicador "AO VIVO" cuja animacao
    // nunca assenta e trava o teste no timeout.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao ve a aba Comandas', (tester) async {
    await pumpShell(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('AGENDA'), findsOneWidget);
    expect(find.text('COMANDAS'), findsNothing);
  });

  testWidgets('financeiro nao ve Agenda nem Reservas', (tester) async {
    await pumpShell(tester, overridesForRole(ArenaStaffRole.financeiro));
    expect(find.text('COMANDAS'), findsOneWidget);
    expect(find.text('AGENDA'), findsNothing);
    expect(find.text('RESERVAS'), findsNothing);
  });

  testWidgets('dono ve as cinco', (tester) async {
    await pumpShell(tester, overridesForRole(null, owner: true));
    for (final label in ['PAINEL', 'AGENDA', 'COMANDAS', 'RESERVAS', 'AJUSTES']) {
      expect(find.text(label), findsOneWidget);
    }
  });
}
```

`ArenaShellPage` exige um `StatefulNavigationShell` do go_router, que não se constrói num widget test. Por isso, no Step 5, extraia a barra para um widget público no mesmo arquivo:

```dart
/// A barra do painel, separada do shell para poder ser montada em teste sem
/// o `StatefulNavigationShell` do go_router.
class ArenaShellTabBar extends ConsumerWidget {
  const ArenaShellTabBar({
    super.key,
    required this.currentBranchIndex,
    required this.onSelectBranch,
    this.collapse,
  });

  final int currentBranchIndex;
  final ValueChanged<int> onSelectBranch;
  final ShellTabBarCollapseController? collapse;
  ...
}
```

`ArenaShellPage` passa a renderizar `ArenaShellTabBar(currentBranchIndex: navigationShell.currentIndex, onSelectBranch: (branch) {...})` no `bottomNavigationBar`, e o teste monta a barra sozinha:

```dart
          home: Scaffold(
            bottomNavigationBar: ArenaShellTabBar(
              currentBranchIndex: 0,
              onSelectBranch: (_) {},
            ),
          ),
```

Se `ShellTabBarCollapseController` não aceitar `null`, dê um default interno ao widget em vez de tornar o parâmetro obrigatório — o teste não exercita colapso.

Os rótulos são maiúsculos porque `NexaBottomNavBar` recebe `uppercaseLabels: true`; se o widget aplicar o caixa alta via `TextStyle` em vez de transformar a string, buscar pelo texto original (`'Comandas'`). Conferir antes com:

```bash
cd <worktree>/nexago_app && grep -n "uppercaseLabels" -A 6 lib/core/layout/nexa_bottom_nav_bar.dart
```

- [ ] **Step 7: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_shell_tabs_test.dart && flutter analyze
```
Esperado: PASS, 3 testes.

- [ ] **Step 8: Commit**

```bash
cd <worktree> && git add -A nexago_app && git commit -m "feat(arena-app): bottom nav por cargo"
```

---

### Task 8: Ajustes filtrado por área

**Files:**
- Modify: `nexago_app/lib/features/arena/presentation/arena_settings_page.dart:145-245`
- Test: `nexago_app/test/features/arena/arena_settings_access_test.dart`

**Interfaces:**
- Consumes: `arenaCanReadProvider`, `arenaAccessProvider` (Task 3).

- [ ] **Step 1: Escrever o teste que falha**

`nexago_app/test/features/arena/arena_settings_access_test.dart` — mesma função `overridesForRole` da Task 7 (copiar para este arquivo; não importar do outro teste), montando `ArenaSettingsPage`:

```dart
  testWidgets('recepcao nao ve Quadras, Relatorios, Plano nem Pagamentos',
      (tester) async {
    await pumpSettings(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Disponibilidade na agenda'), findsOneWidget);
    expect(find.text('Produtos e estoque'), findsOneWidget);
    expect(find.text('Quadras'), findsNothing);
    expect(find.text('Relatórios'), findsNothing);
    expect(find.text('Plano'), findsNothing);
    expect(find.text('Pagamentos'), findsNothing);
    expect(find.text('Equipe'), findsNothing);
  });

  testWidgets('manutencao ve Quadras e Produtos, sem agenda de escrita',
      (tester) async {
    await pumpSettings(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Quadras'), findsOneWidget);
    expect(find.text('Produtos e estoque'), findsOneWidget);
    expect(find.text('Disponibilidade na agenda'), findsNothing);
    expect(find.text('Pagamentos'), findsNothing);
  });

  testWidgets('dono ve tudo, inclusive Plano e Equipe', (tester) async {
    await pumpSettings(tester, overridesForRole(null, owner: true));
    for (final t in ['Quadras', 'Relatórios', 'Plano', 'Pagamentos', 'Equipe']) {
      expect(find.text(t), findsOneWidget);
    }
  });
```

Nota sobre manutenção e "Disponibilidade na agenda": manutenção **lê** agenda mas não escreve, e essa tela escreve `arenaSlots`. Ela é gateada por `canWrite(agenda)`, não por `canRead` — por isso some para manutenção.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_settings_access_test.dart
```
Esperado: FAIL — todos os itens ainda aparecem para recepção.

- [ ] **Step 3: Implementar**

Ler os flags no início do `build`:

```dart
    final canWriteAgenda = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final canReadQuadras = ref.watch(arenaCanReadProvider(ArenaArea.quadras));
    final canReadEstoque = ref.watch(arenaCanReadProvider(ArenaArea.estoque));
    final canReadFinanceiro =
        ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
    final canReadPerfil = ref.watch(arenaCanReadProvider(ArenaArea.perfil));
    final isOwner = ref.watch(arenaAccessProvider).valueOrNull?.isOwner ?? false;
```

Cada grupo passa a ser montado por uma lista de builders, para o divisor da última linha não sobrar pendurado quando o item de baixo some:

```dart
    // O divisor e por tile (`showDivider`), entao filtrar muda quem e o
    // ultimo. Montar builders e resolver `isLast` depois do filtro.
    final arenaTiles = <Widget Function(bool isLast)>[
      if (canReadPerfil)
        (isLast) => ArenaSettingsTile(
              leading: ArenaSettingsArenaLogo(logoUrl: arena?.logoUrl),
              title: arena?.name ?? 'Arena',
              subtitle: profileSubtitle,
              icon: Icons.stadium_rounded,
              onTap: arena == null
                  ? null
                  : () => context.pushNamed(AppRouteNames.arenaProfile),
              trailingBadge: const ArenaSettingsProfileBadge(),
              showDivider: !isLast,
            ),
      if (canWriteAgenda)
        (isLast) => ArenaSettingsTile(
              icon: Icons.calendar_month_outlined,
              title: 'Disponibilidade na agenda',
              subtitle: availabilitySubtitle,
              onTap: () =>
                  context.pushNamed(AppRouteNames.arenaAvailabilitySettings),
              showDivider: !isLast,
            ),
      if (canReadQuadras)
        (isLast) => ArenaSettingsTile(
              icon: Icons.grid_view_rounded,
              title: 'Quadras',
              subtitle: courtsSubtitle,
              onTap: () => context.pushNamed(AppRouteNames.arenaCourts),
              showDivider: !isLast,
            ),
      if (canReadEstoque)
        (isLast) => ArenaSettingsTile(
              icon: Icons.inventory_2_outlined,
              title: 'Produtos e estoque',
              subtitle: productsSubtitle,
              variant: ArenaSettingsIconVariant.neutral,
              onTap: () => context.pushNamed(AppRouteNames.arenaProducts),
              trailingBadge: productSummary.alertCount > 0
                  ? _ProductsAlertBadge(count: productSummary.alertCount)
                  : null,
              showDivider: !isLast,
            ),
      if (canReadFinanceiro)
        (isLast) => ArenaSettingsTile(
              icon: Icons.insights_rounded,
              title: 'Relatórios',
              subtitle: 'Ocupação, jogadores únicos e no-show',
              variant: ArenaSettingsIconVariant.neutral,
              onTap: () => context.pushNamed(AppRouteNames.arenaOccupancyReport),
              showDivider: !isLast,
            ),
    ];
```

e o grupo:

```dart
                          if (arenaTiles.isNotEmpty) ...[
                            ArenaSettingsGroup(
                              sectionLabel: 'ARENA',
                              children: [
                                for (var i = 0; i < arenaTiles.length; i++)
                                  arenaTiles[i](i == arenaTiles.length - 1),
                              ],
                            ),
                            SizedBox(height: 24),
                          ],
```

O grupo PREFERÊNCIAS segue o mesmo padrão: Notificações sempre; Plano e Equipe com `if (isOwner)`; Pagamentos com `if (canReadFinanceiro)`.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_settings_access_test.dart && flutter analyze
```
Esperado: PASS, 3 testes.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add -A nexago_app && git commit -m "feat(arena-app): menu de Ajustes por area do cargo"
```

---

### Task 9: Painel — cards de dinheiro e atalhos

**Files:**
- Modify: `nexago_app/lib/features/arena/presentation/arena_dashboard_page.dart`
- Modify: `nexago_app/lib/features/arena/presentation/widgets/arena_dashboard_quick_actions.dart`
- Test: `nexago_app/test/features/arena/arena_dashboard_money_test.dart`

**Interfaces:**
- Consumes: `arenaCanReadProvider`, `arenaCanWriteProvider` (Task 3).

- [ ] **Step 1: Escrever o teste que falha**

O KPI de faturamento usa `formatDashboardCurrency`, então a asserção busca o prefixo `R$`:

```dart
  testWidgets('recepcao nao ve faturamento no Painel', (tester) async {
    await pumpDashboard(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.textContaining('R\$'), findsNothing);
  });

  testWidgets('gestor ve faturamento', (tester) async {
    await pumpDashboard(tester, overridesForRole(ArenaStaffRole.gestor));
    expect(find.textContaining('R\$'), findsWidgets);
  });

  testWidgets('manutencao nao ve o atalho de abrir comanda', (tester) async {
    await pumpDashboard(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.textContaining('comanda'), findsNothing);
    expect(find.textContaining('Bloquear'), findsNothing);
  });
```

`pumpDashboard` precisa sobrescrever também `arenaDashboardSummaryProvider` e `arenaDashboardPeriodMetricsProvider` com valores fixos, senão a tela fica em `loading` e nenhum card é montado. Descobrir os tipos com:

```bash
cd <worktree>/nexago_app && grep -n "arenaDashboardSummaryProvider\|arenaDashboardPeriodMetricsProvider" -A 4 lib/features/arena/domain/arena_dashboard_providers.dart | head -30
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_dashboard_money_test.dart
```
Esperado: FAIL — recepção ainda vê `R$`.

- [ ] **Step 3: Implementar no `arena_dashboard_page.dart`**

```dart
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
```

O `ArenaDashboardKpiGrid` passa a receber a lista de itens montada com `if (seesMoney)` no KPI de faturamento, e o `ArenaDashboardRevenueChartCard` é embrulhado em `if (seesMoney) ...`. Nada mais muda de layout: ocupação, pico, reputação e seguidores continuam para todos.

Em `arena_dashboard_quick_actions.dart`, o widget vira `ConsumerWidget` e monta os atalhos por área:

```dart
    final canComandas = ref.watch(arenaCanWriteProvider(ArenaArea.comandas));
    final canAgenda = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final canSeeBookings = ref.watch(arenaCanReadProvider(ArenaArea.agenda));

    final actions = <Widget>[
      if (canComandas)
        _QuickAction(
          icon: Icons.receipt_long_rounded,
          label: 'Abrir\ncomanda',
          accent: true,
          onTap: () => context.pushNamed(AppRouteNames.arenaComandaNewType),
        ),
      if (canAgenda)
        _QuickAction(
          icon: Icons.event_busy_rounded,
          label: 'Bloquear\nhorário',
          onTap: () => context.go(AppRoutes.arenaSchedule),
        ),
      if (canSeeBookings)
        _QuickAction(
          icon: Icons.today_rounded,
          label: 'Reservas\nde hoje',
          onTap: () => context.go(AppRoutes.arenaBookings),
        ),
    ];
    if (actions.isEmpty) return const SizedBox.shrink();
    return Row(
      children: [
        for (var i = 0; i < actions.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(child: actions[i]),
        ],
      ],
    );
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_dashboard_money_test.dart && flutter analyze
```
Esperado: PASS, 3 testes.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add -A nexago_app && git commit -m "feat(arena-app): Painel sem dinheiro nem atalhos fora do cargo"
```

---

### Task 10: Ações de escrita — Agenda e Reservas

**Files:**
- Modify: `nexago_app/lib/features/arena/presentation/arena_slot_detail_page.dart:450-490`
- Modify: `nexago_app/lib/features/arena/presentation/arena_bookings_page.dart:125,180`
- Modify: `nexago_app/lib/features/arena/presentation/arena_recurring_list_page.dart:103`
- Modify: `nexago_app/lib/features/arena/presentation/arena_booking_details_page.dart`
- Test: `nexago_app/test/features/arena/arena_agenda_write_actions_test.dart`

**Interfaces:**
- Consumes: `arenaCanWriteProvider(ArenaArea.agenda)`.

Quem lê agenda sem escrever hoje é só `manutencao`. O alvo é: manutenção abre a agenda, vê os horários e não encontra nenhum botão que grave.

- [ ] **Step 1: Escrever o teste que falha**

```dart
  testWidgets('manutencao nao ve as acoes do slot', (tester) async {
    await pumpSlotDetail(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Criar reserva'), findsNothing);
    expect(find.text('Bloquear'), findsNothing);
    expect(find.text('Ajustar preço'), findsNothing);
    expect(find.text('Horário fixo'), findsNothing);
  });

  testWidgets('recepcao ve as acoes do slot', (tester) async {
    await pumpSlotDetail(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Criar reserva'), findsOneWidget);
    expect(find.text('Bloquear'), findsOneWidget);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_agenda_write_actions_test.dart
```
Esperado: FAIL — manutenção ainda vê "Criar reserva".

- [ ] **Step 3: Implementar**

Em `arena_slot_detail_page.dart`, ler `final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));` e envolver as quatro ações (linhas ~456, ~462, ~479, ~485) em `if (canWrite)` dentro da lista que as monta. Se as quatro estiverem num `Column(children: [...])` fixo, transformar em lista com collection-`if`.

Em `arena_bookings_page.dart`, o item "Horários fixos" (linha 125) fica com `if (canWrite)`; o item "Clubinho" (linha 180) também — criar e editar clubinho grava. Em `arena_recurring_list_page.dart:103`, o botão que chama `arenaRecurringNew` idem. Em `arena_booking_details_page.dart`, as ações de cancelar/bloquear (os `FilledButton` por volta de 477/481, 658/666, 730).

- [ ] **Step 4: Varrer o que sobrou**

```bash
cd <worktree>/nexago_app && grep -rn "pushNamed(AppRouteNames.arenaRecurringNew\|pushNamed(AppRouteNames.arenaClubNew\|FilledButton(" lib/features/arena/presentation/arena_slot_detail_page.dart lib/features/arena/presentation/arena_bookings_page.dart lib/features/arena/presentation/arena_recurring_list_page.dart lib/features/arena/presentation/arena_booking_details_page.dart
```

Cada ocorrência que gravar precisa estar sob `canWrite`. Anotar no commit quais foram cobertas.

- [ ] **Step 5: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_agenda_write_actions_test.dart && flutter analyze
```
Esperado: PASS, 2 testes.

- [ ] **Step 6: Commit**

```bash
cd <worktree> && git add -A nexago_app && git commit -m "feat(arena-app): agenda e reservas sem acoes de escrita para quem so le"
```

---

### Task 11: Ações de escrita — Comandas e Estoque

**Files:**
- Modify: `nexago_app/lib/features/arena/presentation/comandas/arena_comandas_page.dart:105`
- Modify: `nexago_app/lib/features/arena/presentation/products/arena_products_list_page.dart:119,122`
- Modify: `nexago_app/lib/features/arena/presentation/comandas/arena_comanda_detail_page.dart` (ações de adicionar item e fechar)
- Test: `nexago_app/test/features/arena/arena_comandas_estoque_write_test.dart`

**Interfaces:**
- Consumes: `arenaCanWriteProvider(ArenaArea.comandas)` e `arenaCanWriteProvider(ArenaArea.estoque)`.

Quem lê comandas sem escrever é `financeiro`; quem lê estoque sem escrever é `recepcao`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
  testWidgets('financeiro nao abre comanda', (tester) async {
    await pumpComandas(tester, overridesForRole(ArenaStaffRole.financeiro));
    expect(find.textContaining('Nova comanda'), findsNothing);
  });

  testWidgets('recepcao ve estoque sem botoes de escrita', (tester) async {
    await pumpProducts(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.textContaining('Novo produto'), findsNothing);
    expect(find.textContaining('Repor'), findsNothing);
  });

  testWidgets('manutencao repoe estoque', (tester) async {
    await pumpProducts(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.textContaining('Repor'), findsWidgets);
  });
```

Conferir os rótulos reais antes de escrever a asserção:

```bash
cd <worktree>/nexago_app && sed -n 110,130p lib/features/arena/presentation/products/arena_products_list_page.dart && sed -n 95,115p lib/features/arena/presentation/comandas/arena_comandas_page.dart
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_comandas_estoque_write_test.dart
```
Esperado: FAIL — financeiro ainda vê o botão de nova comanda.

- [ ] **Step 3: Implementar**

`arena_comandas_page.dart`: o botão que chama `arenaComandaNewType` (linha 105) sob `if (ref.watch(arenaCanWriteProvider(ArenaArea.comandas)))`. Mesmo tratamento nas ações de `arena_comanda_detail_page.dart` que adicionam item, registram pagamento ou fecham a comanda.

`arena_products_list_page.dart`: o botão de `arenaProductStock` (linha 119) e o de `arenaProductNew` (linha 122) sob `if (ref.watch(arenaCanWriteProvider(ArenaArea.estoque)))`.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_comandas_estoque_write_test.dart && flutter analyze
```
Esperado: PASS, 3 testes.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add -A nexago_app && git commit -m "feat(arena-app): comandas e estoque sem escrita para quem so le"
```

---

### Task 12: Pagamentos (dono) e Perfil

**Files:**
- Modify: `nexago_app/lib/features/arena/presentation/arena_payments_page.dart:88-100,213-345`
- Modify: `nexago_app/lib/features/arena/presentation/arena_profile_page.dart`
- Test: `nexago_app/test/features/arena/arena_payments_owner_test.dart`

**Interfaces:**
- Consumes: `arenaAccessProvider` (`isOwner`), `arenaCanWriteProvider(ArenaArea.perfil)`.

A tela de Pagamentos é a que mistura leitura permitida (saldo, extrato) com escrita que **só o dono** faz: `payoutPixKey`/`payoutPixKeyType`/`paymentReceiver` estão congelados para não-donos em `firestore.rules:996` e `requestArenaWithdrawal` recusa membro. Gestor e financeiro leem; ninguém além do dono saca.

- [ ] **Step 1: Escrever o teste que falha**

```dart
  testWidgets('gestor ve saldo e extrato, sem chave PIX nem saque',
      (tester) async {
    await pumpPayments(tester, overridesForRole(ArenaStaffRole.gestor));
    expect(find.textContaining('Sacar'), findsNothing);
    expect(find.textContaining('Chave PIX'), findsNothing);
  });

  testWidgets('dono saca', (tester) async {
    await pumpPayments(tester, overridesForRole(null, owner: true));
    expect(find.textContaining('Sacar'), findsWidgets);
  });
```

Conferir os rótulos reais:

```bash
cd <worktree>/nexago_app && grep -n "Sacar\|Chave PIX\|chave" lib/features/arena/presentation/arena_payments_page.dart | head -12
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd <worktree>/nexago_app && flutter test test/features/arena/arena_payments_owner_test.dart
```
Esperado: FAIL — gestor ainda vê o botão de saque.

- [ ] **Step 3: Implementar**

Em `arena_payments_page.dart`, ler `final isOwner = ref.watch(arenaAccessProvider).valueOrNull?.isOwner ?? false;` e envolver em `if (isOwner)` o bloco da chave PIX (o editor por volta da linha 88 e o card por volta de 224) e o botão que chama `_withdrawAll` (linha ~334). O extrato (`withdrawalsAsync`) e o saldo continuam para todos que alcançam a tela.

Em `arena_profile_page.dart`, o botão de editar perfil sob `if (ref.watch(arenaCanWriteProvider(ArenaArea.perfil)))`.

- [ ] **Step 4: Rodar tudo**

```bash
cd <worktree>/nexago_app && flutter test && flutter analyze
```
Esperado: suíte inteira verde, `No issues found`.

- [ ] **Step 5: Commit**

```bash
cd <worktree> && git add -A nexago_app && git commit -m "feat(arena-app): chave PIX e saque so para o dono"
```

---

## Verificação final (depois da Task 12)

- [ ] `cd <worktree>/nexago_app && flutter test` — suíte inteira verde, com a contagem maior que antes do plano.
- [ ] `cd <worktree>/nexago_app && flutter analyze` — `No issues found`.
- [ ] Rodar o app contra o dev com a conta de um membro **gestor** já existente (`arenas/TtYSz7IaOHB7Hf7CXdIr`): entrar, escolher o papel Arena, conferir que o painel abre na arena certa, que Plano e Equipe não aparecem em Ajustes e que Pagamentos abre sem botão de saque.
- [ ] Conferir que o dono da mesma arena continua com as 5 abas, Plano, Equipe e saque.
- [ ] `cd <worktree> && git log --oneline` — 12 commits de feature, um por task.

## O que este plano NÃO entrega

- Tela de Equipe no app (convidar, trocar cargo, remover) — segue só no portal.
- Gate de plano vencido na UI — as rules derrubam, a tela não avisa; dívida registrada no spec, vale para portal e app juntos.
- Qualquer mudança de backend. Se algum passo parecer exigir deploy de rules ou functions, **pare**: é sinal de que a leitura do espelho saiu do caminho previsto.
