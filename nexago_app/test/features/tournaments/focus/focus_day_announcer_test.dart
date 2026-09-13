import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_logic.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_day_announcer.dart';

class _FakeUser implements User {
  _FakeUser(this.uid);

  @override
  final String uid;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

AthleteFocusHomeTarget _target() => const AthleteFocusHomeTarget(
      tournamentId: 't1',
      tournamentName: 'Copa Teste',
    );

/// Router de verdade, não `MaterialApp` com `navigatorKey`: a asserção destes
/// testes é sobre NAVEGAÇÃO — qual rota a casca abre sozinha —, e `pushNamed`
/// resolve o nome no `GoRouter` do contexto. Um fake de navegação provaria
/// apenas que um dublê foi chamado.
GoRouter _router() => GoRouter(
      initialLocation: '/discover',
      routes: [
        GoRoute(
          path: '/discover',
          builder: (_, __) => const FocusDayAnnouncer(
            child: Scaffold(body: Text('casca do atleta')),
          ),
        ),
        GoRoute(
          path: AppRoutes.tournamentFocus,
          name: AppRouteNames.tournamentFocus,
          builder: (_, state) => Scaffold(
            body: Text('focus de ${state.pathParameters['tournamentId']}'),
          ),
        ),
        GoRoute(
          path: '/convite',
          builder: (_, __) => const Scaffold(body: Text('convite de dupla')),
        ),
      ],
    );

Widget _app(
  GoRouter router, {
  Future<AthleteFocusHomeTarget?>? target,
  Stream<User?>? users,
}) {
  return ProviderScope(
    overrides: [
      authProvider
          .overrideWith((ref) => users ?? Stream.value(_FakeUser('u1'))),
      // Espelha a produção: o alvo do dia depende de QUEM está logado
      // (`athleteEventDayContextProvider` observa o `authProvider`). Sem essa
      // dependência a troca de conta não reemitiria alvo e o teste de baixo
      // passaria por não exercitar nada.
      athleteFocusHomeTargetProvider.overrideWith((ref) async {
        final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
        if (uid.isEmpty) return null;
        return target == null ? _target() : await target;
      }),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  testWidgets('entra no Focus sozinho no dia do torneio', (tester) async {
    await tester.pumpWidget(_app(_router()));
    await tester.pumpAndSettle();

    expect(find.text('focus de t1'), findsOneWidget);
  });

  // O gatilho é o dia do EVENTO, não "tem partida hoje": quem não está em
  // torneio rolando hoje — ou já foi eliminado — não pode ter a navegação
  // sequestrada. Quem responde isso é o `athleteFocusHomeTargetProvider`; aqui
  // só se garante que a casca respeita o `null`.
  testWidgets('fora do dia do torneio a casca fica de pé', (tester) async {
    await tester.pumpWidget(_app(_router(), target: Future.value(null)));
    await tester.pumpAndSettle();

    expect(find.text('casca do atleta'), findsOneWidget);
    expect(find.text('focus de t1'), findsNothing);
  });

  // A casca dispara vários anúncios no mesmo primeiro frame (convite de dupla,
  // feedback de missão diária, promoção de elo). Quem chega primeiro empilha
  // uma rota, e a entrada do Focus cai na guarda de visibilidade — ela tem que
  // ADIAR, não sumir da sessão.
  //
  // Isto pesa mais agora que a folha virou navegação: interromper uma folha é
  // um estorvo, entrar no Focus por cima de um pagamento em curso tira o
  // atleta do fluxo que ele começou de propósito.
  //
  // O reteste vem do `build`, que refaz a tentativa quando a casca volta a ser
  // a rota corrente. Tirar essa chamada de lá — achando que o `ref.listen`
  // basta — mata a entrada em silêncio; é isso que este teste pega.
  testWidgets('entrada adiada por rota em cima acontece quando ela sai',
      (tester) async {
    final router = _router();
    final gate = Completer<AthleteFocusHomeTarget?>();

    await tester.pumpWidget(_app(router, target: gate.future));
    await tester.pumpAndSettle();

    router.push<void>('/convite');
    await tester.pumpAndSettle();
    expect(find.text('convite de dupla'), findsOneWidget);

    // O alvo do dia só resolve com a casca fora de cena: nada é aberto por cima
    // do fluxo que o atleta já está seguindo.
    gate.complete(_target());
    await tester.pumpAndSettle();
    expect(
      find.text('focus de t1', skipOffstage: false),
      findsNothing,
      reason: 'o Focus não pode abrir por cima da rota em andamento',
    );

    router.pop();
    await tester.pumpAndSettle();

    expect(find.text('focus de t1'), findsOneWidget);
  });

  // Mesmo aparelho, troca de conta no mesmo dia — o portal do atleta já guarda
  // esse caso num spec próprio (`focus-day.service.spec.ts`). A trava do dia é
  // por uid, então ela libera; quem barrava era o `_opening`, que a 1ª versão
  // desta tela deixava `true` para sempre depois de entrar no Focus.
  testWidgets('troca de conta no mesmo dia entra no Focus do novo atleta',
      (tester) async {
    final router = _router();
    final users = StreamController<User?>();
    addTearDown(users.close);

    await tester.pumpWidget(_app(router, users: users.stream));
    users.add(_FakeUser('u1'));
    await tester.pumpAndSettle();
    expect(find.text('focus de t1'), findsOneWidget);

    // O × do Focus devolve pra casca.
    router.pop();
    await tester.pumpAndSettle();
    expect(find.text('casca do atleta'), findsOneWidget);

    users.add(_FakeUser('u2'));
    await tester.pumpAndSettle();

    expect(
      find.text('focus de t1'),
      findsOneWidget,
      reason: 'o atleta que acabou de entrar nunca foi oferecido hoje',
    );
  });
}
