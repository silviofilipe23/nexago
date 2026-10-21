import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/arena/domain/professionals/arena_professionals_logic.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';

import '../../presentation/professionals/arena_professionals_test_support.dart';

ArenaProfessorLinkEvent _event(
  String type, {
  String actorRole = 'ARENA',
  String actorName = 'Ana Souza',
  String? reason,
  Map<String, Object?> metadata = const {},
  DateTime? createdAt,
}) =>
    ArenaProfessorLinkEvent(
      id: 'e-$type',
      eventType: type,
      actorRole: actorRole,
      actorName: actorName,
      reason: reason,
      metadata: metadata,
      createdAt: createdAt,
    );

void main() {
  final now = arenaTestNow;

  group('rótulos e permissões', () {
    test('status do ponto de vista da arena', () {
      expect(
        arenaProfessorStatusLabel(ArenaProfessorLinkStatus.invited),
        'Convite enviado',
      );
      expect(
        arenaProfessorStatusLabel(ArenaProfessorLinkStatus.pending),
        'Aguardando aprovação',
      );
      expect(
        arenaProfessorStatusLabel(ArenaProfessorLinkStatus.expired),
        'Convite expirado',
      );
    });

    test(
        'padrão do tipo: equipe liga as três, independente fica fora do '
        'perfil', () {
      final staff =
          defaultArenaProfessorPermissions(ArenaProfessorLinkType.arenaStaff);
      expect(staff.canManageOwnLessons, isTrue);
      expect(staff.canBookCourts, isTrue);
      expect(staff.canAppearInArenaProfile, isTrue);
      final independent =
          defaultArenaProfessorPermissions(ArenaProfessorLinkType.independent);
      expect(independent.canBookCourts, isTrue);
      expect(independent.canAppearInArenaProfile, isFalse);
    });

    test('troca uma chave só e serializa com as chaves do servidor', () {
      final next = arenaProfessorPermissionsWith(
        ArenaProfessorPermissions.none,
        ArenaProfessorPermissionKey.canBookCourts,
        true,
      );
      expect(arenaProfessorPermissionsToMap(next), {
        'canManageOwnLessons': false,
        'canBookCourts': true,
        'canAppearInArenaProfile': false,
        'canEnrollStudents': false,
        'canScheduleLessons': false,
        'canCancelLessons': false,
        'canBookRecurring': false,
      });
    });

    test('Aulas da arena: desligadas no padrão dos dois tipos', () {
      for (final type in ArenaProfessorLinkType.values) {
        final defaults = defaultArenaProfessorPermissions(type);
        expect(defaults.canEnrollStudents, isFalse, reason: type.wire);
        expect(defaults.canScheduleLessons, isFalse, reason: type.wire);
        expect(defaults.canCancelLessons, isFalse, reason: type.wire);
      }
    });

    test('grupo "Aulas da arena" só aparece para a equipe', () {
      final staff =
          arenaProfessorPermissionGroups(ArenaProfessorLinkType.arenaStaff);
      expect(staff.map((g) => g.title), [null, 'Aulas da arena']);
      expect(staff.last.items.map((i) => i.key), [
        ArenaProfessorPermissionKey.canEnrollStudents,
        ArenaProfessorPermissionKey.canScheduleLessons,
        ArenaProfessorPermissionKey.canCancelLessons,
      ]);
      final independent =
          arenaProfessorPermissionGroups(ArenaProfessorLinkType.independent);
      expect(independent.map((g) => g.title), [null, 'Turma própria']);
      expect(
        independent.expand((g) => g.items).any((i) => i.key.arenaStaffOnly),
        isFalse,
      );
    });

    test('grupo "Turma própria" só aparece para o independente', () {
      final independent =
          arenaProfessorPermissionGroups(ArenaProfessorLinkType.independent);
      expect(independent.last.title, 'Turma própria');
      expect(independent.last.items.map((i) => i.key),
          [ArenaProfessorPermissionKey.canBookRecurring]);
      final staff =
          arenaProfessorPermissionGroups(ArenaProfessorLinkType.arenaStaff);
      expect(
        staff.expand((g) => g.items).any((i) => i.key.independentOnly),
        isFalse,
      );
      // Desligada por padrão nos dois tipos.
      for (final type in ArenaProfessorLinkType.values) {
        expect(defaultArenaProfessorPermissions(type).canBookRecurring,
            isFalse);
      }
    });

    test('convite de equipe nunca manda o horário fixo ligado', () {
      final proposal = arenaProfessorPermissionsWith(
        defaultArenaProfessorPermissions(ArenaProfessorLinkType.arenaStaff),
        ArenaProfessorPermissionKey.canBookRecurring,
        true,
      );
      expect(
        arenaProfessorPermissionsToSend(
          proposal,
          ArenaProfessorLinkType.arenaStaff,
        ).canBookRecurring,
        isFalse,
      );
      expect(
        arenaProfessorPermissionsToSend(
          proposal,
          ArenaProfessorLinkType.independent,
        ).canBookRecurring,
        isTrue,
      );
    });

    test('convite/aprovação nunca mandam true de equipe para independente', () {
      var proposal = defaultArenaProfessorPermissions(
        ArenaProfessorLinkType.arenaStaff,
      );
      proposal = arenaProfessorPermissionsWith(
        proposal,
        ArenaProfessorPermissionKey.canEnrollStudents,
        true,
      );
      expect(
        arenaProfessorPermissionsToMap(
          arenaProfessorPermissionsToSend(
            proposal,
            ArenaProfessorLinkType.independent,
          ),
        )['canEnrollStudents'],
        isFalse,
      );
      expect(
        arenaProfessorPermissionsToSend(
          proposal,
          ArenaProfessorLinkType.arenaStaff,
        ).canEnrollStudents,
        isTrue,
      );
    });

    test('só ativo e suspenso são ajustáveis', () {
      expect(
        arenaProfessorPermissionsEditable(ArenaProfessorLinkStatus.active),
        isTrue,
      );
      expect(
        arenaProfessorPermissionsEditable(ArenaProfessorLinkStatus.suspended),
        isTrue,
      );
      for (final status in [
        ArenaProfessorLinkStatus.invited,
        ArenaProfessorLinkStatus.pending,
        ArenaProfessorLinkStatus.ended,
      ]) {
        expect(arenaProfessorPermissionsEditable(status), isFalse);
      }
    });

    test('card do detalhe: aberto mostra a configuração, fechado nada', () {
      expect(
        arenaProfessorPermissionsShown(brunaSuspended(), now).canBookCourts,
        isTrue,
      );
      expect(
        arenaProfessorPermissionsShown(pauloEnded(), now),
        ArenaProfessorPermissions.none,
      );
      // Convite vencido conta como fechado mesmo antes do servidor marcar.
      final expired = lucasInvited(expiresAt: DateTime(2026, 10, 19));
      expect(
        arenaProfessorPermissionsShown(expired, now),
        ArenaProfessorPermissions.none,
      );
    });

    test('célula da lista: pílulas no ativo, texto no resto', () {
      final active = arenaProfessorPermissionsCell(marcosActive(), now);
      expect(active.text, isNull);
      expect(
        [for (final p in active.pills!) '${p.label}:${p.on}'],
        ['Aulas:true', 'Quadras:true', 'Perfil:false'],
      );
      expect(
        arenaProfessorPermissionsCell(lucasInvited(), now).text,
        'após o aceite',
      );
      expect(
        arenaProfessorPermissionsCell(rafaelPending(), now).text,
        'após a aprovação',
      );
      expect(
        arenaProfessorPermissionsCell(brunaSuspended(), now).text,
        'revogadas',
      );
    });

    test('nota das permissões por estado', () {
      expect(arenaProfessorPermissionsNote(marcosActive(), now), isNull);
      expect(
        arenaProfessorPermissionsNote(brunaSuspended(), now),
        contains('nada vale até reativar'),
      );
      expect(
        arenaProfessorPermissionsNote(lucasInvited(), now),
        contains('quando o professor aceitar'),
      );
      expect(
        arenaProfessorPermissionsNote(pauloEnded(), now),
        'Vínculo fechado — permissões revogadas.',
      );
    });
  });

  group('datas', () {
    test('linha da lista por estado', () {
      expect(
          arenaProfessorStatusDateLine(marcosActive(), now), 'desde ago 2025');
      expect(
          arenaProfessorStatusDateLine(lucasInvited(), now), 'convite 19 out');
      expect(
          arenaProfessorStatusDateLine(rafaelPending(), now), 'pedido 19 out');
      expect(
        arenaProfessorStatusDateLine(brunaSuspended(), now),
        'suspenso 12 out',
      );
      expect(
        arenaProfessorStatusDateLine(pauloEnded(), now),
        'encerrado fev 2026',
      );
      expect(
        arenaProfessorStatusDateLine(
          lucasInvited(expiresAt: DateTime(2026, 10, 19, 12)),
          now,
        ),
        'expirou 19 out',
      );
    });

    test('subtítulo do detalhe', () {
      expect(
        arenaProfessorDetailSubtitle(marcosActive(), now),
        'Vínculo desde 04 ago 2025',
      );
      expect(
        arenaProfessorDetailSubtitle(lucasInvited(), now),
        'Convite enviado 19 out · expira em 6 dias',
      );
      expect(
        arenaProfessorDetailSubtitle(
          lucasInvited(expiresAt: DateTime(2026, 10, 20, 18)),
          now,
        ),
        'Convite enviado 19 out · expira em 1 dia',
      );
      expect(
        arenaProfessorDetailSubtitle(brunaSuspended(), now),
        'Suspenso desde 12 out',
      );
      expect(
        arenaProfessorDetailSubtitle(rafaelPending(), now),
        'Pedido em 19 out',
      );
    });

    test('quando o pedido chegou', () {
      expect(
        arenaProfessorRequestSentLabel(rafaelPending(), now),
        'enviada ontem às 21:14',
      );
      expect(
        arenaProfessorRequestSentLabel(julianaPending(), now),
        'enviada hoje às 08:30',
      );
    });
  });

  group('lista', () {
    test('indicadores do protótipo', () {
      final kpis = arenaProfessorKpis(prototypeArenaLinks(), now);
      expect(kpis.staffActive, 3);
      expect(kpis.staffSuspended, 0);
      expect(kpis.independentActive, 1);
      expect(kpis.independentSuspended, 1);
      expect(kpis.pending, 2);
      expect(kpis.invitesOpen, 1);
      expect(kpis.nextInviteDaysLeft, 6);
      expect(
        arenaProfessorActiveKpiSub(
          kpis.independentActive,
          kpis.independentSuspended,
        ),
        'ativo · 1 suspenso',
      );
      expect(arenaProfessorActiveKpiSub(3, 0), 'ativos');
      expect(arenaProfessorInviteKpiSub(kpis), 'expira em 6 dias');
      expect(
        arenaProfessorInviteKpiSub(const ArenaProfessorKpis()),
        'nenhum em aberto',
      );
    });

    test('convite vencido sai dos indicadores de convite', () {
      final kpis = arenaProfessorKpis(
        [lucasInvited(expiresAt: DateTime(2026, 10, 19))],
        now,
      );
      expect(kpis.invitesOpen, 0);
      expect(kpis.nextInviteDaysLeft, isNull);
    });

    test('linhas: sem pedidos, por grupo de status e nome', () {
      final rows = filterArenaProfessorRows(prototypeArenaLinks(), now: now);
      expect(rows.map((l) => l.professorName), [
        'Carla Nunes',
        'Diego Torres',
        'Eva Martins',
        'Marcos Lima',
        'Lucas Ferraz',
        'Bruna Alves',
        'Paulo Reis',
      ]);
      expect(arenaProfessorRowCount(prototypeArenaLinks(), now), 7);
    });

    test('filtros de tipo, status e busca sem acento', () {
      final links = prototypeArenaLinks();
      expect(
        filterArenaProfessorRows(
          links,
          now: now,
          type: ArenaProfessorTypeFilter.independent,
        ).map((l) => l.professorName),
        ['Marcos Lima', 'Bruna Alves'],
      );
      expect(
        filterArenaProfessorRows(
          links,
          now: now,
          status: ArenaProfessorStatusGroup.closed,
        ).map((l) => l.professorName),
        ['Paulo Reis'],
      );
      expect(
        filterArenaProfessorRows(
          links,
          now: now,
          type: ArenaProfessorTypeFilter.arenaStaff,
          status: ArenaProfessorStatusGroup.invites,
        ).map((l) => l.professorName),
        ['Lucas Ferraz'],
      );
      expect(
        filterArenaProfessorRows(links, now: now, term: 'márcos')
            .map((l) => l.professorName),
        ['Marcos Lima'],
      );
    });

    test('pedidos do mais antigo para o mais novo', () {
      expect(
        pendingArenaProfessorRequests(prototypeArenaLinks())
            .map((l) => l.professorName),
        ['Rafael Cunha', 'Juliana Prado'],
      );
    });

    test('subtítulo dos Ajustes', () {
      expect(
        arenaProfessionalsEntrySubtitle(prototypeArenaLinks(), now),
        '2 solicitações para analisar',
      );
      expect(
        arenaProfessionalsEntrySubtitle([marcosActive()], now),
        '1 professor ativo',
      );
      expect(
        arenaProfessionalsEntrySubtitle([lucasInvited()], now),
        '1 convite aguardando resposta',
      );
      expect(
        arenaProfessionalsEntrySubtitle(const [], now),
        'Convidar e aprovar professores',
      );
    });
  });

  group('convite', () {
    test('conta da busca: vínculo aberto bloqueia, fechado libera', () {
      final links = prototypeArenaLinks();
      expect(
        arenaProfessorAccountState(links, 'lucas', now),
        ArenaProfessorAccountState.invited,
      );
      expect(
        arenaProfessorAccountState(links, 'rafael', now),
        ArenaProfessorAccountState.requested,
      );
      expect(
        arenaProfessorAccountState(links, 'bruna', now),
        ArenaProfessorAccountState.linked,
      );
      expect(
        arenaProfessorAccountState(links, 'paulo', now),
        ArenaProfessorAccountState.available,
      );
      expect(
        arenaProfessorAccountState(links, 'novo', now),
        ArenaProfessorAccountState.available,
      );
      expect(
        arenaProfessorAccountState(
          [lucasInvited(expiresAt: DateTime(2026, 10, 19))],
          'lucas',
          now,
        ),
        ArenaProfessorAccountState.available,
      );
      expect(
        arenaProfessorAccountStateLabel(ArenaProfessorAccountState.invited),
        'Já convidado · aguardando resposta',
      );
    });

    test('candidato: apelido no título, nome completo e cidade embaixo', () {
      final candidate = arenaProfessorCandidateFrom(
        const AppUserProfile(
          uid: 'u1',
          nickname: 'Luquinhas',
          fullName: 'Lucas Andrade',
          city: 'Goiânia',
          state: 'GO',
          profilePhotoUrl: '  ',
        ),
      );
      expect(candidate.name, 'Luquinhas');
      expect(candidate.subtitle, 'Lucas Andrade · Goiânia/GO');
      expect(candidate.photoUrl, isNull);
    });

    test('link da página da arena no portal do atleta', () {
      expect(
        arenaProfessorRequestPageUrl('arena cfc'),
        'https://atleta.nexago.com.br/reservar/arena%20cfc',
      );
    });
  });

  group('ações por estado', () {
    test('mesma tabela do portal', () {
      expect(arenaProfessorActions(marcosActive(), now), [
        ArenaProfessorAction.suspend,
        ArenaProfessorAction.end,
      ]);
      expect(arenaProfessorActions(brunaSuspended(), now), [
        ArenaProfessorAction.reactivate,
        ArenaProfessorAction.end,
      ]);
      expect(
        arenaProfessorActions(rafaelPending(), now),
        [ArenaProfessorAction.analyze],
      );
      expect(
        arenaProfessorActions(lucasInvited(), now),
        [ArenaProfessorAction.cancelInvite],
      );
      expect(
        arenaProfessorActions(
          lucasInvited(expiresAt: DateTime(2026, 10, 19)),
          now,
        ),
        [ArenaProfessorAction.resendInvite, ArenaProfessorAction.cancelInvite],
      );
      expect(arenaProfessorActions(pauloEnded(), now), isEmpty);
    });

    test('expirado só reenvia quando a arena convidou', () {
      final byArena = copyArenaLink(
        lucasInvited(),
        status: ArenaProfessorLinkStatus.expired,
      );
      expect(
        arenaProfessorActions(byArena, now),
        [ArenaProfessorAction.resendInvite],
      );
      final byProfessor = copyArenaLink(
        byArena,
        initiatedBy: ArenaProfessorSide.professor,
      );
      expect(arenaProfessorActions(byProfessor, now), isEmpty);
    });

    test('motivo do estado na ficha', () {
      expect(arenaProfessorReasonFact(brunaSuspended()), (
        label: 'Motivo da suspensão',
        text: 'Pendência de pagamento — 3 reservas de setembro em aberto.',
      ));
      expect(arenaProfessorReasonFact(pauloEnded()), (
        label: 'Encerrado pelo professor',
        text: 'Mudei de cidade',
      ));
      expect(arenaProfessorReasonFact(marcosActive()), isNull);
    });
  });

  group('histórico', () {
    final link = marcosActive();

    test('títulos do ponto de vista da arena', () {
      expect(
        arenaProfessorEventTitle(
          _event('REQUESTED', actorRole: 'PROFESSOR', actorName: 'Marcos Lima'),
          link,
        ),
        'Marcos solicitou vínculo · Independente',
      );
      expect(
        arenaProfessorEventTitle(
          _event(
            'APPROVED',
            metadata: const {'relationshipType': 'INDEPENDENT'},
          ),
          link,
        ),
        'Solicitação aprovada como Independente',
      );
      expect(
        arenaProfessorEventTitle(
          _event('INVITED',
              metadata: const {'relationshipType': 'ARENA_STAFF'}),
          link,
        ),
        'Convite enviado · Equipe da arena',
      );
      expect(
        arenaProfessorEventTitle(
          _event('SUSPENDED', reason: 'Pendência de pagamento'),
          link,
        ),
        'Vínculo suspenso · Pendência de pagamento',
      );
      expect(
        arenaProfessorEventTitle(
          _event('REJECTED', actorRole: 'PROFESSOR'),
          link,
        ),
        'Convite recusado pelo professor',
      );
      expect(
        arenaProfessorEventTitle(
          _event('ENDED', actorRole: 'PROFESSOR', reason: 'Mudei de cidade'),
          link,
        ),
        'Vínculo encerrado pelo professor · Mudei de cidade',
      );
      expect(
        arenaProfessorEventTitle(
          _event('CANCELED', metadata: const {'side': 'PROFESSOR'}),
          link,
        ),
        'Pedido cancelado',
      );
      expect(
        arenaProfessorEventTitle(_event('CANCELED'), link),
        'Convite cancelado',
      );
    });

    test('permissões alteradas: uma ou várias', () {
      expect(
        arenaProfessorEventTitle(
          _event('PERMISSIONS_CHANGED', metadata: const {
            'changed': ['canBookCourts'],
            'after': {'canBookCourts': false},
          }),
          link,
        ),
        'Permissão “Reservar quadras” removida',
      );
      expect(
        arenaProfessorEventTitle(
          _event('PERMISSIONS_CHANGED', metadata: const {
            'changed': ['canManageOwnLessons', 'canAppearInArenaProfile'],
            'after': {
              'canManageOwnLessons': true,
              'canAppearInArenaProfile': false,
            },
          }),
          link,
        ),
        'Permissões alteradas · “Gerenciar as próprias aulas” ligada · '
        '“Aparecer no perfil da arena” removida',
      );
    });

    test('linha de baixo: tipo, autor e data', () {
      expect(
        arenaProfessorEventMeta(
          _event('APPROVED', createdAt: DateTime(2025, 8, 4)),
          now,
        ),
        'APPROVED · Ana Souza · 04 ago 2025',
      );
      expect(
        arenaProfessorEventMeta(
          _event('EXPIRED', actorRole: 'SYSTEM', actorName: ''),
          now,
        ),
        'EXPIRED · Sistema',
      );
      expect(
        arenaProfessorEventMeta(
          _event('SUSPENDED', actorRole: 'ADMIN', actorName: 'Silvio'),
          now,
        ),
        'SUSPENDED · Silvio · suporte',
      );
    });
  });

  group('desconto no aluguel de quadra', () {
    test('editável só com o vínculo ativo ou suspenso', () {
      expect(
        arenaProfessorCourtDiscountEditable(ArenaProfessorLinkStatus.active),
        isTrue,
      );
      expect(
        arenaProfessorCourtDiscountEditable(ArenaProfessorLinkStatus.suspended),
        isTrue,
      );
      for (final status in [
        ArenaProfessorLinkStatus.invited,
        ArenaProfessorLinkStatus.pending,
        ArenaProfessorLinkStatus.ended,
      ]) {
        expect(arenaProfessorCourtDiscountEditable(status), isFalse);
      }
    });

    test('entrada: inteiro 0–90; vazio = 0; resto inválido', () {
      expect(parseArenaProfessorCourtDiscountInput('20'), 20);
      expect(parseArenaProfessorCourtDiscountInput(' 15% '), 15);
      expect(parseArenaProfessorCourtDiscountInput(''), 0);
      expect(parseArenaProfessorCourtDiscountInput('0'), 0);
      expect(parseArenaProfessorCourtDiscountInput('90'), 90);
      expect(parseArenaProfessorCourtDiscountInput('91'), isNull);
      expect(parseArenaProfessorCourtDiscountInput('-1'), isNull);
      expect(parseArenaProfessorCourtDiscountInput('12.5'), isNull);
      expect(parseArenaProfessorCourtDiscountInput('abc'), isNull);
    });

    test('rótulos', () {
      expect(arenaProfessorCourtDiscountValueLabel(20), '20%');
      expect(arenaProfessorCourtDiscountValueLabel(0), 'Sem desconto');
      expect(
        arenaProfessorCourtDiscountSavedMessage(0),
        'Desconto no aluguel removido. O professor foi avisado.',
      );
      expect(
        arenaProfessorCourtDiscountSavedMessage(20),
        'Desconto de 20% no aluguel salvo. O professor foi avisado.',
      );
      expect(
        arenaProfessorCourtDiscountSavedMessage(
          20,
          startTime: '08:00',
          endTime: '17:00',
        ),
        'Desconto de 20% das 08:00 às 17:00 no aluguel salvo. O professor '
        'foi avisado.',
      );
    });

    test('linha da faixa do dia no card', () {
      expect(
        arenaProfessorCourtDiscountWindowLabel(20),
        'O dia todo · sobre o preço cheio',
      );
      expect(
        arenaProfessorCourtDiscountWindowLabel(
          20,
          startTime: '08:00',
          endTime: '17:00',
        ),
        'Das 08:00 às 17:00 · sobre o preço cheio',
      );
      // Faixa inválida = o dia todo; sem desconto, só a base do cálculo.
      expect(
        arenaProfessorCourtDiscountWindowLabel(
          20,
          startTime: '17:00',
          endTime: '08:00',
        ),
        'O dia todo · sobre o preço cheio',
      );
      expect(
        arenaProfessorCourtDiscountWindowLabel(0),
        'Sobre o preço cheio do horário',
      );
    });

    test('faixa do dia: valor do seletor e validação', () {
      expect(arenaProfessorCourtDiscountTimeValue(8, 0, isEnd: false), '08:00');
      expect(arenaProfessorCourtDiscountTimeValue(17, 30, isEnd: true), '17:30');
      // 00:00 no fim = meia-noite do fim do dia.
      expect(arenaProfessorCourtDiscountTimeValue(0, 0, isEnd: true), '24:00');
      expect(arenaProfessorCourtDiscountTimeValue(0, 0, isEnd: false), '00:00');

      expect(arenaProfessorCourtDiscountWindowError('08:00', '17:00'), isNull);
      expect(arenaProfessorCourtDiscountWindowError('18:00', '24:00'), isNull);
      const error = 'O início do horário precisa ser antes do fim.';
      expect(arenaProfessorCourtDiscountWindowError('17:00', '08:00'), error);
      expect(arenaProfessorCourtDiscountWindowError('08:00', '08:00'), error);
    });

    test('título do evento no histórico da arena', () {
      ArenaProfessorLinkEvent event(int before, int after) =>
          ArenaProfessorLinkEvent(
            id: 'e',
            eventType: 'COURT_DISCOUNT_CHANGED',
            actorRole: 'ARENA',
            metadata: {'before': before, 'after': after},
          );
      final link = marcosActive();
      expect(
        arenaProfessorEventTitle(event(0, 20), link),
        'Desconto no aluguel: 20%',
      );
      expect(
        arenaProfessorEventTitle(event(20, 0), link),
        'Desconto no aluguel removido',
      );
      expect(
        arenaProfessorEventTitle(event(10, 20), link),
        'Desconto no aluguel: 10% → 20%',
      );
    });
  });
}
