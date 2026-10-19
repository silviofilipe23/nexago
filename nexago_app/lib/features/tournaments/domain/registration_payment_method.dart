import '../../../core/formatting/app_currency_format.dart';

/// Meio da cobrança online da inscrição.
///
/// Torneio que cobra pelo app (`appPixCard`, o padrão do acervo) oferece os
/// dois; o pagamento direto com o organizador nem chega à tela de cobrança.
/// Mesma regra do portal (`resolvePaymentMethods`). O cartão é à vista, no
/// checkout hospedado do Asaas.
enum RegistrationPaymentMethod { pix, card }

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
