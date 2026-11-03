import '../../../core/formatting/app_currency_format.dart';
import 'tournament_service_fee.dart';

/// Meio da cobrança online da inscrição.
///
/// Torneio que cobra pelo app (`appPixCard`, o padrão do acervo) oferece os
/// que o organizador aceitou ([parseOnlinePaymentMethods]); o pagamento
/// direto com o organizador nem chega à tela de cobrança. Mesma regra do
/// portal (`resolvePaymentMethods`). O cartão é à vista, no checkout
/// hospedado do Asaas.
enum RegistrationPaymentMethod { pix, card }

/// Os dois meios, na ordem da tela: Pix primeiro.
const allRegistrationPaymentMethods = RegistrationPaymentMethod.values;

/// Formas aceitas no pagamento pelo app (`tournaments.onlinePaymentMethods`):
/// só Pix, só cartão ou as duas, sempre na ordem Pix → cartão. Ausente, vazio
/// ou fora do contrato = as duas — todo o acervo anterior à escolha. Espelho
/// de `tournamentOnlinePaymentMethods` (functions).
List<RegistrationPaymentMethod> parseOnlinePaymentMethods(Object? raw) {
  if (raw is! List) return allRegistrationPaymentMethods;
  final methods = allRegistrationPaymentMethods
      .where((m) => raw.contains(m.name))
      .toList(growable: false);
  return methods.isEmpty ? allRegistrationPaymentMethods : methods;
}

/// Valores de cada meio na tela de escolha.
///
/// [pixCents] é o que o Pix cobra (preço + taxa de serviço do atleta −
/// descontos − cashback); o cartão cobra isso mais a taxa de antecipação
/// ([cardFeeCents]), que só ele tem — por isso o Pix sai mais barato.
class RegistrationMethodQuote {
  const RegistrationMethodQuote({
    required this.pixCents,
    required this.cardFeeCents,
    required this.cardFeePercent,
  });

  final int pixCents;
  final int cardFeeCents;
  final double cardFeePercent;

  int get cardTotalCents => pixCents + cardFeeCents;

  /// Total do meio escolhido.
  int totalCents(RegistrationPaymentMethod method) =>
      method == RegistrationPaymentMethod.card ? cardTotalCents : pixCents;
}

/// Monta o [RegistrationMethodQuote] a partir do valor do Pix e do % da taxa
/// do cartão (`cardFeePercent` de `getTournamentServiceFee`).
RegistrationMethodQuote registrationMethodQuote({
  required int pixCents,
  required double cardFeePercent,
}) {
  final feeCents = cardAnticipationFeeCents(pixCents, cardFeePercent);
  return RegistrationMethodQuote(
    pixCents: pixCents,
    cardFeeCents: feeCents,
    cardFeePercent: feeCents > 0 ? cardFeePercent : 0,
  );
}

/// Percentual em pt-BR, sem zeros à toa: `1.33` → `1,33%`, `1.5` → `1,5%`,
/// `2` → `2%`.
String formatCardFeePercent(double percent) {
  final fixed = percent.toStringAsFixed(2);
  final trimmed =
      fixed.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
  return '${trimmed.replaceAll('.', ',')}%';
}

/// Texto do botão que abre a cobrança. O cartão diz o valor porque o
/// pagamento acontece fora do app, na página do Asaas.
String registrationChargeButtonLabel(
  RegistrationPaymentMethod method, {
  required double chargeReais,
}) {
  return switch (method) {
    RegistrationPaymentMethod.pix => 'Gerar PIX',
    RegistrationPaymentMethod.card =>
      'Pagar ${formatBRL(chargeReais)} no cartão',
  };
}

/// Título da tela: neutro enquanto o atleta escolhe; depois, o meio da
/// cobrança viva.
String registrationChargePageTitle(RegistrationPaymentMethod? liveMethod) {
  return switch (liveMethod) {
    null => 'Pagamento',
    RegistrationPaymentMethod.pix => 'Pagamento via PIX',
    RegistrationPaymentMethod.card => 'Pagamento com cartão',
  };
}
