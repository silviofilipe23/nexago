import 'package:cloud_firestore/cloud_firestore.dart';

/// Preferências de notificação em `users/{uid}.notificationPreferences`.
class AthleteNotificationPreferences {
  const AthleteNotificationPreferences({
    this.channels = const AthleteNotificationChannels(),
    this.topics = const AthleteNotificationTopics(),
    this.quietHours = const AthleteNotificationQuietHours(),
  });

  final AthleteNotificationChannels channels;
  final AthleteNotificationTopics topics;
  final AthleteNotificationQuietHours quietHours;

  static const AthleteNotificationPreferences defaults =
      AthleteNotificationPreferences();

  factory AthleteNotificationPreferences.fromFirestore(dynamic raw) {
    if (raw is! Map) return defaults;
    final map = Map<String, dynamic>.from(raw);
    return AthleteNotificationPreferences(
      channels: AthleteNotificationChannels.fromFirestore(map['channels']),
      topics: AthleteNotificationTopics.fromFirestore(map['topics']),
      quietHours: AthleteNotificationQuietHours.fromFirestore(map['quietHours']),
    );
  }

  Map<String, dynamic> toFirestore() {
    return <String, dynamic>{
      'channels': channels.toFirestore(),
      'topics': topics.toFirestore(),
      'quietHours': quietHours.toFirestore(),
    };
  }

  AthleteNotificationPreferences copyWith({
    AthleteNotificationChannels? channels,
    AthleteNotificationTopics? topics,
    AthleteNotificationQuietHours? quietHours,
  }) {
    return AthleteNotificationPreferences(
      channels: channels ?? this.channels,
      topics: topics ?? this.topics,
      quietHours: quietHours ?? this.quietHours,
    );
  }

  /// Resumo para o tile em Configurações (ex.: `Push · WhatsApp`).
  String channelsSummaryForSettings() {
    final labels = <String>[];
    if (channels.push) labels.add('Push');
    if (channels.whatsapp) labels.add('WhatsApp');
    if (channels.email) labels.add('Email');
    if (labels.isEmpty) return 'Nenhum canal ativo';
    return labels.join(' · ');
  }

  bool isDirtyComparedTo(AthleteNotificationPreferences other) {
    return channels != other.channels ||
        topics != other.topics ||
        quietHours != other.quietHours;
  }

  @override
  bool operator ==(Object other) {
    return other is AthleteNotificationPreferences &&
        other.channels == channels &&
        other.topics == topics &&
        other.quietHours == quietHours;
  }

  @override
  int get hashCode => Object.hash(channels, topics, quietHours);
}

class AthleteNotificationChannels {
  const AthleteNotificationChannels({
    this.push = true,
    this.whatsapp = true,
    this.email = false,
  });

  final bool push;
  final bool whatsapp;
  final bool email;

