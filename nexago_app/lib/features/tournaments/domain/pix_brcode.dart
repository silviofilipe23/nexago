/// Gera o "PIX copia e cola" (BR Code estático, padrão EMV® MPM do BCB) a partir
/// da chave PIX do organizador + valor, para exibir QR e código na inscrição com
/// pagamento direto ao organizador.
///
/// Referência: Manual de Padrões para Iniciação do PIX (BCB) — EMVCo MPM + CRC16.
/// A chave no campo 26-01 precisa seguir o Manual do DICT (telefone com +55,
/// CPF/CNPJ só dígitos, EVP em minúsculas).
abstract final class PixBrCode {
  PixBrCode._();

  static const String _gui = 'br.gov.bcb.pix';
  static final RegExp _evpPattern = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  /// Monta o BR Code. [amount] em reais (ex.: 160.0); <= 0 omite o valor (o
  /// pagador digita no app do banco). [txid] é normalizado (alfanumérico, ≤25);
  /// vazio vira `***`.
  static String build({
    required String key,
    required String recipientName,
    String city = 'BRASIL',
    double amount = 0,
    String txid = '***',
    String keyType = '',
  }) {
    final cleanKey = normalizeKeyForBrCode(key, keyType: keyType);
    final name = _sanitizeText(recipientName, fallback: 'RECEBEDOR', maxLen: 25);
    final town = _sanitizeText(city, fallback: 'BRASIL', maxLen: 15);
    final tx = _sanitizeTxid(txid);

    // Merchant Account Information (26): GUI + chave.
    final mai = _tlv('00', _gui) + _tlv('01', cleanKey);

    final buffer = StringBuffer()
      ..write(_tlv('00', '01')) // Payload Format Indicator
      ..write(_tlv('26', mai)) // Merchant Account Information - PIX
      ..write(_tlv('52', '0000')) // Merchant Category Code
      ..write(_tlv('53', '986')); // Moeda (BRL)

    if (amount > 0) {
      final cents = (amount * 100).round() / 100.0;
      buffer.write(_tlv('54', cents.toStringAsFixed(2)));
    }

    buffer
      ..write(_tlv('58', 'BR')) // País
      ..write(_tlv('59', name)) // Nome do recebedor
      ..write(_tlv('60', town)) // Cidade
      ..write(_tlv('62', _tlv('05', tx))); // Additional Data Field - txid

    final partial = '${buffer.toString()}6304';
    final crc = _crc16(partial);
    return '$partial$crc';
  }

  /// Validação básica da chave (não exaustiva): não vazia.
  static bool isLikelyValidKey(String? key) {
    return key != null && key.trim().isNotEmpty;
  }

  /// Normaliza a chave para o formato DICT exigido no BR Code.
  static String normalizeKeyForBrCode(String raw, {String keyType = ''}) {
    final key = raw.trim();
    if (key.isEmpty) return key;
    final kind = _resolveKind(key, keyType);

    switch (kind) {
      case _PixKeyKind.phone:
        var d = key.replaceAll(RegExp(r'\D'), '');
        if (d.startsWith('55') && (d.length == 12 || d.length == 13)) {
          d = d.substring(2);
        }
        if (d.length < 10 || d.length > 11) return key;
        return '+55$d';
      case _PixKeyKind.cpf:
        final d = key.replaceAll(RegExp(r'\D'), '');
        return d.length == 11 ? d : key;
      case _PixKeyKind.cnpj:
        final d = key.toUpperCase().replaceAll(RegExp(r'[^0-9A-Z]'), '');
        return d.length == 14 ? d : key;
      case _PixKeyKind.email:
        return key;
      case _PixKeyKind.random:
        return key.toLowerCase();
      case _PixKeyKind.raw:
        return key;
    }
  }

  static _PixKeyKind _resolveKind(String raw, String keyType) {
    final type = keyType.trim().toLowerCase();
    if (type == 'phone' || type == 'telefone' || type == 'celular') {
      return _PixKeyKind.phone;
    }
    if (type == 'cpf') return _PixKeyKind.cpf;
    if (type == 'cnpj') return _PixKeyKind.cnpj;
    if (type == 'email' || type == 'e-mail') return _PixKeyKind.email;
    if (type == 'random' ||
        type == 'evp' ||
        type == 'aleatoria' ||
        type == 'aleatória') {
      return _PixKeyKind.random;
    }

    final key = raw.trim();
    if (key.contains('@')) return _PixKeyKind.email;
    if (_evpPattern.hasMatch(key)) return _PixKeyKind.random;
    final digits = key.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 14) return _PixKeyKind.cnpj;
    if (key.startsWith('+') ||
        (digits.length >= 10 &&
            digits.length <= 13 &&
            digits.startsWith('55'))) {
      return _PixKeyKind.phone;
    }
    if (digits.length == 11 && digits[2] == '9') return _PixKeyKind.phone;
    if (digits.length == 11) return _PixKeyKind.cpf;
    if (digits.length == 10) return _PixKeyKind.phone;
    return _PixKeyKind.raw;
  }

  /// TLV: id (2) + tamanho (2, zero-padded) + valor.
  static String _tlv(String id, String value) {
    final len = value.length.toString().padLeft(2, '0');
    return '$id$len$value';
  }

  /// CRC16-CCITT (poly 0x1021, init 0xFFFF), 4 hex maiúsculos.
  static String _crc16(String payload) {
    const polynomial = 0x1021;
    var crc = 0xFFFF;
    for (final byte in payload.codeUnits) {
      crc ^= byte << 8;
      for (var i = 0; i < 8; i++) {
        if ((crc & 0x8000) != 0) {
          crc = (crc << 1) ^ polynomial;
        } else {
          crc = crc << 1;
        }
        crc &= 0xFFFF;
      }
    }
    return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
  }

  /// Remove acentos e caracteres fora de [A-Za-z0-9 ], caixa alta, e corta no
  /// tamanho máximo. EMV não aceita acentos nos campos 59/60.
  static String _sanitizeText(
    String raw, {
    required String fallback,
    required int maxLen,
  }) {
    final stripped = _stripDiacritics(raw)
        .replaceAll(RegExp(r'[^A-Za-z0-9 ]'), '')
        .trim()
        .replaceAll(RegExp(r'\s+'), ' ')
        .toUpperCase();
    final value = stripped.isEmpty ? fallback : stripped;
    return value.length > maxLen ? value.substring(0, maxLen) : value;
  }

  static String _sanitizeTxid(String raw) {
    final cleaned = _stripDiacritics(raw)
        .replaceAll(RegExp(r'[^A-Za-z0-9]'), '');
    if (cleaned.isEmpty) return '***';
    return cleaned.length > 25 ? cleaned.substring(0, 25) : cleaned;
  }

  static String _stripDiacritics(String input) {
    const from = 'àáâãäçèéêëìíîïñòóôõöùúûüýÿ'
        'ÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ';
    const to = 'aaaaaceeeeiiiinooooouuuuyy'
        'AAAAACEEEEIIIINOOOOOUUUUY';
    var result = input;
    for (var i = 0; i < from.length; i++) {
      result = result.replaceAll(from[i], to[i]);
    }
    return result;
  }
}

enum _PixKeyKind { phone, cpf, cnpj, email, random, raw }
