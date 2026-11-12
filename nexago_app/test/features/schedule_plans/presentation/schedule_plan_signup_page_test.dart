import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/tournaments/domain/registration_payment_method.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arenas_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_service_fee.dart';
import 'package:nexago_app/features/payment_card/application/payment_card_providers.dart';
import 'package:nexago_app/features/payment_card/domain/saved_payment_card.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/infrastructure/schedule_plans_repository.dart';
import 'package:nexago_app/features/schedule_plans/presentation/schedule_plan_signup_page.dart';

Map<String, dynamic> times(List<List<Object>> rows) => {
      'times': [
        for (final r in rows)
          {
            'startTime': r[0],
            'endTime': r[1],
            'freeCourts': r[2],
            'waitlistCount': r[3],
          },
      ],
    };

final availability = SchedulePlanAvailability.fromMap({
  'plan': {
    'name': 'Fixo Noite 2x',
    'timesPerWeek': 2,
    'durationMinutes': 60,
    'monthlyPriceReais': 450,
    'cycles': {
      'monthly': {'enabled': true},
      'quarterly': {'enabled': true, 'discountPercent': 5},
      'annual': {'enabled': false},
    },
    'billing': {
      'methods': ['pix_auto', 'onsite'],
    },
    'rules': {
      'split': {'enabled': true, 'maxPlayers': 4},
    },
  },
  'days': [
    for (final w in [1, 2, 3, 4, 5])
      {
        'weekday': w,
        ...times([
          ['18:00', '19:00', 2, 0],
          ['19:00', '20:00', w == 4 ? 0 : 2, 7],
          ['20:00', '21:00', 1, 0],
        ]),
      },
  ],
}, arenaId: 'a1', planId: 'p1');

