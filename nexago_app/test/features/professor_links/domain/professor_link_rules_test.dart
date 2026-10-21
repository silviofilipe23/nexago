import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/domain/professor_link_rules.dart';

import '../professor_links_test_support.dart';

void main() {
  final now = professorTestNow;

  group('ArenaProfessorLink.fromMap', () {
    test('lê o doc gravado pelas functions', () {
      final link = ArenaProfessorLink.fromMap('arena-1_prof-1', {
        'arenaId': 'arena-1',
        'professorUserId': 'prof-1',
        'relationshipType': 'INDEPENDENT',
        'status': 'PENDING',
        'initiatedBy': 'PROFESSOR',
        'permissions': {
          'canManageOwnLessons': true,
          'canBookCourts': true,
          'canAppearInArenaProfile': false,
        },
        'cycle': 2,
        'message': '  Tenho alunos aos sábados  ',
        'professorName': 'Thiago Mendes',
        'professorModalities': ['Beach Tennis', '', 3],
        'arenaName': 'Praia Viva Arena',
        'arenaLogoUrl': '',
        'arenaCity': 'Goiânia · GO',
        'requestedAt': Timestamp.fromDate(DateTime(2026, 10, 17, 9)),
        'expiresAt': null,
      });

      expect(link.id, 'arena-1_prof-1');
      expect(link.type, ArenaProfessorLinkType.independent);
      expect(link.status, ArenaProfessorLinkStatus.pending);
      expect(link.initiatedBy, ArenaProfessorSide.professor);
      expect(link.permissions.canBookCourts, isTrue);
      expect(link.permissions.canAppearInArenaProfile, isFalse);
      expect(link.cycle, 2);
      expect(link.message, 'Tenho alunos aos sábados');
      expect(link.professorModalities, ['Beach Tennis']);
      expect(link.arenaLogoUrl, isNull);
      expect(link.requestedAt, DateTime(2026, 10, 17, 9));
      expect(link.expiresAt, isNull);
    });

    test('status desconhecido conta como fechado; tipo cai em independente',
        () {
      final link = ArenaProfessorLink.fromMap('x', {'status': 'WHATEVER'});
      expect(link.status, ArenaProfessorLinkStatus.ended);
      expect(link.status.isOpen, isFalse);
      expect(link.type, ArenaProfessorLinkType.independent);
      expect(link.permissions, ArenaProfessorPermissions.none);
      expect(link.arenaName, 'Arena');
    });

    test('evento e professor público', () {
      final event = ArenaProfessorLinkEvent.fromMap('e1', {
        'eventType': 'PERMISSIONS_CHANGED',
        'actorRole': 'ARENA',
        'actorName': 'Carla N.',
        'metadata': {
          'changed': ['canAppearInArenaProfile'],
        },
        'createdAt': Timestamp.fromDate(DateTime(2026, 9, 1)),
      });
      expect(event.eventType, 'PERMISSIONS_CHANGED');
      expect(event.metadata['changed'], ['canAppearInArenaProfile']);
      expect(event.createdAt, DateTime(2026, 9, 1));

      final professor = PublicArenaProfessor.fromMap('prof-9', {
        'name': 'Juliana Rocha',
        'relationshipType': 'ARENA_STAFF',
        'modalities': ['Beach Tennis', 'Kids'],
      });
      expect(professor.professorUserId, 'prof-9');
      expect(professor.type, ArenaProfessorLinkType.arenaStaff);
      expect(professor.modalities, ['Beach Tennis', 'Kids']);
    });
  });

  group('convite vencido e status efetivo', () {
    test('INVITED com expiresAt <= agora é "Convite expirado"', () {
      final expired = invitedLink(expiresAt: now);
      final open = invitedLink(
        expiresAt: now.add(const Duration(minutes: 1)),
      );

      expect(isProfessorInviteExpired(expired, now), isTrue);
      expect(
        effectiveProfessorLinkStatus(expired, now),
        ArenaProfessorLinkStatus.expired,
      );
      expect(professorLinkStatusLabel(ArenaProfessorLinkStatus.expired),
          'Convite expirado');
      expect(isProfessorInviteExpired(open, now), isFalse);
      expect(
        effectiveProfessorLinkStatus(open, now),
        ArenaProfessorLinkStatus.invited,
      );
    });

    test('só INVITED vence; sem expiresAt nunca vence', () {
      final active = professorLink(expiresAt: DateTime(2020));
      expect(isProfessorInviteExpired(active, now), isFalse);
      final noDate = professorLink(status: ArenaProfessorLinkStatus.invited);
      expect(isProfessorInviteExpired(noDate, now), isFalse);
    });
  });

  group('rótulos e tons (lado do professor)', () {
    test('cada status tem rótulo e tom do protótipo', () {
      const expected = {
        ArenaProfessorLinkStatus.invited: (
          'Convite recebido',
          ProfessorLinkTone.invited
        ),
        ArenaProfessorLinkStatus.pending: (
          'Aguardando a arena',
          ProfessorLinkTone.pending
        ),
        ArenaProfessorLinkStatus.active: ('Ativo', ProfessorLinkTone.active),
        ArenaProfessorLinkStatus.rejected: (
          'Recusado',
          ProfessorLinkTone.muted
        ),
        ArenaProfessorLinkStatus.suspended: (
          'Suspenso',
          ProfessorLinkTone.danger
        ),
        ArenaProfessorLinkStatus.ended: ('Encerrado', ProfessorLinkTone.muted),
        ArenaProfessorLinkStatus.canceled: (
          'Cancelado',
          ProfessorLinkTone.muted
        ),
        ArenaProfessorLinkStatus.expired: (
          'Convite expirado',
          ProfessorLinkTone.muted
        ),
      };
      for (final entry in expected.entries) {
        expect(professorLinkStatusLabel(entry.key), entry.value.$1);
        expect(professorLinkStatusTone(entry.key), entry.value.$2);
      }
    });

    test('tipos', () {
      expect(professorLinkTypeLabel(ArenaProfessorLinkType.arenaStaff),
          'Equipe da arena');
      expect(professorLinkTypeLabel(ArenaProfessorLinkType.independent),
          'Independente');
      expect(
        professorLinkTypeDescription(ArenaProfessorLinkType.independent),
        'Autônomo, usa a estrutura para os próprios alunos',
      );
    });
  });

  group('permissões', () {
    const configured = ArenaProfessorPermissions(
      canManageOwnLessons: true,
      canBookCourts: true,
      canAppearInArenaProfile: true,
    );

    test('efetivas só com ACTIVE', () {
      for (final status in ArenaProfessorLinkStatus.values) {
        final link = professorLink(status: status, permissions: configured);
        expect(
          effectiveProfessorPermissions(link),
          status == ArenaProfessorLinkStatus.active
              ? configured
              : ArenaProfessorPermissions.none,
          reason: status.wire,
        );
      }
    });

    test('convite em aberto mostra a proposta; suspenso mostra nada', () {
      expect(professorPermissionsToShow(invitedLink(), now), configured);
      expect(
        professorPermissionsToShow(invitedLink(expiresAt: now), now),
        ArenaProfessorPermissions.none,
      );
      expect(
        professorPermissionsToShow(
          professorLink(status: ArenaProfessorLinkStatus.suspended),
          now,
        ),
        ArenaProfessorPermissions.none,
      );
    });

    group('Aulas da arena (só equipe)', () {
      const allOn = ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: true,
        canAppearInArenaProfile: true,
        canEnrollStudents: true,
        canScheduleLessons: true,
        canCancelLessons: true,
      );
      const lessonKeys = [
        ArenaProfessorPermissionKey.canEnrollStudents,
        ArenaProfessorPermissionKey.canScheduleLessons,
        ArenaProfessorPermissionKey.canCancelLessons,
      ];

      test('vínculo antigo sem as chaves lê false; o servidor grava e lê', () {
        final legacy = ArenaProfessorPermissions.fromMap(const {
          'canManageOwnLessons': true,
          'canBookCourts': true,
          'canAppearInArenaProfile': true,
        });
        for (final key in lessonKeys) {
          expect(legacy.valueOf(key), isFalse, reason: key.wire);
          expect(ArenaProfessorPermissions.none.valueOf(key), isFalse);
        }
        final stored = ArenaProfessorPermissions.fromMap(const {
          'canEnrollStudents': true,
          'canScheduleLessons': 'yes',
          'canCancelLessons': true,
        });
        expect(stored.canEnrollStudents, isTrue);
        expect(stored.canScheduleLessons, isFalse, reason: 'só `== true`');
        expect(stored.canCancelLessons, isTrue);
      });

      test('igualdade considera as chaves novas', () {
        const base = ArenaProfessorPermissions(
          canManageOwnLessons: true,
          canBookCourts: true,
          canAppearInArenaProfile: true,
        );
        expect(base == allOn, isFalse);
        expect(
          base.withValue(ArenaProfessorPermissionKey.canCancelLessons, true),
          const ArenaProfessorPermissions(
            canManageOwnLessons: true,
            canBookCourts: true,
            canAppearInArenaProfile: true,
            canCancelLessons: true,
          ),
        );
        expect(allOn.withoutArenaStaffOnly(), base);
        expect(allOn.withoutArenaStaffOnly().hashCode, base.hashCode);
      });

      test('só as três novas são de equipe e têm título/descrição', () {
        expect(
          ArenaProfessorPermissionKey.values.where((k) => k.arenaStaffOnly),
          lessonKeys,
        );
        expect(
          professorArenaLessonsPermissionCatalog.map((i) => i.key),
          lessonKeys,
        );
        expect(
          professorPermissionInfo(ArenaProfessorPermissionKey.canEnrollStudents)
              .title,
          'Matricular alunos',
        );
        expect(
          professorPermissionInfo(
            ArenaProfessorPermissionKey.canScheduleLessons,
          ).title,
          'Agendar aulas e encaixes',
        );
        expect(
          professorPermissionInfo(ArenaProfessorPermissionKey.canCancelLessons)
              .title,
          'Cancelar aulas e avisar alunos',
        );
        for (final info in professorArenaLessonsPermissionCatalog) {
          expect(info.description, isNotEmpty);
          expect(info.shortLabel, isNotEmpty);
        }
      });

      test('efetivas: ACTIVE + equipe + gravado true', () {
        final staff = effectiveProfessorPermissions(
          professorLink(permissions: allOn),
        );
        for (final key in lessonKeys) {
          expect(staff.valueOf(key), isTrue, reason: key.wire);
        }
        final suspended = effectiveProfessorPermissions(
          professorLink(
            status: ArenaProfessorLinkStatus.suspended,
            permissions: allOn,
          ),
        );
        expect(suspended, ArenaProfessorPermissions.none);
      });

      test('independente nunca tem as chaves de equipe efetivas', () {
        final independent = professorLink(
          type: ArenaProfessorLinkType.independent,
          permissions: allOn,
        );
        final effective = effectiveProfessorPermissions(independent);
        for (final key in lessonKeys) {
          expect(effective.valueOf(key), isFalse, reason: key.wire);
        }
        expect(effective.canBookCourts, isTrue);
        expect(
          professorPermissionsForType(
            allOn,
            ArenaProfessorLinkType.independent,
          ),
          allOn.withoutArenaStaffOnly(),
        );
        expect(
          professorPermissionsForType(allOn, ArenaProfessorLinkType.arenaStaff),
          allOn,
        );
      });

      test('convite independente não mostra as chaves de equipe', () {
        final invite = professorLink(
          type: ArenaProfessorLinkType.independent,
          status: ArenaProfessorLinkStatus.invited,
          permissions: allOn,
          expiresAt: DateTime(2026, 10, 27),
        );
        expect(
          professorPermissionsToShow(invite, now),
          allOn.withoutArenaStaffOnly(),
        );
      });
    });

    group('Horário fixo (só independente)', () {
      const withKey = ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: true,
        canAppearInArenaProfile: false,
        canBookRecurring: true,
      );

      test('lê do Firestore; vínculo antigo sem a chave lê false', () {
        expect(
          ArenaProfessorPermissions.fromMap(const {'canBookRecurring': true})
              .canBookRecurring,
          isTrue,
        );
        expect(
          ArenaProfessorPermissions.fromMap(const {'canBookCourts': true})
              .canBookRecurring,
          isFalse,
        );
        expect(ArenaProfessorPermissionKey.canBookRecurring.independentOnly,
            isTrue);
        expect(ArenaProfessorPermissionKey.canBookRecurring.arenaStaffOnly,
            isFalse);
        expect(
          ArenaProfessorPermissionKey.values.where((k) => k.independentOnly),
          [ArenaProfessorPermissionKey.canBookRecurring],
        );
        expect(
          professorPermissionInfo(ArenaProfessorPermissionKey.canBookRecurring)
              .title,
          'Horário fixo (turma própria)',
        );
      });

      test('efetiva só no independente ativo', () {
        expect(
          effectiveProfessorPermissions(professorLink(
            type: ArenaProfessorLinkType.independent,
            permissions: withKey,
          )).canBookRecurring,
          isTrue,
        );
        expect(
          effectiveProfessorPermissions(professorLink(permissions: withKey))
              .canBookRecurring,
          isFalse,
          reason: 'equipe',
        );
        expect(
          effectiveProfessorPermissions(professorLink(
            type: ArenaProfessorLinkType.independent,
            status: ArenaProfessorLinkStatus.suspended,
            permissions: withKey,
          )).canBookRecurring,
          isFalse,
        );
        expect(withKey.withoutArenaStaffOnly().canBookRecurring, isTrue);
        expect(withKey.withoutIndependentOnly().canBookRecurring, isFalse);
        expect(
          withKey ==
              withKey.withValue(
                ArenaProfessorPermissionKey.canBookRecurring,
                false,
              ),
          isFalse,
        );
      });
    });

    test('nota das permissões por estado', () {
      expect(professorPermissionsNote(ArenaProfessorLinkStatus.active), isNull);
      expect(
        professorPermissionsNote(ArenaProfessorLinkStatus.invited),
        contains('depois do seu aceite'),
      );
      expect(
        professorPermissionsNote(ArenaProfessorLinkStatus.pending),
        contains('antes da aprovação'),
      );
    });
  });

  group('datas', () {
    test('linha do card como no protótipo', () {
      expect(professorLinkDateLine(invitedLink(), now), 'Convite em 20 out');
      expect(
        professorLinkDateLine(
          professorLink(approvedAt: DateTime(2025, 3, 10)),
          now,
        ),
        'Desde mar 2025',
      );
      expect(
        professorLinkDateLine(
          professorLink(
            status: ArenaProfessorLinkStatus.pending,
            requestedAt: DateTime(2026, 10, 17),
          ),
          now,
        ),
        'Pedido em 17 out',
      );
      expect(
        professorLinkDateLine(
          professorLink(
            status: ArenaProfessorLinkStatus.ended,
            endedAt: DateTime(2026, 2, 3),
          ),
          now,
        ),
        'Encerrado em fev 2026',
      );
      expect(
        professorLinkDateLine(
          professorLink(
            status: ArenaProfessorLinkStatus.suspended,
            suspendedAt: DateTime(2025, 10, 2),
          ),
          now,
        ),
        'Suspenso em 02 out 2025',
      );
      expect(
        professorLinkDateLine(
            invitedLink(expiresAt: DateTime(2026, 10, 19)), now),
        'Expirou em 19 out',
      );
    });

    test('sem a data do estado usa updatedAt; sem nada, null', () {
      expect(
        professorLinkDateLine(
          professorLink(updatedAt: DateTime(2026, 5, 1)),
          now,
        ),
        'Desde mai 2026',
      );
      expect(professorLinkDateLine(professorLink(), now), isNull);
    });

    test('subtítulo do detalhe', () {
      expect(
        professorLinkHeaderSubtitle(
          professorLink(approvedAt: DateTime(2026, 5, 6)),
          now,
        ),
        'VÍNCULO ATIVO · DESDE MAI 2026',
      );
      expect(
        professorLinkHeaderSubtitle(
          professorLink(
            status: ArenaProfessorLinkStatus.pending,
            requestedAt: DateTime(2026, 10, 17),
          ),
          now,
        ),
        'AGUARDANDO A ARENA · PEDIDO EM 17 OUT',
      );
      expect(
        professorLinkHeaderSubtitle(professorLink(), now),
        'VÍNCULO ATIVO',
      );
    });

    test('expiração do convite', () {
      expect(professorInviteExpiryLine(invitedLink(), now), 'Expira em 7 dias');
      expect(
        professorInviteExpiryLine(
          invitedLink(expiresAt: now.add(const Duration(hours: 30))),
          now,
        ),
        'Expira em 2 dias',
      );
      expect(
        professorInviteExpiryLine(
          invitedLink(expiresAt: now.add(const Duration(hours: 24))),
          now,
        ),
        'Expira em 1 dia',
      );
      expect(
        professorInviteExpiryLine(
          invitedLink(expiresAt: now.add(const Duration(hours: 5))),
          now,
        ),
        'Expira em 5 h',
      );
      expect(
        professorInviteExpiryLine(
          invitedLink(expiresAt: now.add(const Duration(minutes: 20))),
          now,
        ),
        'Expira em menos de 1 hora',
      );
      expect(
          professorInviteExpiryLine(invitedLink(expiresAt: now), now), isNull);
      expect(professorInviteExpiryLine(professorLink(), now), isNull);
    });

    test('momento do envio', () {
      expect(
        professorLinkMoment(DateTime(2026, 10, 20, 10, 42), now),
        'hoje 10:42',
      );
      expect(
        professorLinkMoment(DateTime(2026, 10, 19, 8, 5), now),
        'ontem 08:05',
      );
      expect(
        professorLinkMoment(DateTime(2026, 10, 1, 18, 0), now),
        '01 out · 18:00',
      );
    });
  });

  group('Minhas arenas (M1)', () {
    test('resumo do header', () {
      expect(professorLinksSummary(prototypeLinks(), now),
          '2 ATIVAS · 1 CONVITE · 1 AGUARDANDO');
      expect(professorLinksSummary(const [], now), 'ÁREA DO PROFESSOR');
      expect(
        professorLinksSummary([
          professorLink(status: ArenaProfessorLinkStatus.ended),
        ], now),
        'NENHUM VÍNCULO ATIVO',
      );
      expect(
        professorLinksSummary([
          professorLink(),
          professorLink(status: ArenaProfessorLinkStatus.suspended),
          invitedLink(expiresAt: now),
        ], now),
        '1 ATIVA · 1 SUSPENSA',
      );
    });

    test('convites no topo; linhas: ativos, suspensos, aguardando, fechados',
        () {
      final links = [
        ...prototypeLinks(),
        professorLink(
          arenaId: 'suspensa',
          arenaName: 'Arena Suspensa',
          status: ArenaProfessorLinkStatus.suspended,
          updatedAt: DateTime(2026, 10, 2),
        ),
        invitedLink(arenaId: 'vencido', arenaName: 'Vencido', expiresAt: now),
      ];

      expect(
        professorOpenInvites(links, now).map((l) => l.arenaName),
        ['Arena Sul'],
      );
      expect(professorLinkRows(links, now).map((l) => l.arenaName), [
        'Arena Norte', // ativo, atualizado em set/2026
        'Arena CFC', // ativo, atualizado em mar/2025
        'Arena Suspensa',
        'Lagoa Beach Club',
        'Vencido', // convite vencido vira linha fechada
        'Beach Point',
      ]);
    });

    test('manchete do convite por tipo', () {
      expect(professorInviteHeadline(invitedLink()),
          'Arena Sul quer você na equipe');
      expect(
        professorInviteHeadline(
          professorLink(type: ArenaProfessorLinkType.independent),
        ),
        'Arena Sul convidou você como independente',
      );
    });

    test('subtítulo da entrada nos ajustes', () {
      expect(professorLinksEntrySubtitle(prototypeLinks(), now),
          '1 convite de arena para responder');
      expect(
        professorLinksEntrySubtitle(prototypeLinks().skip(1).toList(), now),
        '2 vínculos ativos',
      );
      expect(
        professorLinksEntrySubtitle([
          professorLink(status: ArenaProfessorLinkStatus.pending),
        ], now),
        'Pedido aguardando a arena',
      );
      expect(professorLinksEntrySubtitle(const [], now),
          'Vínculos com as arenas onde você dá aula');
    });
  });

  group('ações por estado', () {
    test('cada estado tem uma ação', () {
      const expected = {
        ArenaProfessorLinkStatus.invited: ProfessorLinkAction.respondInvite,
        ArenaProfessorLinkStatus.pending: ProfessorLinkAction.cancelRequest,
        ArenaProfessorLinkStatus.active: ProfessorLinkAction.end,
        ArenaProfessorLinkStatus.suspended: ProfessorLinkAction.end,
        ArenaProfessorLinkStatus.rejected: ProfessorLinkAction.requestAgain,
        ArenaProfessorLinkStatus.ended: ProfessorLinkAction.requestAgain,
        ArenaProfessorLinkStatus.canceled: ProfessorLinkAction.requestAgain,
        ArenaProfessorLinkStatus.expired: ProfessorLinkAction.requestAgain,
      };
      for (final entry in expected.entries) {
        expect(
          professorLinkAction(professorLink(status: entry.key), now),
          entry.value,
          reason: entry.key.wire,
        );
      }
    });

    test('convite vencido não se responde mais: pede de novo', () {
      expect(
        professorLinkAction(invitedLink(expiresAt: now), now),
        ProfessorLinkAction.requestAgain,
      );
    });

    test('nota do estado no detalhe', () {
      expect(professorLinkStatusNote(professorLink(), now), isNull);
      final suspended = professorLinkStatusNote(
        professorLink(
          status: ArenaProfessorLinkStatus.suspended,
          suspensionReason: 'Pagamento em atraso',
        ),
        now,
      );
      expect(suspended?.tone, ProfessorLinkTone.danger);
      expect(
        suspended?.text,
        'A arena suspendeu o vínculo. Motivo: Pagamento em atraso. Suas '
        'permissões voltam se ela reativar.',
      );
      expect(
        professorLinkStatusNote(
          professorLink(
            status: ArenaProfessorLinkStatus.ended,
            endedBySide: ArenaProfessorSide.professor,
          ),
          now,
        )?.text,
        'Você encerrou o vínculo.',
      );
      expect(
        professorLinkStatusNote(invitedLink(), now)?.text,
        'Expira em 7 dias. Responda para o vínculo começar a valer.',
      );
    });
  });

  group('histórico', () {
    ArenaProfessorLinkEvent event(
      String type, {
      String role = 'ARENA',
      String? reason,
      Map<String, Object?> metadata = const {},
      DateTime? at,
      String actorUserId = 'gestor-1',
      String actorName = 'Carla N.',
    }) =>
        ArenaProfessorLinkEvent(
          id: type,
          eventType: type,
          actorRole: role,
          actorUserId: actorUserId,
          actorName: actorName,
          reason: reason,
          metadata: metadata,
          createdAt: at,
        );

    String title(ArenaProfessorLinkEvent e) => professorLinkEventTitle(
          e,
          linkType: ArenaProfessorLinkType.independent,
        );

    test('títulos do ponto de vista do professor', () {
      expect(
        title(event('REQUESTED', role: 'PROFESSOR', metadata: {
          'relationshipType': 'INDEPENDENT',
        })),
        'Você solicitou vínculo · Independente',
      );
      expect(
        title(event('INVITED', metadata: {'relationshipType': 'ARENA_STAFF'})),
        'Convite da arena · Equipe da arena',
      );
      expect(
          title(event('APPROVED')), 'Solicitação aprovada como Independente');
      expect(title(event('ACCEPTED', role: 'PROFESSOR')),
          'Você aceitou o convite');
      expect(
        title(event('REJECTED', reason: 'Sem horário')),
        'Solicitação recusada · Sem horário',
      );
      expect(title(event('REJECTED', role: 'PROFESSOR')),
          'Você recusou o convite');
      expect(
        title(event('SUSPENDED', reason: 'Atraso')),
        'Vínculo suspenso · Atraso',
      );
      expect(title(event('REACTIVATED')), 'Vínculo reativado');
      expect(
          title(event('ENDED', role: 'PROFESSOR')), 'Você encerrou o vínculo');
      expect(title(event('ENDED')), 'Vínculo encerrado pela arena');
      expect(title(event('CANCELED', role: 'PROFESSOR')),
          'Você cancelou o pedido');
      expect(title(event('CANCELED')), 'Convite cancelado pela arena');
      expect(title(event('EXPIRED', role: 'SYSTEM')), 'Convite expirou');
    });

    test('permissões alteradas: uma ou várias', () {
      expect(
        title(event('PERMISSIONS_CHANGED', metadata: {
          'changed': ['canAppearInArenaProfile'],
          'after': {
            'canManageOwnLessons': true,
            'canBookCourts': true,
            'canAppearInArenaProfile': false,
          },
        })),
        'Permissão “Aparecer no perfil da arena” removida',
      );
      expect(
        title(event('PERMISSIONS_CHANGED', metadata: {
          'changed': ['canManageOwnLessons', 'canBookCourts'],
          'after': {'canManageOwnLessons': true, 'canBookCourts': false},
        })),
        'Permissões alteradas: Aulas ligada, Quadras removida',
      );
      expect(title(event('PERMISSIONS_CHANGED')), 'Permissões alteradas');
    });

    test('linha de baixo: tipo · quem · data', () {
      expect(
        professorLinkEventMeta(
          event('APPROVED', at: DateTime(2026, 5, 6)),
          viewerUid: professorTestUid,
          now: now,
        ),
        'APPROVED · Carla N. · 06 mai',
      );
      expect(
        professorLinkEventMeta(
          event(
            'REQUESTED',
            role: 'PROFESSOR',
            actorUserId: professorTestUid,
            at: DateTime(2025, 5, 5),
          ),
          viewerUid: professorTestUid,
          now: now,
        ),
        'REQUESTED · Você · 05 mai 2025',
      );
      expect(
        professorLinkEventMeta(
          event('EXPIRED', role: 'SYSTEM', actorName: 'NexaGO'),
          viewerUid: professorTestUid,
          now: now,
        ),
        'EXPIRED · NexaGO',
      );
    });

    test('ordena do mais recente para o mais antigo', () {
      final sorted = sortProfessorLinkEvents([
        event('REQUESTED', at: DateTime(2026, 5, 5)),
        event('PERMISSIONS_CHANGED', at: DateTime(2026, 9, 1)),
        event('APPROVED', at: DateTime(2026, 5, 6)),
      ]);
      expect(sorted.map((e) => e.eventType), [
        'PERMISSIONS_CHANGED',
        'APPROVED',
        'REQUESTED',
      ]);
    });
  });

  group('pedido duplicado (M5)', () {
    test('already-exists com pedido aguardando', () {
      final dup = professorLinkDuplicateFrom(
        code: 'already-exists',
        details: {
          'linkId': 'lagoa_prof-1',
          'status': 'PENDING',
          'initiatedBy': 'PROFESSOR',
        },
      );
      expect(dup, isNotNull);
      expect(dup!.linkId, 'lagoa_prof-1');
      expect(dup.status, ArenaProfessorLinkStatus.pending);
      expect(dup.initiatedBy, ArenaProfessorSide.professor);
      expect(dup.title, 'Você já tem um pedido aqui');
      expect(
        dup.body,
        'Só é possível ter um vínculo em aberto por arena. Aguarde a resposta '
        'ou cancele o pedido atual para enviar outro.',
      );
      expect(dup.primaryLabel, 'Ver pedido atual');
    });

    test('failed-precondition quando a arena já convidou', () {
      final dup = professorLinkDuplicateFrom(
        code: 'failed-precondition',
        details: {'linkId': 'sul_prof-1', 'status': 'INVITED'},
      );
      expect(dup?.title, 'A arena já convidou você');
      expect(dup?.primaryLabel, 'Ver convite');
    });

    test('ativo/suspenso: "Você já tem vínculo"; código em caixa alta', () {
      for (final status in ['ACTIVE', 'SUSPENDED']) {
        final dup = professorLinkDuplicateFrom(
          code: 'ALREADY_EXISTS',
          details: {'linkId': 'cfc_prof-1', 'status': status},
        );
        expect(dup?.title, 'Você já tem vínculo', reason: status);
        expect(dup?.primaryLabel, 'Ver vínculo');
      }
    });

    test(
        'não é duplicado: convite vencido, sem details, sem linkId, outro código',
        () {
      expect(
        professorLinkDuplicateFrom(
          code: 'failed-precondition',
          details: {'linkId': 'x', 'status': 'EXPIRED'},
        ),
        isNull,
      );
      expect(
        professorLinkDuplicateFrom(code: 'failed-precondition'),
        isNull,
      );
      expect(
        professorLinkDuplicateFrom(
          code: 'failed-precondition',
          details: {'status': 'PENDING'},
        ),
        isNull,
      );
      expect(
        professorLinkDuplicateFrom(
          code: 'permission-denied',
          details: {'linkId': 'x', 'status': 'PENDING'},
        ),
        isNull,
      );
    });
  });

  group('diversos', () {
    test('id do vínculo e iniciais da arena', () {
      expect(arenaProfessorLinkIdFor('arena-1', 'prof-1'), 'arena-1_prof-1');
      expect(professorArenaInitials('Arena Sul'), 'AS');
      expect(professorArenaInitials('Praia Viva Arena'), 'PV');
      expect(professorArenaInitials('Clube de Praia'), 'CP');
      expect(professorArenaInitials('  '), 'A');
      expect(professorArenaInitials('ótima'), 'Ó');
    });

    test('professores públicos: equipe primeiro, depois nome', () {
      PublicArenaProfessor p(String name, ArenaProfessorLinkType type) =>
          PublicArenaProfessor(professorUserId: name, name: name, type: type);
      final sorted = sortPublicArenaProfessors([
        p('marcos', ArenaProfessorLinkType.independent),
        p('Thiago', ArenaProfessorLinkType.arenaStaff),
        p('Ana', ArenaProfessorLinkType.independent),
        p('juliana', ArenaProfessorLinkType.arenaStaff),
      ]);
      expect(sorted.map((e) => e.name), ['juliana', 'Thiago', 'Ana', 'marcos']);
    });
  });
}
