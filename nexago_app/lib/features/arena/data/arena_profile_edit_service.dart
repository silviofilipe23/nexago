import 'package:cloud_firestore/cloud_firestore.dart';

import '../../arenas/domain/arena_amenities.dart';
import '../../arenas/domain/arena_list_item.dart';

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
    String? state,
    double? latitude,
    double? longitude,
    String? coverUrl,
    String? logoUrl,
    required List<String> courtTypes,
    List<String> surfaces = const [],
    required bool onlinePaymentEnabled,
    required bool onsitePaymentEnabled,
    ArenaAmenities amenities = ArenaAmenities.empty,
    String payoutPixKey = '',
    String payoutPixKeyType = '',
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
    final trimmedCity = city.trim();
    if (trimmedCity.isEmpty) {
      throw ArenaProfileEditException('Selecione a cidade da arena.');
    }
    final trimmedState = state?.trim().toUpperCase() ?? '';
    if (trimmedState.isEmpty) {
      throw ArenaProfileEditException('Selecione o estado da arena.');
    }
    if ((latitude == null) != (longitude == null)) {
      throw ArenaProfileEditException(
        'Informe latitude e longitude juntas, ou deixe ambas vazias.',
      );
    }
    if (latitude != null &&
        (latitude < -90 || latitude > 90 || longitude! < -180 || longitude > 180)) {
      throw ArenaProfileEditException('Coordenadas geográficas inválidas.');
    }
    final trimmedPixKey = payoutPixKey.trim();
    final trimmedPixType = payoutPixKeyType.trim().toUpperCase();
    if (onlinePaymentEnabled && trimmedPixKey.length < 5) {
      throw ArenaProfileEditException(
        'Informe a chave PIX da arena para receber repasses.',
      );
    }
    if (onlinePaymentEnabled && trimmedPixKey.isNotEmpty && trimmedPixType.isEmpty) {
      throw ArenaProfileEditException(
        'Selecione o tipo da chave PIX (CPF, telefone, e-mail, etc.).',
      );
    }

    final uniqueTypes = <String>[];
    for (final t in courtTypes) {
      final s = t.trim();
      if (s.isNotEmpty && !uniqueTypes.contains(s)) uniqueTypes.add(s);
    }
    final uniqueSurfaces = <String>[];
    for (final t in surfaces) {
      final s = t.trim();
      if (s.isNotEmpty && !uniqueSurfaces.contains(s)) uniqueSurfaces.add(s);
    }

    await _firestore.collection('arenas').doc(arenaId).set(
      <String, dynamic>{
        'name': trimmedName,
        'description': description.trim(),
        'phone': phone.trim(),
        'whatsapp': wa.isEmpty ? FieldValue.delete() : wa,
        'address': address.trim(),
        'city': trimmedCity,
        'state': trimmedState,
        if (latitude != null && longitude != null) ...<String, dynamic>{
          'latitude': latitude,
          'longitude': longitude,
          'location': GeoPoint(latitude, longitude),
        } else ...<String, dynamic>{
          'latitude': FieldValue.delete(),
          'longitude': FieldValue.delete(),
          'location': FieldValue.delete(),
        },
        'coverUrl': _urlOrDelete(coverUrl),
        'logoUrl': _urlOrDelete(logoUrl),
        'courtTypes': uniqueTypes,
        'surfaces': uniqueSurfaces,
        'amenities': amenities.toFirestoreMap(),
        'onlinePaymentEnabled': onlinePaymentEnabled,
        'onsitePaymentEnabled': onsitePaymentEnabled,
        'paymentReceiver': ArenaPaymentReceiver.platform.firestoreValue,
        'payoutPixKey': trimmedPixKey.isEmpty ? FieldValue.delete() : trimmedPixKey,
        'payoutPixKeyType':
            trimmedPixType.isEmpty ? FieldValue.delete() : trimmedPixType,
      },
      SetOptions(merge: true),
    );
  }
}
