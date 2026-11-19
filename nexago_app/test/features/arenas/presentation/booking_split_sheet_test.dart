import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_split.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_split/booking_split_sheet.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_split/booking_split_tracking.dart';

import '../../weather/weather_test_fakes.dart';

// Folha "Dividir com os jogadores" e o acompanhamento das fatias na tela do
// Pix — paridade com o "Dividir com amigos" do portal do atleta.

/// Busca de atleta em memória: devolve quem tem o termo no apelido.
class FakeSplitUsersRepository extends UsersRepository {
  FakeSplitUsersRepository(this.people) : super(UnusedFirestore());

  final List<AppUserProfile> people;

  @override
  Future<List<AppUserProfile>> searchAthletesByKeywords(
    String term, {
    int max = 25,
  }) async =>
      people
          .where((p) =>
              (p.nickname ?? '').toLowerCase().contains(term.toLowerCase()))
          .toList();
}

const joana = AppUserProfile(uid: 'joana', nickname: 'Joana', city: 'Goiânia');
const caio = AppUserProfile(uid: 'caio', nickname: 'Caio');

/// Abre a folha num botão e guarda o que ela devolveu.
Future<List<BookingSplitDraft?>> _openSheet(
  WidgetTester tester, {
  double total = 70,
  bool needsOwnCpf = false,
  BookingSplitDraft? initial,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final results = <BookingSplitDraft?>[];
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        usersRepositoryProvider.overrideWithValue(
          FakeSplitUsersRepository(const [joana, caio]),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async => results.add(
                await showBookingSplitSheet(
                  context,
                  totalReais: total,
                  selfUid: 'me',
                  selfName: 'Silvio',
                  needsOwnCpf: needsOwnCpf,
                  initial: initial,
                ),
              ),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
  return results;
}

Future<void> _add(WidgetTester tester, String term, String name) async {
  await tester.enterText(find.byKey(const Key('booking-split-search')), term);
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump();
  await tester.tap(find.text(name));
  await tester.pump();
}

String _amount(WidgetTester tester, String id) => tester
    .widget<TextField>(find.byKey(Key('booking-split-amount-$id')))
    .controller!
    .text;

FilledButton _submit(WidgetTester tester) =>
    tester.widget(find.byKey(const Key('booking-split-submit')));

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('folha de dividir', () {
    testWidgets('começa com "Você" pagando tudo e o botão travado',
        (tester) async {
      await _openSheet(tester);

      expect(find.text('Dividir com os jogadores'), findsOneWidget);
      expect(find.text('Você'), findsOneWidget);
      expect(_amount(tester, 'me'), '70,00');
      expect(find.text('Inclua pelo menos um jogador além de você.'),
          findsOneWidget);
      expect(_submit(tester).onPressed, isNull);
    });

    testWidgets('incluir jogadores divide igual, com os centavos certos',
        (tester) async {
      await _openSheet(tester, total: 100);

      await _add(tester, 'jo', 'Joana');
      expect(_amount(tester, 'me'), '50,00');
      expect(_amount(tester, 'joana'), '50,00');

      await _add(tester, 'ca', 'Caio');
      expect(_amount(tester, 'me'), '33,34');
      expect(_amount(tester, 'joana'), '33,33');
      expect(_amount(tester, 'caio'), '33,33');
      expect(
          find.text('${formatBRL(100)} de ${formatBRL(100)}'), findsOneWidget);
      expect(_submit(tester).onPressed, isNotNull);
    });

    testWidgets('quem já está na divisão some da busca', (tester) async {
      await _openSheet(tester);
      await _add(tester, 'jo', 'Joana');

      await tester.enterText(
        find.byKey(const Key('booking-split-search')),
        'jo',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();

      expect(find.text('Quem apareceu já está na divisão.'), findsOneWidget);
    });

    testWidgets('valor ajustado que não fecha a soma trava e avisa',
        (tester) async {
      await _openSheet(tester);
      await _add(tester, 'jo', 'Joana');

      await tester.enterText(
        find.byKey(const Key('booking-split-amount-joana')),
        '20',
      );
      await tester.pump();

      expect(find.text('${formatBRL(55)} de ${formatBRL(70)}'), findsOneWidget);
      expect(
        find.text('A soma das partes precisa ser igual ao valor da reserva.'),
        findsOneWidget,
      );
      expect(_submit(tester).onPressed, isNull);

      // Ajustando o outro lado a soma fecha.
      await tester.enterText(
        find.byKey(const Key('booking-split-amount-me')),
        '50,00',
      );
      await tester.pump();
      expect(_submit(tester).onPressed, isNotNull);
    });

    testWidgets('"Dividir igual" desfaz o ajuste', (tester) async {
      await _openSheet(tester);
      await _add(tester, 'jo', 'Joana');
      await tester.enterText(
        find.byKey(const Key('booking-split-amount-joana')),
        '20',
      );
      await tester.pump();

      await tester.tap(find.text('Dividir igual'));
      await tester.pump();

      expect(_amount(tester, 'me'), '35,00');
      expect(_amount(tester, 'joana'), '35,00');
    });

    testWidgets('tirar alguém redivide entre quem ficou', (tester) async {
      await _openSheet(tester, total: 90);
      await _add(tester, 'jo', 'Joana');
      await _add(tester, 'ca', 'Caio');
      expect(_amount(tester, 'me'), '30,00');

      await tester.tap(find.byTooltip('Tirar da divisão').first);
      await tester.pump();

      expect(find.byKey(const Key('booking-split-amount-me')), findsNothing);
      expect(_amount(tester, 'joana'), '45,00');
      expect(_amount(tester, 'caio'), '45,00');
    });

    testWidgets('devolve a divisão escolhida', (tester) async {
      final results = await _openSheet(tester);
      await _add(tester, 'jo', 'Joana');

      await tester.tap(find.byKey(const Key('booking-split-submit')));
      await tester.pumpAndSettle();

      final draft = results.single!;
      expect(draft.participants.map((p) => p.athleteId), ['me', 'joana']);
      expect(draft.participants.map((p) => p.amountReais), [35, 35]);
      expect(draft.evenly, isTrue);
      expect(draft.ownCpf, isNull);
    });

    testWidgets('sem CPF salvo: pede o CPF antes de liberar', (tester) async {
      final results = await _openSheet(tester, needsOwnCpf: true);
      await _add(tester, 'jo', 'Joana');

      expect(find.text('CPF DO TITULAR'), findsOneWidget);
      expect(_submit(tester).onPressed, isNull);

      await tester.enterText(
        find.descendant(
          of: find.byType(Column),
          matching: find.widgetWithText(TextField, '000.000.000-00'),
        ),
        '52998224725',
      );
      await tester.pump();
      expect(_submit(tester).onPressed, isNotNull);

      await tester.tap(find.byKey(const Key('booking-split-submit')));
      await tester.pumpAndSettle();
      expect(results.single!.ownCpf, '52998224725');
    });

    testWidgets('reaberta com divisão: "Não dividir" devolve vazio',
        (tester) async {
      final results = await _openSheet(
        tester,
        initial: BookingSplitDraft(participants: const [
          BookingSplitParticipant(
            athleteId: 'me',
            name: 'Silvio',
            isSelf: true,
            amountReais: 35,
          ),
          BookingSplitParticipant(
            athleteId: 'joana',
            name: 'Joana',
            amountReais: 35,
          ),
        ]),
      );
      expect(_amount(tester, 'joana'), '35,00');

      await tester.tap(find.text('Não dividir'));
      await tester.pumpAndSettle();

      expect(results.single!.isEmpty, isTrue);
    });
  });

  group('acompanhamento das fatias', () {
    BookingPaymentShare share(
      String id,
      String payer,
      String status, {
      double amount = 23.33,
    }) =>
        BookingPaymentShare.fromMap(id, {
          'payerAthleteId': payer,
          'amountReais': amount,
          'status': status,
          'pixCopyPaste': '00020126PIX$id',
          'expiresAt': DateTime(2030, 11, 8, 17),
        });

    Future<({List<String> copied, List<String> shared})> pump(
      WidgetTester tester,
      List<BookingPaymentShare> shares,
    ) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final copied = <String>[];
      final shared = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: SingleChildScrollView(
              child: BookingSplitTracking(
                shares: shares,
                selfUid: 'me',
                payerNames: const {'joana': 'Joana', 'caio': 'Caio'},
                onCopyPix: copied.add,
                onSharePix: (s) => shared.add(s.payerAthleteId),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      return (copied: copied, shared: shared);
    }

    testWidgets('mostra quem pagou, o Pix da sua parte e o prazo',
        (tester) async {
      final calls = await pump(tester, [
        share('1', 'me', 'pending', amount: 23.34),
        share('2', 'joana', 'paid'),
        share('3', 'caio', 'pending'),
      ]);

      expect(find.text('Reserva confirmada'), findsOneWidget);
      expect(find.textContaining('1 de 3 pagaram'), findsOneWidget);
      expect(find.text('Sua parte: ${formatBRL(23.34)}'), findsOneWidget);
      expect(find.text('Joana'), findsOneWidget);
      expect(find.text('Pago'), findsOneWidget);
      expect(find.text('Aguardando'), findsNWidgets(2));
      expect(find.textContaining('08/11 às 17:00'), findsOneWidget);

      await tester.tap(find.text('Copiar Pix Copia & Cola'));
      expect(calls.copied, ['00020126PIX1']);

      // Só o convidado pendente tem o botão de mandar o Pix.
      expect(find.byTooltip('Enviar o Pix de Caio'), findsOneWidget);
      expect(find.byTooltip('Enviar o Pix de Joana'), findsNothing);
      await tester.tap(find.byTooltip('Enviar o Pix de Caio'));
      expect(calls.shared, ['caio']);
    });

    testWidgets('fatia vencida aparece como conta sua na arena',
        (tester) async {
      await pump(tester, [
        share('1', 'me', 'paid', amount: 35),
        share('2', 'joana', 'covered_by_organizer', amount: 35),
      ]);

      expect(find.text('Virou sua conta'), findsOneWidget);
      expect(
        find.text('${formatBRL(35)} de quem não pagou a tempo ficou para '
            'você pagar na arena.'),
        findsOneWidget,
      );
      expect(find.textContaining('Sua parte'), findsNothing,
          reason: 'a sua já foi paga');
    });

    testWidgets('pagador sem nome conhecido não mostra o uid', (tester) async {
      await pump(tester, [share('1', 'xyz123', 'pending')]);
      expect(find.text('Jogador convidado'), findsOneWidget);
      expect(find.textContaining('xyz123'), findsNothing);
    });
  });
}
