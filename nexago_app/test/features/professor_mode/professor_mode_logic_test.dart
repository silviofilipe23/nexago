import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_mode_logic.dart';

ClassAgendaEntry entry(Map<String, Object?> over) => ClassAgendaEntry.fromMap({
      'sessionId': 'class_c1_2026-10-20',
      'arenaId': 'arena1',
      'arenaName': 'Arena CFC',
      'classId': 'c1',
      'className': 'Intermediário B',
      'teacherName': 'Thiago',
      'courtName': 'Quadra 2',
      'date': '2026-10-20',
      'startTime': '19:00',
      'endTime': '20:00',
      'status': 'scheduled',
      'role': 'teacher',
      'kind': 'regular',
      'studentCount': 6,
      'canManageLessons': true,
      ...over,
    });

ArenaProfessorLink link(
  String arenaId, {
  ArenaProfessorLinkStatus status = ArenaProfessorLinkStatus.active,
  bool canBookCourts = true,
  String? arenaName,
}) =>
    ArenaProfessorLink(
      id: '${arenaId}_u1',
      arenaId: arenaId,
      professorUserId: 'u1',
      type: ArenaProfessorLinkType.independent,
      status: status,
      arenaName: arenaName ?? 'Arena $arenaId',
      permissions: ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: canBookCourts,
        canAppearInArenaProfile: false,
      ),
    );

void main() {
  final today = DateTime(2026, 10, 20, 12);
  const todayKey = '2026-10-20';

  test('professorDateKey', () {
    expect(professorDateKey(DateTime(2026, 1, 5)), '2026-01-05');
  });

  group('aulas da home', () {
    final entries = [
      entry({'sessionId': 'late', 'startTime': '19:00'}),
      entry({'sessionId': 'early', 'startTime': '07:00'}),
      entry({'sessionId': 'student', 'role': 'student'}),
      entry({
        'sessionId': 'canceled',
        'status': 'canceled',
        'startTime': '09:00',
      }),
      entry({'sessionId': 'tomorrow', 'date': '2026-10-21'}),
      entry({'sessionId': 'far', 'date': '2026-10-30'}),
      entry({'sessionId': 'past-open', 'date': '2026-10-18'}),
      entry({
        'sessionId': 'past-closed',
        'date': '2026-10-17',
        'status': 'completed',
      }),
      entry({
        'sessionId': 'past-no-permission',
        'date': '2026-10-16',
        'canManageLessons': false,
      }),
    ];

    test('hoje: só as minhas, por horário, com a cancelada', () {
      expect(
        professorClassesOn(entries, todayKey).map((e) => e.sessionId),
        ['early', 'canceled', 'late'],
      );
    });

    test('próximas: depois de hoje, até 7 dias, sem canceladas', () {
      expect(
        professorUpcomingClasses(entries, today).map((e) => e.sessionId),
        ['tomorrow'],
      );
      expect(
        professorUpcomingClasses(entries, today, days: 14)
            .map((e) => e.sessionId),
        ['tomorrow', 'far'],
      );
    });

    test('chamada pendente: dias anteriores ainda abertos e com permissão', () {
      expect(
        professorPendingAttendance(entries, todayKey).map((e) => e.sessionId),
        ['past-open'],
      );
    });
  });

  group('botão da aula', () {
    test('rótulo por estado', () {
      expect(professorClassCta(entry({}), todayKey), 'Fazer chamada');
      expect(
        professorClassCta(entry({'date': '2026-10-18'}), todayKey),
        'Fazer chamada',
      );
      expect(
        professorClassCta(entry({'date': '2026-10-22'}), todayKey),
        'Ver lista',
      );
      expect(
        professorClassCta(entry({'status': 'completed'}), todayKey),
        'Ver chamada',
      );
    });

    test('sem botão: cancelada, sem permissão ou aula de aluno', () {
      expect(
          professorClassCta(entry({'status': 'canceled'}), todayKey), isNull);
      expect(
        professorClassCta(entry({'canManageLessons': false}), todayKey),
        isNull,
      );
      expect(professorClassCta(entry({'role': 'student'}), todayKey), isNull);
    });

    test('subtítulo', () {
      expect(
          professorClassSubtitle(entry({})), 'Arena CFC · Quadra 2 · 6 alunos');
      expect(
        professorClassSubtitle(entry({'studentCount': 1, 'courtName': ''})),
        'Arena CFC · 1 aluno',
      );
    });
  });

  group('vínculos', () {
    test('reservar: só ACTIVE com "Reservar quadras", por nome', () {
      final arenas = professorBookableArenas([
        link('b', arenaName: 'Zeta'),
        link('a', arenaName: 'Alfa'),
        link('c', canBookCourts: false),
        link('d', status: ArenaProfessorLinkStatus.suspended),
      ]);
      expect(arenas.map((l) => l.arenaName), ['Alfa', 'Zeta']);
    });

    test('rodapé do seletor', () {
      expect(professorRoleFooter([link('a')], today), '1 ARENA ATIVA');
      expect(
        professorRoleFooter([link('a'), link('b')], today),
        '2 ARENAS ATIVAS',
      );
      expect(
        professorRoleFooter(
          [link('a', status: ArenaProfessorLinkStatus.ended)],
          today,
        ),
        'NENHUMA ARENA ATIVA',
      );
    });

    test('refresh do token só com vínculo ativo e sem a claim', () {
      expect(
        professorRoleNeedsRefresh(
          tokenRoles: const ['athlete'],
          links: [link('a')],
          now: today,
        ),
        isTrue,
      );
      expect(
        professorRoleNeedsRefresh(
          tokenRoles: const ['athlete', 'professor'],
          links: [link('a')],
          now: today,
        ),
        isFalse,
      );
      expect(
        professorRoleNeedsRefresh(
          tokenRoles: const ['athlete'],
          links: [link('a', status: ArenaProfessorLinkStatus.pending)],
          now: today,
        ),
        isFalse,
      );
    });
  });
}
