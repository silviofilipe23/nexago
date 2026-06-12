import 'package:cloud_firestore/cloud_firestore.dart';

import 'arena_product_category.dart';

/// Produto em `arenas/{arenaId}/products/{productId}`.
class ArenaProduct {
  const ArenaProduct({
    required this.id,
    required this.name,
    required this.category,
    required this.active,
    required this.priceCents,
    required this.stockQuantity,
    required this.minStockQuantity,
    this.description,
    this.emoji,
    this.imageUrl,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String name;
  final ArenaProductCategory category;
  final bool active;
  final int priceCents;
  final int stockQuantity;
  final int minStockQuantity;
  final String? description;
  final String? emoji;
  final String? imageUrl;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  double get priceReais => priceCents / 100;

  int get inventoryValueCents => priceCents * stockQuantity;

  factory ArenaProduct.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return ArenaProduct(
      id: doc.id,
      name: (data['name'] as String?)?.trim() ?? 'Produto',
      category: ArenaProductCategoryX.fromFirestore(data['category'] as String?),
      active: data['active'] == true,
      priceCents: (data['priceCents'] as num?)?.toInt() ?? 0,
      stockQuantity: (data['stockQuantity'] as num?)?.toInt() ?? 0,
      minStockQuantity: (data['minStockQuantity'] as num?)?.toInt() ?? 0,
      description: (data['description'] as String?)?.trim(),
      emoji: (data['emoji'] as String?)?.trim(),
      imageUrl: (data['imageUrl'] as String?)?.trim(),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  Map<String, dynamic> toFirestore({bool isCreate = false}) {
    return <String, dynamic>{
      'name': name,
      'nameLower': name.toLowerCase(),
      'category': category.firestoreValue,
      if (description != null && description!.isNotEmpty)
        'description': description,
      if (emoji != null && emoji!.isNotEmpty) 'emoji': emoji,
      if (imageUrl != null && imageUrl!.isNotEmpty) 'imageUrl': imageUrl,
      'active': active,
      'priceCents': priceCents,
      'stockQuantity': stockQuantity,
      'minStockQuantity': minStockQuantity,
      'updatedAt': FieldValue.serverTimestamp(),
      if (isCreate) 'createdAt': FieldValue.serverTimestamp(),
    };
  }

  ArenaProduct copyWith({
    String? id,
    String? name,
    ArenaProductCategory? category,
    bool? active,
    int? priceCents,
    int? stockQuantity,
    int? minStockQuantity,
    String? description,
    String? emoji,
    String? imageUrl,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return ArenaProduct(
      id: id ?? this.id,
      name: name ?? this.name,
      category: category ?? this.category,
      active: active ?? this.active,
      priceCents: priceCents ?? this.priceCents,
      stockQuantity: stockQuantity ?? this.stockQuantity,
      minStockQuantity: minStockQuantity ?? this.minStockQuantity,
      description: description ?? this.description,
      emoji: emoji ?? this.emoji,
      imageUrl: imageUrl ?? this.imageUrl,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  static DateTime? _parseTimestamp(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}