void main() {
  testWidgets('escolhe 2 dias e um horário que vale para os dois',
      (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          schedulePlansUidProvider.overrideWith((ref) => 'u1'),
          schedulePlanAvailabilityProvider
              .overrideWith((ref, key) async => availability),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Fixo Noite 2x'), findsOneWidget);
    expect(find.text('ESCOLHA 2 DIAS'), findsOneWidget);
    // Ciclos ligados com o mensal do ciclo.
    expect(find.textContaining('450/mês'), findsOneWidget);
    expect(find.text('Anual'), findsNothing);

    FilledButton submit() => tester.widget<FilledButton>(find.descendant(
          of: find.byKey(const Key('schedule-signup-submit')),
          matching: find.byType(FilledButton),
        ));
    expect(submit().onPressed, isNull);

    await tester.tap(find.byKey(const ValueKey('schedule-day-2')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('schedule-day-4')));
    await tester.pump();
    expect(find.text('HORÁRIO · VALE PARA TER E QUI'), findsOneWidget);
    // 19:00 lotado na quinta: fila para os dois dias.
    expect(find.text('Lista de espera · 7'), findsOneWidget);
    expect(find.text('Entrar na fila'), findsOneWidget);
    expect(find.text('1 quadra'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('schedule-time-20:00')));
    await tester.pump();
    expect(submit().onPressed, isNotNull);
    expect(find.textContaining('450,00'), findsOneWidget);
    expect(find.text('por mês'), findsOneWidget);

    // Trimestral: 5% sobre o mensal.
    await tester.tap(find.byKey(const ValueKey('schedule-cycle-quarterly')));
    await tester.pump();
    expect(find.textContaining('427,50'), findsOneWidget);
  });

  testWidgets('plano aguardando pagamento trava a assinatura de outro',
      (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          schedulePlansUidProvider.overrideWith((ref) => 'u1'),
          schedulePlanAvailabilityProvider
              .overrideWith((ref, key) async => availability),
          myScheduleSubscriptionsProvider.overrideWith(
            (ref) async => MyScheduleSubscriptions.fromMap({
              'subscriptions': [
                {
                  'id': 's1',
                  'planName': 'Fixo Manhã',
                  'status': 'pending_payment',
                  'holderAthleteId': 'u1',
                },
              ],
            }),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(
        find.byKey(const Key('schedule-signup-pending-block')), findsOneWidget);
    expect(find.text('Pague o plano Fixo Manhã primeiro'), findsOneWidget);
    expect(find.text('Pagar agora'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('schedule-day-2')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('schedule-day-4')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('schedule-time-20:00')));
    await tester.pump();
    final submit = tester.widget<FilledButton>(find.descendant(
      of: find.byKey(const Key('schedule-signup-submit')),
      matching: find.byType(FilledButton),
    ));
    expect(submit.onPressed, isNull);
  });

  testWidgets('pagamento: nota conforme a cobrança online da arena',
      (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    Future<void> pump(bool online) async {
      final a = SchedulePlanAvailability.fromMap({
        'plan': {
          'name': 'Fixo Noite 2x',
          'timesPerWeek': 2,
          'monthlyPriceReais': 450,
          'billing': {
            'methods': ['pix_auto', 'onsite'],
          },
        },
        'days': const [],
        'onlineBilling': online,
      }, arenaId: 'a1', planId: 'p1');
      await tester.pumpWidget(
        ProviderScope(
          key: ValueKey(online),
          overrides: [
            schedulePlansUidProvider.overrideWith((ref) => 'u1'),
            schedulePlanAvailabilityProvider
                .overrideWith((ref, key) async => a),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    Text note() =>
        tester.widget<Text>(find.byKey(const Key('schedule-method-note')));

    await pump(true);
    expect(note().data, startsWith('Pix ou cartão: ao assinar você já paga'));
    expect(find.text('Assinar e pagar'), findsOneWidget);
    await tester.ensureVisible(
      find.byKey(const ValueKey('schedule-method-onsite')),
    );
    await tester.tap(find.byKey(const ValueKey('schedule-method-onsite')));
    await tester.pump();
    expect(note().data, contains('direto na arena'));
    expect(find.text('Assinar'), findsOneWidget);

    await pump(false);
    expect(note().data, startsWith('Combine o pagamento com a arena'));
    expect(find.text('Assinar'), findsOneWidget);
  });

  group('assinar com Pix ou cartão leva ao pagamento', () {
    Future<String> subscribeAndLand(
      WidgetTester tester, {
      required bool online,
      required bool pending,
    }) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final a = SchedulePlanAvailability.fromMap({
        ...{
          'plan': {
            'name': 'Fixo Noite 1x',
            'timesPerWeek': 1,
            'monthlyPriceReais': 180,
            'billing': {
              'methods': ['pix_auto', 'onsite'],
            },
          },
          'days': [
            {
              'weekday': 2,
              ...times([
                ['19:00', '20:00', 2, 0],
              ]),
            },
          ],
        },
        'onlineBilling': online,
      }, arenaId: 'a1', planId: 'p1');
      final repo = _SubscribeRepo(pending);
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) =>
                const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
          ),
          GoRoute(
            path: AppRoutes.mySchedulePlans,
            builder: (_, __) => const Text(
              'MEU PLANO',
              textDirection: TextDirection.ltr,
            ),
          ),
          GoRoute(
            path: AppRoutes.schedulePlanPayment,
            builder: (_, state) => Text(
              'PAGAR ${state.pathParameters['chargeId']}',
              textDirection: TextDirection.ltr,
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            schedulePlansUidProvider.overrideWith((ref) => 'u1'),
            schedulePlanAvailabilityProvider
                .overrideWith((ref, key) async => a),
            schedulePlansRepositoryProvider.overrideWithValue(repo),
            myScheduleSubscriptionsProvider.overrideWith(
              (ref) async => MyScheduleSubscriptions.fromMap(const {}),
            ),
          ],
          child: MaterialApp.router(
            theme: AppTheme.dark,
            routerConfig: router,
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('schedule-day-2')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('schedule-time-19:00')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('schedule-signup-submit')));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      // A tela de cima (pagamento por cima de Meu plano, ou só Meu plano).
      final pay = find.textContaining('PAGAR ');
      if (pay.evaluate().isNotEmpty) return tester.widget<Text>(pay).data!;
      expect(find.text('MEU PLANO'), findsOneWidget);
      return 'MEU PLANO';
    }

    testWidgets('aguardando pagamento: vai para a tela de pagamento da 1ª',
        (tester) async {
      expect(
        await subscribeAndLand(tester, online: true, pending: true),
        'PAGAR s1_2026-11_0',
      );
      expect(
          find.textContaining('Horário reservado por 30 min'), findsOneWidget);
    });

    testWidgets('assinatura já ativa (na arena / abaixo do mínimo): Meu plano',
        (tester) async {
      expect(
        await subscribeAndLand(tester, online: true, pending: false),
        'MEU PLANO',
      );
    });
  });

  group('assinar com débito automático', () {
    const card = SavedPaymentCard(
      brand: 'VISA',
      last4: '4242',
      expiryMonth: 12,
      expiryYear: 2030,
    );
    const consent =
        'Autorizo a nexaGO a debitar no cartão Visa final 4242, no dia do '
        'vencimento, cada mensalidade do plano Fixo Noite 1x (Arena CFC), '
        'mais a taxa do cartão (5,49% + R\$ 0,49). Posso desligar quando '
        'quiser em Meu plano.';

    String? shown;
    String? detail;

    Future<_AutopayRepo> run(
      WidgetTester tester, {
      SavedPaymentCard? saved,
      bool flag = true,
      bool optIn = true,
      bool failPay = false,
      bool failSet = false,
      bool cancelSheet = false,
      bool arenaLoaded = true,
      bool zeroFees = false,
      double? firstChargeReais = _serverFirst,
    }) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final a = SchedulePlanAvailability.fromMap({
        'plan': {
          'name': 'Fixo Noite 1x',
          'timesPerWeek': 1,
          'monthlyPriceReais': 180,
          'billing': {
            'methods': ['card', 'onsite'],
          },
        },
        'days': [
          {
            'weekday': 2,
            ...times([
              ['19:00', '20:00', 2, 0],
            ]),
          },
        ],
        'onlineBilling': true,
      }, arenaId: 'a1', planId: 'p1');
      final repo = _AutopayRepo(
        failPay: failPay,
        failSet: failSet,
        firstChargeReais: firstChargeReais,
      );
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) =>
                const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
          ),
          GoRoute(
            path: AppRoutes.mySchedulePlans,
            builder: (_, __) =>
                const Text('MEU PLANO', textDirection: TextDirection.ltr),
          ),
          GoRoute(
            path: AppRoutes.schedulePlanPayment,
            builder: (_, state) => Text(
              'PAGAR ${state.pathParameters['chargeId']}',
              textDirection: TextDirection.ltr,
            ),
          ),
          GoRoute(
            path: AppRoutes.paymentCardNew,
            builder: (context, _) {
              repo.calls.add('cardForm');
              return Scaffold(
                body: TextButton(
                  key: const Key('fake-card-save'),
                  onPressed: () => context.pop(card),
                  child: const Text('SALVAR CARTÃO'),
                ),
              );
            },
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            schedulePlansUidProvider.overrideWith((ref) => 'u1'),
            schedulePlanAvailabilityProvider
                .overrideWith((ref, key) async => a),
            schedulePlansRepositoryProvider.overrideWithValue(repo),
            scheduleCardAutopayEnabledProvider
                .overrideWith((ref) => Stream.value(flag)),
            myPaymentCardProvider.overrideWith((ref) async => saved),
            scheduleCardFeeTermsProvider.overrideWith(
              (ref) async => zeroFees
                  ? CardFeeTerms.none
                  : const CardFeeTerms(
                      anticipationPercent: 1.5,
                      processingPercent: 3.99,
                      fixedReais: 0.49,
                    ),
            ),
            arenaByIdProvider.overrideWith(
              (ref, id) => Stream.value(
                arenaLoaded
                    ? const ArenaListItem(
                        id: 'a1',
                        name: 'Arena CFC',
                        locationLabel: 'Goiânia',
                        pricePerHourReais: 100,
                      )
                    : null,
              ),
            ),
          ],
          child: MaterialApp.router(
            theme: AppTheme.dark,
            routerConfig: router,
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('schedule-day-2')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('schedule-time-19:00')));
      await tester.pump();
      if (flag) {
        final box = find.byKey(const Key('schedule-autopay-optin'));
        await tester.ensureVisible(box);
        expect(find.text('Debitar todo mês neste cartão'), findsOneWidget);
        expect(tester.widget<CheckboxListTile>(box).value, isTrue);
        if (!optIn) {
          await tester.tap(box);
          await tester.pump();
        }
      } else {
        expect(find.byKey(const Key('schedule-autopay-optin')), findsNothing);
      }
      await tester.tap(find.byKey(const Key('schedule-signup-submit')));
      for (var i = 0; i < 4; i++) {
        await tester.pump();
      }
      await tester.pump(const Duration(milliseconds: 400));
      if (repo.calls.contains('cardForm') && saved == null) {
        await tester.tap(find.byKey(const Key('fake-card-save')));
        for (var i = 0; i < 4; i++) {
          await tester.pump();
        }
        await tester.pump(const Duration(milliseconds: 400));
      }
      final text = find.byKey(const Key('schedule-autopay-consent-text'));
      if (text.evaluate().isNotEmpty) {
        // A folha vem depois da reserva (nada cobrado) e antes de qualquer
        // cobrança: só a assinatura foi criada.
        expect(repo.calls.where((c) => c != 'cardForm'), ['subscribe']);
        shown = tester.widget<Text>(text).data;
        expect(find.textContaining('taxa do cartão'), findsNWidgets(2));
        expect(find.textContaining('Visa final 4242'), findsOneWidget);
        // O valor é o da 1ª mensalidade do servidor (proporcional), não o
        // mensal cheio da tela.
        final q = registrationMethodQuote(
          pixCents: (_serverFirst * 100).round(),
          cardFee: const CardFeeTerms(
            anticipationPercent: 1.5,
            processingPercent: 3.99,
            fixedReais: 0.49,
          ),
        );
        detail = tester
            .widget<Text>(
                find.byKey(const Key('schedule-autopay-consent-detail')))
            .data;
        expect(
          detail,
          '1ª mensalidade agora: ${formatBRL(q.cardTotalCents / 100)} '
          '(${formatBRL(q.pixCents / 100)} + taxa do cartão '
          '${formatBRL(q.cardFeeCents / 100)})',
        );
        expect(detail, contains(formatBRL(123.45)));
        await tester.tap(cancelSheet
            ? find.text('Agora não')
            : find.byKey(const Key('schedule-autopay-authorize')));
        for (var i = 0; i < 4; i++) {
          await tester.pump();
        }
        await tester.pump(const Duration(milliseconds: 400));
      }
      return repo;
    }

    testWidgets('com cartão: paga a 1ª, liga o débito e vai para Meu plano',
        (tester) async {
      final repo = await run(tester, saved: card);
      expect(repo.calls, [
        'subscribe',
        'pay:s1_2026-11_0',
        'set:s1:true:$consent',
      ]);
      expect(find.text('MEU PLANO'), findsOneWidget);
      expect(find.textContaining('PAGAR '), findsNothing);
      expect(repo.calls.last, 'set:s1:true:$shown');
      expect(shown, consent);
      expect(repo.calls, isNot(contains('preview:s1')));
    });

    testWidgets('a folha mostra o total com a taxa do cartão', (tester) async {
      await run(tester, saved: card);
      expect(detail, contains('taxa do cartão'));
      final q = registrationMethodQuote(
        pixCents: 12345,
        cardFee: const CardFeeTerms(
          anticipationPercent: 1.5,
          processingPercent: 3.99,
          fixedReais: 0.49,
        ),
      );
      expect(q.cardFeeCents, greaterThan(0));
    });

    testWidgets('taxa do cartão zerada: avisa, sem folha nem chamadas',
        (tester) async {
      final repo = await run(tester, saved: card, zeroFees: true);
      expect(
        find.text('Não foi possível carregar a taxa do cartão. Tente de novo.'),
        findsOneWidget,
      );
      expect(
          find.byKey(const Key('schedule-autopay-consent-text')), findsNothing);
      expect(repo.calls, isEmpty);
    });

    testWidgets('Agora não: nada é cobrado; fluxo de hoje (tela de pagar)',
        (tester) async {
      final repo = await run(tester, saved: card, cancelSheet: true);
      expect(repo.calls, ['subscribe']);
      expect(find.text('PAGAR s1_2026-11_0'), findsOneWidget);
      expect(
          find.textContaining('Horário reservado por 30 min'), findsOneWidget);
    });

    testWidgets('sem o valor da 1ª do servidor: sem folha, tela de pagar',
        (tester) async {
      final repo = await run(tester, saved: card, firstChargeReais: null);
      expect(
          find.byKey(const Key('schedule-autopay-consent-text')), findsNothing);
      expect(repo.calls, ['subscribe']);
      expect(find.text('PAGAR s1_2026-11_0'), findsOneWidget);
      expect(
        find.text('Não foi possível calcular a 1ª mensalidade. Pague pela '
            'tela de pagamento.'),
        findsOneWidget,
      );
    });

    testWidgets('1ª de valor zero do servidor: sem folha, tela de pagar',
        (tester) async {
      final repo = await run(tester, saved: card, firstChargeReais: 0);
      expect(
          find.byKey(const Key('schedule-autopay-consent-text')), findsNothing);
      expect(repo.calls, ['subscribe']);
      expect(find.text('PAGAR s1_2026-11_0'), findsOneWidget);
    });

    testWidgets('arena ainda sem nome: o texto não escreve "()"',
        (tester) async {
      await run(tester, saved: card, arenaLoaded: false);
      expect(shown, isNot(contains('()')));
      expect(shown, contains('plano Fixo Noite 1x, mais a taxa'));
    });

    testWidgets('nota da forma de pagamento com o opt-in', (tester) async {
      await run(tester, saved: card, cancelSheet: true);
      expect(
        tester.widget<Text>(find.byKey(const Key('schedule-method-note'))).data,
        'Cartão: ao assinar você autoriza o débito automático; a 1ª '
        'mensalidade é cobrada agora e as próximas no vencimento.',
      );
    });

    testWidgets('sem cartão: abre o formulário antes de assinar',
        (tester) async {
      final repo = await run(tester);
      expect(repo.calls.first, 'cardForm');
      expect(repo.calls, contains('subscribe'));
      expect(repo.calls, contains('set:s1:true:$consent'));
      expect(find.text('MEU PLANO'), findsOneWidget);
    });

    testWidgets('falha ao pagar: cai na tela de pagar com o erro',
        (tester) async {
      final repo = await run(tester, saved: card, failPay: true);
      expect(repo.calls.where((c) => c.startsWith('set')), isEmpty);
      expect(find.text('PAGAR s1_2026-11_0'), findsOneWidget);
      expect(find.textContaining('Não foi possível pagar no cartão'),
          findsOneWidget);
    });

    testWidgets('pagou mas o débito falhou: Meu plano com o erro',
        (tester) async {
      final repo = await run(tester, saved: card, failSet: true);
      expect(repo.calls, contains('pay:s1_2026-11_0'));
      expect(find.text('MEU PLANO'), findsOneWidget);
      expect(find.textContaining('Não foi possível ligar o débito automático'),
          findsOneWidget);
    });

    testWidgets('desmarcado: fluxo de hoje (tela de pagar)', (tester) async {
      final repo = await run(tester, saved: card, optIn: false);
      expect(repo.calls, ['subscribe']);
      expect(find.text('PAGAR s1_2026-11_0'), findsOneWidget);
    });

    testWidgets('flag desligada: sem o checkbox, fluxo de hoje',
        (tester) async {
      final repo = await run(tester, saved: card, flag: false);
      expect(repo.calls, ['subscribe']);
      expect(find.text('PAGAR s1_2026-11_0'), findsOneWidget);
    });
  });

  group('plano de horário livre', () {
    final flexAvailability = SchedulePlanAvailability.fromMap({
      'plan': {
        'name': 'Manhã livre',
        'bookingMode': 'flexible',
        'timesPerWeek': 2,
        'durationMinutes': 60,
        'monthlyPriceReais': 300,
        'capacity': 20,
        'occupiedCount': 3,
        'windows': [
          for (final w in [1, 2, 3, 4, 5])
            {'weekday': w, 'startTime': '06:00', 'endTime': '12:00'},
        ],
        'cycles': {
          'monthly': {'enabled': true},
        },
        'billing': {
          'methods': ['onsite'],
        },
      },
      'days': const [],
    }, arenaId: 'a1', planId: 'p1');

    testWidgets('não pede dia nem horário e assina sem eles', (tester) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final repo = _SubscribeRepo(false);
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) =>
                const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
          ),
          GoRoute(
            path: AppRoutes.mySchedulePlans,
            builder: (_, __) => const Text(
              'MEU PLANO',
              textDirection: TextDirection.ltr,
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            schedulePlansUidProvider.overrideWith((ref) => 'u1'),
            schedulePlanAvailabilityProvider
                .overrideWith((ref, key) async => flexAvailability),
            schedulePlansRepositoryProvider.overrideWithValue(repo),
            myScheduleSubscriptionsProvider.overrideWith(
              (ref) async => MyScheduleSubscriptions.fromMap(const {}),
            ),
          ],
          child: MaterialApp.router(
            theme: AppTheme.dark,
            routerConfig: router,
          ),
        ),
      );
      await tester.pump();
      await tester.pump();

      expect(find.byKey(const ValueKey('schedule-day-1')), findsNothing);
      expect(find.byKey(const Key('schedule-flex-rule')), findsOneWidget);
      expect(
        find.textContaining('até 2 vezes por semana (1h cada)'),
        findsOneWidget,
      );
      expect(find.textContaining('Seg–Sex, 6h–12h'), findsOneWidget);

      final submit = tester.widget<FilledButton>(find.descendant(
        of: find.byKey(const Key('schedule-signup-submit')),
        matching: find.byType(FilledButton),
      ));
      expect(submit.onPressed, isNotNull);
      await tester.tap(find.byKey(const Key('schedule-signup-submit')));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(repo.sentWeekdays, isEmpty);
      expect(repo.sentStartTime, isEmpty);
      expect(find.text('MEU PLANO'), findsOneWidget);
    });

    testWidgets(
        'troca de horário de quem assinou como fixo segue pedindo dia e hora',
        (tester) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      // Plano que virou livre depois: o servidor ainda manda os horários.
      final turned = SchedulePlanAvailability.fromMap({
        'plan': {
          'name': 'Noite',
          'bookingMode': 'flexible',
          'timesPerWeek': 1,
          'monthlyPriceReais': 200,
          'windows': [
            {'weekday': 2, 'startTime': '18:00', 'endTime': '22:00'},
          ],
        },
        'days': [
          {
            'weekday': 2,
            ...times([
              ['19:00', '20:00', 2, 0],
            ]),
          },
        ],
      }, arenaId: 'a1', planId: 'p1');
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            schedulePlansUidProvider.overrideWith((ref) => 'u1'),
            schedulePlanAvailabilityProvider
                .overrideWith((ref, key) async => turned),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: const SchedulePlanSignupPage(
              arenaId: 'a1',
              planId: 'p1',
              changeSubscriptionId: 's1',
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('schedule-flex-rule')), findsNothing);
      expect(find.byKey(const ValueKey('schedule-day-2')), findsOneWidget);
    });

    testWidgets('desconto no Pix: chip e preço no Pix; cartão volta ao cheio',
        (tester) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final pixPlan = SchedulePlanAvailability.fromMap({
        'plan': {
          'name': 'Manhã livre',
          'bookingMode': 'flexible',
          'timesPerWeek': 2,
          'monthlyPriceReais': 220,
          'capacity': 10,
          'windows': [
            {'weekday': 1, 'startTime': '06:00', 'endTime': '12:00'},
          ],
          'cycles': {
            'monthly': {'enabled': true},
          },
          'billing': {
            'methods': ['pix_auto', 'card'],
            'pixDiscountPercent': 10,
          },
        },
        'days': const [],
        'onlineBilling': true,
      }, arenaId: 'a1', planId: 'p1');
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            schedulePlansUidProvider.overrideWith((ref) => 'u1'),
            schedulePlanAvailabilityProvider
                .overrideWith((ref, key) async => pixPlan),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(find.text('Pix −10%'), findsOneWidget);
      expect(
        tester.widget<Text>(find.byKey(const Key('schedule-signup-share'))).data,
        formatBRL(198),
      );
      expect(find.text('por mês no Pix'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('schedule-method-card')));
      await tester.pump();
      expect(
        tester.widget<Text>(find.byKey(const Key('schedule-signup-share'))).data,
        formatBRL(220),
      );
      expect(find.text('por mês'), findsOneWidget);
    });

    testWidgets('plano livre lotado não deixa assinar', (tester) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final full = SchedulePlanAvailability.fromMap({
        'plan': {
          ...{
            'name': 'Manhã livre',
            'bookingMode': 'flexible',
            'timesPerWeek': 2,
            'monthlyPriceReais': 300,
            'windows': [
              {'weekday': 1, 'startTime': '06:00', 'endTime': '12:00'},
            ],
          },
          'capacity': 3,
          'occupiedCount': 3,
        },
        'days': const [],
      }, arenaId: 'a1', planId: 'p1');
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            schedulePlansUidProvider.overrideWith((ref) => 'u1'),
            schedulePlanAvailabilityProvider
                .overrideWith((ref, key) async => full),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('schedule-flex-full')), findsOneWidget);
      final submit = tester.widget<FilledButton>(find.descendant(
        of: find.byKey(const Key('schedule-signup-submit')),
        matching: find.byType(FilledButton),
      ));
      expect(submit.onPressed, isNull);
    });
  });
}

