import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:nexago_app/features/organizer/data/organizer_wallet_repository.dart';
import 'package:nexago_app/features/organizer/domain/organizer_wallet_providers.dart';
import 'package:nexago_app/features/organizer/presentation/organizer_financial_page.dart';

/// Fake do repositório da carteira: registra as chamadas e nunca toca em
/// Firebase. A tela não precisa de Firestore — o saldo ao vivo entra por um
/// `StreamController` por torneio.
class _FakeWalletRepository implements OrganizerWalletRepository {
  _FakeWalletRepository({required this.load});

  /// Resposta da callable por `tournamentId` pedido (`null` = o servidor
  /// escolhe). É onde cada teste encena o que o servidor devolveria.
  final OrganizerWalletView Function(String? tournamentId) load;

  /// Todos os `tournamentId` pedidos, na ordem. O último é o que importa para
  /// a regressão do saque: recarregar com `null` deixa o servidor trocar o
  /// caixa debaixo da pessoa.
  final loadCalls = <String?>[];
  final withdrawalCalls = <({String tournamentId, double amountReais})>[];
  final payoutCalls = <({String pixKey, String pixKeyType})>[];

  /// Erro da carga (rede/servidor). Quando não-nulo, `loadWalletView` estoura.
  Object? loadError;

  /// Erro do save da chave PIX.
  Object? payoutError;

  /// O que o servidor devolve no save — normalizado por ele, de propósito
  /// diferente do que o formulário mandou.
  OrganizerPayoutProfile payoutEcho = OrganizerPayoutProfile.empty;

  OrganizerWithdrawalRequestResult withdrawalResult =
      const OrganizerWithdrawalRequestResult(
    withdrawalId: 'w1',
    status: 'approved',
    payoutStatus: 'sent',
    autoProcessed: true,
  );

  final _live = <String, StreamController<TournamentCashBox?>>{};

  StreamController<TournamentCashBox?> liveOf(String tournamentId) {
    return _live.putIfAbsent(
      tournamentId,
      () => StreamController<TournamentCashBox?>.broadcast(),
    );
  }

  Future<void> closeLive() async {
    for (final c in _live.values) {
      await c.close();
    }
  }

  @override
  Future<OrganizerWalletView> loadWalletView({
    String? tournamentId,
    int? ledgerLimit,
  }) async {
    loadCalls.add(tournamentId);
    final error = loadError;
    if (error != null) throw error;
    return load(tournamentId);
  }

  @override
  Future<OrganizerWithdrawalRequestResult> requestWithdrawal({
    required String tournamentId,
    required double amountReais,
  }) async {
    withdrawalCalls
        .add((tournamentId: tournamentId, amountReais: amountReais));
    return withdrawalResult;
  }

  @override
  Future<OrganizerPayoutProfile> setPayoutPixKey({
    required String pixKey,
    required String pixKeyType,
  }) async {
    payoutCalls.add((pixKey: pixKey, pixKeyType: pixKeyType));
    final error = payoutError;
    if (error != null) throw error;
    return payoutEcho;
  }

  @override
  Stream<TournamentCashBox?> watchCashBox(String tournamentId) {
    return liveOf(tournamentId).stream;
  }
}

TournamentCashBox caixa(
  String id,
  String nome, {
  double disponivel = 0,
  double pendente = 0,
}) {
  return TournamentCashBox(
    tournamentId: id,
    tournamentName: nome,
    availableReais: disponivel,
    pendingReais: pendente,
  );
}

OrganizerWalletView vista({
  required List<TournamentCashBox> caixas,
  required TournamentCashBox? selecionado,
  OrganizerPayoutProfile payout = OrganizerPayoutProfile.empty,
  List<OrganizerLedgerEntry> ledger = const [],
  List<OrganizerWithdrawalItem> saques = const [],
}) {
  return OrganizerWalletView(
    cashBoxes: caixas,
    selected: selecionado,
    payout: payout,
    ledger: ledger,
    withdrawals: saques,
  );
}

Future<void> abrirTela(
  WidgetTester tester,
  _FakeWalletRepository repo,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        organizerWalletRepositoryProvider.overrideWithValue(repo),
        currentOrganizerIdProvider.overrideWithValue('u1'),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const OrganizerFinancialPage(),
      ),
    ),
  );
  // Carregando: só `pump()`. O spinner do `AppLoadingView` é indeterminado e
  // `pumpAndSettle` nunca volta.
  await tester.pump();
}

