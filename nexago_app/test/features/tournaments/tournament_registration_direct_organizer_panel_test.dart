// Regressão do gap de paridade com o app web (commit bf477d2): o BR Code Pix
// da inscrição com pagamento direto ao organizador (`directWithOrganizer`)
// precisa cair na cidade do torneio quando a chave PIX do organizador não tem
// cidade configurada (alguns bancos rejeitam "BRASIL" como cidade) e sempre
// carregar um txid que identifique o torneio (`INSC$tournamentId`) — antes
// esse widget nem passava `tournamentCity` nem `txid` pro `PixBrCode.build`.
//
// Testado no nível do widget (não reimplementando o fallback aqui) porque a
// composição de `city`/`txid` vive dentro do `build()` do
// `TournamentRegistrationDirectOrganizerPanel`, não em uma função pura
// isolada — o teste teria que duplicar a mesma expressão para simular a
// lógica, o que o próprio objetivo do teste é evitar.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_direct_organizer_panel.dart';

void main() {
  Widget wrap(Widget child) {
    return ProviderScope(
      overrides: [
        // organizerId fica vazio nestes testes (managerId não é passado), o
        // que evita `athleteProfileByIdProvider`/Firestore; só `authProvider`
        // é observado incondicionalmente pelo painel.
        authProvider.overrideWith((ref) => Stream.value(null)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );
  }

  Future<void> pumpPanel(
    WidgetTester tester, {
    required String tournamentId,
    String pixCity = '',
    String tournamentCity = '',
  }) async {
    await tester.pumpWidget(
      wrap(
        TournamentRegistrationDirectOrganizerPanel(
          tournamentId: tournamentId,
          tournamentName: 'Copa Teste',
          quote: const TournamentRegistrationQuote(entryFee: 160),
          paymentType: 'full',
          onPaymentTypeChanged: (_) {},
          pixKey: 'organizador@email.com',
          pixCity: pixCity,
          tournamentCity: tournamentCity,
        ),
      ),
    );
    await tester.pump();
  }

  /// Lê o BR Code de fato renderizado pelo widget (o `Text` que exibe o
  /// "copia e cola"), em vez de recalcular a composição no teste.
  String renderedBrCode(WidgetTester tester) {
    final finder = find.byWidgetPredicate(
      (w) => w is Text && (w.data?.startsWith('000201') ?? false),
    );
    expect(finder, findsOneWidget);
    return tester.widget<Text>(finder).data!;
  }

  group('TournamentRegistrationDirectOrganizerPanel — BR Code Pix', () {
    testWidgets(
      'usa a cidade do torneio quando a chave PIX do organizador não tem cidade',
      (tester) async {
        await pumpPanel(
          tester,
          tournamentId: 'T1',
          pixCity: '',
          tournamentCity: 'Recife',
        );

        final code = renderedBrCode(tester);
        expect(code.contains('6006RECIFE'), isTrue);
        expect(code.contains('6006BRASIL'), isFalse);
      },
    );

    testWidgets(
      'cai para BRASIL quando nem a chave PIX nem o torneio têm cidade',
      (tester) async {
        await pumpPanel(
          tester,
          tournamentId: 'T2',
          pixCity: '',
          tournamentCity: '',
        );

        final code = renderedBrCode(tester);
        expect(code.contains('6006BRASIL'), isTrue);
      },
    );

    testWidgets(
      'cidade configurada na chave PIX tem prioridade sobre a cidade do torneio',
      (tester) async {
        await pumpPanel(
          tester,
          tournamentId: 'T3',
          pixCity: 'Recife',
          tournamentCity: 'Fortaleza',
        );

        final code = renderedBrCode(tester);
        expect(code.contains('6006RECIFE'), isTrue);
        expect(code.contains('FORTALEZA'), isFalse);
      },
    );

    testWidgets(
      'txid identifica o torneio no extrato do organizador (INSC + id)',
      (tester) async {
        await pumpPanel(
          tester,
          tournamentId: 'T1',
          pixCity: 'Recife',
        );

        final code = renderedBrCode(tester);
        // Campo 62 (Additional Data Field), subcampo 05 (Reference Label):
        // "05" + tamanho (06) + "INSCT1".
        expect(code.contains('0506INSCT1'), isTrue);
      },
    );

    testWidgets(
      'txid remove caracteres não alfanuméricos do id do torneio',
      (tester) async {
        await pumpPanel(
          tester,
          tournamentId: 'T-1',
          pixCity: 'Recife',
        );

        final code = renderedBrCode(tester);
        // "T-1" sanitizado vira "T1" — mesmo resultado do id sem hífen,
        // confirmando que a concatenação "INSC$tournamentId" não vaza o
        // hífen para o TXID final.
        expect(code.contains('0506INSCT1'), isTrue);
      },
    );
  });
}
