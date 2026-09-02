import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/registration_wizard/registration_uniform_page.dart';

/// Testes da tela 5 do wizard de inscrição: uniforme.
///
/// O harness segue `registration_partner_page_test.dart` (torneio de uma
/// categoria só, rotas-alvo que capturam o `state` da navegação). Duas
/// diferenças: `firebaseAuthProvider` com `MockFirebaseAuth` (o bloco de
/// uniforme copiado da tela única lê o uid via `authServiceProvider`, não via
/// `authProvider`) e `tournamentRegistrationSnapshotProvider(registrationId)`
/// SEMPRE dublado — `registrationId` é obrigatório nesta tela (o wizard só
/// chega no passo de uniforme depois de existir inscrição).
///
/// `dupla()` aqui exige nome na camisa por padrão (`uniformNameOnShirt:
/// true`) — é o único campo do uniforme sem valor-padrão sempre válido:
/// tamanho sempre cai num tamanho da lista da categoria, e número sempre cai
/// em 10. Sem um perfil com nome (`athleteProfileProvider` dublado com
/// `null`), o passo abre incompleto de verdade, e é isso que os testes de
/// CTA travado precisam para não testar um estado inatingível.
void main() {
  const meuUid = 'atleta-1';
  const parceiroUid = 'parceiro-1';
  const registrationId = 'reg-1';

  TournamentCategoryOffer dupla({
    String id = 'masc',
    String name = 'Dupla Masculina',
    String genderType = 'male',
    double entryFee = 100,
    int maxTeams = 8,
    String? uniformType,
    bool uniformNameOnShirt = true,
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    genderType: genderType,
    entryFee: entryFee,
    maxTeams: maxTeams,
    spotsTotal: maxTeams,
    spotsLeft: maxTeams,
    uniformType: uniformType,
    uniformNameOnShirt: uniformNameOnShirt,
  );

  TournamentDetail torneio(
    List<TournamentCategoryOffer> categorias, {
    String name = 'Copa de Teste',
    DateTime? registrationClosesAt,
  }) => TournamentDetail(
    id: 't1',
    name: name,
    location: 'Arena Teste',
    city: 'Goiânia',
    dateLabel: '20–22 Ago',
    startDate: DateTime(2026, 8, 20),
    endDate: DateTime(2026, 8, 22),
    categories: const [],
    format: TournamentFormat.dupla,
    priceLabel: 'R\$ 100',
    priceValue: 100,
    spotsLeft: 8,
    spotsTotal: 8,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
    categoryOffers: categorias,
    sport: 'beachTennis',
    registrationClosesAt: registrationClosesAt,
  );

  /// Snapshot da dupla (eu + parceiro-1). O MEU uniforme começa sempre vazio
  /// de propósito — os três testes do brief não mexem no formulário, então
  /// só a hidratação (a partir de `stored`) decide o estado do CTA, nunca uma
  /// escolha feita durante o teste.
  ///
  /// `partnerPending` controla só o uniforme do PARCEIRO: completo por
  /// padrão (`sizeTop` + `jerseyName`), vazio quando `true`.
  TournamentRegistrationSnapshot snapshot({bool partnerPending = false}) =>
      TournamentRegistrationSnapshot(
        registrationId: registrationId,
        isPaid: false,
        paidAmount: 0,
        player1Id: meuUid,
        participantUids: const [meuUid, parceiroUid],
        uniformPlayer1: const TournamentUniformSelection(),
        uniformPlayer2: partnerPending
            ? const TournamentUniformSelection()
            : const TournamentUniformSelection(
                sizeTop: 'M',
                jerseyName: 'Parceiro',
              ),
      );

  late List<String> rotasAbertas;
  late Map<String, String>? destinoQueryParams;
  late _FakeInviteService servico;

  Future<void> abrirTela(
    WidgetTester tester, {
    required TournamentDetail tournament,
    String categoryId = 'masc',
    String registrationIdParam = registrationId,
    TournamentRegistrationSnapshot? snap,
  }) async {
    // Tela alta o bastante pra montar o passo de uniforme inteiro (herói +
    // tamanho + shorts/número/nome + selo) — o viewport padrão do teste corta
    // antes disso, como nas telas irmãs.
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    rotasAbertas = <String>[];
    destinoQueryParams = null;
    servico = _FakeInviteService();

    final router = GoRouter(
      initialLocation: '/inscricao',
      routes: [
        GoRoute(
          path: '/inscricao',
          builder: (_, __) => RegistrationUniformPage(
            tournamentId: 't1',
            categoryId: categoryId,
            registrationId: registrationIdParam,
          ),
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao/pagamento',
          name: AppRouteNames.tournamentRegistrationPayment,
          builder: (_, state) {
            rotasAbertas.add('pagamento');
            destinoQueryParams = Map.of(state.uri.queryParameters);
            return const Scaffold(body: Text('pagamento'));
          },
        ),
        GoRoute(
          path: '/torneios/:tournamentId',
          name: AppRouteNames.tournamentDetail,
          builder: (_, __) {
            rotasAbertas.add('detalhe');
            return const Scaffold(body: Text('detalhe'));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    final auth = MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(uid: meuUid, displayName: 'Eu Mesmo'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(auth),
          // Sem nome no perfil: `_applyUniformDefaults` não tem de onde tirar
          // o nome na camisa, e o passo abre de fato incompleto.
          athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
          tournamentDetailProvider(
            't1',
          ).overrideWith((ref) => Stream.value(tournament)),
          tournamentPartnerInviteServiceProvider.overrideWithValue(servico),
          tournamentRegistrationSnapshotProvider(
            registrationIdParam,
          ).overrideWith((ref) => Stream.value(snap)),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  // ── Step 1 do brief: os 3 testes que abrem a task ────────────────────────

  testWidgets('CTA trava enquanto o uniforme está incompleto', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(uniformType: 'top_only')]),
      snap: snapshot(),
    );

    // A categoria exige tamanho; sem escolha gravada o passo não fecha.
    final botao = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(botao.onPressed, isNull);
  });

  testWidgets('mostra o prazo de alteração quando o torneio tem prazo', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio(
        [dupla(uniformType: 'top_only')],
        registrationClosesAt: DateTime(2026, 7, 8, 23, 59),
      ),
      snap: snapshot(),
    );

    expect(
      find.textContaining('podem ser alterados até qua, 08 jul · 23h59'),
      findsOneWidget,
    );
  });

  testWidgets('mostra a pendência do uniforme do parceiro', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(uniformType: 'top_only')]),
      snap: snapshot(partnerPending: true),
    );

    expect(find.text('PENDENTE'), findsOneWidget);
    expect(find.text('Uniforme do parceiro'), findsOneWidget);
  });

  testWidgets(
    'em elenco trio+ a linha fala do ELENCO, não de "o parceiro"',
    (tester) async {
      // "Uniforme do parceiro" é impreciso quando são vários: a linha resume
      // o estado de TODOS os demais integrantes.
      await abrirTela(
        tester,
        tournament: torneio([
          TournamentCategoryOffer(
            id: 'quarteto',
            name: 'Quarteto Livre',
            genderType: '',
            entryFee: 400,
            maxTeams: 8,
            spotsTotal: 8,
            spotsLeft: 8,
            teamSize: 4,
            uniformType: 'top_only',
          ),
        ]),
        categoryId: 'quarteto',
        snap: snapshot(partnerPending: true),
      );

      expect(find.text('Uniforme do restante do elenco'), findsOneWidget);
      expect(find.text('Uniforme do parceiro'), findsNothing);
    },
  );

  // ── prazo ausente ────────────────────────────────────────────────────────

  testWidgets('sem registrationClosesAt a linha do prazo não aparece', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(uniformType: 'top_only')]),
      snap: snapshot(),
    );

    expect(find.textContaining('podem ser alterados até'), findsNothing);
  });

  // ── parceiro com uniforme completo ──────────────────────────────────────

  testWidgets('parceiro com uniforme completo mostra COMPLETO', (
    tester,
  ) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(uniformType: 'top_only')]),
      snap: snapshot(),
    );

    expect(find.text('COMPLETO'), findsOneWidget);
    expect(find.text('PENDENTE'), findsNothing);
  });

  // ── CTA destrava quando a escolha fica completa ─────────────────────────

  testWidgets(
    'escolher um nome para a camisa destrava o CTA e ele leva para o '
    'pagamento com o registrationId da rota',
    (tester) async {
      await abrirTela(
        tester,
        tournament: torneio([dupla(uniformType: 'top_only')]),
        snap: snapshot(),
      );

      // Antes de preencher, o CTA está travado (mesma asserção do 1º teste).
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );

      await tester.enterText(find.byType(TextFormField), 'Bruno');
      await tester.pumpAndSettle();

      final botao = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(botao.onPressed, isNotNull);

      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();

      // Pode ter 1 ou 2 chamadas: o autosave (debounce de 600ms, que o
      // `pumpAndSettle` acima pode ter atravessado) grava a MESMA escolha
      // que o CTA também grava explicitamente antes de navegar — a garantia
      // que importa é a ÚLTIMA gravação carregar o registrationId certo.
      expect(servico.setUniformCalls, isNotEmpty);
      expect(servico.setUniformCalls.last.registrationId, registrationId);
      expect(rotasAbertas, contains('pagamento'));
      expect(destinoQueryParams?['registrationId'], registrationId);
      expect(destinoQueryParams?['categoryId'], 'masc');
    },
  );
}

/// Dublê de `TournamentPartnerInviteService`: registra as chamadas em vez de
/// tocar no Firebase. Mesmo padrão de `registration_partner_page_test.dart`.
class _FakeInviteService implements TournamentPartnerInviteService {
  final setUniformCalls =
      <({String registrationId, TournamentUniformSelection uniform})>[];

  @override
  Future<void> setRegistrationUniform({
    required String registrationId,
    required TournamentUniformSelection uniform,
  }) async {
    setUniformCalls.add((registrationId: registrationId, uniform: uniform));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê não implementa ${invocation.memberName}. '
      'Se a tela passou a usar este método, cubra-o aqui.',
    );
  }
}
