import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/arena_comandas_repository.dart';
import '../arena_schedule_providers.dart';
import '../arena_manager_booking.dart';
import 'arena_comanda.dart';
import 'arena_comanda_draft.dart';
import 'arena_comanda_item.dart';
import 'arena_comanda_logic.dart';
import 'arena_comanda_payment.dart';

final arenaComandasRepositoryProvider = Provider<ArenaComandasRepository>((ref) {
  return ArenaComandasRepository(
    FirebaseFirestore.instance,
    FirebaseAuth.instance,
  );
});

final arenaComandasStreamProvider =
    StreamProvider.autoDispose.family<List<ArenaComanda>, String>((ref, arenaId) {
  final id = arenaId.trim();
  if (id.isEmpty) return Stream.value(const []);

  return ref.watch(arenaComandasRepositoryProvider).watchComandas(id);
});

final arenaComandaFilterProvider =
    StateProvider.autoDispose<ArenaComandaFilterChip>(
  (ref) => ArenaComandaFilterChip.all,
);

final arenaComandasFilteredProvider =
    Provider.autoDispose.family<List<ArenaComanda>, String>((ref, arenaId) {
  final comandas =
      ref.watch(arenaComandasStreamProvider(arenaId)).valueOrNull ??
          const <ArenaComanda>[];
  final chip = ref.watch(arenaComandaFilterProvider);
  return filterComandas(comandas, chip);
});

final arenaComandasKpisProvider =
    Provider.autoDispose.family<ArenaComandasKpis, String>((ref, arenaId) {
  final comandasAsync = ref.watch(arenaComandasStreamProvider(arenaId));
  return comandasAsync.maybeWhen(
    data: computeComandasKpis,
    orElse: () => emptyArenaComandasKpis,
  );
});

final arenaComandaProvider = FutureProvider.autoDispose
    .family<ArenaComanda?, String>((ref, comandaId) {
  final id = comandaId.trim();
  if (id.isEmpty) return Future.value(null);
  return ref.watch(arenaComandasRepositoryProvider).getComanda(id);
});

final arenaComandaStreamProvider = StreamProvider.autoDispose
    .family<ArenaComanda?, String>((ref, comandaId) {
  final id = comandaId.trim();
  if (id.isEmpty) return Stream.value(null);
  return ref.watch(arenaComandasRepositoryProvider).watchComanda(id);
});

/// Comanda em andamento do atleta (Peça na quadra), resolvida pela reserva.
final arenaComandaByBookingIdStreamProvider = StreamProvider.autoDispose
    .family<ArenaComanda?, String>((ref, bookingId) {
  final id = bookingId.trim();
  if (id.isEmpty) return Stream.value(null);
  return ref
      .watch(arenaComandasRepositoryProvider)
      .watchComandaByBookingId(id);
});

final arenaComandaItemsStreamProvider = StreamProvider.autoDispose
    .family<List<ArenaComandaItem>, String>((ref, comandaId) {
  final id = comandaId.trim();
  if (id.isEmpty) return Stream.value(const []);
  return ref.watch(arenaComandasRepositoryProvider).watchComandaItems(id);
});

final arenaComandaPaymentsStreamProvider = StreamProvider.autoDispose
    .family<List<ArenaComandaPayment>, String>((ref, comandaId) {
  final id = comandaId.trim();
  if (id.isEmpty) return Stream.value(const []);
  return ref.watch(arenaComandasRepositoryProvider).watchComandaPayments(id);
});

class ArenaComandaQuickAddDraftNotifier extends Notifier<Map<String, int>> {
  @override
  Map<String, int> build() => const {};

  void reset() => state = const {};

  void setQuantity(String productId, int quantity) {
    final id = productId.trim();
    if (id.isEmpty) return;
    final next = Map<String, int>.from(state);
    if (quantity <= 0) {
      next.remove(id);
    } else {
      next[id] = quantity;
    }
    state = next;
  }

  void increment(String productId) {
    final current = state[productId.trim()] ?? 0;
    setQuantity(productId, current + 1);
  }

  void decrement(String productId) {
    final current = state[productId.trim()] ?? 0;
    setQuantity(productId, current - 1);
  }

  int totalItems() => state.values.fold(0, (sum, qty) => sum + qty);
}

final arenaComandaQuickAddDraftProvider =
    NotifierProvider<ArenaComandaQuickAddDraftNotifier, Map<String, int>>(
  ArenaComandaQuickAddDraftNotifier.new,
);

class ArenaComandaDraftNotifier extends Notifier<ArenaComandaDraft> {
  @override
  ArenaComandaDraft build() => const ArenaComandaDraft();

  void reset() {
    state = const ArenaComandaDraft();
  }

  void setType(ArenaComandaType type) {
    state = state.copyWith(
      type: type,
      clearLinkedBooking: true,
      linkWithoutBooking: false,
    );
  }

  void selectBooking(ArenaManagerBooking booking) {
    state = state.copyWith(
      linkedBooking: booking,
      linkWithoutBooking: false,
    );
  }

  void selectWithoutBooking() {
    state = state.copyWith(
      clearLinkedBooking: true,
      linkWithoutBooking: true,
    );
  }

  void setCustomerName(String value) {
    state = state.copyWith(customerName: value);
  }

  void setCustomerWhatsapp(String value) {
    state = state.copyWith(customerWhatsapp: value);
  }

  void setCustomerCpf(String value) {
    state = state.copyWith(customerCpf: value);
  }

  void setAllowAppOrders(bool value) {
    state = state.copyWith(allowAppOrders: value);
  }

  void setSendReceiptWhatsapp(bool value) {
    state = state.copyWith(sendReceiptWhatsapp: value);
  }
}

final arenaComandaDraftProvider =
    NotifierProvider<ArenaComandaDraftNotifier, ArenaComandaDraft>(
  ArenaComandaDraftNotifier.new,
);

final managedArenaComandasFilteredProvider =
    Provider.autoDispose<List<ArenaComanda>>((ref) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  if (arenaId.isEmpty) return const [];
  return ref.watch(arenaComandasFilteredProvider(arenaId));
});

final managedArenaComandasKpisProvider =
    Provider.autoDispose<ArenaComandasKpis>((ref) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  if (arenaId.isEmpty) {
    return emptyArenaComandasKpis;
  }
  return ref.watch(arenaComandasKpisProvider(arenaId));
});
