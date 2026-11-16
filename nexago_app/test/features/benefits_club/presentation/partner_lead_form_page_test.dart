import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/partner_lead.dart';

import '../support/benefits_club_fakes.dart';

const _submit = Key('benefits-lead-submit');

Future<GoRouter> _pumpForm(
  WidgetTester tester, {
  required FakeBenefitsClubService service,
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = benefitsTestRouter(
    '/athlete/clube/linq/contratar?origem=hub_card',
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: benefitsOverrides(
        service: service,
        config: const BenefitsClubConfig(testerUids: [testUid]),
      ),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

FilledButton _button(WidgetTester tester) =>
    tester.widget<FilledButton>(find.byKey(_submit));

Finder _field(String key) =>
    find.descendant(of: find.byKey(Key(key)), matching: find.byType(TextField));

void main() {
  testWidgets('nome e WhatsApp vêm do perfil e Enviar só habilita com o '
      'consentimento', (tester) async {
    final service = FakeBenefitsClubService();
    await _pumpForm(tester, service: service);

    expect(find.text('Quero contratar'), findsOneWidget);
    expect(find.text('DO SEU PERFIL'), findsNWidgets(2));
    expect(find.text('Silvio Dionizio'), findsOneWidget);
    expect(find.text('(62) 98240-6456'), findsOneWidget);
    expect(
      find.textContaining(
        defaultConsentText('LinQ Telecom'),
        findRichText: true,
      ),
      findsOneWidget,
    );

    expect(_button(tester).onPressed, isNull);
    await tester.tap(find.byKey(const Key('benefits-lead-consent')));
    await tester.pump();
    expect(_button(tester).onPressed, isNotNull);

    await tester.tap(find.byKey(const Key('benefits-lead-consent')));
    await tester.pump();
    expect(_button(tester).onPressed, isNull, reason: 'desmarcou, desabilita');
    expect(service.leads, isEmpty);
  });

  testWidgets(
    'valida como o backend e, enviado, mostra o Pronto! com o resumo',
    (tester) async {
      final service = FakeBenefitsClubService();
      await _pumpForm(tester, service: service);

      await tester.tap(find.byKey(const Key('benefits-lead-consent')));
      await tester.pump();
      await tester.tap(find.byKey(_submit));
      await tester.pump();
      expect(find.text('Informe seu bairro.'), findsOneWidget);
      expect(service.leads, isEmpty);

      await tester.enterText(
        _field('benefits-lead-neighborhood'),
        'Setor Bueno',
      );
      await tester.enterText(_field('benefits-lead-cep'), '74230010');
      expect(find.text('74230-010'), findsOneWidget, reason: 'máscara do CEP');

      await tester.tap(find.byKey(_submit));
      await tester.pumpAndSettle();

      final lead = service.leads.single;
      expect(lead.partnerId, 'linq');
      expect(lead.name, 'Silvio Dionizio');
      expect(lead.whatsapp, '5562982406456');
      expect(lead.neighborhood, 'Setor Bueno');
      expect(lead.cep, '74230010');
      expect(lead.source, BenefitSource.hubCard);

      expect(find.text('Pronto!'), findsOneWidget);
      expect(
        find.text('A LinQ vai falar com você pelo WhatsApp.'),
        findsOneWidget,
      );
      expect(find.text('LinQ Telecom'), findsOneWidget);
      expect(find.text('(62) 98240-6456'), findsOneWidget);
      expect(find.text('Setor Bueno'), findsOneWidget);
      expect(
        find.byKey(const Key('benefits-lead-back-to-club')),
        findsOneWidget,
      );
    },
  );

  testWidgets('"Voltar ao clube" tira o formulário e o parceiro da pilha', (
    tester,
  ) async {
    final service = FakeBenefitsClubService();
    await tester.binding.setSurfaceSize(const Size(430, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final router = benefitsTestRouter('/athlete/clube?origem=hub_card');
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: benefitsOverrides(
          service: service,
          config: const BenefitsClubConfig(testerUids: [testUid]),
        ),
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('benefits-sponsor-banner')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('benefits-partner-cta')));
    await tester.pumpAndSettle();
    await tester.enterText(_field('benefits-lead-neighborhood'), 'Setor Bueno');
    await tester.enterText(_field('benefits-lead-cep'), '74230-010');
    await tester.tap(find.byKey(const Key('benefits-lead-consent')));
    await tester.pump();
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();
    expect(find.text('Pronto!'), findsOneWidget);

    await tester.tap(find.byKey(const Key('benefits-lead-back-to-club')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('benefits-sponsor-banner')), findsOneWidget);
    expect(find.text('Pronto!'), findsNothing);
    expect(find.text('COMO FUNCIONA'), findsNothing);
    expect(service.leads.single.source, BenefitSource.hubCard);
    expect(service.events.map((e) => e.source).toSet(), {
      BenefitSource.hubCard,
    }, reason: 'a visita inteira carrega a origem do card do Hub');
  });

  testWidgets('erro da callable aparece amigável e o formulário continua', (
    tester,
  ) async {
    final service = FakeBenefitsClubService()
      ..leadError = Exception('Parceiro não encontrado.');
    await _pumpForm(tester, service: service);

    await tester.enterText(_field('benefits-lead-neighborhood'), 'Setor Bueno');
    await tester.enterText(_field('benefits-lead-cep'), '74230-010');
    await tester.tap(find.byKey(const Key('benefits-lead-consent')));
    await tester.pump();
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(
      find.text('Não foi possível enviar seus dados. Parceiro não encontrado.'),
      findsOneWidget,
    );
    expect(find.text('Pronto!'), findsNothing);
    expect(_button(tester).onPressed, isNotNull);
  });
}
