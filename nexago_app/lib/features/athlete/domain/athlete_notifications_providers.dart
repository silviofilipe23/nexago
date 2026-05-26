import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/athlete_notifications_repository.dart';
import 'athlete_inbox_notification.dart';
import 'athlete_notifications_logic.dart';

final athleteNotificationsProvider =
    StreamProvider.autoDispose<List<AthleteInboxNotification>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(athleteNotificationsRepositoryProvider).watchInbox(uid);
});

final athleteUnreadNotificationsCountProvider = Provider.autoDispose<int>((ref) {
  final items = ref.watch(athleteNotificationsProvider).valueOrNull ?? const [];
  return countUnreadNotifications(items);
});
