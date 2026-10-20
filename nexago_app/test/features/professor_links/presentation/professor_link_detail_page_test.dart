import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/domain/professor_links_repository.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_invite_sheet.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_link_request_sheet.dart';

import '../professor_links_test_support.dart';

const _norte = 'arena-norte_prof-1';

ArenaProfessorLink _activeNorte() => professorLink(
      arenaId: 'arena-norte',
      arenaName: 'Arena Norte',
      type: ArenaProfessorLinkType.independent,
      initiatedBy: ArenaProfessorSide.professor,
      permissions: const ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: true,
        canAppearInArenaProfile: false,
      ),
      approvedAt: DateTime(2026, 5, 6),
    );

final _norteEvents = [
  ArenaProfessorLinkEvent(
    id: 'e1',
    eventType: 'REQUESTED',
    actorRole: 'PROFESSOR',
    actorUserId: professorTestUid,
    actorName: 'Thiago Mendes',
    metadata: const {'relationshipType': 'INDEPENDENT'},
    createdAt: DateTime(2026, 5, 5),
  ),
  ArenaProfessorLinkEvent(
    id: 'e3',
    eventType: 'PERMISSIONS_CHANGED',
    actorRole: 'ARENA',
    actorUserId: 'gestor-1',
    actorName: 'Carla N.',
    metadata: const {
      'changed': ['canAppearInArenaProfile'],
      'after': {
        'canManageOwnLessons': true,
        'canBookCourts': true,
        'canAppearInArenaProfile': false,
      },
    },
    createdAt: DateTime(2026, 9, 1),
  ),
  ArenaProfessorLinkEvent(
    id: 'e2',
    eventType: 'APPROVED',
    actorRole: 'ARENA',
    actorUserId: 'gestor-1',
    actorName: 'Carla N.',
    createdAt: DateTime(2026, 5, 6),
  ),
];