/// 1ª mensalidade que o servidor devolve (proporcional ao mês).
const _serverFirst = 123.45;

class _AutopayRepo implements SchedulePlansRepository {
  _AutopayRepo({
    this.failPay = false,
    this.failSet = false,
    this.firstChargeReais = _serverFirst,
  });

  final bool failPay;
  final bool failSet;
  final double? firstChargeReais;
  final calls = <String>[];

  @override
  Future<ScheduleSubscribeResult> subscribe({
    required String arenaId,
    required String planId,
    List<int> weekdays = const [],
    String startTime = '',
    required SchedulePlanCycle cycle,
    required SchedulePaymentMethod paymentMethod,
    List<String> memberAthleteIds = const [],
  }) async {
    calls.add('subscribe');
    return ScheduleSubscribeResult.fromMap({
      'subscriptionId': 's1',
      'courtName': 'Quadra 1',
      'firstCharge': {
        'chargeId': 's1_2026-11_0',
        if (firstChargeReais != null) 'amountReais': firstChargeReais,
        'dueDate': '2026-11-10',
      },
      'status': 'pending_payment',
      'paymentDeadline': '2026-11-03T13:30:00.000Z',
    });
  }

  @override
  Future<void> payWithSavedCard(String chargeId) async {
    if (failPay) throw Exception('recusado');
    calls.add('pay:$chargeId');
  }

