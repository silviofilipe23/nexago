import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/professionals/arena_professionals_repository.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';

import 'arena_professionals_test_support.dart';

const _marcos = '${arenaTestId}_marcos';

final _marcosEvents = [
  ArenaProfessorLinkEvent(
    id: 'e1',
    eventType: 'REQUESTED',
    actorRole: 'PROFESSOR',
    actorName: 'Marcos Lima',
    metadata: const {'relationshipType': 'INDEPENDENT'},
    createdAt: DateTime(2025, 8, 2),
  ),
  ArenaProfessorLinkEvent(
    id: 'e3',
    eventType: 'PERMISSIONS_CHANGED',
    actorRole: 'ARENA',
    actorName: 'Ana Souza',
    metadata: const {
      'changed': ['canAppearInArenaProfile'],
      'after': {'canAppearInArenaProfile': false},
    },
    createdAt: DateTime(2026, 9, 1),
  ),
  ArenaProfessorLinkEvent(
    id: 'e2',
    eventType: 'APPROVED',
    actorRole: 'ARENA',
    actorName: 'Ana Souza',
    metadata: const {'relationshipType': 'INDEPENDENT'},
    createdAt: DateTime(2025, 8, 4),
  ),
];

Future<FakeArenaProfessionalsRepository> _pumpDetail(
  WidgetTester tester, {
  required ArenaProfessorLink link,
  Map<String, List<ArenaProfessorLinkEvent>> events = const {},
  bool canManage = true,
}) async {
  final repo = FakeArenaProfessionalsRepository(
    links: [link],
    events: events,
  );
  await pumpArenaProfessionalsApp(
    tester,
    repo: repo,
    canManage: canManage,
    location: '/arena/professionals/${link.id}',
  );
  return repo;
}

Future<void> _tapKey(WidgetTester tester, String key) async {
  final finder = find.byKey(Key(key));
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await settleProfessorSheet(tester);
}

