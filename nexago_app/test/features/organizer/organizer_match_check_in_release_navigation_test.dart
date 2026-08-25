import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/data/organizer_match_ops_repository.dart';
import 'package:nexago_app/features/organizer/data/organizer_match_schedule_service.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_match_check_in_page.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_match_navigation.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

/// Cobertura da regra: ao liberar a partida (check-in completo das duas
/// equipes + quadra definida), o mesário deve cair direto na mesa de
/// lançamento de pontos ao vivo — nunca de volta pra tela anterior.
///
/// Antes desta regra o app fazia `context.pop()`; a troca para
/// `context.pushReplacement(organizerMatchLivePath(...))` é o que este teste
/// tranca. Ver `organizer_match_check_in_page.dart#_releaseMatch`.
void main() {
  const tournamentId = 't1';
  const matchId = 'm1';

  TournamentMatch matchProntaParaLiberar({String courtId = 'Q1'}) {
    return TournamentMatch(
      id: matchId,
      tournamentId: tournamentId,
      categoryId: 'masc-open',
      round: 3,
      matchType: 'wb',
      poolId: '',
      teamAId: 'team-a',
      teamBId: 'team-b',
      status: TournamentMatchStatus.scheduled,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 12,
      teamADescription: 'Marcos / Victor',
      teamBDescription: 'Igor / João',
      courtId: courtId,
      // Ambas as duplas já compareceram: é a condição que libera o botão.
      checkInTeamAStatus: 'present',
      checkInTeamBStatus: 'present',
    );
  }

  late _FakeMatchScheduleService scheduleService;
  late _FakeMatchOpsRepository matchOpsRepository;
  late List<({String tournamentId, String matchId})> telasAoVivoAbertas;

  Future<GoRouter> abrirCheckIn(
    WidgetTester tester, {
    required TournamentMatch match,
  }) async {
    scheduleService = _FakeMatchScheduleService();
    matchOpsRepository = _FakeMatchOpsRepository();
    telasAoVivoAbertas = [];

    final router = GoRouter(
      initialLocation: '/home',
      routes: [
        GoRoute(
          path: '/home',
          builder: (_, __) => const Scaffold(body: Text('home stub')),
        ),
        GoRoute(
          path: AppRoutes.organizerMatchCheckIn,
          name: AppRouteNames.organizerMatchCheckIn,
          builder: (context, state) {
            final tid = state.pathParameters['tournamentId']?.trim() ?? '';
            final mid = state.pathParameters['matchId']?.trim() ?? '';
            return OrganizerMatchCheckInPage(tournamentId: tid, matchId: mid);
          },
        ),
        GoRoute(
          path: AppRoutes.organizerMatchLive,
          name: AppRouteNames.organizerMatchLive,
          builder: (context, state) {
            final tid = state.pathParameters['tournamentId']?.trim() ?? '';
            final mid = state.pathParameters['matchId']?.trim() ?? '';
            telasAoVivoAbertas.add((tournamentId: tid, matchId: mid));
            return const Scaffold(body: Text('mesa ao vivo stub'));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          organizerMatchOpsRepositoryProvider
              .overrideWithValue(matchOpsRepository),
          organizerMatchScheduleServiceProvider
              .overrideWithValue(scheduleService),
          organizerMatchByIdProvider((
            tournamentId: tournamentId,
            matchId: matchId,
          )).overrideWith((ref) => Stream.value(match)),
          organizerMatchCardsByIdProvider(tournamentId).overrideWith(
            (ref) => Stream.value(<String, TournamentMatchCardViewModel>{}),
          ),
          organizerMatchOpsConfigProvider(tournamentId).overrideWith(
            (ref) => Stream.value(const TournamentMatchOpsConfig()),
          ),
          organizerTournamentDetailProvider(tournamentId).overrideWith(
            (ref) =>
                Stream.value(const OrganizerTournamentDetailState(
              isLoading: false,
            )),
          ),
          organizerMatchOpsStateProvider(tournamentId)
              .overrideWith((ref) => const OrganizerMatchOpsState()),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    // Simula uma pilha real: o mesário chegou ao check-in a partir de outra
    // tela (fila de chamadas, chave etc.), então há algo para "voltar".
    router.push(organizerMatchCheckInPath(tournamentId, matchId));
    await tester.pumpAndSettle();

    return router;
  }

  testWidgets(
    'libera a partida e navega para a mesa ao vivo via pushReplacement, '
    'não via pop',
    (tester) async {
      final router = await abrirCheckIn(
        tester,
        match: matchProntaParaLiberar(),
      );

      // Pré-condição: com as duas duplas presentes e quadra definida, o botão
      // de liberar está habilitado (não "Aguardando check-in"/"Defina a quadra").
      final botao = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Liberar partida'),
      );
      expect(botao.onPressed, isNotNull);

      await tester.tap(find.text('Liberar partida'));
      await tester.pumpAndSettle();

      // callMatchToCourt foi chamada com a partida e a quadra certas.
      expect(scheduleService.callMatchToCourtCalls, hasLength(1));
      expect(scheduleService.callMatchToCourtCalls.single.matchId, matchId);
      expect(scheduleService.callMatchToCourtCalls.single.courtId, 'Q1');

      expect(find.text('Partida liberada.'), findsOneWidget);

      // Chegou na mesa ao vivo com os ids certos — não voltou pro check-in
      // nem para a tela de origem (home).
      expect(find.text('mesa ao vivo stub'), findsOneWidget);
      expect(find.text('home stub'), findsNothing);
      expect(find.byType(OrganizerMatchCheckInPage), findsNothing);
      expect(telasAoVivoAbertas, [
        (tournamentId: tournamentId, matchId: matchId),
      ]);

      // pushReplacement troca o topo da pilha (check-in some), em vez de
      // empilhar (push) ou voltar (pop). Pilha esperada: [home, mesa ao vivo].
      final matches = router.routerDelegate.currentConfiguration.matches;
      expect(
        matches.length,
        2,
        reason: 'check-in deveria ter sido substituído, não empilhado nem '
            'removido da pilha via pop()',
      );
      expect(router.canPop(), isTrue, reason: 'home ainda está sob a mesa ao vivo');
    },
  );

  testWidgets(
    'sem quadra definida, o botão de liberar fica desabilitado e nada navega',
    (tester) async {
      await abrirCheckIn(
        tester,
        match: matchProntaParaLiberar(courtId: ''),
      );

      final botao = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Defina a quadra'),
      );
      expect(botao.onPressed, isNull);
      expect(scheduleService.callMatchToCourtCalls, isEmpty);
      expect(telasAoVivoAbertas, isEmpty);
    },
  );
}

/// Dublê do serviço de callables: registra as chamadas e nunca toca em
/// FirebaseFunctions. `noSuchMethod` faz qualquer outra operação estourar se
/// o teste encostar nela sem querer.
class _FakeMatchScheduleService implements OrganizerMatchScheduleService {
  final callMatchToCourtCalls = <({String matchId, String courtId})>[];

  @override
  Future<void> callMatchToCourt({
    required String matchId,
    required String courtId,
  }) async {
    callMatchToCourtCalls.add((matchId: matchId, courtId: courtId));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê do serviço de agendamento não implementa '
      '${invocation.memberName}. Se a tela passou a chamá-lo, cubra-o aqui.',
    );
  }
}

/// Dublê do repositório de match ops: só precisa não tocar no Firestore real
/// quando `bootstrapOrganizerTournamentCourts` roda no `initState`.
class _FakeMatchOpsRepository implements OrganizerMatchOpsRepository {
  int ensureCourtsInitializedCalls = 0;

  @override
  Future<void> ensureCourtsInitialized({required String tournamentId}) async {
    ensureCourtsInitializedCalls++;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê do repositório de match ops não implementa '
      '${invocation.memberName}. Se a tela passou a chamá-lo, cubra-o aqui.',
    );
  }
}
