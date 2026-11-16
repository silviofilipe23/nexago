import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/presentation/partner_lead_form_page.dart';

import '../support/benefits_club_fakes.dart';

const _urlLauncherChannel = MethodChannel('plugins.flutter.io/url_launcher');

Future<GoRouter> _pumpPartner(
  WidgetTester tester, {
  required FakeBenefitsClubService service,
  required String location,
  BenefitsClubConfig config = const BenefitsClubConfig(
    enabled: true,
    testerUids: [testUid],
  ),
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = benefitsTestRouter(location);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: benefitsOverrides(service: service, config: config),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets(
    'parceiro de link: benefício, cupom copiável, passos e o botão abre o '
    'site com UTMs, tudo com a origem da visita',
    (tester) async {
      final service = FakeBenefitsClubService();
      String? copied;
      String? launched;
      final messenger = tester.binding.defaultBinaryMessenger;
      messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') {
          copied = (call.arguments as Map)['text'] as String?;
        }
        return null;
      });
      messenger.setMockMethodCallHandler(_urlLauncherChannel, (call) async {
        if (call.method == 'launch') {
          launched = (call.arguments as Map)['url'] as String?;
        }
        return true;
      });
      addTearDown(() {
        messenger.setMockMethodCallHandler(SystemChannels.platform, null);
        messenger.setMockMethodCallHandler(_urlLauncherChannel, null);
      });

      await _pumpPartner(
        tester,
        service: service,
        location: '/athlete/clube/fast-acai?origem=hub_card',
      );

      expect(find.text('Fast Açaí'), findsOneWidget);
      expect(find.text('ALIMENTAÇÃO'), findsOneWidget);
      expect(find.text('10% OFF'), findsOneWidget);
      expect(find.text('10% de desconto em todo pedido'), findsOneWidget);
      expect(find.text('NEXAGO10'), findsOneWidget);
      expect(find.text('COMO USAR'), findsOneWidget);
      expect(find.text('Abre o site da Fast Açaí'), findsOneWidget);
      expect(find.text('Patrocinador oficial'.toUpperCase()), findsNothing);
      expect(service.of(BenefitEventType.partnerView).single, (
        type: BenefitEventType.partnerView,
        source: BenefitSource.hubCard,
        partnerId: 'fast-acai',
      ));

      await tester.tap(find.byKey(const Key('benefits-copy-coupon')));
      await tester.pump();
      expect(copied, 'NEXAGO10');
      expect(find.text('Cupom copiado'), findsOneWidget);
      expect(
        service.of(BenefitEventType.codeCopy).single.source,
        BenefitSource.hubCard,
      );

      expect(find.text('Não cumulativo com outras promoções.'), findsNothing);
      await tester.tap(find.byKey(const Key('benefits-terms-toggle')));
      await tester.pump();
      expect(find.text('Não cumulativo com outras promoções.'), findsOneWidget);

      await tester.tap(find.byKey(const Key('benefits-partner-cta')));
      await tester.pumpAndSettle();
      expect(service.of(BenefitEventType.ctaClick).single, (
        type: BenefitEventType.ctaClick,
        source: BenefitSource.hubCard,
        partnerId: 'fast-acai',
      ));
      expect(
        launched,
        'https://fast.example/cardapio?loja=12&utm_source=nexago'
        '&utm_medium=app&utm_campaign=clube_vantagens&ref=NEXA-ABCD',
      );
    },
  );

  testWidgets('parceiro de formulário: selo oficial e o botão abre o '
      'formulário com a mesma origem', (tester) async {
    final service = FakeBenefitsClubService();
    await _pumpPartner(
      tester,
      service: service,
      location: '/athlete/clube/linq?origem=hub_card',
    );

    expect(find.text('PATROCINADOR OFICIAL'), findsOneWidget);
    expect(find.text('COMO FUNCIONA'), findsOneWidget);
    expect(find.byKey(const Key('benefits-copy-coupon')), findsNothing);
    expect(
      find.text('Seus dados só vão para a LinQ Telecom com a sua autorização'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('benefits-partner-cta')));
    await tester.pumpAndSettle();
    final form = tester.widget<PartnerLeadFormPage>(
      find.byType(PartnerLeadFormPage),
    );
    expect(form.partnerId, 'linq');
    expect(form.source, BenefitSource.hubCard);
    expect(find.text('Enviar'), findsOneWidget);
    expect(
      service.of(BenefitEventType.ctaClick).single.source,
      BenefitSource.hubCard,
    );
  });

  testWidgets(
    'parceiro de teste para quem não testa = indisponível, sem evento',
    (tester) async {
      final service = FakeBenefitsClubService();
      await _pumpPartner(
        tester,
        service: service,
        location: '/athlete/clube/linq',
        config: const BenefitsClubConfig(enabled: true),
      );

      expect(find.text('Benefício indisponível'), findsOneWidget);
      expect(service.of(BenefitEventType.partnerView), isEmpty);
    },
  );
}
