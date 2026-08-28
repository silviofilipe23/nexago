import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/league_stage_create/league_stage_create_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';
import 'package:nexago_app/features/organizer/presentation/league_stage_create/steps/league_stage_create_categories_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_form_widgets.dart';

/// Cobertura da regra: a janela de inscrição da etapa de liga (ABREM EM /
/// FECHAM EM) também captura data E hora — mesmo padrão do
/// `tournament_create_registration_page.dart`, mas gravando em
/// `leagueStageCreateWizardProvider`.
///
/// A página lê `leagueId` via `GoRouterState.of(context)`, então o teste
/// precisa de um `GoRouter` de verdade. A rota de teste NÃO tem o parâmetro
/// `leagueId` de propósito: isso faz `leagueIdFromRoute` devolver `''`, o
/// que faz o `initState` retornar cedo (sem tentar carregar a liga do
/// Firestore nem restaurar sessão local — nenhum dos dois está disponível
/// neste teste).
void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  late ProviderContainer container;

  Future<void> pumpPage(WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: '/categories',
      routes: [
        GoRoute(
          path: '/categories',
          builder: (context, state) {
            container = ProviderScope.containerOf(context);
            return const LeagueStageCreateCategoriesPage();
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(
          theme: AppTheme.dark,
          routerConfig: router,
          // Força formato 24h: sem isso o time picker abre com seletor
          // AM/PM e o modo texto espera 1-12 em vez de 0-23.
          builder: (context, child) => MediaQuery(
            data:
                MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
            child: child!,
          ),
        ),
      ),
    );
    await tester.pump(); // primeiro frame
    await tester.pump(); // postFrameCallback do initState (leagueId vazio)
  }

  Finder dateFieldInkWell(String label) => find.descendant(
        of: find.byWidgetPredicate(
          (widget) => widget is OrganizerDateField && widget.label == label,
        ),
        matching: find.byType(InkWell),
      );

  /// Ver documentação equivalente em
  /// `tournament_create_registration_page_test.dart`: só `pump()` sem
  /// duração, nunca `pumpAndSettle`, pra não disparar o timer de
  /// persistência (400ms) do wizard em cima de um `FirebaseAuth.instance`
  /// não inicializado neste teste.
  Future<void> pickDateAndTime(
    WidgetTester tester, {
    required String fieldLabel,
    required int day,
    required int hour,
    required int minute,
  }) async {
    await tester.tap(dateFieldInkWell(fieldLabel));
    await tester.pump();

    await tester.tap(find.text('$day'));
    await tester.pump();
    await tester.tap(find.text('OK'));
    await tester.pump();
    await tester.pump();

    // Time picker abre em modo relógio (dial); troca pra texto.
    await tester.tap(find.byIcon(Icons.keyboard_outlined));
    await tester.pump();

    final hourMinuteFields = find.byType(TextFormField);
    await tester.enterText(hourMinuteFields.at(0), '$hour');
    await tester.pump();
    await tester.enterText(hourMinuteFields.at(1), '$minute');
    await tester.pump();

    await tester.tap(find.text('OK'));
    await tester.pump();
    await tester.pump();
  }

  /// Cancela o time picker em vez de confirmar — cobre o early-return de
  /// `_pickDate` quando `pickedTime == null`.
  Future<void> pickDateThenCancelTime(
    WidgetTester tester, {
    required String fieldLabel,
    required int day,
  }) async {
    await tester.tap(dateFieldInkWell(fieldLabel));
    await tester.pump();

    await tester.tap(find.text('$day'));
    await tester.pump();
    await tester.tap(find.text('OK'));
    await tester.pump();
    await tester.pump();

    await tester.tap(find.text('Cancel'));
    await tester.pump();
    await tester.pump();
  }

  testWidgets(
    'ABREM EM: escolher data e hora grava os dois componentes em '
    'registrationOpensAt e mostra data+hora no campo',
    (tester) async {
      await pumpPage(tester);
      final now = DateTime.now();

      await pickDateAndTime(
        tester,
        fieldLabel: 'ABREM EM',
        day: 10,
        hour: 14,
        minute: 30,
      );

      final draft = container.read(leagueStageCreateDraftProvider);
      final expected = DateTime(now.year, now.month, 10, 14, 30);
      expect(draft.registrationOpensAt, expected);
      expect(draft.registrationClosesAt, isNull); // campo irmão intocado

      expect(find.text(formatShortDateTime(expected)), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'FECHAM EM: escolher data e hora grava os dois componentes em '
    'registrationClosesAt e mostra data+hora no campo',
    (tester) async {
      await pumpPage(tester);
      final now = DateTime.now();

      await pickDateAndTime(
        tester,
        fieldLabel: 'FECHAM EM',
        day: 12,
        hour: 9,
        minute: 5,
      );

      final draft = container.read(leagueStageCreateDraftProvider);
      final expected = DateTime(now.year, now.month, 12, 9, 5);
      expect(draft.registrationClosesAt, expected);
      expect(draft.registrationOpensAt, isNull); // campo irmão intocado

      expect(find.text(formatShortDateTime(expected)), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'cancelar o time picker (após escolher a data) NÃO atualiza o draft',
    (tester) async {
      await pumpPage(tester);

      await pickDateThenCancelTime(
        tester,
        fieldLabel: 'ABREM EM',
        day: 10,
      );

      final draft = container.read(leagueStageCreateDraftProvider);
      expect(draft.registrationOpensAt, isNull);
      expect(find.text('—'), findsWidgets); // placeholder ainda visível

      await tester.pumpWidget(const SizedBox());
    },
  );
}
