import 'package:cloud_firestore/cloud_firestore.dart';

/// Item de lista/detalhe de arena a partir de `arenas/{id}`.
///
/// Campos reais podem variar (`basePriceReais` do backoffice, `pricePerHourReais` do marketing).
class ArenaListItem {
  const ArenaListItem({
    required this.id,
    required this.name,
    required this.locationLabel,
    this.coverUrl,
    this.logoUrl,
    required this.pricePerHourReais,
    this.description,
    this.galleryImageUrls = const [],
    this.phone,
    this.whatsapp,
    this.addressLine,
    this.city,
    this.state,
    this.courtTypes = const [],
    this.onlinePaymentEnabled = true,
    this.onsitePaymentEnabled = true,
    this.ratingAverage = 0,
    this.reviewsCount = 0,
    this.reputationScore = 0,
    this.reviewResponseRate = 0,
  });

  final String id;
  final String name;
  final String locationLabel;
  final String? coverUrl;
  final String? logoUrl;
  final double pricePerHourReais;
  final String? description;

  /// Telefone de contato (`phone`, `phoneNumber`… no Firestore).
  final String? phone;

  /// WhatsApp (`whatsapp`, `whatsApp`…).
  final String? whatsapp;

  /// Endereço em linha (`address`, `streetAddress`…), se existir.
  final String? addressLine;

  /// Cidade e estado persistidos (quando existirem no documento).
  final String? city;
  final String? state;

  /// Tipos de quadra oferecidos pela arena (lista editável no painel).
  final List<String> courtTypes;

  final bool onlinePaymentEnabled;
  final bool onsitePaymentEnabled;
  final double ratingAverage;
  final int reviewsCount;
  final int reputationScore;
  final double reviewResponseRate;

  /// Compatibilidade com código legado.
  String get imageUrl => coverUrl ?? kDefaultImageUrl;

  /// URLs extras (Firestore: `galleryImageUrls` ou lista `images`).
  final List<String> galleryImageUrls;

  /// Slides do carrossel: capa + galeria sem duplicar.
  List<String> get carouselImageUrls {
    final out = <String>[imageUrl];
    for (final u in galleryImageUrls) {
      if (u.isNotEmpty && !out.contains(u)) out.add(u);
    }
    return out;
  }

  /// Imagem padrão quando o documento não tem URL.
  static const String kDefaultImageUrl =
      'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=800&q=80&auto=format&fit=crop';

  factory ArenaListItem.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final name = (data['name'] as String?)?.trim();
    final resolvedName =
        (name == null || name.isEmpty) ? 'Arena ${doc.id}' : name;

    final city = (data['city'] as String?)?.trim() ?? '';
    final state = (data['state'] as String?)?.trim() ?? '';
    String locationLabel;
    if (city.isNotEmpty || state.isNotEmpty) {
      locationLabel = [city, state].where((e) => e.isNotEmpty).join(', ');
    } else {
      final raw = data['address'] ?? data['location'];
      if (raw is String && raw.trim().isNotEmpty) {
        locationLabel = raw.trim();
      } else {
        locationLabel = 'Local a confirmar';
      }
    }

    String? pickUrl(String key) {
      final v = data[key] as String?;
      if (v == null || v.trim().isEmpty) return null;
      return v.trim();
    }

    final imageUrl = pickUrl('coverUrl') ??
        pickUrl('coverImageUrl') ??
        pickUrl('imageUrl') ??
        pickUrl('heroImageUrl');
    final logoUrl =
        pickUrl('logoUrl') ?? pickUrl('logo') ?? pickUrl('logoImageUrl');

    final price = (data['pricePerHourReais'] as num?)?.toDouble() ??
        (data['basePriceReais'] as num?)?.toDouble() ??
        89.0;

    final description = data['description'] as String?;

    String? phone;
    for (final key in ['phone', 'phoneNumber', 'telefone', 'mobile']) {
      final v = data[key];
      if (v is String && v.trim().isNotEmpty) {
        phone = v.trim();
        break;
      }
    }

    String? whatsapp;
    for (final key in ['whatsapp', 'whatsApp', 'whatsappNumber']) {
      final v = data[key];
      if (v is String && v.trim().isNotEmpty) {
        whatsapp = v.trim();
        break;
      }
    }

    String? addressLine;
    for (final key in ['address', 'streetAddress', 'street', 'fullAddress']) {
      final v = data[key];
      if (v is String && v.trim().isNotEmpty) {
        addressLine = v.trim();
        break;
      }
    }

    final gallery = <String>[];
    final rawGallery =
        data['galleryImageUrls'] ?? data['images'] ?? data['gallery'];
    if (rawGallery is List) {
      for (final e in rawGallery) {
        if (e is String && e.trim().isNotEmpty) gallery.add(e.trim());
      }
    }

    final courtTypes = <String>[];
    final rawCourtTypes =
        data['courtTypes'] ?? data['court_type_labels'] ?? data['sportTypes'];
    if (rawCourtTypes is List) {
      for (final e in rawCourtTypes) {
        if (e is String && e.trim().isNotEmpty) {
          courtTypes.add(e.trim());
        }
      }
    }

    bool readBool(dynamic v, {required bool defaultValue}) {
      if (v is bool) return v;
      return defaultValue;
    }

    final onlinePayment = readBool(
      data['onlinePaymentEnabled'] ?? data['acceptOnlinePayment'],
      defaultValue: true,
    );
    final onsitePayment = readBool(
      data['onsitePaymentEnabled'] ??
          data['acceptOnsitePayment'] ??
          data['payAtVenue'],
      defaultValue: true,
    );

    final cityValue = city.isEmpty ? null : city;
    final stateValue = state.isEmpty ? null : state;
    final ratingAverage = (data['ratingAverage'] as num?)?.toDouble() ?? 0;
    final reviewsCount = (data['reviewsCount'] as num?)?.toInt() ?? 0;
    final reputationScore = (data['reputationScore'] as num?)?.toInt() ?? 0;
    final reviewResponseRate =
        (data['reviewResponseRate'] as num?)?.toDouble() ?? 0;

    return ArenaListItem(
      id: doc.id,
      name: resolvedName,
      locationLabel: locationLabel,
      coverUrl: imageUrl,
      logoUrl: logoUrl,
      pricePerHourReais: price,
      description: description,
      galleryImageUrls: gallery,
      phone: phone,
      whatsapp: whatsapp,
      addressLine: addressLine,
      city: cityValue,
      state: stateValue,
      courtTypes: courtTypes,
      onlinePaymentEnabled: onlinePayment,
      onsitePaymentEnabled: onsitePayment,
      ratingAverage: ratingAverage,
      reviewsCount: reviewsCount,
      reputationScore: reputationScore,
      reviewResponseRate: reviewResponseRate,
    );
  }
}
