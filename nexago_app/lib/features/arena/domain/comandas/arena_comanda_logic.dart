import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';

import '../arena_date_utils.dart';
import '../arena_manager_booking.dart';
import '../products/arena_product_category.dart';
import 'arena_comanda.dart';
import 'arena_comanda_draft.dart';
import 'arena_comanda_item.dart';
import 'arena_comanda_payment.dart';

enum ArenaComandaFilterChip { all, court, table, event, toPay }

class ArenaComandasKpis {
  const ArenaComandasKpis({
    required this.openCount,
    required this.todayTotalCents,
    required this.averageTicketCents,
  });

  final int openCount;
  final int todayTotalCents;
  final int averageTicketCents;
}

const emptyArenaComandasKpis = ArenaComandasKpis(
  openCount: 0,
  todayTotalCents: 0,
  averageTicketCents: 0,
);

/// Data de referência da comanda (abertura ou criação).
DateTime? comandaReferenceDate(ArenaComanda comanda) {
  return comanda.openedAt ?? comanda.createdAt;
}

bool isComandaOnDate(ArenaComanda comanda, DateTime date) {
  final reference = comandaReferenceDate(comanda);
  if (reference == null) return false;
  return arenaDateKey(reference) == arenaDateKey(date);
}

String formatComandaNumber(int displayNumber) {
  return '#${displayNumber.toString().padLeft(4, '0')}';
}

String formatComandaReais(int cents) {
  final formatter = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
  return formatter.format(cents / 100);
}

String comandaTypeLabel(ArenaComandaType type) {
  return switch (type) {
    ArenaComandaType.shared => 'Compartilhada',
    ArenaComandaType.individual => 'Individual',
    ArenaComandaType.table => 'Mesa',
    ArenaComandaType.event => 'Evento',
  };
}

String comandaStatusLabel(ArenaComandaStatus status) {
  return switch (status) {
    ArenaComandaStatus.open => 'ABERTA',
    ArenaComandaStatus.closing => 'EM FECHAMENTO',
    ArenaComandaStatus.partiallyPaid => 'PARCIALMENTE PAGA',
    ArenaComandaStatus.closed => 'FECHADA',
  };
}

Color comandaStatusColor(ArenaComandaStatus status) {
  return switch (status) {
    ArenaComandaStatus.open => AppColors.win,
    ArenaComandaStatus.closing => AppColors.pending,
    ArenaComandaStatus.partiallyPaid => AppColors.brand,
    ArenaComandaStatus.closed => AppColors.onSurfaceMuted,
  };
}

String comandaFilterChipLabel(ArenaComandaFilterChip chip, {int count = 0}) {
  return switch (chip) {
    ArenaComandaFilterChip.all => count > 0 ? 'Todas $count' : 'Todas',
    ArenaComandaFilterChip.court => 'Quadra',
    ArenaComandaFilterChip.table => 'Mesa',
    ArenaComandaFilterChip.event => 'Evento',
    ArenaComandaFilterChip.toPay => 'A pagar',
  };
}

String comandaTypeShortLabel(ArenaComandaType type) {
  return switch (type) {
    ArenaComandaType.shared => 'Compartilhada',
    ArenaComandaType.individual => 'Individual',
    ArenaComandaType.table => 'Mesa',
    ArenaComandaType.event => 'Evento',
  };
}

String comandaListTitle(ArenaComanda comanda) {
  if (comanda.locationLabel != null && comanda.locationLabel!.isNotEmpty) {
    return comanda.locationLabel!;
  }
  return comanda.customerName;
}

String comandaListSubtitle(ArenaComanda comanda) {
  final typeLabel = comandaTypeShortLabel(comanda.type);
  final itemsLabel = comanda.itemsCount == 1
      ? '1 item'
      : '${comanda.itemsCount} itens';
  return '$typeLabel · $itemsLabel';
}

String formatComandaOpenedSince(DateTime openedAt, {DateTime? reference}) {
  final formatter = DateFormat('HH:mm');
  return 'desde ${formatter.format(openedAt)}';
}

String formatComandaOpenedAt(DateTime openedAt) {
  final formatter = DateFormat('d MMM, HH:mm', 'pt_BR');
  return formatter.format(openedAt);
}

int rentalCentsFromBooking(ArenaManagerBooking booking) {
  final data = booking.data;
  final amountReais =
      data['amountReais'] ?? data['priceReais'] ?? data['price'];
  if (amountReais is num && amountReais > 0) {
    return (amountReais * 100).round();
  }
  final dueOnsite = data['amountDueOnsiteReais'];
  if (dueOnsite is num && dueOnsite > 0) {
    return (dueOnsite * 100).round();
  }
  return 0;
}

