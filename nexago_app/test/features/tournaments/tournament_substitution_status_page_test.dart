// Widget tests da tela de acompanhamento da substituição (Task 6 da jornada
// v2): timeline "O QUE FALTA" (item enviado com timestamp formatado, item
// pendente com o "visto há" quando existe), caixa "VAGA RESERVADA" com o
// countdown, transição pra tela de sucesso quando o convite vira `accepted`
// e o corpo terminal quando `declined`.
//
// O cálculo de countdown/viewed em si (arredondamento, `null` no vencido) já
// é coberto em `substitution_journey_logic_test.dart` — aqui o alvo é a
// FIAÇÃO: qual texto aparece, com qual dado.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/my_tournament_registrations_repository.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/domain/substitution_journey_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_substitution_status_page.dart';

void main() {
  const tournamentId = 't1';
  const inviteId = 'invite-1';
  const registrationId = 'reg-1';

  TournamentPartnerInvite convite({
    String status = 'pending',
    DateTime? createdAt,
    DateTime? expiresAt,
    DateTime? viewedAt,
    String? reason,
  }) =>
      TournamentPartnerInvite(
        id: inviteId,
        tournamentId: tournamentId,
        categoryId: 'masc',
        inviterUid: 'me',
        inviterName: 'Eu Mesmo',
        inviteeUid: 'carla',
        inviteeName: 'Carla Nunes',
        status: status,
        attachRegistrationId: registrationId,
        createdAt: createdAt ?? DateTime.now(),
        expiresAt: expiresAt ?? DateTime.now().add(const Duration(hours: 40)),
        isSubstitutionInvite: true,
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
        reason: reason,
        viewedAt: viewedAt,
      );

  MyTournamentRegistration inscricao({
    bool isPaid = true,
    bool hasPartialPayment = false,
    int? teamSize,
  }) =>
      MyTournamentRegistration(
        registrationId: registrationId,
        tournamentId: tournamentId,
        tournamentName: 'Copa de Teste',
        dateLabel: '20 ago',
        statusLabel: 'Confirmada',
        isPaid: isPaid,
        hasPartialPayment: hasPartialPayment,
        categoryId: 'masc',
        teamSize: teamSize,
        category: const TournamentCategoryOffer(
          id: 'masc',
          name: 'Dupla Masculina',
          entryFee: 150,
        ),
      );

  /// Dois `pump()` (build + microtask do `postFrameCallback`) e um `pump`
  /// com duração pra transição de rota do `pushReplacement` assentar — sem
  /// `pumpAndSettle`, mesmo cuidado do resto da jornada (spinner/animação
  /// contínua na tela anterior).
  Future<void> assentar(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  /// A `ListView` do corpo pendente é mais alta que a viewport padrão do
  /// teste (800×600) — os botões "Lembrar"/"Cancelar troca" ficam fora da
  /// área carregada pela lista. Alarga a viewport em vez de rolar, só nos
  /// testes que precisam tocar esses botões.
  void ampliarTela(WidgetTester tester) {
    tester.view.physicalSize = const Size(900, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  Future<void> abrirStatus(
    WidgetTester tester, {
    required TournamentPartnerInvite? invite,
    List<MyTournamentRegistration> registrations = const [],
    TournamentPartnerInviteService? service,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tournamentPartnerInviteProvider(
            inviteId,
          ).overrideWith((ref) => Stream.value(invite)),
          myTournamentRegistrationsProvider.overrideWith(
            (ref) => Stream.value(registrations),
          ),
          tournamentPartnerInviteServiceProvider.overrideWithValue(
            service ?? _FakeInviteService(),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const TournamentSubstitutionStatusPage(
            tournamentId: tournamentId,
            inviteId: inviteId,
          ),
        ),
      ),
    );
    await assentar(tester);
  }

  /// Variante com `GoRouter` de verdade: só é preciso pra cobrir a navegação
  /// do corpo terminal ("Tentar com outro atleta"), que usa
  /// `context.pushReplacementNamed` — método de extensão do go_router que
  /// precisa de um `GoRouter` ancestral pra resolver (`MaterialApp.home`
  /// simples, como em `abrirStatus`, não tem um).
  Future<void> abrirStatusComRouter(
    WidgetTester tester, {
    required TournamentPartnerInvite? invite,
    List<MyTournamentRegistration> registrations = const [],
    TournamentPartnerInviteService? service,
  }) async {
    final router = GoRouter(
      initialLocation: AppRoutes.tournamentSubstitutionStatus
          .replaceFirst(':tournamentId', tournamentId)
          .replaceFirst(':inviteId', inviteId),
      routes: [
        GoRoute(
          path: AppRoutes.tournamentSubstitutionStatus,
          name: AppRouteNames.tournamentSubstitutionStatus,
          builder: (context, state) => TournamentSubstitutionStatusPage(
            tournamentId: state.pathParameters['tournamentId'] ?? '',
            inviteId: state.pathParameters['inviteId'] ?? '',
          ),
        ),
        GoRoute(
          path: AppRoutes.tournamentSubstitutionWizard,
          name: AppRouteNames.tournamentSubstitutionWizard,
          builder: (context, state) {
            final tId = state.pathParameters['tournamentId'] ?? '';
            final regId = state.pathParameters['registrationId'] ?? '';
            return Scaffold(body: Center(child: Text('WIZARD $tId/$regId')));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tournamentPartnerInviteProvider(
            inviteId,
          ).overrideWith((ref) => Stream.value(invite)),
          myTournamentRegistrationsProvider.overrideWith(
            (ref) => Stream.value(registrations),
          ),
          tournamentPartnerInviteServiceProvider.overrideWithValue(
            service ?? _FakeInviteService(),
          ),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await assentar(tester);
  }

  group('pendente — timeline, countdown e "visto há"', () {
    testWidgets('mostra o pedido enviado, o item pendente e o countdown',
        (tester) async {
      final now = DateTime.now();
      final createdAt = now.subtract(const Duration(minutes: 12));
      final expiresAt = now.add(const Duration(hours: 50, minutes: 3));
      final viewedAt = now.subtract(const Duration(minutes: 8));

      await abrirStatus(
        tester,
        invite: convite(
          createdAt: createdAt,
          expiresAt: expiresAt,
          viewedAt: viewedAt,
        ),
        registrations: [inscricao()],
      );

      expect(find.text('Substituição em curso'), findsOneWidget);
      expect(find.text('Copa de Teste · Dupla Masculina'), findsOneWidget);

      // Hero: quem sai, quem entra.
      expect(find.text('Ana sai, Carla entra'), findsOneWidget);
      expect(
        find.text(
          'Sua vaga está mantida. A troca fica valendo quando Carla Nunes '
          'aceitar.',
        ),
        findsOneWidget,
      );

      // Timeline "O QUE FALTA".
      expect(find.text('Pedido de substituição enviado'), findsOneWidget);
      final hh = createdAt.hour.toString().padLeft(2, '0');
      final mm = createdAt.minute.toString().padLeft(2, '0');
      expect(find.text('hoje · $hh:$mm'), findsOneWidget);
      expect(find.text('Carla Nunes precisa aceitar'), findsOneWidget);

      final viewedLabel = substitutionViewedLabel(viewedAt, DateTime.now())!;
      expect(find.text(viewedLabel), findsOneWidget);

      // Caixa "VAGA RESERVADA" com o countdown.
      expect(find.text('VAGA RESERVADA'), findsOneWidget);
      final countdown = substitutionCountdownLabel(expiresAt, DateTime.now())!;
      expect(find.text(countdown), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);

      // Acerto do valor: inscrição paga.
      expect(find.text('ACERTO DO VALOR'), findsOneWidget);
      expect(
        find.textContaining(
          'A inscrição de ${formatBRL(150)} continua paga',
        ),
        findsOneWidget,
      );
    });

    testWidgets('sem "visto" ainda, o rótulo não aparece', (tester) async {
      await abrirStatus(
        tester,
        invite: convite(viewedAt: null),
        registrations: [inscricao()],
      );

      expect(find.textContaining('visualizado'), findsNothing);
    });

    testWidgets('sem pagamento na inscrição, some o card de acerto',
        (tester) async {
      await abrirStatus(
        tester,
        invite: convite(),
        registrations: [
          inscricao(isPaid: false, hasPartialPayment: false),
        ],
      );

      expect(find.text('ACERTO DO VALOR'), findsNothing);
    });
  });

  group('aceito — transição para a tela de sucesso', () {
    testWidgets('convite já aceito troca a tela por "Dupla atualizada"',
        (tester) async {
      await abrirStatus(
        tester,
        invite: convite(status: 'accepted'),
        registrations: [inscricao()],
      );
      // `assentar` já cobre o `postFrameCallback` + `pushReplacement`, mas a
      // transição do `MaterialPageRoute` (300ms) pode não ter zerado ainda —
      // uma folga extra garante a rota antiga fora da árvore.
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Substituição em curso'), findsNothing);
      expect(find.text('Dupla atualizada'), findsOneWidget);
      expect(find.text('Carla Nunes é sua nova dupla'), findsOneWidget);
      expect(find.text('Carla aceitou seu convite.'), findsOneWidget);
    });
  });

  group('estados terminais', () {
    testWidgets('recusado mostra a mensagem e as duas ações', (tester) async {
      await abrirStatus(
        tester,
        invite: convite(status: 'declined'),
        registrations: [inscricao()],
      );

      expect(find.text('O convite foi recusado.'), findsOneWidget);
      expect(find.text('Tentar com outro atleta'), findsOneWidget);
      expect(find.text('Voltar'), findsOneWidget);
    });

    testWidgets('cancelado mostra a mensagem certa', (tester) async {
      await abrirStatus(
        tester,
        invite: convite(status: 'cancelled'),
        registrations: [inscricao()],
      );

      expect(find.text('A troca foi cancelada.'), findsOneWidget);
    });

    testWidgets(
        'recusado: "Tentar com outro atleta" navega pro wizard com o '
        'registrationId do convite', (tester) async {
      await abrirStatusComRouter(
        tester,
        invite: convite(status: 'declined'),
        registrations: [inscricao()],
      );

      await tester.tap(find.text('Tentar com outro atleta'));
      await tester.pumpAndSettle();

      expect(find.text('WIZARD $tournamentId/$registrationId'), findsOneWidget);
      expect(find.text('O convite foi recusado.'), findsNothing);
    });
  });

  group('lembrar — sheet "Enviar lembrete por notificação"', () {
    testWidgets('sucesso: chama resendSubstitutionInvite e mostra '
        '"Lembrete enviado."', (tester) async {
      ampliarTela(tester);
      final service = _FakeInviteService();
      await abrirStatus(
        tester,
        invite: convite(),
        registrations: [inscricao()],
        service: service,
      );

      // O rótulo do botão usa o primeiro nome do convidado.
      await tester.tap(find.text('Lembrar Carla'));
      await tester.pumpAndSettle();

      expect(find.text('Enviar lembrete por notificação'), findsOneWidget);
      await tester.tap(find.text('Enviar lembrete por notificação'));
      await tester.pumpAndSettle();

      expect(service.resendCalls, [inviteId]);
      expect(find.text('Lembrete enviado.'), findsOneWidget);
    });

    testWidgets('erro do backend (ex.: "aguarde") mostra a mensagem no '
        'lugar do sucesso', (tester) async {
      ampliarTela(tester);
      final service = _FakeInviteService(
        resendError: TournamentPartnerInviteException(
          'Aguarde para lembrar novamente.',
        ),
      );
      await abrirStatus(
        tester,
        invite: convite(),
        registrations: [inscricao()],
        service: service,
      );

      await tester.tap(find.text('Lembrar Carla'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enviar lembrete por notificação'));
      await tester.pumpAndSettle();

      expect(service.resendCalls, [inviteId]);
      expect(find.text('Aguarde para lembrar novamente.'), findsOneWidget);
      expect(find.text('Lembrete enviado.'), findsNothing);
    });
  });

  group('cancelar troca', () {
    testWidgets('confirmar chama cancelInvite e fecha a tela (pop)',
        (tester) async {
      ampliarTela(tester);
      final service = _FakeInviteService();
      final navigatorKey = GlobalKey<NavigatorState>();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            tournamentPartnerInviteProvider(
              inviteId,
            ).overrideWith((ref) => Stream.value(convite())),
            myTournamentRegistrationsProvider.overrideWith(
              (ref) => Stream.value([inscricao()]),
            ),
            tournamentPartnerInviteServiceProvider.overrideWithValue(service),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            navigatorKey: navigatorKey,
            home: Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const TournamentSubstitutionStatusPage(
                          tournamentId: tournamentId,
                          inviteId: inviteId,
                        ),
                      ),
                    ),
                    child: const Text('abrir'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await assentar(tester);
      await tester.tap(find.text('abrir'));
      await assentar(tester);

      expect(find.text('Substituição em curso'), findsOneWidget);

      // O botão "Cancelar troca" e a ação de confirmação do dialog têm o
      // MESMO rótulo — mira só o `FilledButton` (o do dialog) pra não pegar
      // os dois.
      await tester.tap(find.text('Cancelar troca'));
      await assentar(tester);

      expect(find.text('Cancelar a troca?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Cancelar troca'));
      await tester.pumpAndSettle();

      expect(service.cancelCalls, [inviteId]);
      expect(find.text('Substituição em curso'), findsNothing);
      expect(find.text('abrir'), findsOneWidget);
    });

    testWidgets('erro do backend mostra a mensagem e mantém a tela aberta',
        (tester) async {
      ampliarTela(tester);
      final service = _FakeInviteService(
        cancelError: TournamentPartnerInviteException(
          'Não foi possível cancelar. Tente novamente.',
        ),
      );
      await abrirStatus(
        tester,
        invite: convite(),
        registrations: [inscricao()],
        service: service,
      );

      await tester.tap(find.text('Cancelar troca'));
      await assentar(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Cancelar troca'));
      await tester.pumpAndSettle();

      expect(service.cancelCalls, [inviteId]);
      expect(
        find.text('Não foi possível cancelar. Tente novamente.'),
        findsOneWidget,
      );
      // Sem pop no caminho de erro — a tela continua.
      expect(find.text('Substituição em curso'), findsOneWidget);
    });
  });

  group('convite não encontrado', () {
    testWidgets('mostra estado vazio com Voltar', (tester) async {
      await abrirStatus(tester, invite: null);

      expect(find.text('Convite não encontrado'), findsOneWidget);
      expect(find.text('Voltar'), findsOneWidget);
    });
  });
}

/// Dublê de `TournamentPartnerInviteService`: nesta bateria de testes nenhum
/// botão que chama a rede é acionado — só precisa existir pra satisfazer o
/// provider. Também captura as chamadas de lembrete (`resendSubstitutionInvite`)
/// e cancelamento (`cancelInvite`), reproduzindo o erro do backend quando
/// configurado. `noSuchMethod` denuncia qualquer chamada não coberta.
class _FakeInviteService implements TournamentPartnerInviteService {
  _FakeInviteService({this.resendError, this.cancelError});

  final TournamentPartnerInviteException? resendError;
  final TournamentPartnerInviteException? cancelError;
  final resendCalls = <String>[];
  final cancelCalls = <String>[];

  @override
  Future<void> resendSubstitutionInvite(String inviteId) async {
    resendCalls.add(inviteId);
    final erro = resendError;
    if (erro != null) throw erro;
  }

  @override
  Future<void> cancelInvite(String inviteId, {bool asDecline = false}) async {
    cancelCalls.add(inviteId);
    final erro = cancelError;
    if (erro != null) throw erro;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se o teste passou a exercitar este método, cubra-o aqui.',
    );
  }
}