Finder _permission(String wire, bool on) =>
    find.byKey(Key('arena-professor-permission-$wire-${on ? 'on' : 'off'}'));

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Detalhe do vínculo (A4)', () {
    testWidgets('ativo: ficha, ações, permissões e histórico', (tester) async {
      await _pumpDetail(
        tester,
        link: marcosActive(),
        events: {_marcos: _marcosEvents},
      );

      expect(find.text('VÍNCULO DESDE 04 AGO 2025'), findsOneWidget);
      expect(find.text('Vôlei de praia'), findsOneWidget);
      expect(find.text('INDEPENDENTE'), findsOneWidget);
      expect(find.text('Ativo'), findsOneWidget);
      expect(find.text('Professor'), findsOneWidget);
      expect(find.text('Ana Souza'), findsOneWidget);
      expect(
        find.text('“Tenho alunos particulares de manhã cedo.”'),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('arena-professor-action-suspend')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('arena-professor-action-end')),
        findsOneWidget,
      );
      expect(_permission('canBookCourts', true), findsOneWidget);
      expect(_permission('canAppearInArenaProfile', false), findsOneWidget);

      // Histórico do mais recente para o mais antigo.
      final titles = [
        'Permissão “Aparecer no perfil da arena” removida',
        'Solicitação aprovada como Independente',
        'Marcos solicitou vínculo · Independente',
      ];
      for (var i = 1; i < titles.length; i++) {
        expect(
          tester.getTopLeft(find.text(titles[i - 1])).dy <
              tester.getTopLeft(find.text(titles[i])).dy,
          isTrue,
          reason: titles[i],
        );
      }
      expect(
        find.text('PERMISSIONS_CHANGED · Ana Souza · 01 set'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets(
        'interruptor grava só a chave e segura o valor até o doc '
        'voltar', (tester) async {
      final repo = await _pumpDetail(tester, link: marcosActive());
      repo.holdPermissionEcho = true;

      final off = _permission('canAppearInArenaProfile', false);
      await tester.ensureVisible(off);
      await tester.tap(off);
      await settleProfessorLinks(tester);

      expect(repo.permissionCalls, [
        (
          linkId: _marcos,
          key: ArenaProfessorPermissionKey.canAppearInArenaProfile,
          value: true,
        ),
      ]);
      // A callable respondeu, o snapshot ainda não: segue ligado e travado.
      expect(_permission('canAppearInArenaProfile', true), findsOneWidget);
      await tester.tap(_permission('canBookCourts', true));
      await settleProfessorLinks(tester);
      expect(repo.permissionCalls, hasLength(1));

      repo.flushPermissionEcho();
      await settleProfessorLinks(tester);
      expect(_permission('canAppearInArenaProfile', true), findsOneWidget);

      // Doc de volta: os interruptores voltam a responder.
      await tester.tap(_permission('canBookCourts', true));
      await settleProfessorLinks(tester);
      expect(repo.permissionCalls, hasLength(2));
      expect(repo.permissionCalls.last.value, isFalse);
      repo.flushPermissionEcho();
      await settleProfessorLinks(tester);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('independente: sem o grupo "Aulas da arena"', (tester) async {
      await _pumpDetail(tester, link: marcosActive());

      expect(
        find.byKey(const Key('arena-professor-permission-group-lessons')),
        findsNothing,
      );
      for (final wire in [
        'canEnrollStudents',
        'canScheduleLessons',
        'canCancelLessons',
      ]) {
        expect(_permission(wire, false), findsNothing, reason: wire);
        expect(_permission(wire, true), findsNothing, reason: wire);
      }
      expect(_permission('canBookCourts', true), findsOneWidget);
    });

    testWidgets(
        'independente: "Horário fixo (turma própria)" desligado; o '
        'interruptor grava canBookRecurring', (tester) async {
      final repo = await _pumpDetail(tester, link: marcosActive());

      expect(
        find.byKey(const Key('arena-professor-permission-group-recurring')),
        findsOneWidget,
      );
      expect(find.text('Horário fixo (turma própria)'), findsOneWidget);
      expect(
        find.text('Pode reservar a quadra toda semana para uma turma dele. A '
            'reserva aparece nos horários fixos da arena.'),
        findsOneWidget,
      );
      final toggle = _permission('canBookRecurring', false);
      expect(toggle, findsOneWidget);
      await tester.ensureVisible(toggle);
      await tester.tap(toggle);
      await settleProfessorLinks(tester);

      expect(repo.permissionCalls, [
        (
          linkId: _marcos,
          key: ArenaProfessorPermissionKey.canBookRecurring,
          value: true,
        ),
      ]);
      expect(_permission('canBookRecurring', true), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('equipe: sem o "Horário fixo (turma própria)"', (tester) async {
      await _pumpDetail(
        tester,
        link: copyArenaLink(
          marcosActive(),
          type: ArenaProfessorLinkType.arenaStaff,
        ),
      );
      expect(
        find.byKey(const Key('arena-professor-permission-group-recurring')),
        findsNothing,
      );
      expect(_permission('canBookRecurring', false), findsNothing);
      expect(_permission('canBookRecurring', true), findsNothing);
    });

    testWidgets(
        'equipe: "Aulas da arena" desligadas por padrão; o interruptor '
        'grava a chave certa', (tester) async {
      final repo = await _pumpDetail(
        tester,
        link: copyArenaLink(
          marcosActive(),
          type: ArenaProfessorLinkType.arenaStaff,
        ),
      );

      expect(
        find.byKey(const Key('arena-professor-permission-group-lessons')),
        findsOneWidget,
      );
      expect(find.text('Matricular alunos'), findsOneWidget);
      expect(find.text('Agendar aulas e encaixes'), findsOneWidget);
      expect(find.text('Cancelar aulas e avisar alunos'), findsOneWidget);
      expect(_permission('canScheduleLessons', false), findsOneWidget);
      expect(_permission('canCancelLessons', false), findsOneWidget);

      final enroll = _permission('canEnrollStudents', false);
      await tester.ensureVisible(enroll);
      await tester.tap(enroll);
      await settleProfessorLinks(tester);

      expect(repo.permissionCalls, [
        (
          linkId: _marcos,
          key: ArenaProfessorPermissionKey.canEnrollStudents,
          value: true,
        ),
      ]);
      expect(_permission('canEnrollStudents', true), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('interruptor: erro volta o valor e mostra a mensagem', (
      tester,
    ) async {
      final repo = await _pumpDetail(tester, link: marcosActive());
      repo.error = const ProfessorLinkException(
        'Só vínculo ativo ou suspenso tem permissões ajustáveis.',
        code: 'failed-precondition',
      );

      await tester.ensureVisible(_permission('canBookCourts', true));
      await tester.tap(_permission('canBookCourts', true));
      await settleProfessorLinks(tester);

      expect(_permission('canBookCourts', true), findsOneWidget);
      expect(
        find.text('Só vínculo ativo ou suspenso tem permissões ajustáveis.'),
        findsOneWidget,
      );
    });

    testWidgets('suspender: motivo obrigatório, detalhes e aviso', (
      tester,
    ) async {
      final repo = await _pumpDetail(tester, link: marcosActive());

      await _tapKey(tester, 'arena-professor-action-suspend');
      expect(find.text('Suspender vínculo'), findsOneWidget);
      expect(find.text('Marcos Lima · Independente'), findsOneWidget);
      expect(
        find.textContaining('Os vínculos de Marcos com outras arenas'),
        findsOneWidget,
      );

      // Sem motivo o botão não responde.
      await _tapKey(tester, 'arena-professor-suspend-confirm');
      expect(repo.suspendCalls, isEmpty);

      await _tapKey(
        tester,
        'arena-professor-suspend-reason-Pendência de pagamento',
      );
      await tester.enterText(
        find.byKey(const Key('arena-professor-suspend-details')),
        '3 reservas em aberto',
      );
      await _tapKey(tester, 'arena-professor-suspend-confirm');

      expect(repo.suspendCalls, [
        (
          linkId: _marcos,
          reason: 'Pendência de pagamento',
          details: '3 reservas em aberto',
        ),
      ]);
      expect(
        find.text('Vínculo com Marcos Lima suspenso. O professor foi avisado.'),
        findsOneWidget,
      );
      // Ao vivo: suspenso, com o motivo na ficha e a reativação.
      expect(find.text('SUSPENSO DESDE 20 OUT'), findsOneWidget);
      expect(
        find.text('Pendência de pagamento — 3 reservas em aberto'),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('arena-professor-action-reactivate')),
        findsOneWidget,
      );
      expect(find.textContaining('nada vale até reativar'), findsOneWidget);
    });

    testWidgets('reativar: chama a callable; erro mostra a mensagem', (
      tester,
    ) async {
      final repo = await _pumpDetail(tester, link: brunaSuspended());
      repo.error = const ProfessorLinkException(
        'Este vínculo não está suspenso.',
        code: 'failed-precondition',
      );

      await _tapKey(tester, 'arena-professor-action-reactivate');
      expect(repo.reactivateCalls, ['${arenaTestId}_bruna']);
      expect(find.text('Este vínculo não está suspenso.'), findsOneWidget);

      repo.error = null;
      await _tapKey(tester, 'arena-professor-action-reactivate');
      expect(find.text('Vínculo com Bruna Alves reativado.'), findsOneWidget);
      expect(find.text('Ativo'), findsOneWidget);
    });

    testWidgets('encerrar: confirma com motivo; depois fica só leitura', (
      tester,
    ) async {
      final repo = await _pumpDetail(tester, link: marcosActive());

      await _tapKey(tester, 'arena-professor-action-end');
      expect(find.text('Encerrar o vínculo com Marcos Lima?'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('arena-professor-reason')),
        'Fim da parceria',
      );
      await _tapKey(tester, 'arena-professor-confirm');

      expect(repo.endCalls, [(linkId: _marcos, reason: 'Fim da parceria')]);
      expect(
        find.text('Vínculo encerrado. O professor foi avisado.'),
        findsOneWidget,
      );
      expect(find.text('ENCERRADO EM 20 OUT'), findsOneWidget);
      expect(find.text('Fim da parceria'), findsOneWidget);
      expect(
        find.byKey(const Key('arena-professor-action-end')),
        findsNothing,
      );
      // Fechado: nada vale e nada se ajusta.
      expect(_permission('canBookCourts', false), findsOneWidget);
      await tester.tap(_permission('canBookCourts', false));
      await settleProfessorLinks(tester);
      expect(repo.permissionCalls, isEmpty);
    });

    testWidgets('convite em aberto: cancelar com confirmação', (tester) async {
      final repo = await _pumpDetail(tester, link: lucasInvited());

      expect(
        find.text('CONVITE ENVIADO 19 OUT · EXPIRA EM 6 DIAS'),
        findsOneWidget,
      );
      expect(find.text('Convidado por'), findsNothing);
      expect(find.text('CONVIDADO POR'), findsOneWidget);
      expect(
        find.textContaining('só passa a valer quando o professor aceitar'),
        findsOneWidget,
      );
      // A proposta aparece, mas não se ajusta antes do aceite.
      await tester.tap(_permission('canBookCourts', true));
      await settleProfessorLinks(tester);
      expect(repo.permissionCalls, isEmpty);

      await _tapKey(tester, 'arena-professor-action-cancel');
      expect(
        find.text('Cancelar o convite para Lucas Ferraz?'),
        findsOneWidget,
      );
      await _tapKey(tester, 'arena-professor-confirm');

      expect(repo.cancelCalls, ['${arenaTestId}_lucas']);
      expect(find.text('Convite cancelado.'), findsOneWidget);
    });

    testWidgets('convite vencido: reenviar com o mesmo tipo e proposta', (
      tester,
    ) async {
      final link = lucasInvited(expiresAt: DateTime(2026, 10, 19));
      final repo = await _pumpDetail(tester, link: link);

      expect(find.text('CONVITE EXPIROU 19 OUT'), findsOneWidget);
      await _tapKey(tester, 'arena-professor-action-resend');

      expect(repo.inviteCalls, hasLength(1));
      final call = repo.inviteCalls.single;
      expect(call.professorUserId, 'lucas');
      expect(call.type, ArenaProfessorLinkType.arenaStaff);
      expect(call.permissions, link.permissions);
      expect(call.message, 'Queremos você nas turmas de sábado.');
      expect(
        find.text('Convite reenviado para Lucas Ferraz. Vale por mais 7 dias.'),
        findsOneWidget,
      );
      expect(
        find.text('CONVITE ENVIADO 20 OUT · EXPIRA EM 7 DIAS'),
        findsOneWidget,
      );
    });

    testWidgets('pedido: analisar → rejeitar pela folha', (tester) async {
      final repo = await _pumpDetail(tester, link: rafaelPending());

      expect(find.text('Aguardando aprovação'), findsOneWidget);
      await _tapKey(tester, 'arena-professor-action-analyze');
      expect(find.text('Solicitação de vínculo'), findsOneWidget);
      await _tapKey(tester, 'arena-professor-request-reject');
      await _tapKey(tester, 'arena-professor-confirm');

      expect(repo.rejectCalls, [
        (linkId: '${arenaTestId}_rafael', reason: null),
      ]);
      expect(find.text('Recusado'), findsOneWidget);
    });

    testWidgets('sem escrita na arena: sem ações e sem interruptor', (
      tester,
    ) async {
      final repo = await _pumpDetail(
        tester,
        link: marcosActive(),
        canManage: false,
      );

      expect(
        find.byKey(const Key('arena-professor-action-suspend')),
        findsNothing,
      );
      await tester.tap(_permission('canBookCourts', true));
      await settleProfessorLinks(tester);
      expect(repo.permissionCalls, isEmpty);
    });

    testWidgets('vínculo inexistente', (tester) async {
      await pumpArenaProfessionalsApp(
        tester,
        repo: FakeArenaProfessionalsRepository(),
        location: '/arena/professionals/arena-cfc_ninguem',
      );

      expect(find.text('Vínculo não encontrado'), findsOneWidget);
      await tester.tap(find.text('Ver profissionais'));
      await settleProfessorSheet(tester);
      expect(find.text('Adicione seu primeiro professor'), findsOneWidget);
    });
  });

  group('Desconto no aluguel de quadra', () {
    testWidgets('ativo sem desconto: mostra "Sem desconto" e a dica',
        (tester) async {
      await _pumpDetail(tester, link: marcosActive());

      expect(find.text('DESCONTO NO ALUGUEL DE QUADRA'), findsOneWidget);
      expect(
        find.byKey(const Key('arena-professor-court-discount-value')),
        findsOneWidget,
      );
      expect(find.text('Sem desconto'), findsOneWidget);
      expect(find.textContaining('vale o menor preço'), findsOneWidget);
      expect(
        find.byKey(const Key('arena-professor-court-discount-edit')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('alterar grava pela callable e mostra o valor novo',
        (tester) async {
      final repo = await _pumpDetail(
        tester,
        link: arenaLink(
          uid: 'marcos',
          name: 'Marcos Lima',
          courtDiscountPercent: 10,
        ),
      );
      expect(find.text('10%'), findsOneWidget);

      await _tapKey(tester, 'arena-professor-court-discount-edit');
      final input = find.byKey(const Key('arena-professor-court-discount-input'));
      expect(input, findsOneWidget);

      // Fora do intervalo: erro no campo, nada gravado.
      await tester.enterText(input, '95');
      await tester.tap(
        find.byKey(const Key('arena-professor-court-discount-save')),
      );
      await settleProfessorLinks(tester);
      expect(find.text('Use um número inteiro de 0 a 90.'), findsOneWidget);
      expect(repo.courtDiscountCalls, isEmpty);

      await tester.enterText(input, '20');
      await tester.tap(
        find.byKey(const Key('arena-professor-court-discount-save')),
      );
      await settleProfessorSheet(tester);

      expect(repo.courtDiscountCalls, [
        (linkId: _marcos, courtDiscountPercent: 20),
      ]);
      expect(find.text('20%'), findsOneWidget);
      expect(
        find.text(
          'Desconto de 20% no aluguel salvo. O professor foi avisado.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('suspenso também edita', (tester) async {
      await _pumpDetail(tester, link: brunaSuspended());
      expect(
        find.byKey(const Key('arena-professor-court-discount-edit')),
        findsOneWidget,
      );
    });

    testWidgets('encerrado sem desconto: seção some', (tester) async {
      await _pumpDetail(tester, link: pauloEnded());
      expect(
        find.byKey(const Key('arena-professor-court-discount')),
        findsNothing,
      );
    });

    testWidgets('só leitura: mostra o valor sem "Alterar"', (tester) async {
      await _pumpDetail(
        tester,
        link: arenaLink(
          uid: 'marcos',
          name: 'Marcos Lima',
          courtDiscountPercent: 15,
        ),
        canManage: false,
      );
      expect(find.text('15%'), findsOneWidget);
      expect(
        find.byKey(const Key('arena-professor-court-discount-edit')),
        findsNothing,
      );
    });

    testWidgets('histórico mostra a mudança de desconto', (tester) async {
      await _pumpDetail(
        tester,
        link: marcosActive(),
        events: {
          _marcos: [
            ArenaProfessorLinkEvent(
              id: 'd1',
              eventType: 'COURT_DISCOUNT_CHANGED',
              actorRole: 'ARENA',
              actorName: 'Ana Souza',
              metadata: const {'before': 10, 'after': 20},
              createdAt: DateTime(2026, 9, 2),
            ),
          ],
        },
      );
      expect(find.text('Desconto no aluguel: 10% → 20%'), findsOneWidget);
    });
  });
}
