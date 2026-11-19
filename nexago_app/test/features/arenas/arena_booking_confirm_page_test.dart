import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/auth/auth_service.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_quote.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arenas_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/arenas/presentation/arena_booking_confirm_page.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_sticky_bar.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';

import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_cashback_note.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_coupon_field.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_hero_card.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_confirm/booking_confirm_sport_picker.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/domain/cashback_rules.dart';

import 'package:nexago_app/features/arenas/data/coupons_repository.dart';
import 'package:nexago_app/features/arenas/data/last_booking_payment_store.dart';
import 'package:nexago_app/features/arenas/domain/available_coupon.dart';
import 'package:nexago_app/features/arenas/domain/booking_payment_method.dart';

import '../../core/theme/state_tone_contrast.dart';
import '../weather/weather_test_fakes.dart';

// Tela de confirmar reserva: correções (erro técnico na tela, botão liberado
// com o preço desatualizado, laranja ilegível no tema claro, campo de
// observações que não chegava em lugar nenhum) e a ordem dos blocos
// (pagamento antes do recibo, Total sempre, prazo em data e hora).

final _args = ArenaBookingConfirmArgs(
  arenaId: 'a1',
  arenaName: 'Arena CFC',
  courtId: 'q2',
  courtName: 'Quadra 2',
  date: DateTime(2030, 11, 8),
  startTime: '19:00',
  endTime: '20:00',
  amountReais: 70,
  selectedSlotStartTimes: const ['19:00'],
);

/// Cotação controlada pelo teste; criação da reserva pode falhar à vontade.
class _FakeBookingService extends BookingService {
  _FakeBookingService({this.createError, this.createResult})
      : super(UnusedFirestore(), functions: FakeWeatherFunctions());

  final Object? createError;
  final CreateBookingResult? createResult;
  final List<String> createdModes = [];
  Completer<ArenaBookingQuote> pendingQuote = Completer()
    ..complete(const ArenaBookingQuote(amountReais: 70, lineItems: []));

  @override
  Future<ArenaBookingQuote> quoteBooking({
    required ArenaBookingConfirmArgs args,
    String? couponCode,
    bool asProfessor = false,
    bool useWeatherCredit = false,
    String paymentMode = 'onsite',
  }) {
    if (couponCode == null) return pendingQuote.future;
    quotedCoupons.add(couponCode);
    return Future.value(const ArenaBookingQuote(
      amountReais: 63,
      lineItems: [],
      couponApplied: true,
      couponDiscountReais: 7,
    ));
  }

  final List<String> quotedCoupons = [];

  @override
  Future<CreateBookingResult?> findResumablePixBooking({
    required String athleteId,
    required ArenaBookingConfirmArgs args,
  }) async =>
      null;

  @override
  Future<CreateBookingResult> createBookingAtomically({
    required ArenaBookingConfirmArgs args,
    required String athleteId,
    String paymentMode = 'onsite',
    double paymentFraction = 1.0,
    String? couponCode,
    String? sport,
    bool asProfessor = false,
    String? professorStudentId,
    bool useWeatherCredit = false,
  }) async {
    createdModes.add(paymentMode);
    final result = createResult;
    if (result != null && createError == null) return result;
    throw createError ?? StateError('não configurado');
  }
}

/// Forma lembrada em memória (sem SharedPreferences nos testes).
class _FakePaymentStore extends LastBookingPaymentStore {
  _FakePaymentStore([this.stored]);

  BookingPaymentMethod? stored;
  final List<BookingPaymentMethod> saved = [];

  @override
  Future<BookingPaymentMethod?> load(String uid) async => stored;

  @override
  Future<void> save(String uid, BookingPaymentMethod method) async {
    saved.add(method);
    stored = method;
  }
}

