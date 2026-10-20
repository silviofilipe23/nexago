import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/domain/professor_link_rules.dart';
import 'package:nexago_app/features/professor_links/domain/professor_links_repository.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_link_detail_page.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_link_request_sent_page.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_my_arenas_page.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_link_duplicate_sheet.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_link_request_sheet.dart';

import '../professor_links_test_support.dart';

const _praiaViva = 'praia-viva_prof-1';

/// Página da arena de teste → "Solicitar vínculo" (M3).
Future<FakeProfessorLinksRepository> _openRequestSheet(
  WidgetTester tester, {
  Object? requestError,
  List<ArenaProfessorLink>? links,
}) async {
  final repo = FakeProfessorLinksRepository(
    links: links,
    requestError: requestError,
  );
  await pumpProfessorLinksApp(
    tester,
    repo: repo,
    location: professorTestArenaRoute,
    size: const Size(375, 667),
  );
  await tester.tap(find.byKey(const Key('arena-professor-request')));
  await settleProfessorSheet(tester);
  return repo;
}

Future<void> _submit(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const Key('professor-request-submit')));
  await tester.tap(find.byKey(const Key('professor-request-submit')));
  await settleProfessorSheet(tester);
}

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Solicitar vínculo (M3)', () {
    testWidgets('o tipo é obrigatório: sem escolha o envio fica desligado', (
      tester,
    ) async {
      final repo = await _openRequestSheet(tester);

      expect(find.byType(ProfessorLinkRequestSheet), findsOneWidget);
      expect(find.text('Solicitar vínculo'), findsWidgets);
      expect(find.text('Equipe da arena'), findsOneWidget);
      expect(
        find.text('Autônomo, usa a estrutura para os próprios alunos'),
        findsOneWidget,
      );
      final submit = tester.widget<FilledButton>(
        find.descendant(
          of: find.byKey(const Key('professor-request-submit')),
          matching: find.byType(FilledButton),
        ),
      );
      expect(submit.onPressed, isNull);

      await _submit(tester);
      expect(repo.requestCalls, isEmpty);
    });

    testWidgets('envia tipo + mensagem e abre "Solicitação enviada" (M4)', (
      tester,
    ) async {
      final repo = await _openRequestSheet(tester);

      await tester.tap(
        find.byKey(const Key('professor-request-type-INDEPENDENT')),
      );
      await tester.pump();
      await tester.enterText(
        find.byKey(const Key('professor-request-message')),
        'Tenho alunos aos sábados.',
      );
      await _submit(tester);

      expect(repo.requestCalls, [
        (
          arenaId: 'praia-viva',
          type: ArenaProfessorLinkType.independent,
          message: 'Tenho alunos aos sábados.',
        ),
      ]);
      expect(find.byType(ProfessorLinkRequestSheet), findsNothing);
      expect(find.byType(ProfessorLinkRequestSentPage), findsOneWidget);
      expect(find.text('Solicitação enviada'), findsOneWidget);
      expect(
        find.text(
          'A Praia Viva Arena vai analisar seu pedido. Você recebe uma '
          'notificação com a resposta.',
        ),
        findsOneWidget,
      );
      expect(find.text('Aguardando a arena'), findsOneWidget);
      expect(find.text('INDEPENDENTE'), findsOneWidget);
      expect(find.text('Pedido em 20 out'), findsOneWidget);
      expect(
        find.text(
          'Sem permissões até a aprovação: você ainda não pode reservar '
          'quadras aqui.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('M4: "Cancelar solicitação" confirma e cancela o pedido', (
      tester,
    ) async {
      final repo = await _openRequestSheet(tester);
      await tester.tap(
        find.byKey(const Key('professor-request-type-ARENA_STAFF')),
      );
      await tester.pump();
      await _submit(tester);

      await tester.tap(find.byKey(const Key('professor-sent-cancel')));
      await settleProfessorSheet(tester);
      expect(find.text('Cancelar solicitação?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('professor-link-confirm')));
      await settleProfessorSheet(tester);

      expect(repo.cancelCalls, [_praiaViva]);
      expect(find.text('Solicitação cancelada.'), findsOneWidget);
      // Volta para a página da arena.
      expect(find.byType(ProfessorLinkRequestSentPage), findsNothing);
      expect(find.byKey(const Key('arena-professor-request')), findsOneWidget);
    });

    testWidgets('M4: "Ver minhas arenas" troca a tela pela lista', (
      tester,
    ) async {
      await _openRequestSheet(tester);
      await tester.tap(
        find.byKey(const Key('professor-request-type-ARENA_STAFF')),
      );
      await tester.pump();
      await _submit(tester);

      await tester.tap(find.byKey(const Key('professor-sent-my-arenas')));
      await settleProfessorSheet(tester);

      expect(find.byType(ProfessorMyArenasPage), findsOneWidget);
      expect(find.text('1 AGUARDANDO'), findsOneWidget);
    });

    testWidgets('erro comum (arena sem gestor) fica na folha', (tester) async {
      final repo = await _openRequestSheet(
        tester,
        requestError: const ProfessorLinkException(
          'Esta arena ainda não é administrada na NexaGO — não dá para pedir '
          'vínculo por aqui.',
          code: 'failed-precondition',
        ),
      );
      await tester.tap(
        find.byKey(const Key('professor-request-type-ARENA_STAFF')),
      );
      await tester.pump();
      await _submit(tester);

      expect(repo.requestCalls, hasLength(1));
      expect(find.byType(ProfessorLinkRequestSheet), findsOneWidget);
      expect(
        find.textContaining('Esta arena ainda não é administrada'),
        findsOneWidget,
      );
    });
  });

  group('Pedido duplicado (M5)', () {
    final pending = professorLink(
      arenaId: 'praia-viva',
      arenaName: 'Praia Viva Arena',
      type: ArenaProfessorLinkType.independent,
      status: ArenaProfessorLinkStatus.pending,
      initiatedBy: ArenaProfessorSide.professor,
      requestedAt: DateTime(2026, 10, 17),
    );

    ProfessorLinkException duplicateError() => ProfessorLinkException(
          'Você já tem um pedido aqui. Aguarde a resposta ou cancele o pedido '
          'atual para enviar outro.',
          code: 'already-exists',
          duplicate: professorLinkDuplicateFrom(
            code: 'already-exists',
            details: {
              'linkId': _praiaViva,
              'status': 'PENDING',
              'initiatedBy': 'PROFESSOR',
            },
          ),
        );

    testWidgets('troca a folha do pedido por "Você já tem um pedido aqui"', (
      tester,
    ) async {
      // A página da arena some com o card de status quando já há pedido —
      // aqui o vínculo só "aparece" depois de abrir a folha (corrida comum
      // entre duas abas/aparelhos).
      final repo = await _openRequestSheet(
        tester,
        requestError: duplicateError(),
      );
      repo.setLinks([pending]);
      await tester.tap(
        find.byKey(const Key('professor-request-type-ARENA_STAFF')),
      );
      await tester.pump();
      await _submit(tester);
      await settleProfessorSheet(tester);

      expect(find.byType(ProfessorLinkRequestSheet), findsNothing);
      expect(find.byType(ProfessorLinkDuplicateSheet), findsOneWidget);
      expect(find.text('Você já tem um pedido aqui'), findsOneWidget);
      expect(find.text('Independente · pedido em 17 out'), findsOneWidget);
      expect(
        find.text(
          'Só é possível ter um vínculo em aberto por arena. Aguarde a '
          'resposta ou cancele o pedido atual para enviar outro.',
        ),
        findsOneWidget,
      );

      await tester.ensureVisible(
        find.byKey(const Key('professor-duplicate-open')),
      );
      await tester.tap(find.byKey(const Key('professor-duplicate-open')));
      await settleProfessorSheet(tester);

      expect(find.byType(ProfessorLinkDuplicateSheet), findsNothing);
      expect(
        tester
            .widget<ProfessorLinkDetailPage>(
              find.byType(ProfessorLinkDetailPage),
            )
            .linkId,
        _praiaViva,
      );
    });

    testWidgets('"Fechar" só fecha a folha', (tester) async {
      await _openRequestSheet(tester, requestError: duplicateError());
      await tester.tap(
        find.byKey(const Key('professor-request-type-ARENA_STAFF')),
      );
      await tester.pump();
      await _submit(tester);
      await settleProfessorSheet(tester);

      // Sem o vínculo ao vivo, o status vem dos `details`.
      expect(find.text('Aguardando a arena'), findsOneWidget);
      await tester.ensureVisible(
        find.byKey(const Key('professor-duplicate-close')),
      );
      await tester.tap(find.byKey(const Key('professor-duplicate-close')));
      await settleProfessorSheet(tester);

      expect(find.byType(ProfessorLinkDuplicateSheet), findsNothing);
      expect(find.byType(ProfessorLinkDetailPage), findsNothing);
      expect(find.byKey(const Key('arena-professor-request')), findsOneWidget);
    });
  });
}