String bookingAthletesLabel(ArenaManagerBooking booking) {
  final data = booking.data;
  final confirmed = data['confirmedAthletes'];
  if (confirmed is List && confirmed.isNotEmpty) {
    final names = confirmed
        .map((e) => e is Map ? (e['name'] as String?)?.trim() : null)
        .whereType<String>()
        .where((n) => n.isNotEmpty)
        .take(2)
        .toList();
    if (names.isNotEmpty) return names.join(' & ');
  }
  final participants = data['confirmedParticipants'];
  if (participants is num && participants > 0) {
    return '${participants.toInt()} atletas';
  }
  return 'Reserva';
}

bool isBookingActiveNow(ArenaManagerBooking booking, DateTime now) {
  final data = booking.data;
  final status = (data['status'] as String?)?.toLowerCase().trim() ?? '';
  if (status == 'canceled' || status == 'cancelled') return false;

  final dateKey = booking.dateKey;
  final todayKey = arenaDateKey(now);
  if (dateKey != todayKey) return false;

  final startParts = booking.startTime.split(':');
  final endParts = booking.endTime.split(':');
  if (startParts.length < 2 || endParts.length < 2) return true;

  final start = DateTime(
    now.year,
    now.month,
    now.day,
    int.tryParse(startParts[0]) ?? 0,
    int.tryParse(startParts[1]) ?? 0,
  );
  final end = DateTime(
    now.year,
    now.month,
    now.day,
    int.tryParse(endParts[0]) ?? 23,
    int.tryParse(endParts[1]) ?? 59,
  );
  return !now.isBefore(start) && now.isBefore(end);
}

List<ArenaComanda> filterComandas(
  List<ArenaComanda> comandas,
  ArenaComandaFilterChip chip,
) {
  final active = comandas.where((c) => c.status.isActive).toList();
  return switch (chip) {
    ArenaComandaFilterChip.all => active,
    ArenaComandaFilterChip.court =>
      active
          .where(
            (c) =>
                c.type == ArenaComandaType.shared ||
                c.type == ArenaComandaType.individual,
          )
          .toList(),
    ArenaComandaFilterChip.table =>
      active.where((c) => c.type == ArenaComandaType.table).toList(),
    ArenaComandaFilterChip.event =>
      active.where((c) => c.type == ArenaComandaType.event).toList(),
    ArenaComandaFilterChip.toPay =>
      active
          .where(
            (c) =>
                c.status == ArenaComandaStatus.partiallyPaid ||
                c.status == ArenaComandaStatus.closing,
          )
          .toList(),
  };
}

ArenaComandasKpis computeComandasKpis(
  List<ArenaComanda> comandas, {
  DateTime? reference,
}) {
  final now = reference ?? DateTime.now();
  final openCount = comandas.where((c) => c.status.isActive).length;

  var todayTotalCents = 0;
  var todayComandaCount = 0;
  for (final comanda in comandas) {
    if (!isComandaOnDate(comanda, now)) continue;
    todayTotalCents += comanda.totalCents;
    todayComandaCount++;
  }

  final averageTicketCents = todayComandaCount > 0
      ? (todayTotalCents / todayComandaCount).round()
      : 0;

  return ArenaComandasKpis(
    openCount: openCount,
    todayTotalCents: todayTotalCents,
    averageTicketCents: averageTicketCents,
  );
}

bool isValidComandaDraftForCreate(ArenaComandaDraft draft) {
  return draft.type == ArenaComandaType.individual &&
      draft.hasOriginSelection &&
      draft.customerName.trim().isNotEmpty;
}

String comandaReviewLocationLabel(ArenaComandaDraft draft) {
  if (draft.linkWithoutBooking) return 'Sem vínculo';
  final booking = draft.linkedBooking;
  if (booking == null) return '—';
  return booking.courtName.isNotEmpty ? booking.courtName : 'Quadra';
}

String comandaReviewSubtitle(
  ArenaComandaDraft draft,
  int displayNumberPreview,
) {
  final location = comandaReviewLocationLabel(draft);
  if (draft.linkWithoutBooking) {
    return 'Vai abrir como comanda ${formatComandaNumber(displayNumberPreview)}';
  }
  return '$location · ${comandaTypeLabel(draft.type).toLowerCase()}';
}

enum ArenaComandaQuickAddCategory { all, bebidas, alimentacao, equipamentos }

