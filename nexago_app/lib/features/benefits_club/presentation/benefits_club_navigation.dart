import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../domain/benefit_event.dart';

Map<String, String> _originQuery(BenefitSource source) => {
  BenefitSource.queryParam: source.key,
};

/// Abre o clube contando de onde a pessoa veio (`?origem=`).
void openBenefitsClub(BuildContext context, BenefitSource source) =>
    context.pushNamed(
      AppRouteNames.benefitsClub,
      queryParameters: _originQuery(source),
    );

void openBenefitsPartner(
  BuildContext context,
  String partnerId,
  BenefitSource source,
) => context.pushNamed(
  AppRouteNames.benefitsPartner,
  pathParameters: {'partnerId': partnerId},
  queryParameters: _originQuery(source),
);

/// Abre o formulário; resolve `true` quando a pessoa enviou e tocou em
/// "Voltar ao clube" (a tela do parceiro sai junto).
Future<bool?> openBenefitsLeadForm(
  BuildContext context,
  String partnerId,
  BenefitSource source,
) => context.pushNamed<bool>(
  AppRouteNames.benefitsPartnerLead,
  pathParameters: {'partnerId': partnerId},
  queryParameters: _originQuery(source),
);

/// Endereço do clube com a origem, para o voltar de quem chegou por link.
String benefitsClubLocation(BenefitSource source) => Uri(
  path: AppRoutes.benefitsClub,
  queryParameters: _originQuery(source),
).toString();

/// Volta uma tela ou, se esta for a única da pilha (link direto), vai para
/// [fallback] em vez de deixar a pessoa presa.
void benefitsBack(BuildContext context, String fallback) =>
    popOrGo(context, fallback);

/// "Voltar ao clube" depois do envio: devolve `true` para a tela do parceiro
/// sair junto; aberto por link direto, vai para o clube.
void finishLeadAndBackToClub(BuildContext context, BenefitSource source) {
  final router = GoRouter.of(context);
  if (router.canPop()) {
    router.pop(true);
    return;
  }
  router.go(benefitsClubLocation(source));
}
