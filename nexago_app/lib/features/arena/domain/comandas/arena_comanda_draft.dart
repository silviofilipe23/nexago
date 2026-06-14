import 'package:flutter/foundation.dart';

import '../arena_manager_booking.dart';
import 'arena_comanda.dart';

/// Estado do wizard de nova comanda (Individual MVP).
@immutable
class ArenaComandaDraft {
  const ArenaComandaDraft({
    this.type = ArenaComandaType.individual,
    this.linkedBooking,
    this.linkWithoutBooking = false,
    this.customerName = '',
    this.customerWhatsapp = '',
    this.customerCpf = '',
    this.allowAppOrders = true,
    this.sendReceiptWhatsapp = true,
  });

  final ArenaComandaType type;
  final ArenaManagerBooking? linkedBooking;
  final bool linkWithoutBooking;
  final String customerName;
  final String customerWhatsapp;
  final String customerCpf;
  final bool allowAppOrders;
  final bool sendReceiptWhatsapp;

  bool get canContinueFromType => type == ArenaComandaType.individual;

  bool get hasOriginSelection =>
      linkWithoutBooking || linkedBooking != null;

  bool get canContinueFromOrigin => hasOriginSelection;

  bool get canContinueFromCustomer =>
      customerName.trim().isNotEmpty;

  ArenaComandaDraft copyWith({
    ArenaComandaType? type,
    ArenaManagerBooking? linkedBooking,
    bool? clearLinkedBooking,
    bool? linkWithoutBooking,
    String? customerName,
    String? customerWhatsapp,
    String? customerCpf,
    bool? allowAppOrders,
    bool? sendReceiptWhatsapp,
  }) {
    return ArenaComandaDraft(
      type: type ?? this.type,
      linkedBooking:
          clearLinkedBooking == true ? null : linkedBooking ?? this.linkedBooking,
      linkWithoutBooking: linkWithoutBooking ?? this.linkWithoutBooking,
      customerName: customerName ?? this.customerName,
      customerWhatsapp: customerWhatsapp ?? this.customerWhatsapp,
      customerCpf: customerCpf ?? this.customerCpf,
      allowAppOrders: allowAppOrders ?? this.allowAppOrders,
      sendReceiptWhatsapp:
          sendReceiptWhatsapp ?? this.sendReceiptWhatsapp,
    );
  }
}