String quickAddCategoryLabel(ArenaComandaQuickAddCategory category) {
  return switch (category) {
    ArenaComandaQuickAddCategory.all => 'Rápido',
    ArenaComandaQuickAddCategory.bebidas => 'Bebidas',
    ArenaComandaQuickAddCategory.alimentacao => 'Comida',
    ArenaComandaQuickAddCategory.equipamentos => 'Equip.',
  };
}

ArenaProductCategory? quickAddCategoryFilter(
  ArenaComandaQuickAddCategory chip,
) {
  return switch (chip) {
    ArenaComandaQuickAddCategory.all => null,
    ArenaComandaQuickAddCategory.bebidas => ArenaProductCategory.bebidas,
    ArenaComandaQuickAddCategory.alimentacao =>
      ArenaProductCategory.alimentacao,
    ArenaComandaQuickAddCategory.equipamentos =>
      ArenaProductCategory.equipamentos,
  };
}

String formatComandaHeaderSubtitle(ArenaComanda comanda) {
  return '${comandaTypeLabel(comanda.type).toUpperCase()} · '
      '${comandaStatusLabel(comanda.status)}';
}

String formatComandaOpenedAtLabel(DateTime openedAt) {
  final formatter = DateFormat('HH:mm');
  return 'aberta às ${formatter.format(openedAt)}';
}

String formatConsumptionBreakdown({
  required int rentalCents,
  required int consumptionCents,
}) {
  final parts = <String>[];
  if (rentalCents > 0) {
    parts.add('Locação ${formatComandaReais(rentalCents)}');
  }
  if (consumptionCents > 0) {
    parts.add('consumo ${formatComandaReais(consumptionCents)}');
  }
  if (parts.isEmpty) return 'Sem lançamentos';
  return parts.join(' + ');
}

String formatItemMeta(ArenaComandaItem item) {
  final time = item.createdAt != null
      ? DateFormat('HH:mm').format(item.createdAt!)
      : '--:--';
  final sourceLabel = switch (item.source) {
    ArenaComandaItemSource.app => 'App · ${item.addedByName}',
    ArenaComandaItemSource.counter => '${item.addedByName} (balcão)',
  };
  return '$time · $sourceLabel';
}

String formatItemUnitPrice(int unitPriceCents) {
  return '${formatComandaReais(unitPriceCents)}/un';
}

String paymentMethodLabel(ArenaComandaPaymentMethod method) {
  return switch (method) {
    ArenaComandaPaymentMethod.pix => 'Pix',
    ArenaComandaPaymentMethod.credit => 'Crédito',
    ArenaComandaPaymentMethod.debit => 'Débito',
    ArenaComandaPaymentMethod.cash => 'Dinheiro',
    ArenaComandaPaymentMethod.wallet => 'Carteira',
    ArenaComandaPaymentMethod.other => 'Outro',
  };
}

String formatPaymentHistoryLabel(ArenaComandaPayment payment) {
  return '${paymentMethodLabel(payment.method)} · ${payment.payerName}';
}

int computeCashbackCents(int totalCents) {
  return (totalCents * 0.03).round();
}

String customerInitials(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.substring(0, 1).toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

String formatComandaClosedSubtitle(ArenaComanda comanda) {
  final number = formatComandaNumber(comanda.displayNumber);
  final location = comanda.locationLabel ?? comanda.customerName;
  final openedAt = comanda.openedAt;
  if (openedAt == null) return '$number · $location';
  final minutes = DateTime.now().difference(openedAt).inMinutes;
  return '$number · $location · aberta por $minutes min';
}

String formatComandaContextLabel(ArenaComanda comanda) {
  final number = formatComandaNumber(comanda.displayNumber);
  final location = comanda.locationLabel;
  if (location == null || location.isEmpty) return 'COMANDA $number';
  return 'COMANDA $number · ${location.toUpperCase()}';
}

/// Motivo pelo qual o estorno não pode ser feito; `null` = permitido.
String? comandaItemReverseBlockReason(
  ArenaComanda comanda,
  ArenaComandaItem item,
) {
  if (!comanda.status.isActive) {
    return 'Comanda não está aberta para estorno.';
  }
  if (item.quantity <= 0 || item.lineTotalCents <= 0) {
    return 'Item inválido para estorno.';
  }
  final newItemsTotal = comanda.itemsTotalCents - item.lineTotalCents;
  if (newItemsTotal < 0) {
    return 'Total de consumo inconsistente.';
  }
  final newTotal = comanda.rentalCents + newItemsTotal;
  if (comanda.paidCents > newTotal) {
    return 'Estorne pagamentos antes de remover itens já cobertos.';
  }
  return null;
}

bool canReverseComandaItem(ArenaComanda comanda, ArenaComandaItem item) {
  return comandaItemReverseBlockReason(comanda, item) == null;
}
