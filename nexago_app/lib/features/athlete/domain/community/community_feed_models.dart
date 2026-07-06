import 'package:cloud_firestore/cloud_firestore.dart';

/// Tipos de item do feed — alinhado a `functions/src/community-feed.ts`.
enum CommunityFeedType {
  tournamentOpen('tournament_open'),
  tournamentChampions('tournament_champions'),
  unknown('');

  const CommunityFeedType(this.value);

  final String value;

  static CommunityFeedType fromValue(String? value) {
    for (final type in CommunityFeedType.values) {
      if (type != unknown && type.value == value) return type;
    }
    return unknown;
  }
}

class CommunityFeedChampion {
  const CommunityFeedChampion({
    required this.categoryName,
    required this.playerNames,
    this.playerPhotos = const [],
  });

  final String categoryName;
  final List<String> playerNames;
  final List<String?> playerPhotos;

  String get playersLabel => playerNames.join(' & ');
}

class CommunityFeedItem {
  const CommunityFeedItem({
    required this.id,
    required this.type,
    required this.tournamentId,
    required this.tournamentName,
    this.city = '',
    this.locationName = '',
    this.startAt,
    this.createdAt,
    this.categoriesCount = 0,
    this.champions = const [],
  });

  final String id;
  final CommunityFeedType type;
  final String tournamentId;
  final String tournamentName;
  final String city;
  final String locationName;
  final DateTime? startAt;
  final DateTime? createdAt;
  final int categoriesCount;
  final List<CommunityFeedChampion> champions;

  factory CommunityFeedItem.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? const <String, dynamic>{};
    return CommunityFeedItem(
      id: doc.id,
      type: CommunityFeedType.fromValue(data['type'] as String?),
      tournamentId: (data['tournamentId'] as String?) ?? '',
      tournamentName: (data['tournamentName'] as String?) ?? '',
      city: (data['city'] as String?) ?? '',
      locationName: (data['locationName'] as String?) ?? '',
      startAt: _toDate(data['startAt']),
      createdAt: _toDate(data['createdAt']),
      categoriesCount: (data['categoriesCount'] as num?)?.toInt() ?? 0,
      champions: _parseChampions(data['champions']),
    );
  }

  static DateTime? _toDate(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }

  static List<CommunityFeedChampion> _parseChampions(dynamic raw) {
    if (raw is! List) return const [];
    final result = <CommunityFeedChampion>[];
    for (final entry in raw) {
      if (entry is! Map) continue;
      final players = entry['players'];
      final names = <String>[];
      final photos = <String?>[];
      if (players is List) {
        for (final player in players) {
          if (player is! Map) continue;
          final name = (player['name'] as String?)?.trim() ?? '';
          if (name.isEmpty) continue;
          names.add(name);
          photos.add((player['photoUrl'] as String?)?.trim());
        }
      }
      if (names.isEmpty) continue;
      result.add(
        CommunityFeedChampion(
          categoryName: (entry['categoryName'] as String?)?.trim() ?? '',
          playerNames: names,
          playerPhotos: photos,
        ),
      );
    }
    return result;
  }
}

/// Tempo relativo curto em pt-BR para o feed ("agora", "há 2 h", "12/05").
String communityFeedRelativeTime(DateTime createdAt, {DateTime? now}) {
  final reference = now ?? DateTime.now();
  final diff = reference.difference(createdAt);
  if (diff.inMinutes < 1) return 'agora';
  if (diff.inMinutes < 60) return 'há ${diff.inMinutes} min';
  if (diff.inHours < 24) return 'há ${diff.inHours} h';
  if (diff.inDays == 1) return 'ontem';
  if (diff.inDays < 7) return 'há ${diff.inDays} dias';
  final dd = createdAt.day.toString().padLeft(2, '0');
  final mm = createdAt.month.toString().padLeft(2, '0');
  return '$dd/$mm';
}