  factory AthleteNotificationChannels.fromFirestore(dynamic raw) {
    if (raw is! Map) {
      return const AthleteNotificationChannels();
    }
    final map = Map<String, dynamic>.from(raw);
    return AthleteNotificationChannels(
      push: map['push'] as bool? ?? true,
      whatsapp: map['whatsapp'] as bool? ?? true,
      email: map['email'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toFirestore() => <String, dynamic>{
        'push': push,
        'whatsapp': whatsapp,
        'email': email,
      };

  AthleteNotificationChannels copyWith({
    bool? push,
    bool? whatsapp,
    bool? email,
  }) {
    return AthleteNotificationChannels(
      push: push ?? this.push,
      whatsapp: whatsapp ?? this.whatsapp,
      email: email ?? this.email,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is AthleteNotificationChannels &&
        other.push == push &&
        other.whatsapp == whatsapp &&
        other.email == email;
  }

  @override
  int get hashCode => Object.hash(push, whatsapp, email);
}

class AthleteNotificationTopics {
  const AthleteNotificationTopics({
    this.bookingsAndGames = true,
    this.athleteInvites = true,
    this.achievementsXp = true,
    this.availableSlots = false,
    this.promotions = false,
  });

  final bool bookingsAndGames;
  final bool athleteInvites;
  final bool achievementsXp;
  final bool availableSlots;
  final bool promotions;

  factory AthleteNotificationTopics.fromFirestore(dynamic raw) {
    if (raw is! Map) {
      return const AthleteNotificationTopics();
    }
    final map = Map<String, dynamic>.from(raw);
    return AthleteNotificationTopics(
      bookingsAndGames: map['bookingsAndGames'] as bool? ?? true,
      athleteInvites: map['athleteInvites'] as bool? ?? true,
      achievementsXp: map['achievementsXp'] as bool? ?? true,
      availableSlots: map['availableSlots'] as bool? ?? false,
      promotions: map['promotions'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toFirestore() => <String, dynamic>{
        'bookingsAndGames': bookingsAndGames,
        'athleteInvites': athleteInvites,
        'achievementsXp': achievementsXp,
        'availableSlots': availableSlots,
        'promotions': promotions,
      };

  AthleteNotificationTopics copyWith({
    bool? bookingsAndGames,
    bool? athleteInvites,
    bool? achievementsXp,
    bool? availableSlots,
    bool? promotions,
  }) {
    return AthleteNotificationTopics(
      bookingsAndGames: bookingsAndGames ?? this.bookingsAndGames,
      athleteInvites: athleteInvites ?? this.athleteInvites,
      achievementsXp: achievementsXp ?? this.achievementsXp,
      availableSlots: availableSlots ?? this.availableSlots,
      promotions: promotions ?? this.promotions,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is AthleteNotificationTopics &&
        other.bookingsAndGames == bookingsAndGames &&
        other.athleteInvites == athleteInvites &&
        other.achievementsXp == achievementsXp &&
        other.availableSlots == availableSlots &&
        other.promotions == promotions;
  }

  @override
  int get hashCode => Object.hash(
        bookingsAndGames,
        athleteInvites,
        achievementsXp,
        availableSlots,
        promotions,
      );
}

class AthleteNotificationQuietHours {
  const AthleteNotificationQuietHours({
    this.enabled = true,
    this.start = '22:00',
    this.end = '07:00',
  });

  final bool enabled;
  /// `HH:mm` horário local.
  final String start;
  final String end;

  factory AthleteNotificationQuietHours.fromFirestore(dynamic raw) {
    if (raw is! Map) {
      return const AthleteNotificationQuietHours();
    }
    final map = Map<String, dynamic>.from(raw);
    return AthleteNotificationQuietHours(
      enabled: map['enabled'] as bool? ?? true,
      start: _normalizeTime(map['start'] as String?) ?? '22:00',
      end: _normalizeTime(map['end'] as String?) ?? '07:00',
    );
  }

  static String? _normalizeTime(String? raw) {
    final t = raw?.trim();
    if (t == null || t.isEmpty) return null;
    final match = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch(t);
    if (match == null) return null;
    final h = int.tryParse(match.group(1)!);
    final m = int.tryParse(match.group(2)!);
    if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) {
      return null;
    }
    return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}';
  }

  Map<String, dynamic> toFirestore() => <String, dynamic>{
        'enabled': enabled,
        'start': start,
        'end': end,
      };

  String get label => 'Das $start às $end';

  AthleteNotificationQuietHours copyWith({
    bool? enabled,
    String? start,
    String? end,
  }) {
    return AthleteNotificationQuietHours(
      enabled: enabled ?? this.enabled,
      start: start ?? this.start,
      end: end ?? this.end,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is AthleteNotificationQuietHours &&
        other.enabled == enabled &&
        other.start == start &&
        other.end == end;
  }

  @override
  int get hashCode => Object.hash(enabled, start, end);
}

/// Leitura pontual de `channels.push` para gate de FCM no login.
Future<bool> readAthletePushChannelEnabled(
  FirebaseFirestore firestore,
  String uid,
) async {
  final snap = await firestore.collection('users').doc(uid).get();
  if (!snap.exists) return true;
  final prefs = snap.data()?['notificationPreferences'];
  if (prefs is! Map) return true;
  final channels = prefs['channels'];
  if (channels is! Map) return true;
  return channels['push'] as bool? ?? true;
}
