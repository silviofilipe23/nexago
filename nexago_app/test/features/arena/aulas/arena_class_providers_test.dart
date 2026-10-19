import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_logic.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_providers.dart';

import 'arena_class_fixtures.dart';
import 'fake_arena_class_repository.dart';

void main() {
  final now = DateTime(2026, 10, 19, 17, 40);

  ProviderContainer makeContainer(
    FakeArenaClassRepository repo, {
    bool noArena = false,
  }) {
    final container = ProviderContainer(
      overrides: [
        if (noArena) ...[
          ownedArenaMembershipsProvider.overrideWith(
            (ref) => Stream.value(const <ArenaMembership>[]),
          ),
          staffArenaMembershipsProvider.overrideWith(
            (ref) => Stream.value(const <ArenaMembership>[]),
          ),
        ] else
          ...arenaAccessOverrides(ArenaStaffRole.recepcao),
        arenaClassRepositoryProvider.overrideWithValue(repo),
        arenaClassClockProvider.overrideWith((ref) => Stream.value(now)),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  /// Espera o provider assíncrono assentar mantendo-o vivo (autoDispose).
  Future<T> settle<T>(
    ProviderContainer container,
    ProviderListenable<AsyncValue<T>> provider,
  ) async {
    final sub = container.listen(provider, (_, __) {});
    addTearDown(sub.close);
    for (var i = 0; i < 20; i++) {
      final value = sub.read();
      if (value.hasValue && !value.isLoading) return value.requireValue;
      await Future<void>.delayed(Duration.zero);
    }
    throw StateError('provider não assentou: ${sub.read()}');
  }

  test('turmas e aulas do dia consultam sempre com o arenaId da arena gerida',
      () async {
    final repo = FakeArenaClassRepository(
      classes: [arenaClass(id: 'c5', studentCount: 11)],
      sessionsByDate: {
        '2026-10-19': [session(id: 's5', classId: 'c5')],
      },
    );
    final container = makeContainer(repo);

    final classes = await settle(container, managedArenaClassesProvider);
    final sessions = await settle(
      container,
      arenaClassSessionsOnDayProvider('2026-10-19'),
    );

    expect(classes.single.id, 'c5');
    expect(sessions.single.id, 's5');
    expect(repo.classQueries, everyElement('a1'));
    expect(repo.sessionQueries, everyElement(('a1', '2026-10-19')));
  });

  test('alunos da turma levam o arenaId exigido pela rule', () async {
    final repo = FakeArenaClassRepository(students: [student('u1', 'Ana')]);
    final container = makeContainer(repo);

    final students = await settle(
      container,
      arenaClassStudentsProvider((arenaId: 'a1', classId: 'c5')),
    );

    expect(students.single.name, 'Ana');
    expect(repo.studentQueries, [('a1', 'c5')]);
  });

  test('visão do dia junta o nº de alunos da turma e o relógio', () async {
    final repo = FakeArenaClassRepository(
      classes: [
        arenaClass(id: 'c4', studentCount: 3, capacity: 3),
        arenaClass(id: 'c5', studentCount: 11, capacity: 12),
      ],
      sessionsByDate: {
        '2026-10-19': [
          session(id: 's5', classId: 'c5', start: '18:00', end: '19:30'),
          session(
              id: 's4',
              classId: 'c4',
              start: '17:00',
              end: '18:00',
              capacity: 3),
        ],
      },
    );
    final container = makeContainer(repo);
    // Turmas e relógio primeiro: a visão é um Provider síncrono derivado.
    await settle(container, managedArenaClassesProvider);
    await settle(container, arenaClassClockProvider);
    await settle(container, arenaClassSessionsOnDayProvider('2026-10-19'));

    final view =
        container.read(arenaClassDayViewProvider('2026-10-19')).requireValue;

    expect(view.active.map((i) => (i.session.id, i.phase)), [
      ('s4', ArenaClassPhase.live),
      ('s5', ArenaClassPhase.upcoming),
    ]);
    expect(view.active.last.isNext, isTrue);
    expect(view.studentTotal, 14);
    expect(view.occupancyPercent, (14 * 100 / 15).round());
  });

  test('sem arena gerida não consulta nada', () async {
    final repo = FakeArenaClassRepository();
    final container = makeContainer(repo, noArena: true);

    final classes = await settle(container, managedArenaClassesProvider);

    expect(classes, isEmpty);
    expect(repo.classQueries, isEmpty);
  });

  test('seletor de dia começa em hoje', () {
    final container = makeContainer(FakeArenaClassRepository());
    final day = container.read(arenaClassSelectedDayProvider);
    final today = DateTime.now();
    expect(day, DateTime(today.year, today.month, today.day));
    expect(container.read(arenaClassesTabProvider), ArenaClassesTab.today);
  });
}