  @override
  Future<ScheduleAutopayPreview> autopayPreview(String id) async {
    calls.add('preview:$id');
    return const ScheduleAutopayPreview(
      cardFeePercent: 1.5,
      cardProcessingPercent: 3.99,
      cardFixedReais: 0.49,
    );
  }

  @override
  Future<ScheduleAutopayConsent> setAutopay(
    String subscriptionId, {
    required bool enabled,
    String? consentText,
  }) async {
    if (failSet) throw Exception('falhou');
    calls.add('set:$subscriptionId:$enabled:$consentText');
    return ScheduleAutopayConsent(enabled: enabled);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _SubscribeRepo implements SchedulePlansRepository {
  _SubscribeRepo(this.pending);

  final bool pending;
  List<int>? sentWeekdays;
  String? sentStartTime;

  @override
  Future<ScheduleSubscribeResult> subscribe({
    required String arenaId,
    required String planId,
    List<int> weekdays = const [],
    String startTime = '',
    required SchedulePlanCycle cycle,
    required SchedulePaymentMethod paymentMethod,
    List<String> memberAthleteIds = const [],
  }) async {
    sentWeekdays = weekdays;
    sentStartTime = startTime;
    return ScheduleSubscribeResult.fromMap({
      'subscriptionId': 's1',
      'courtName': 'Quadra 1',
      'firstCharge': {
        'chargeId': 's1_2026-11_0',
        'amountReais': 90,
        'dueDate': '2026-11-10',
      },
      'status': pending ? 'pending_payment' : 'active',
      if (pending) 'paymentDeadline': '2026-11-03T13:30:00.000Z',
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
