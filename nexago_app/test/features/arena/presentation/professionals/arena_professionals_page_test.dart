import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/professionals/arena_professionals_logic.dart';
import 'package:nexago_app/features/arena/domain/professionals/arena_professionals_repository.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';

import 'arena_professionals_test_support.dart';

Future<FakeArenaProfessionalsRepository> _pumpList(
  WidgetTester tester, {
  List<ArenaProfessorLink>? links,
  List<ArenaProfessorCandidate> accounts = const [],
  bool canManage = true,
}) async {
  final repo = FakeArenaProfessionalsRepository(
    links: links ?? prototypeArenaLinks(),
    accounts: [...accounts],
  );
  await pumpArenaProfessionalsApp(tester, repo: repo, canManage: canManage);
  return repo;
}

Finder _rowOf(String uid) =>
    find.byKey(Key('arena-professor-row-${arenaTestId}_$uid'));

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Profissionais (A1)', () {
    testWidgets('indicadores, pedidos e lista do protótipo', (tester) async {
      await _pumpList(tester);

      expect(find.text('Profissionais'), findsOneWidget);
      expect(
        find.text('ARENA CFC · 4 ATIVOS'),
        findsOneWidget,
      );
      expect(find.text('EQUIPE DA ARENA'), findsWidgets);
      expect(find.text('ativo · 1 suspenso'), findsOneWidget);
      expect(find.text('aguardando sua decisão'), findsOneWidget);
      expect(find.text('expira em 6 dias'), findsOneWidget);

      // Pedidos no topo, o mais antigo primeiro.
      expect(find.text('2 professores pediram vínculo'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Rafael Cunha')).dy <
            tester.getTopLeft(find.text('Juliana Prado')).dy,
        isTrue,
      );
      expect(
          find.textContaining('Tenho 8 alunos particulares'), findsOneWidget);

      // Lista sem os pedidos.
      expect(find.text('Todos · 7'), findsOneWidget);
      for (final uid in [
        'carla',
        'diego',
        'eva',
        'marcos',
        'lucas',
        'bruna',
        'paulo',
      ]) {
        expect(_rowOf(uid), findsOneWidget, reason: uid);
      }
      expect(_rowOf('rafael'), findsNothing);
      expect(find.text('após o aceite'), findsOneWidget);
      expect(find.text('revogadas'), findsNWidgets(2));
      expect(find.text('desde ago 2025'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('filtros de tipo e status, busca e "Todos"', (tester) async {
      await _pumpList(tester);

      await tester.tap(find.text('Independentes'));
      await settleProfessorLinks(tester);
      expect(_rowOf('marcos'), findsOneWidget);
      expect(_rowOf('bruna'), findsOneWidget);
      expect(_rowOf('carla'), findsNothing);

      await tester.ensureVisible(find.text('Encerrados'));
      await tester.tap(find.text('Encerrados'));
      await settleProfessorLinks(tester);
      expect(find.text('Nenhum professor neste filtro.'), findsOneWidget);

      await tester.ensureVisible(find.text('Todos · 7'));
      await tester.tap(find.text('Todos · 7'));
      await settleProfessorLinks(tester);
      expect(_rowOf('carla'), findsOneWidget);
      expect(_rowOf('paulo'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('arena-professor-search')),
        'PAULO',
      );
      await settleProfessorLinks(tester);
      expect(_rowOf('paulo'), findsOneWidget);
      expect(_rowOf('carla'), findsNothing);
    });

    testWidgets('analisar: aprova com as permissões ajustadas', (
      tester,
    ) async {
      final repo = await _pumpList(tester);

      await tester.tap(
        find.byKey(const Key('arena-professor-analyze-${arenaTestId}_rafael')),
      );
      await settleProfessorSheet(tester);
      expect(find.text('Solicitação de vínculo'), findsOneWidget);
      expect(
        find.text('Rafael Cunha · enviada ontem às 21:14'),
        findsOneWidget,
      );
      expect(find.textContaining('Os vínculos de Rafael'), findsOneWidget);

      // Proposta do pedido: Perfil desligado. O gestor liga antes de aprovar.
      final profile = find.byKey(
        const Key('arena-professor-permission-canAppearInArenaProfile-off'),
      );
      await tester.ensureVisible(profile);
      await tester.tap(profile);
      await tester.pump();
      expect(
        find.byKey(
          const Key('arena-professor-permission-canAppearInArenaProfile-on'),
        ),
        findsOneWidget,
      );

      await tester.ensureVisible(
        find.byKey(const Key('arena-professor-approve')),
      );
      await tester.tap(find.byKey(const Key('arena-professor-approve')));
      await settleProfessorSheet(tester);

      expect(repo.approveCalls, hasLength(1));
      expect(repo.approveCalls.single.linkId, '${arenaTestId}_rafael');
      expect(
        repo.approveCalls.single.permissions,
        const ArenaProfessorPermissions(
          canManageOwnLessons: true,
          canBookCourts: true,
          canAppearInArenaProfile: true,
        ),
      );
      expect(find.text('Vínculo com Rafael Cunha aprovado.'), findsOneWidget);
      // Ao vivo: saiu dos pedidos e virou linha ativa.
      expect(find.text('1 professor pediu vínculo'), findsOneWidget);
      expect(_rowOf('rafael'), findsOneWidget);
    });

    testWidgets('analisar → "Rejeitar" confirma com motivo', (tester) async {
      final repo = await _pumpList(tester);

      await tester.tap(
        find.byKey(const Key('arena-professor-analyze-${arenaTestId}_rafael')),
      );
      await settleProfessorSheet(tester);
      await tester.ensureVisible(
        find.byKey(const Key('arena-professor-request-reject')),
      );
      await tester.tap(find.byKey(const Key('arena-professor-request-reject')));
      await settleProfessorSheet(tester);

      expect(
        find.text('Rejeitar a solicitação de Rafael Cunha?'),
        findsOneWidget,
      );
      await tester.enterText(
        find.byKey(const Key('arena-professor-reason')),
        'Sem horário de manhã',
      );
      await tester.tap(find.byKey(const Key('arena-professor-confirm')));
      await settleProfessorSheet(tester);

      expect(repo.rejectCalls, [
        (linkId: '${arenaTestId}_rafael', reason: 'Sem horário de manhã'),
      ]);
      expect(repo.approveCalls, isEmpty);
      expect(
        find.text('Solicitação rejeitada. O professor foi avisado.'),
        findsOneWidget,
      );
    });

    testWidgets(
        'rejeitar direto do card: "Voltar" desiste; erro mostra a '
        'mensagem do servidor', (tester) async {
      final repo = await _pumpList(tester);
      final reject = find.byKey(
        const Key('arena-professor-reject-${arenaTestId}_juliana'),
      );

      await tester.tap(reject);
      await settleProfessorSheet(tester);
      await tester.tap(find.text('Voltar'));
      await settleProfessorSheet(tester);
      expect(repo.rejectCalls, isEmpty);

      repo.error = const ProfessorLinkException(
        'Esta solicitação não está mais aguardando decisão.',
        code: 'failed-precondition',
      );
      await tester.tap(reject);
      await settleProfessorSheet(tester);
      await tester.tap(find.byKey(const Key('arena-professor-confirm')));
      await settleProfessorSheet(tester);

      expect(repo.rejectCalls, [
        (linkId: '${arenaTestId}_juliana', reason: null),
      ]);
      expect(
        find.text('Esta solicitação não está mais aguardando decisão.'),
        findsOneWidget,
      );
    });

    testWidgets('convidar: busca, conta bloqueada, tipo e permissões', (
      tester,
    ) async {
      final repo = await _pumpList(
        tester,
        accounts: const [
          ArenaProfessorCandidate(
            uid: 'lucas',
            name: 'Lucas Ferraz',
            subtitle: 'Goiânia/GO',
          ),
          ArenaProfessorCandidate(
            uid: 'lucas-a',
            name: 'Lucas Andrade',
            subtitle: 'Lucas Andrade Silva · Goiânia/GO',
          ),
        ],
      );

      await tester.tap(find.byKey(const Key('arena-professor-invite')));
      await settleProfessorSheet(tester);
      expect(find.text('Convidar professor'), findsOneWidget);

      Future<void> tapSend() async {
        final send = find.byKey(const Key('arena-professor-invite-send'));
        await tester.ensureVisible(send);
        await tester.tap(send);
        await settleProfessorSheet(tester);
      }

      // Sem ninguém escolhido o envio fica travado.
      await tapSend();
      expect(repo.inviteCalls, isEmpty);

      await tester.enterText(
        find.byKey(const Key('arena-professor-invite-search')),
        'lucas',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await settleProfessorLinks(tester);
      expect(repo.searchCalls, ['lucas']);
      // Quem já tem convite em aberto aparece travado.
      expect(find.text('Já convidado · aguardando resposta'), findsOneWidget);
      await tester.tap(
        find.byKey(const Key('arena-professor-candidate-lucas')),
      );
      await tester.pump();
      await tapSend();
      expect(repo.inviteCalls, isEmpty);

      await tester.tap(
        find.byKey(const Key('arena-professor-candidate-lucas-a')),
      );
      await tester.pump();

      // Independente: a proposta volta ao padrão do tipo (perfil desligado).
      final independent = find.byKey(
        const Key('arena-professor-type-INDEPENDENT'),
      );
      await tester.ensureVisible(independent);
      await tester.tap(independent);
      await tester.pump();
      expect(
        find.byKey(
          const Key('arena-professor-permission-canAppearInArenaProfile-off'),
        ),
        findsOneWidget,
      );

      await tester.enterText(
        find.byKey(const Key('arena-professor-invite-message')),
        'Turmas de sábado',
      );
      await tapSend();

      expect(repo.inviteCalls, hasLength(1));
      final call = repo.inviteCalls.single;
      expect(call.arenaId, arenaTestId);
      expect(call.professorUserId, 'lucas-a');
      expect(call.type, ArenaProfessorLinkType.independent);
      expect(
        call.permissions,
        defaultArenaProfessorPermissions(ArenaProfessorLinkType.independent),
      );
      expect(call.message, 'Turmas de sábado');
      expect(
        find.text('Convite enviado para Lucas Andrade. Vale por 7 dias.'),
        findsOneWidget,
      );
      expect(find.text('Convidar professor'), findsNothing);
    });

    testWidgets('convidar: erro do servidor fica na folha', (tester) async {
      final repo = await _pumpList(
        tester,
        accounts: const [
          ArenaProfessorCandidate(uid: 'novo', name: 'Nina Costa'),
        ],
      );
      repo.error = const ProfessorLinkException(
        'Este professor pediu vínculo — analise a solicitação.',
        code: 'failed-precondition',
      );

      await tester.tap(find.byKey(const Key('arena-professor-invite')));
      await settleProfessorSheet(tester);
      await tester.enterText(
        find.byKey(const Key('arena-professor-invite-search')),
        'nina',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await settleProfessorLinks(tester);
      await tester.tap(find.byKey(const Key('arena-professor-candidate-novo')));
      await tester.pump();
      final send = find.byKey(const Key('arena-professor-invite-send'));
      await tester.ensureVisible(send);
      await tester.tap(send);
      await settleProfessorSheet(tester);

      expect(repo.inviteCalls, hasLength(1));
      expect(
        find.text('Este professor pediu vínculo — analise a solicitação.'),
        findsOneWidget,
      );
      expect(find.text('Convidar professor'), findsOneWidget);
    });

    testWidgets('copiar link da página no convite', (tester) async {
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            copied = (call.arguments as Map)['text'] as String?;
          }
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, null),
      );
      await _pumpList(tester);

      await tester.tap(find.byKey(const Key('arena-professor-invite')));
      await settleProfessorSheet(tester);
      await tester.tap(find.byKey(const Key('arena-professor-copy-link')));
      await tester.pump();

      expect(copied, 'https://atleta.nexago.com.br/reservar/arena-cfc');
      expect(find.text('Copiado'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
    });

    testWidgets('linha abre o detalhe do vínculo', (tester) async {
      await _pumpList(tester);

      await tester.tap(_rowOf('marcos'));
      await settleProfessorSheet(tester);

      // Nome no cabeçalho e na ficha.
      expect(find.text('Marcos Lima'), findsNWidgets(2));
      expect(find.text('VÍNCULO DESDE 04 AGO 2025'), findsOneWidget);
    });

    testWidgets('vazio: convite, link da página e os dois tipos', (
      tester,
    ) async {
      await _pumpList(tester, links: const []);

      expect(find.text('Adicione seu primeiro professor'), findsOneWidget);
      expect(
        find.text('ARENA CFC · SEM PROFESSORES'),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('arena-professor-empty-invite')),
        findsOneWidget,
      );
      expect(find.text('Equipe da arena'), findsOneWidget);
      expect(find.text('Independente'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('cabe num celular estreito (360)', (tester) async {
      final repo = FakeArenaProfessionalsRepository(
        links: [
          ...prototypeArenaLinks(),
          // Dois convites: o rodapé vira "o próximo expira em…".
          arenaLink(
            uid: 'nina',
            name: 'Nina Costa',
            status: ArenaProfessorLinkStatus.invited,
            invitedAt: DateTime(2026, 10, 20, 9),
            expiresAt: DateTime(2026, 10, 27, 9),
          ),
        ],
      );
      await pumpArenaProfessionalsApp(
        tester,
        repo: repo,
        size: const Size(360, 2400),
      );
      expect(find.text('o próximo expira em 6 dias'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(_rowOf('marcos'));
      await settleProfessorSheet(tester);
      expect(find.text('VÍNCULO DESDE 04 AGO 2025'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('só leitura: sem convite nem decisão nos pedidos', (
      tester,
    ) async {
      await _pumpList(tester, canManage: false);

      expect(find.byKey(const Key('arena-professor-invite')), findsNothing);
      expect(
        find.byKey(const Key('arena-professor-reject-${arenaTestId}_rafael')),
        findsNothing,
      );
      expect(find.text('Rafael Cunha'), findsOneWidget);
    });
  });
}