void main() {
  const payoutComChave = OrganizerPayoutProfile(
    pixKey: 'antigo@nexago.app',
    pixKeyType: 'EMAIL',
    hasPixKey: true,
  );

  group('os três estados da tela', () {
    testWidgets('falha de carga mostra o card de erro, e NÃO o texto do '
        'administrador', (tester) async {
      final repo = _FakeWalletRepository(
        load: (_) => vista(caixas: const [], selecionado: null),
      )..loadError = Exception('Firestore unavailable');
      addTearDown(repo.closeLive);

      await abrirTela(tester, repo);
      await tester.pumpAndSettle();

      expect(find.byType(AppErrorView), findsOneWidget);
      expect(find.text('Não foi possível carregar o Financeiro'),
          findsOneWidget);
      // O ponto da inversão de guardas: falha de rede jamais pode ser
      // apresentada como "você não alcança caixa nenhum".
      expect(find.textContaining('administrador do evento'), findsNothing);
    });

    testWidgets('sem caixa nenhum explica a regra em vez de mostrar erro',
        (tester) async {
      final repo = _FakeWalletRepository(
        load: (_) => vista(
          caixas: const [],
          selecionado: null,
          payout: payoutComChave,
        ),
      );
      addTearDown(repo.closeLive);

      await abrirTela(tester, repo);
      await tester.pumpAndSettle();

      expect(find.textContaining('administrador do evento'), findsOneWidget);
      expect(find.byType(AppErrorView), findsNothing);
      expect(find.text('Disponível para saque'), findsNothing);
    });

    testWidgets('com caixa mostra o saldo do evento escolhido', (tester) async {
      final repo = _FakeWalletRepository(
        load: (_) => vista(
          caixas: [caixa('a', 'Etapa Aurora', disponivel: 1000)],
          selecionado: caixa('a', 'Etapa Aurora', disponivel: 1000),
          payout: payoutComChave,
        ),
      );
      addTearDown(repo.closeLive);

      await abrirTela(tester, repo);
      await tester.pumpAndSettle();

      expect(find.text('Caixa de Etapa Aurora'), findsOneWidget);
      expect(find.text('Disponível para saque'), findsOneWidget);
      expect(find.text(formatBRL(1000)), findsOneWidget);
      expect(find.textContaining('administrador do evento'), findsNothing);
    });
  });

  testWidgets('saldo ao vivo entra sem apagar o nome do caixa',
      (tester) async {
    final repo = _FakeWalletRepository(
      load: (_) => vista(
        caixas: [caixa('a', 'Etapa Aurora', disponivel: 1000)],
        selecionado: caixa('a', 'Etapa Aurora', disponivel: 1000),
        payout: payoutComChave,
      ),
    );
    addTearDown(repo.closeLive);

    await abrirTela(tester, repo);
    await tester.pumpAndSettle();
    expect(find.text(formatBRL(1000)), findsOneWidget);

    // Como o doc `tournamentWallets/{id}` não guarda nome, o caixa do stream
    // chega com `tournamentName` vazio. Trocar a linha carregada por ele
    // (`live ?? selected`) passaria nos testes de unidade e deixaria o título
    // da tela no fallback de nome vazio.
    repo.liveOf('a').add(caixa('a', '', disponivel: 1500, pendente: 200));
    await tester.pumpAndSettle();

    expect(find.text(formatBRL(1500)), findsOneWidget);
    expect(find.text('${formatBRL(200)} em processamento'), findsOneWidget);
    expect(find.text('Caixa de Etapa Aurora'), findsOneWidget);
    expect(find.text('Caixa de um evento seu'), findsNothing);
  });

  testWidgets('o card da chave PIX existe mesmo sem caixa nenhum',
      (tester) async {
    final repo = _FakeWalletRepository(
      load: (_) => vista(
        caixas: const [],
        selecionado: null,
        payout: OrganizerPayoutProfile.empty,
      ),
    );
    addTearDown(repo.closeLive);

    await abrirTela(tester, repo);
    await tester.pumpAndSettle();

    // Sem este card, o administrador do evento e o organizador novo ficam sem
    // nenhum caminho para cadastrar a própria chave.
    expect(find.text('Chave PIX de repasse'), findsOneWidget);
    expect(find.text('Cadastrar chave'), findsOneWidget);
  });

  group('destino do saque só muda com o servidor', () {
    testWidgets('save que falha mantém o destino que o servidor tem',
        (tester) async {
      final repo = _FakeWalletRepository(
        load: (_) => vista(
          caixas: const [],
          selecionado: null,
          payout: payoutComChave,
        ),
      )..payoutError = Exception('unavailable');
      addTearDown(repo.closeLive);

      await abrirTela(tester, repo);
      await tester.pumpAndSettle();
      expect(find.textContaining('antigo@nexago.app'), findsOneWidget);

      await tester.tap(find.text('Chave PIX de repasse'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'novo@nexago.app');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salvar'));
      await tester.pumpAndSettle();

      expect(repo.payoutCalls.single.pixKey, 'novo@nexago.app');
      // O card mostra DESTINO de dinheiro: o rascunho não pode virar verdade.
      expect(find.textContaining('antigo@nexago.app'), findsOneWidget);
      expect(find.textContaining('novo@nexago.app'), findsNothing);
    });

    testWidgets('sucesso mostra o eco normalizado do servidor', (tester) async {
      final repo = _FakeWalletRepository(
        load: (_) => vista(
          caixas: const [],
          selecionado: null,
          payout: payoutComChave,
        ),
      )..payoutEcho = const OrganizerPayoutProfile(
          pixKey: '+5562999990000',
          pixKeyType: 'PHONE',
          hasPixKey: true,
        );
      addTearDown(repo.closeLive);

      await abrirTela(tester, repo);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chave PIX de repasse'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'novo@nexago.app');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salvar'));
      await tester.pumpAndSettle();

      // O servidor normaliza (telefone ganha `+55`): é o eco dele que fica na
      // tela, não o que foi digitado.
      expect(find.textContaining('+5562999990000'), findsOneWidget);
      expect(find.textContaining('novo@nexago.app'), findsNothing);
    });
  });

  testWidgets('recarga que falha sobre dado carregado avisa em vez de '
      'esconder a tela', (tester) async {
    // `AsyncError.copyWithPrevious` preserva `hasValue`, então uma guarda
    // `hasError && !hasValue` nunca veria este caso: o saldo cairia pelo
    // listener do Firestore e o extrato ficaria velho, sem ninguém avisar.
    final repo = _FakeWalletRepository(
      load: (_) => vista(
        caixas: [caixa('a', 'Etapa Aurora', disponivel: 1000)],
        selecionado: caixa('a', 'Etapa Aurora', disponivel: 1000),
        payout: payoutComChave,
      ),
    );
    addTearDown(repo.closeLive);

    await abrirTela(tester, repo);
    await tester.pumpAndSettle();

    // 1o saque: fixa a selecao no caixa e recarrega com sucesso.
    await tester.enterText(find.byType(TextField), '20');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Solicitar saque'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // 2o saque com o servidor fora: a recarga da MESMA chave falha.
    repo.loadError = Exception('deadline exceeded');
    await tester.enterText(find.byType(TextField), '20');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Solicitar saque'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.textContaining('podem estar desatualizados'), findsOneWidget);
    // O erro e aviso, nao substituicao: os numeros que a pessoa tinha ficam.
    expect(find.byType(AppErrorView), findsNothing);
    expect(find.text('Disponível para saque'), findsOneWidget);
  });

  testWidgets('vista nova manda no destino: eco local nao envelhece na tela',
      (tester) async {
    // A chave e da PESSOA e pode mudar em outro lugar (portal, outro
    // aparelho). Se o eco do ultimo save vencesse toda recarga, este card —
    // que diz PARA ONDE o dinheiro vai — ficaria afirmando a chave antiga.
    late _FakeWalletRepository repo;
    repo = _FakeWalletRepository(
      load: (_) => vista(
        caixas: [caixa('a', 'Etapa Aurora', disponivel: 1000)],
        selecionado: caixa('a', 'Etapa Aurora', disponivel: 1000),
        payout: repo.payoutCalls.isEmpty
            ? payoutComChave
            : const OrganizerPayoutProfile(
                pixKey: 'portal@nexago.app',
                pixKeyType: 'EMAIL',
                hasPixKey: true,
              ),
      ),
    )..payoutEcho = const OrganizerPayoutProfile(
        pixKey: '+5562999990000',
        pixKeyType: 'PHONE',
        hasPixKey: true,
      );
    addTearDown(repo.closeLive);

    await abrirTela(tester, repo);
    await tester.pumpAndSettle();
    expect(find.textContaining('antigo@nexago.app'), findsOneWidget);

    // Salva: o eco do servidor aparece na hora.
    await tester.tap(find.text('Chave PIX de repasse'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == 'Chave',
      ),
      'novo@nexago.app',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();
    expect(find.textContaining('+5562999990000'), findsOneWidget);

    // Um saque recarrega a vista, que traz o perfil atual do servidor.
    await tester.enterText(find.byType(TextField), '100');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Solicitar saque'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.textContaining('portal@nexago.app'), findsOneWidget);
    expect(find.textContaining('+5562999990000'), findsNothing);
  });

  testWidgets('extrato nomeia a dupla que pagou', (tester) async {
    // A callable paga uma leitura de inscricao para resolver esse rotulo
    // (`resolveLedgerAthleteLabels`); o app vinha jogando fora.
    final repo = _FakeWalletRepository(
      load: (_) => vista(
        caixas: [caixa('a', 'Etapa Aurora', disponivel: 1000)],
        selecionado: caixa('a', 'Etapa Aurora', disponivel: 1000),
        payout: payoutComChave,
        ledger: [
          OrganizerLedgerEntry(
            id: 'l1',
            netReais: 100,
            grossReais: 106.38,
            platformFeeReais: 6.38,
            createdAt: DateTime(2026, 9, 10),
            athleteLabel: 'Ana & Bia',
          ),
        ],
      ),
    );
    addTearDown(repo.closeLive);

    await abrirTela(tester, repo);
    await tester.pumpAndSettle();

    // O extrato fica no fim da lista: sem rolar, a ListView nem constroi a
    // linha.
    await tester.scrollUntilVisible(
      find.text('Ana & Bia'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(find.text('Ana & Bia'), findsOneWidget);
    expect(find.text('+ ${formatBRL(100)}'), findsOneWidget);
  });

  testWidgets('depois do saque a tela continua no MESMO caixa', (tester) async {
    final aurora = caixa('a', 'Etapa Aurora', disponivel: 1000);
    final boreal = caixa('b', 'Etapa Boreal', disponivel: 800);
    // O servidor, sem `tournamentId`, devolve o caixa mais cheio. Depois do
    // saque o disponível de Aurora vira pendente, então uma recarga sem id
    // passaria a devolver Boreal — a tela trocaria de evento sozinha.
    final auroraSacada = caixa('a', 'Etapa Aurora', pendente: 1000);
    late _FakeWalletRepository repo;
    repo = _FakeWalletRepository(
      load: (tournamentId) {
        final sacou = repo.withdrawalCalls.isNotEmpty;
        final aurorAtual = sacou ? auroraSacada : aurora;
        final caixas = [aurorAtual, boreal];
        if (tournamentId == 'b') {
          return vista(
            caixas: caixas,
            selecionado: boreal,
            payout: payoutComChave,
          );
        }
        if (tournamentId == 'a') {
          return vista(
            caixas: caixas,
            selecionado: aurorAtual,
            payout: payoutComChave,
          );
        }
        // Sem id: o mais cheio de agora.
        return vista(
          caixas: caixas,
          selecionado: sacou ? boreal : aurora,
          payout: payoutComChave,
        );
      },
    );
    addTearDown(repo.closeLive);

    await abrirTela(tester, repo);
    await tester.pumpAndSettle();
    expect(repo.loadCalls, [null]);
    expect(find.text('Etapa Aurora'), findsOneWidget);
    expect(find.text('Etapa Boreal'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '1000');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Solicitar saque'));
    // A recarga fixa a seleção numa chave nova da família, então a tela passa
    // pelo loader: `pump` com duração, nunca `pumpAndSettle`.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));

    // O saque saiu do caixa em exibição...
    expect(repo.withdrawalCalls.single.tournamentId, 'a');
    expect(repo.withdrawalCalls.single.amountReais, 1000);
    // ...e a recarga pediu ESTE caixa, não "o mais cheio de agora". Com a
    // chave vazia o servidor devolveria Etapa Boreal e a tela trocaria de
    // evento: saldo subindo, extrato de outro torneio e o próximo saque
    // saindo do caixa errado.
    expect(repo.loadCalls.last, 'a');
    expect(find.text('${formatBRL(1000)} em processamento'), findsOneWidget);
  });
}
