import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/formatting/app_date_format.dart';

/// Alerta em `users/{uid}/slotVacancyAlerts/{alertId}` quando uma quadra/dia lota.
class SlotVacancyAlert {
  const SlotVacancyAlert({
    required this.id,
    required this.arenaId,
    required this.courtId,
    required this.dateKey,
    this.arenaName,
    this.courtName,
    this.active = true,
    this.createdAt,
  });

  final String id;
  final String arenaId;
  final String courtId;
  final String dateKey;
  final String? arenaName;
  final String? courtName;
  final bool active;
  final DateTime? createdAt;

  static String documentId({
    required String arenaId,
    required String courtId,
    required String dateKey,
  }) =>
      '${arenaId.trim()}_${courtId.trim()}_$dateKey';

  static String dateKeyFrom(DateTime day) => calendarDateKey(day);

  factory SlotVacancyAlert.fromFirestore(String docId, Map<String, dynamic> data) {
    final created = data['createdAt'];
    DateTime? at;
    if (created is Timestamp) at = created.toDate();
    return SlotVacancyAlert(
      id: docId,
      arenaId: (data['arenaId'] as String?)?.trim() ?? '',
      courtId: (data['courtId'] as String?)?.trim() ?? '',
      dateKey: (data['date'] as String?)?.trim() ?? '',
      arenaName: (data['arenaName'] as String?)?.trim(),
      courtName: (data['courtName'] as String?)?.trim(),
      active: data['active'] as bool? ?? true,
      createdAt: at,
    );
  }

  Map<String, dynamic> toFirestore() => <String, dynamic>{
        'arenaId': arenaId,
        'courtId': courtId,
        'date': dateKey,
        if (arenaName != null && arenaName!.isNotEmpty) 'arenaName': arenaName,
        if (courtName != null && courtName!.isNotEmpty) 'courtName': courtName,
        'active': active,
        'createdAt': FieldValue.serverTimestamp(),
      };
}

/// Chave para providers de alerta.
class SlotVacancyAlertKey {
  const SlotVacancyAlertKey({
    required this.arenaId,
    required this.courtId,
    required this.date,
  });

  final String arenaId;
  final String courtId;
  final DateTime date;

  String get dateKey => SlotVacancyAlert.dateKeyFrom(date);

  String get documentId => SlotVacancyAlert.documentId(
        arenaId: arenaId,
        courtId: courtId,
        dateKey: dateKey,
      );

  @override
  bool operator ==(Object other) {
    return other is SlotVacancyAlertKey &&
        other.arenaId == arenaId &&
        other.courtId == courtId &&
        other.dateKey == dateKey;
  }

  @override
  int get hashCode => Object.hash(arenaId, courtId, dateKey);
}
