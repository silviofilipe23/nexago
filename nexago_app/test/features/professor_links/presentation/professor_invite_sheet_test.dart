import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/domain/professor_links_repository.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_invite_sheet.dart';

import '../professor_links_test_support.dart';

/// Abre a folha do convite (M2) pela lista, numa tela de iPhone SE — a folha
/// tem de caber (teto de 85% + rolagem) sem estourar.
Future<FakeProfessorLinksRepository> _openInviteSheet(
  WidgetTester tester, {
  Object? respondError,
  ArenaProfessorLink? invite,
}) async {
  final repo = FakeProfessorLinksRepository(
    links: [
      invite ??
          invitedLink(
            message: 'Estamos abrindo turmas de Beach Tennis à noite e '
                'queremos você no time.',
          ),
    ],
    respondError: respondError,
  );
  await pumpProfessorLinksApp(
    tester,
    repo: repo,
    location: AppRoutes.professorArenas,
    size: const Size(375, 667),
  );
  await tester.tap(
    find.byKey(const Key('professor-invite-open-arena-sul_prof-1')),
  );
  await settleProfessorSheet(tester);
  return repo;
}

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Folha do convite (M2)', () {
    testWidgets('mostra arena, tipo, mensagem, o que a arena libera e a nota', (
      tester,
    ) async {
      await _openInviteSheet(
        tester,
        invite: professorLink(
          status: ArenaProfessorLinkStatus.invited,
          invitedAt: DateTime(2026, 10, 20, 10, 42),
          expiresAt: DateTime(2026, 10, 27, 10, 42),
          invitedByName: 'Ricardo Prado',
          message: 'Queremos você no time.',
          permissions: const ArenaProfessorPermissions(
            canManageOwnLessons: true,
            canBookCourts: true,
            canAppearInArenaProfile: false,
          ),
        ),
      );

      expect(find.byType(ProfessorInviteSheet), findsOneWidget);
      expect(find.text('Convite da Arena Sul'), findsOneWidget);
      expect(find.text('Ricardo Prado · hoje 10:42'), findsOneWidget);
      expect(find.text('GOIÂNIA · GO'), findsOneWidget);
      expect(find.text('“Queremos você no time.”'), findsOneWidget);
      expect(find.text('A ARENA LIBERA'), findsOneWidget);
      // Proposta da arena: aulas e quadras ligadas, perfil desligado.
      expect(
        find.byKey(const Key('professor-permission-canManageOwnLessons-on')),
        findsOneWidget,
      );
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
      expect(
        find.textContaining(
          'Não é vínculo empregatício nem exclusividade. Seus outros vínculos '
          'não mudam.',
        ),
        findsOneWidget,
      );
      // A lista atrás da folha também mostra o prazo: conferir só na folha.
      expect(
        find.descendant(
          of: find.byType(ProfessorInviteSheet),
          matching: find.textContaining('Expira em 7 dias'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('aceitar responde accept=true, fecha e confirma', (
      tester,
    ) async {
      final repo = await _openInviteSheet(tester);

      await tester.ensureVisible(
        find.byKey(const Key('professor-invite-accept')),
      );
      await tester.tap(find.byKey(const Key('professor-invite-accept')));
      await settleProfessorSheet(tester);

      expect(repo.respondCalls, [
        (linkId: 'arena-sul_prof-1', accept: true, reason: null),
      ]);
      expect(find.byType(ProfessorInviteSheet), findsNothing);
      expect(
        find.text(
            'Convite aceito: agora você faz parte da equipe da Arena Sul.'),
        findsOneWidget,
      );
      // A lista ao vivo já mostra o vínculo ativo.
      expect(find.text('1 ATIVA'), findsOneWidget);
    });

    testWidgets('recusar responde accept=false e fecha', (tester) async {
      final repo = await _openInviteSheet(tester);

      await tester.ensureVisible(
        find.byKey(const Key('professor-invite-decline')),
      );
      await tester.tap(find.byKey(const Key('professor-invite-decline')));
      await settleProfessorSheet(tester);

      expect(repo.respondCalls, [
        (linkId: 'arena-sul_prof-1', accept: false, reason: null),
      ]);
      expect(find.byType(ProfessorInviteSheet), findsNothing);
      expect(find.text('Convite recusado.'), findsOneWidget);
    });

    testWidgets('erro do servidor (convite vencido) fica na folha', (
      tester,
    ) async {
      final repo = await _openInviteSheet(
        tester,
        respondError: const ProfessorLinkException(
          'Este convite expirou. Peça à arena um convite novo.',
          code: 'failed-precondition',
          status: ArenaProfessorLinkStatus.expired,
        ),
      );

      await tester.ensureVisible(
        find.byKey(const Key('professor-invite-accept')),
      );
      await tester.tap(find.byKey(const Key('professor-invite-accept')));
      await settleProfessorSheet(tester);

      expect(repo.respondCalls, hasLength(1));
      expect(find.byType(ProfessorInviteSheet), findsOneWidget);
      expect(
        find.text('Este convite expirou. Peça à arena um convite novo.'),
        findsOneWidget,
      );
      // Os botões voltam a responder.
      final accept = tester.widget<FilledButton>(
        find.descendant(
          of: find.byKey(const Key('professor-invite-accept')),
          matching: find.byType(FilledButton),
        ),
      );
      expect(accept.onPressed, isNotNull);
    });
  });
}
