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
  });

  final String id;
  final String name;
  final String locationLabel;
  final String? coverUrl;
  final String? logoUrl;
  final double pricePerHourReais;
  final String? description;

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

    final imageUrl =
        pickUrl('coverUrl') ?? pickUrl('coverImageUrl') ?? pickUrl('imageUrl') ?? pickUrl('heroImageUrl');
    final logoUrl = pickUrl('logoUrl') ?? pickUrl('logo') ?? pickUrl('logoImageUrl');

    final price = (data['pricePerHourReais'] as num?)?.toDouble() ??
        (data['basePriceReais'] as num?)?.toDouble() ??
        89.0;

    final description = data['description'] as String?;

    final gallery = <String>[];
    final rawGallery = data['galleryImageUrls'] ?? data['images'] ?? data['gallery'];
    if (rawGallery is List) {
      for (final e in rawGallery) {
        if (e is String && e.trim().isNotEmpty) gallery.add(e.trim());
      }
    }

    return ArenaListItem(
      id: doc.id,
      name: resolvedName,
      locationLabel: locationLabel,
      coverUrl: imageUrl,
      logoUrl: logoUrl,
      pricePerHourReais: price,
      description: description,
      galleryImageUrls: gallery,
    );
  }
}
