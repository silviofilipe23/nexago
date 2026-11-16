import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';
import 'package:nexago_app/features/benefits_club/domain/benefits_club_config.dart';
import 'package:nexago_app/features/benefits_club/domain/my_benefits.dart';
import 'package:nexago_app/features/benefits_club/presentation/benefit_partner_page.dart';
import 'package:nexago_app/features/benefits_club/presentation/my_benefits_page.dart';

import '../support/benefits_club_fakes.dart';

Future<GoRouter> _pumpMine(
  WidgetTester tester, {
  required FakeBenefitsClubService service,
  FakeBenefitsClubRepository? repository,
  String location = '/athlete/clube/meus',
}) async {
  await tester.binding.setSurfaceSize(const Size(430, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = benefitsTestRouter(location);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: benefitsOverrides(
        service: service,
        config: const BenefitsClubConfig(enabled: true, testerUids: [testUid]),
        repository: repository,
      ),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets('a rota literal /meus abre a tela (não vira id de parceiro)', (
    tester,
  ) async {
    await _pumpMine(tester, service: FakeBenefitsClubService());
    expect(find.byType(MyBenefitsPage), findsOneWidget);
    expect(find.byType(BenefitPartnerPage), findsNothing);
  });

  testWidgets('Usados com o status da resposta, sem economia confirmada', (
    tester,
  ) async {
    final service = FakeBenefitsClubService(
      myBenefits: MyBenefits(
        uses: [
          BenefitUse(
            partnerId: 'fast-acai',
            useCount: 3,
            lastUsedAt: DateTime(2026, 11, 12, 20),
            lastAnswer: BenefitUseAnswer.used,
          ),
          BenefitUse(
            partnerId: 'linq',
            useCount: 1,
            lastUsedAt: DateTime(2026, 11, 10, 9),
          ),
          // Parceiro que saiu do clube não aparece.
          const BenefitUse(partnerId: 'sumiu', useCount: 2),
        ],
      ),
    );
    await _pumpMine(tester, service: service);

    expect(find.text('Meus benefícios'), findsOneWidget);
    expect(find.byKey(const Key('benefits-used-fast-acai')), findsOneWidget);
    expect(find.text('Usado 3 vezes · último em 12/11'), findsOneWidget);
    expect(find.text('Deu certo'), findsOneWidget);
    expect(find.byKey(const Key('benefits-used-linq')), findsOneWidget);
    expect(find.text('Contato enviado em 10/11'), findsOneWidget);
    expect(find.text('Sem resposta'), findsOneWidget);
    expect(find.byKey(const Key('benefits-used-sumiu')), findsNothing);
    expect(find.byKey(const Key('benefits-mine-savings')), findsNothing);
    expect(find.textContaining('Economia'), findsNothing);
  });

  testWidgets('economia confirmada aparece com o valor real', (tester) async {
    await _pumpMine(
      tester,
      service: FakeBenefitsClubService(
        myBenefits: const MyBenefits(
          savings: BenefitSavings(confirmedCount: 3, totalDiscountCents: 4590),
        ),
      ),
    );

    expect(find.byKey(const Key('benefits-mine-savings')), findsOneWidget);
    expect(find.textContaining('45,90'), findsOneWidget);
    expect(find.text('em 3 resgates confirmados'), findsOneWidget);
    expect(find.text('Valores confirmados pelos parceiros.'), findsOneWidget);
  });

  testWidgets('Salvos vazio mostra o estado do desenho; com salvo, abre o '
      'parceiro com a origem my_benefits', (tester) async {
    final repository = FakeBenefitsClubRepository();
    final service = FakeBenefitsClubService();
    await _pumpMine(tester, service: service, repository: repository);

    // Usados vazio.
    expect(find.text('Nenhum benefício usado ainda'), findsOneWidget);

    await tester.tap(find.byKey(const Key('benefits-tab-saved')));
    await tester.pumpAndSettle();
    expect(find.text('Nada salvo ainda'), findsOneWidget);
    expect(
      find.text(
        'Toque no coração de um parceiro para guardar aqui. A gente avisa '
        'antes da oferta acabar.',
      ),
      findsOneWidget,
    );

    await repository.setSaved(
      uid: testUid,
      partnerId: 'fast-acai',
      saved: true,
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('benefits-saved-fast-acai')), findsOneWidget);

    await tester.tap(find.byKey(const Key('benefits-saved-fast-acai')));
    await tester.pumpAndSettle();
    final page = tester.widget<BenefitPartnerPage>(
      find.byType(BenefitPartnerPage),
    );
    expect(page.source, BenefitSource.myBenefits);
  });
}
