import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_providers.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/steps/tournament_create_registration_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_form_widgets.dart';

/// Cobertura da regra: a janela de inscrição (ABREM EM / FECHAM EM) agora
/// captura data E hora — `_pickDate` encadeia `showDatePicker` +
/// `showTimePicker` e só grava no draft quando os DOIS forem confirmados.
///
/// Dirige os pickers nativos do Material de verdade (sem mockar), então os
/// testes aqui também garantem que a integração com o `showDatePicker`/
/// `showTimePicker` do framework continua funcionando.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  late ProviderContainer container;

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          // Força formato 24h: sem isso o time picker abre com seletor
          // AM/PM e o modo texto espera 1-12 em vez de 0-23.
          builder: (context, child) => MediaQuery(
            data:
                MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
            child: child!,
          ),
          home: Builder(
            builder: (context) {
              container = ProviderScope.containerOf(context);
              return const TournamentCreateRegistrationPage();
            },
          ),
        ),
      ),
    );
    await tester.pump(); // primeiro frame
  }

  Finder dateFieldInkWell(String label) => find.descendant(
        of: find.byWidgetPredicate(
          (widget) => widget is OrganizerDateField && widget.label == label,
        ),
        matching: find.byType(InkWell),
      );

  /// Abre o campo [fieldLabel], escolhe o dia [day] do mês corrente no
  /// calendário e confirma; em seguida troca o time picker pro modo de
  /// entrada por teclado e digita [hour]:[minute], confirmando os dois
  /// diálogos. Usa apenas `pump()` sem duração (nunca `pumpAndSettle`) pra
  /// não deixar o relógio falso avançar 400ms e disparar o timer de
  /// persistência do wizard (que bateria em `FirebaseAuth.instance` sem
  /// Firebase inicializado no teste).
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

  /// Igual ao fluxo acima, mas cancela o time picker em vez de confirmar —
  /// cobre o early-return de `_pickDate` quando `pickedTime == null`.
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

      final draft = container.read(tournamentCreateDraftProvider);
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

      final draft = container.read(tournamentCreateDraftProvider);
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

      final draft = container.read(tournamentCreateDraftProvider);
      expect(draft.registrationOpensAt, isNull);
      expect(find.text('—'), findsWidgets); // placeholder ainda visível

      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'toggle "Exigir dupla já formada" liga requireFormedPair no draft',
    (tester) async {
      await pumpPage(tester);

      expect(
        container.read(tournamentCreateDraftProvider).requireFormedPair,
        isFalse,
      );

      final row = find.byWidgetPredicate(
        (widget) =>
            widget is OrganizerToggleSettingRow &&
            widget.title == 'Exigir dupla já formada',
      );
      expect(row, findsOneWidget);

      await tester.ensureVisible(row);
      await tester.pump();
      await tester.tap(find.descendant(of: row, matching: find.byType(Switch)));
      await tester.pump();

      expect(
        container.read(tournamentCreateDraftProvider).requireFormedPair,
        isTrue,
      );

      await tester.pumpWidget(const SizedBox());
    },
  );
}