Future<FakeProfessorLinksRepository> _pumpDetail(
  WidgetTester tester, {
  required ArenaProfessorLink link,
  Map<String, List<ArenaProfessorLinkEvent>> events = const {},
  Object? endError,
}) async {
  final repo = FakeProfessorLinksRepository(
    links: [link],
    events: events,
    endError: endError,
  );
  await pumpProfessorLinksApp(
    tester,
    repo: repo,
    location: '/athlete/professor/arenas/${link.id}',
  );
  return repo;
}

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Detalhe do vínculo (M6)', () {
    testWidgets('equipe: lista as Aulas da arena ligadas; independente nunca', (
      tester,
    ) async {
      const lessons = ArenaProfessorPermissions(
        canManageOwnLessons: true,
        canBookCourts: true,
        canAppearInArenaProfile: true,
        canEnrollStudents: true,
        canCancelLessons: true,
      );
      await _pumpDetail(
        tester,
        link: professorLink(permissions: lessons),
      );
      expect(
        find.byKey(const Key('professor-permission-canEnrollStudents-on')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('professor-permission-canCancelLessons-on')),
        findsOneWidget,
      );
      expect(find.text('Matricular alunos'), findsOneWidget);
      // Desligada não entra na lista (nem como "x").
      expect(
        find.byKey(const Key('professor-permission-canScheduleLessons-off')),
        findsNothing,
      );
    });

    testWidgets('independente com chave de equipe gravada não a mostra', (
      tester,
    ) async {
      await _pumpDetail(
        tester,
        link: professorLink(
          type: ArenaProfessorLinkType.independent,
          permissions: const ArenaProfessorPermissions(
            canManageOwnLessons: true,
            canBookCourts: true,
            canAppearInArenaProfile: false,
            canEnrollStudents: true,
          ),
        ),
      );
      expect(
        find.byKey(const Key('professor-permission-canBookCourts-on')),
        findsOneWidget,
      );
      expect(find.textContaining('Matricular alunos'), findsNothing);
    });

    testWidgets('ativo: tipo, status, permissões efetivas e histórico', (
      tester,
    ) async {
      await _pumpDetail(
        tester,
        link: _activeNorte(),
        events: {_norte: _norteEvents},
      );

      expect(find.text('Arena Norte'), findsOneWidget);
      expect(find.text('VÍNCULO ATIVO · DESDE MAI 2026'), findsOneWidget);
      expect(find.text('INDEPENDENTE'), findsOneWidget);
      expect(find.text('Ativo'), findsOneWidget);
      expect(find.text('SUAS PERMISSÕES'), findsOneWidget);
      expect(
        find.byKey(const Key('professor-permission-canBookCourts-on')),
        findsOneWidget,
      );
      expect(
        find.byKey(
          const Key('professor-permission-canAppearInArenaProfile-off'),
        ),
        findsOneWidget,
      );

      // Histórico do mais recente para o mais antigo.
      final titles = [
        'Permissão “Aparecer no perfil da arena” removida',
        'Solicitação aprovada como Independente',
        'Você solicitou vínculo · Independente',
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
          find.text('PERMISSIONS_CHANGED · Carla N. · 01 set'), findsOneWidget);
      expect(find.text('REQUESTED · Você · 05 mai'), findsOneWidget);
      expect(find.byKey(const Key('professor-link-end')), findsOneWidget);
    });

    testWidgets('encerrar: confirma com motivo e chama a callable', (
      tester,
    ) async {
      final repo = await _pumpDetail(tester, link: _activeNorte());

      await tester.ensureVisible(find.byKey(const Key('professor-link-end')));
      await tester.tap(find.byKey(const Key('professor-link-end')));
      await settleProfessorSheet(tester);
      expect(find.text('Encerrar vínculo?'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('professor-link-end-reason')),
        'Mudei de cidade',
      );
      await tester.tap(find.byKey(const Key('professor-link-confirm')));
      await settleProfessorSheet(tester);

      expect(repo.endCalls, [(linkId: _norte, reason: 'Mudei de cidade')]);
      expect(find.text('Vínculo encerrado.'), findsOneWidget);
      // Ao vivo: agora encerrado, com a ação de pedir de novo.
      expect(find.textContaining('VÍNCULO ENCERRADO'), findsOneWidget);
      expect(
        find.byKey(const Key('professor-link-request-again')),
        findsOneWidget,
      );
    });

    testWidgets('encerrar: "Voltar" não encerra; erro mostra a copy', (
      tester,
    ) async {
      final repo = await _pumpDetail(
        tester,
        link: _activeNorte(),
        endError: const ProfessorLinkException('Este vínculo não está ativo.'),
      );

      await tester.ensureVisible(find.byKey(const Key('professor-link-end')));
      await tester.tap(find.byKey(const Key('professor-link-end')));
      await settleProfessorSheet(tester);
      await tester.tap(find.text('Voltar'));
      await settleProfessorSheet(tester);
      expect(repo.endCalls, isEmpty);

      await tester.tap(find.byKey(const Key('professor-link-end')));
      await settleProfessorSheet(tester);
      await tester.tap(find.byKey(const Key('professor-link-confirm')));
      await settleProfessorSheet(tester);

      expect(repo.endCalls, [(linkId: _norte, reason: null)]);
      expect(find.text('Este vínculo não está ativo.'), findsOneWidget);
    });

    testWidgets('suspenso: nota vermelha com o motivo e nada liberado', (
      tester,
    ) async {
      await _pumpDetail(
        tester,
        link: professorLink(
          arenaId: 'arena-norte',
          arenaName: 'Arena Norte',
          status: ArenaProfessorLinkStatus.suspended,
          suspendedAt: DateTime(2026, 10, 2),
          suspensionReason: 'Pagamento em atraso',
        ),
      );

      expect(find.text('VÍNCULO SUSPENSO · DESDE 02 OUT'), findsOneWidget);
      expect(
        find.textContaining('Motivo: Pagamento em atraso.'),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('professor-permission-canBookCourts-off')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('professor-link-end')), findsOneWidget);
    });

    testWidgets('pedido aguardando: cancela com confirmação', (tester) async {
      final pending = professorLink(
        arenaId: 'lagoa',
        arenaName: 'Lagoa Beach Club',
        status: ArenaProfessorLinkStatus.pending,
        initiatedBy: ArenaProfessorSide.professor,
        requestedAt: DateTime(2026, 10, 17),
      );
      final repo = await _pumpDetail(tester, link: pending);

      expect(
          find.text('AGUARDANDO A ARENA · PEDIDO EM 17 OUT'), findsOneWidget);
      await tester.tap(find.byKey(const Key('professor-link-cancel')));
      await settleProfessorSheet(tester);
      await tester.tap(find.byKey(const Key('professor-link-confirm')));
      await settleProfessorSheet(tester);

      expect(repo.cancelCalls, ['lagoa_prof-1']);
      expect(find.text('Solicitação cancelada.'), findsOneWidget);
    });

    testWidgets('convite em aberto: mostra a proposta e abre a folha', (
      tester,
    ) async {
      await _pumpDetail(tester, link: invitedLink());

      expect(find.text('A ARENA LIBERA'), findsOneWidget);
      expect(
        find.byKey(const Key('professor-permission-canBookCourts-on')),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('professor-link-respond')));
      await settleProfessorSheet(tester);
      expect(find.byType(ProfessorInviteSheet), findsOneWidget);
    });

    testWidgets('fechado: "Solicitar novo vínculo" abre o pedido da arena', (
      tester,
    ) async {
      await _pumpDetail(
        tester,
        link: professorLink(
          arenaId: 'beach-point',
          arenaName: 'Beach Point',
          status: ArenaProfessorLinkStatus.ended,
          endedBySide: ArenaProfessorSide.arena,
          endedReason: 'Fim da parceria',
          endedAt: DateTime(2026, 2, 3),
        ),
      );

      expect(find.text('VÍNCULO ENCERRADO · EM FEV 2026'), findsOneWidget);
      expect(
        find.text('A arena encerrou o vínculo. Motivo: Fim da parceria.'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('professor-link-request-again')));
      await settleProfessorSheet(tester);
      final sheet = tester.widget<ProfessorLinkRequestSheet>(
        find.byType(ProfessorLinkRequestSheet),
      );
      expect(sheet.arenaId, 'beach-point');
      expect(sheet.arenaName, 'Beach Point');
    });

    testWidgets('vínculo inexistente (ou de outra conta): estado vazio', (
      tester,
    ) async {
      final repo = FakeProfessorLinksRepository();
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: '/athlete/professor/arenas/nao-existe',
      );

      expect(find.text('Vínculo não encontrado'), findsOneWidget);
      expect(find.text('Ver minhas arenas'), findsOneWidget);
    });
  });
}
