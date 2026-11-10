/// Cartão salvo do atleta: só o que o servidor devolve para exibir
/// (bandeira, final e validade). Número e CVV nunca ficam no app.
class SavedPaymentCard {
  const SavedPaymentCard({
    required this.brand,
    required this.last4,
    required this.expiryMonth,
    required this.expiryYear,
  });

  final String brand;
  final String last4;
  final int expiryMonth;
  final int expiryYear;

  factory SavedPaymentCard.fromMap(Map<String, dynamic> map) {
    int asInt(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
    return SavedPaymentCard(
      brand: (map['brand'] ?? '').toString(),
      last4: (map['last4'] ?? '').toString(),
      expiryMonth: asInt(map['expiryMonth']),
      expiryYear: asInt(map['expiryYear']),
    );
  }

  /// "Visa final 4242".
  String get label => '${_brandLabel(brand)} final $last4';

  /// "12/26".
  String get expiryLabel {
    final mm = expiryMonth.toString().padLeft(2, '0');
    final yy = (expiryYear % 100).toString().padLeft(2, '0');
    return '$mm/$yy';
  }

  static String _brandLabel(String brand) => switch (brand.toUpperCase()) {
        'VISA' => 'Visa',
        'MASTERCARD' => 'Mastercard',
        'ELO' => 'Elo',
        'AMEX' => 'Amex',
        'HIPERCARD' => 'Hipercard',
        _ => brand,
      };
}

/// Dados digitados no formulário. Vivem só até o envio.
class PaymentCardInput {
  const PaymentCardInput({
    required this.number,
    required this.holderName,
    required this.expiryMonth,
    required this.expiryYear,
    required this.ccv,
    required this.postalCode,
    required this.addressNumber,
  });

  final String number;
  final String holderName;
  final int expiryMonth;
  final int expiryYear;
  final String ccv;
  final String postalCode;
  final String addressNumber;

  static String _digits(String s) => s.replaceAll(RegExp(r'\D'), '');

  /// Corpo da callable: números só com dígitos.
  Map<String, Object?> toMap() => {
        'number': _digits(number),
        'holderName': holderName.trim(),
        'expiryMonth': expiryMonth,
        'expiryYear': expiryYear,
        'ccv': _digits(ccv),
        'postalCode': _digits(postalCode),
        'addressNumber': addressNumber.trim(),
      };
}
