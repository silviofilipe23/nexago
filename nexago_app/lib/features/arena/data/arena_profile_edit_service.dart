import 'package:cloud_firestore/cloud_firestore.dart';

String _arenaDigitsOnly(String raw) {
  final out = StringBuffer();
  for (var i = 0; i < raw.length; i++) {
    final c = raw.codeUnitAt(i);
    if (c >= 0x30 && c <= 0x39) out.writeCharCode(c);
  }
  return out.toString();
}

/// Validação leve para telefone/WhatsApp (BR): só dígitos, 10–13 caracteres.
bool isValidArenaPhoneDigits(String raw) {
  final digits = _arenaDigitsOnly(raw);
  return digits.length >= 10 && digits.length <= 13;
}

/// Erros de negócio ao salvar perfil da arena.
class ArenaProfileEditException implements Exception {
  ArenaProfileEditException(this.message);

  final String message;

  @override
  String toString() => message;
}

dynamic _urlOrDelete(String? url) {
  final t = url?.trim() ?? '';
  return t.isEmpty ? FieldValue.delete() : t;
}

class ArenaProfileEditService {
  ArenaProfileEditService(this._firestore);

  final FirebaseFirestore _firestore;

  Future<void> saveProfile({
    required String arenaId,
    required String name,
    required String description,
    required String phone,
    String? whatsapp,
    required String address,
    required String city,
    String? coverUrl,
    String? logoUrl,
    required List<String> courtTypes,
    required bool onlinePaymentEnabled,
    required bool onsitePaymentEnabled,
  }) async {
    final trimmedName = name.trim();
    if (trimmedName.isEmpty) {
      throw ArenaProfileEditException('Informe o nome da arena.');
    }
    final phoneDigits = _arenaDigitsOnly(phone);
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      throw ArenaProfileEditException(
        'Telefone inválido. Use DDD + número (10 a 13 dígitos).',
      );
    }
    final wa = whatsapp?.trim() ?? '';
    if (wa.isNotEmpty && !isValidArenaPhoneDigits(wa)) {
      throw ArenaProfileEditException('WhatsApp inválido.');
    }
    if (!onlinePaymentEnabled && !onsitePaymentEnabled) {
      throw ArenaProfileEditException(
        'Ative pelo menos uma forma de pagamento.',
      );
    }

    final uniqueTypes = <String>[];
    for (final t in courtTypes) {
      final s = t.trim();
      if (s.isNotEmpty && !uniqueTypes.contains(s)) uniqueTypes.add(s);
    }

    await _firestore.collection('arenas').doc(arenaId).set(
      <String, dynamic>{
        'name': trimmedName,
        'description': description.trim(),
        'phone': phone.trim(),
        'whatsapp': wa.isEmpty ? FieldValue.delete() : wa,
        'address': address.trim(),
        'city': city.trim(),
        'coverUrl': _urlOrDelete(coverUrl),
        'logoUrl': _urlOrDelete(logoUrl),
        'courtTypes': uniqueTypes,
        'onlinePaymentEnabled': onlinePaymentEnabled,
        'onsitePaymentEnabled': onsitePaymentEnabled,
      },
      SetOptions(merge: true),
    );
  }
}
