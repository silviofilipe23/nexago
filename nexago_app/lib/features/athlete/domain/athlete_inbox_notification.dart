import 'package:cloud_firestore/cloud_firestore.dart';

class AthleteInboxNotification {
  const AthleteInboxNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.data,
    required this.read,
    required this.dismissed,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String body;
  final String type;
  final Map<String, String> data;
  final bool read;
  final bool dismissed;
  final DateTime createdAt;

  bool get isUnread => !read && !dismissed;

  factory AthleteInboxNotification.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> snap,
  ) {
    final d = snap.data() ?? {};
    final rawData = d['data'];
    final data = <String, String>{};
    if (rawData is Map) {
      for (final entry in rawData.entries) {
        final key = entry.key.toString();
        final value = entry.value;
        if (value != null) {
          data[key] = value.toString();
        }
      }
    }

    return AthleteInboxNotification(
      id: snap.id,
      title: d['title'] as String? ?? '',
      body: d['body'] as String? ?? '',
      type: (d['type'] as String? ?? 'general').trim(),
      data: data,
      read: d['read'] == true,
      dismissed: d['dismissed'] == true,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }
}