Future<void> _pumpConfirm(
  WidgetTester tester,
  _FakeBookingService service, {
  ThemeData? theme,
  List<String> sports = const ['Pickleball', 'Beach Tennis'],
  CashbackCheckoutContext? cashback,
  LastBookingPaymentStore? paymentStore,
  List<AvailableCoupon> availableCoupons = const [],
}) async {
  tester.view.physicalSize = const Size(900, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: '/arena/a1/book/confirm',
    initialExtra: _args,
    routes: [
      GoRoute(
        path: AppRoutes.arenaBookingConfirm,
        builder: (context, state) =>
            ArenaBookingConfirmPage(arenaId: state.pathParameters['arenaId']!),
      ),
      GoRoute(
        path: AppRoutes.arenaBookingSuccess,
        builder: (context, state) =>
            const Scaffold(body: Text('tela de sucesso')),
      ),
      GoRoute(
        path: AppRoutes.arenaBookingPix,
        name: AppRouteNames.arenaBookingPix,
        builder: (context, state) => const Scaffold(body: Text('tela do pix')),
      ),
    ],
  );
  addTearDown(router.dispose);

  final user = MockUser(uid: 'u1');
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(user)),
        authServiceProvider.overrideWithValue(
          AuthService(MockFirebaseAuth(signedIn: true, mockUser: user)),
        ),
        bookingServiceProvider.overrideWithValue(service),
        arenaByIdProvider.overrideWith((ref, id) => Stream.value(null)),
        courtsStreamProvider.overrideWith(
          (ref, id) => Stream.value([
            ArenaCourt(
              id: 'q2',
              name: 'Quadra 2',
              sportTypes: sports,
            ),
          ]),
        ),
        myArenaProfessorLinkProvider
            .overrideWith((ref, id) => Stream.value(null)),
        cashbackCheckoutContextProvider.overrideWithValue(cashback),
        lastBookingPaymentStoreProvider
            .overrideWithValue(paymentStore ?? _FakePaymentStore()),
        availableArenaCouponsProvider
            .overrideWith((ref, id) async => availableCoupons),
      ],
      child: MaterialApp.router(
        theme: theme ?? AppTheme.dark,
        routerConfig: router,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

FilledButton _cta(WidgetTester tester) => tester.widget<FilledButton>(
      find.descendant(
        of: find.byType(BookingConfirmStickyBar),
        matching: find.byType(FilledButton),
      ),
    );

/// Escolhe o primeiro esporte da quadra (sem esporte o botão só avisa).
Future<void> _pickSport(WidgetTester tester) async {
  await tester.tap(find.text('Pickleball'));
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('não mostra mais o campo de observações', (tester) async {
    await _pumpConfirm(tester, _FakeBookingService());

    expect(find.text('OBSERVAÇÕES (OPCIONAL)'), findsNothing);
    expect(find.byType(TextField), findsNothing, reason: 'cupom recolhido');
  });

  testWidgets('botão travado enquanto o preço é recalculado', (tester) async {
    final service = _FakeBookingService()..pendingQuote = Completer();
    await _pumpConfirm(tester, service);

    expect(find.text('Calculando…'), findsWidgets);
    expect(_cta(tester).onPressed, isNull);

    service.pendingQuote
        .complete(const ArenaBookingQuote(amountReais: 70, lineItems: []));
    await tester.pump();

    expect(find.text('Calculando…'), findsNothing);
    expect(_cta(tester).onPressed, isNotNull);
  });

  testWidgets('falha inesperada ao reservar mostra texto amigável, sem o erro',
      (tester) async {
    await _pumpConfirm(
      tester,
      _FakeBookingService(createError: StateError('type Null is not a String')),
    );
    await _pickSport(tester);

    await tester.tap(find.descendant(
      of: find.byType(BookingConfirmStickyBar),
      matching: find.text('Confirmar reserva'),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text('Não foi possível reservar. Tente de novo em instantes.'),
      findsOneWidget,
    );
    expect(find.textContaining('type Null'), findsNothing);
    expect(find.textContaining('Erro ao reservar'), findsNothing);
  });

  for (final (name, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    testWidgets('laranja como texto e ícone legível no tema $name',
        (tester) async {
      await _pumpConfirm(tester, _FakeBookingService(), theme: theme);
      await _pickSport(tester);

      final checked = expectBrandTextLegible(
        tester,
        find.byType(ArenaBookingConfirmPage),
      );
      // Total da barra, esporte escolhido (texto e check) e forma de
      // pagamento marcada.
      expect(checked, containsAll(<Object>['Pickleball', Icons.check_rounded]));
      expect(checked, contains(Icons.check_circle_rounded));
    });
  }

  test('serviço: resposta quebrada vira frase amigável, sem o erro cru',
      () async {
    final functions = FakeWeatherFunctions(responses: {
      // bookingId numérico: o cast falha dentro do serviço.
      'createArenaBooking': {'bookingId': 42, 'amountReais': 70.0},
    });
    final service = BookingService(UnusedFirestore(), functions: functions);

    await expectLater(
      service.createBookingAtomically(args: _args, athleteId: 'u1'),
      throwsA(isA<BookingException>().having(
        (e) => e.message,
        'message',
        'Não foi possível concluir a reserva. Tente de novo em instantes.',
      )),
    );
  });

  group('ordem e recibo', () {
    double top(WidgetTester tester, String text) =>
        tester.getTopLeft(find.text(text)).dy;

    testWidgets('forma de pagamento vem antes do resumo de valores',
        (tester) async {
      await _pumpConfirm(tester, _FakeBookingService());

      expect(
        top(tester, 'FORMA DE PAGAMENTO'),
        lessThan(top(tester, 'RESUMO DE VALORES')),
      );
      expect(
        top(tester, 'RESUMO DE VALORES'),
        lessThan(top(tester, 'Tenho um cupom')),
      );
    });

    testWidgets('caso comum mostra taxa grátis e Total', (tester) async {
      await _pumpConfirm(tester, _FakeBookingService());

      expect(find.byKey(const Key('booking-confirm-fee')), findsOneWidget);
      expect(find.text('Taxa de serviço'), findsOneWidget);
      expect(find.text('Grátis'), findsOneWidget);
      final total = find.byKey(const Key('booking-confirm-total'));
      expect(total, findsOneWidget);
      expect(
        find.descendant(of: total, matching: find.text(formatBRL(70))),
        findsOneWidget,
      );
    });

    testWidgets('um esporte só vira texto no hero, sem seletor',
        (tester) async {
      await _pumpConfirm(
        tester,
        _FakeBookingService(),
        sports: const ['Pickleball'],
      );

      expect(find.text('ESPORTE'), findsNothing);
      expect(find.textContaining('Quadra 2 · Pickleball'), findsOneWidget);
    });

    testWidgets('dois esportes: seletor aparece e o hero não escolhe',
        (tester) async {
      await _pumpConfirm(tester, _FakeBookingService());

      expect(find.text('ESPORTE'), findsOneWidget);
      expect(find.textContaining('· Pickleball'), findsNothing);
    });

    testWidgets('política mostra o prazo e muda com a forma de pagamento',
        (tester) async {
      await _pumpConfirm(tester, _FakeBookingService());

      expect(find.textContaining('Cancelamento grátis até '), findsOneWidget);
      expect(find.textContaining('6h antes'), findsNothing);
      expect(find.textContaining('Cancele pelo app até lá'), findsOneWidget);
      expect(find.textContaining('(Pix ou cartão)'), findsNothing);

      await tester.tap(find.text('Pagar online'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.textContaining('(Pix ou cartão)'), findsOneWidget);
      expect(find.textContaining('Cancele pelo app até lá'), findsNothing);
    });
  });

  group('extras recolhidos e hero', () {
    const cashbackOn = CashbackConfig(
      enabled: true,
      ratePercent: 2,
      maxShareOfFee: 0.5,
      minCashCents: 500,
      expiryMonths: 6,
      expiryWarningDays: 15,
    );

    Future<void> confirm(WidgetTester tester) async {
      await tester.tap(find.descendant(
        of: find.byType(BookingConfirmStickyBar),
        matching: find.text('Confirmar reserva'),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }

    testWidgets('cupom começa como linha e abre o campo ao tocar',
        (tester) async {
      await _pumpConfirm(tester, _FakeBookingService());

      expect(find.text('CUPOM DE DESCONTO (OPCIONAL)'), findsNothing);
      await tester.tap(find.byKey(BookingConfirmCouponField.openRowKey));
      await tester.pump();

      expect(find.text('CUPOM DE DESCONTO (OPCIONAL)'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Aplicar'), findsOneWidget);
    });

    testWidgets('"Alterar horário" fica no hero, com a duração na data',
        (tester) async {
      await _pumpConfirm(tester, _FakeBookingService());

      final hero = find.byType(BookingConfirmHeroCard);
      expect(
        find.descendant(
          of: hero,
          matching: find.byKey(BookingConfirmHeroCard.changeTimeKey),
        ),
        findsOneWidget,
      );
      expect(find.text('Alterar horário'), findsOneWidget);
      expect(
        find.descendant(of: hero, matching: find.textContaining('· 1H')),
        findsOneWidget,
      );
    });

    testWidgets('sem esporte: rola até o seletor e destaca, sem snackbar',
        (tester) async {
      await _pumpConfirm(tester, _FakeBookingService());
      expect(find.byKey(BookingConfirmSportPicker.missingKey), findsNothing);

      await confirm(tester);

      expect(find.byKey(BookingConfirmSportPicker.missingKey), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);

      await tester.tap(find.text('Pickleball'));
      await tester.pump();
      expect(find.byKey(BookingConfirmSportPicker.missingKey), findsNothing);
    });

    testWidgets('cashback com saldo aparece no recibo só pagando pelo app',
        (tester) async {
      await _pumpConfirm(
        tester,
        _FakeBookingService(),
        cashback: const CashbackCheckoutContext(
          config: cashbackOn,
          availableCents: 1200,
        ),
      );
      expect(find.byKey(BookingConfirmCashbackNote.noteKey), findsNothing);

      await tester.tap(find.text('Pagar online'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byKey(BookingConfirmCashbackNote.noteKey), findsOneWidget);
      expect(
        find.text('Você tem ${formatBRL(12)} de cashback para usar neste '
            'pagamento, na próxima etapa.'),
        findsOneWidget,
      );
    });
  });

  group('cashbackNoteText', () {
    const on = CashbackConfig(
      enabled: true,
      ratePercent: 2,
      maxShareOfFee: 0.5,
      minCashCents: 500,
      expiryMonths: 6,
      expiryWarningDays: 15,
    );

    test('desligado ou carregando: nada', () {
      expect(cashbackNoteText(checkout: null, amountDueReais: 70), isNull);
      expect(
        cashbackNoteText(
          checkout: const CashbackCheckoutContext(
            config: CashbackConfig.fallback,
            availableCents: 1000,
          ),
          amountDueReais: 70,
        ),
        isNull,
      );
    });

    test('sem saldo: "ganhe até 2%"', () {
      expect(
        cashbackNoteText(
          checkout:
              const CashbackCheckoutContext(config: on, availableCents: 0),
          amountDueReais: 70,
        ),
        'Ganhe até 2% de volta neste pagamento',
      );
    });

    test('saldo maior que a cobrança deixa o mínimo em dinheiro', () {
      expect(
        cashbackNoteText(
          checkout:
              const CashbackCheckoutContext(config: on, availableCents: 10000),
          amountDueReais: 70,
        ),
        'Você tem ${formatBRL(65)} de cashback para usar neste pagamento, '
        'na próxima etapa.',
      );
    });
  });

  testWidgets('hero com capa mostra a faixa da foto', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: BookingConfirmHeroCard(
          dateKey: '2030-11-08',
          timeRange: '19:00 - 20:00',
          arenaName: 'Arena CFC',
          courtName: 'Quadra 2',
          coverUrl: 'https://example.com/capa.jpg',
          onChangeTime: () {},
        ),
      ),
    ));
    expect(find.byKey(BookingConfirmHeroCard.coverKey), findsOneWidget);
  });

  group('forma de pagamento lembrada (N1)', () {
    Finder confirmButton(String label) => find.descendant(
          of: find.byType(BookingConfirmStickyBar),
          matching: find.text(label),
        );

    testWidgets('sem histórico: abre em "na arena", sem selo', (tester) async {
      await _pumpConfirm(tester, _FakeBookingService());

      expect(find.text('Último usado'), findsNothing);
      expect(confirmButton('Confirmar reserva'), findsOneWidget);
    });

    testWidgets('última foi online: abre em "Pagar online" com o selo',
        (tester) async {
      await _pumpConfirm(
        tester,
        _FakeBookingService(),
        paymentStore: _FakePaymentStore(BookingPaymentMethod.online),
      );

      expect(find.text('Último usado'), findsOneWidget);
      expect(confirmButton('Confirmar e pagar'), findsOneWidget);

      // Tocar em outra forma vale mais que a lembrada.
      await tester.tap(find.text('Pagar na arena'));
      await tester.pump();
      expect(confirmButton('Confirmar reserva'), findsOneWidget);
    });

    testWidgets('reserva concluída na arena grava "onsite"', (tester) async {
      final store = _FakePaymentStore(BookingPaymentMethod.online);
      final service = _FakeBookingService(
        createResult: const CreateBookingResult(
          bookingId: 'b1',
          amountReais: 70,
          amountDueOnsiteReais: 70,
        ),
      );
      await _pumpConfirm(tester, service, paymentStore: store);

      await tester.tap(find.text('Pagar na arena'));
      await tester.pump();
      await _pickSport(tester);
      await tester.tap(confirmButton('Confirmar reserva'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(service.createdModes, ['onsite']);
      expect(store.saved, [BookingPaymentMethod.onsite]);
      expect(find.text('tela de sucesso'), findsOneWidget);
    });
  });

  group('LastBookingPaymentStore', () {
    test('lê e grava por atleta', () async {
      SharedPreferences.setMockInitialValues({});
      final store = LastBookingPaymentStore();

      expect(await store.load('u1'), isNull);
      await store.save('u1', BookingPaymentMethod.online);
      expect(await store.load('u1'), BookingPaymentMethod.online);
      expect(await store.load('u2'), isNull);
    });

    test('sem usuário não lê nem grava', () async {
      SharedPreferences.setMockInitialValues({});
      final store = LastBookingPaymentStore();
      await store.save('', BookingPaymentMethod.online);
      expect(await store.load(''), isNull);
    });
  });

  group('cupons disponíveis (N2)', () {
    const coupons = [
      AvailableCoupon(code: 'VERAO10', discountPercent: 10),
      AvailableCoupon(code: 'AMIGO', fixedDiscountReais: 15),
    ];

    testWidgets('linha conta os disponíveis e o chip aplica com um toque',
        (tester) async {
      final service = _FakeBookingService();
      await _pumpConfirm(tester, service, availableCoupons: coupons);

      expect(find.text('2 disponíveis'), findsOneWidget);
      await tester.tap(find.byKey(BookingConfirmCouponField.openRowKey));
      await tester.pump();

      expect(find.text('VERAO10 · 10% off'), findsOneWidget);
      expect(find.text('AMIGO · ${formatBRL(15)} off'), findsOneWidget);

      await tester.tap(find.text('VERAO10 · 10% off'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(service.quotedCoupons, ['VERAO10']);
      expect(find.textContaining('Cupom VERAO10 aplicado'), findsOneWidget);
      // Aplicado: os chips saem.
      expect(find.text('AMIGO · ${formatBRL(15)} off'), findsNothing);
    });

    testWidgets('sem cupons divulgados: linha sem contador', (tester) async {
      await _pumpConfirm(tester, _FakeBookingService());
      expect(find.textContaining('disponíve'), findsNothing);
    });

    test('fromMap e rótulo do desconto', () {
      expect(AvailableCoupon.fromMap({'code': ''}), isNull);
      final c = AvailableCoupon.fromMap({
        'code': 'P12',
        'discountPercent': 12.5,
        'fixedDiscountReais': null,
        'validUntil': '2026-12-31T23:59:59.000Z',
      })!;
      expect(c.discountLabel, '12,5% off');
      expect(c.validUntil, isNotNull);
      expect(
        const AvailableCoupon(code: 'X', fixedDiscountReais: 15).discountLabel,
        '${formatBRL(15)} off',
      );
    });

    test('repositório: callable fora do ar vira lista vazia', () async {
      final functions = FakeWeatherFunctions(errors: {
        'listAvailableArenaCoupons': FirebaseFunctionsException(
          code: 'not-found',
          message: 'NOT FOUND',
        ),
      });
      final repo = CouponsRepository(functions: functions);
      expect(await repo.listAvailableCoupons('a1'), isEmpty);
    });

    test('repositório: lê a lista e ignora item sem código', () async {
      final functions = FakeWeatherFunctions(responses: {
        'listAvailableArenaCoupons': {
          'coupons': [
            {'code': 'VERAO10', 'discountPercent': 10},
            {'code': ''},
          ],
        },
      });
      final repo = CouponsRepository(functions: functions);
      final list = await repo.listAvailableCoupons('a1');
      expect(list.map((c) => c.code), ['VERAO10']);
      expect(
          functions.payloadOf('listAvailableArenaCoupons'), {'arenaId': 'a1'});
    });
  });
}
