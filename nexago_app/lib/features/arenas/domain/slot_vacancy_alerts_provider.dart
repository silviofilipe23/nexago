import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/slot_vacancy_alert_service.dart';
import 'arenas_providers.dart';
import 'slot_vacancy_alert.dart';

final slotVacancyAlertServiceProvider = Provider<SlotVacancyAlertService>((ref) {
  return SlotVacancyAlertService(ref.watch(firestoreProvider));
});

final slotVacancyAlertActiveProvider = StreamProvider.autoDispose
    .family<bool, SlotVacancyAlertKey>((ref, key) {
  final user = ref.watch(authServiceProvider).currentUser;
  if (user == null) return Stream.value(false);
  return ref.watch(slotVacancyAlertServiceProvider).watchIsSubscribed(
        userId: user.uid,
        key: key,
      );
});
