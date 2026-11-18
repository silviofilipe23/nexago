import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import '../../../core/search/search_keywords.dart';
import 'arena_booking_card_pills.dart';
import 'arena_booking_labels.dart';
import 'arena_bookings_grouping.dart';
import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';

/// Filtro de pagamento da aba Reservas.
enum ArenaPaymentFilter { paid, due, awaitingOnline }

extension ArenaPaymentFilterLabel on ArenaPaymentFilter {
  String get label => switch (this) {
        ArenaPaymentFilter.paid => 'Pago',
        ArenaPaymentFilter.due => 'Falta receber',
        // Curto para caber numa linha com os outros (cobre Pix, cartão e MP).
        ArenaPaymentFilter.awaitingOnline => 'Aguardando online',
      };
}

/// Filtro de tipo de reserva.
enum ArenaBookingTypeFilter { single, recurring, classBlock, professor }

extension ArenaBookingTypeFilterLabel on ArenaBookingTypeFilter {
  String get label => switch (this) {
        ArenaBookingTypeFilter.single => 'Avulsa',
        ArenaBookingTypeFilter.recurring => 'Horário fixo',
        ArenaBookingTypeFilter.classBlock => 'Aula',
        ArenaBookingTypeFilter.professor => 'Professor',
      };
}

/// Filtros da aba Reservas. Dentro de um grupo vale qualquer opção (OU);
/// entre grupos, todas (E). Grupo vazio não filtra.
@immutable
class ArenaBookingsFilter {
  const ArenaBookingsFilter({
    this.courtIds = const {},
    this.payments = const {},
    this.types = const {},
    this.sports = const {},
  });

  final Set<String> courtIds;
  final Set<ArenaPaymentFilter> payments;
  final Set<ArenaBookingTypeFilter> types;

  /// Rótulos de esporte (`arenaBookingSportLabel`).
  final Set<String> sports;

  bool get isEmpty =>
      courtIds.isEmpty && payments.isEmpty && types.isEmpty && sports.isEmpty;

  /// Quantos grupos estão filtrando (selo no botão de filtro).
  int get activeGroups => [
        courtIds,
        payments,
        types,
        sports,
      ].where((s) => s.isNotEmpty).length;

  /// Só a quadra filtra: os horários livres continuam fazendo sentido.
  bool get onlyCourts => payments.isEmpty && types.isEmpty && sports.isEmpty;

  ArenaBookingsFilter copyWith({
    Set<String>? courtIds,
    Set<ArenaPaymentFilter>? payments,
    Set<ArenaBookingTypeFilter>? types,
    Set<String>? sports,
  }) =>
      ArenaBookingsFilter(
        courtIds: Set.unmodifiable(courtIds ?? this.courtIds),
        payments: Set.unmodifiable(payments ?? this.payments),
        types: Set.unmodifiable(types ?? this.types),
        sports: Set.unmodifiable(sports ?? this.sports),
      );

  bool matches(ArenaManagerBooking b) {
    if (courtIds.isNotEmpty && !courtIds.contains(b.courtId)) return false;
    if (payments.isNotEmpty && !payments.any((p) => _payment(b, p))) {
      return false;
    }
    if (types.isNotEmpty && !types.any((t) => _type(b, t))) return false;
    if (sports.isNotEmpty) {
      final sport = arenaBookingSportLabel(b.data);
      if (sport == null || !sports.contains(sport)) return false;
    }
    return true;
  }

  static bool _payment(ArenaManagerBooking b, ArenaPaymentFilter f) {
    final info = arenaBookingPaymentInfo(b.data);
    return switch (f) {
      ArenaPaymentFilter.paid => info.isPaidInFull ||
          info.settlement == ArenaBookingPaymentSettlement.paidMp,
      ArenaPaymentFilter.due => arenaBookingDueReais(b) != null,
      ArenaPaymentFilter.awaitingOnline => info.isPendingPayment,
    };
  }

  static bool _type(ArenaManagerBooking b, ArenaBookingTypeFilter t) =>
      switch (t) {
        ArenaBookingTypeFilter.recurring => b.isRecurring,
        ArenaBookingTypeFilter.classBlock => b.isClassBlock,
        ArenaBookingTypeFilter.professor => b.bookedAsProfessor,
        ArenaBookingTypeFilter.single =>
          !b.isRecurring && !b.isClassBlock && !b.bookedAsProfessor,
      };

  @override
  bool operator ==(Object other) =>
      other is ArenaBookingsFilter &&
      setEquals(other.courtIds, courtIds) &&
      setEquals(other.payments, payments) &&
      setEquals(other.types, types) &&
      setEquals(other.sports, sports);

  @override
  int get hashCode => Object.hash(
        Object.hashAllUnordered(courtIds),
        Object.hashAllUnordered(payments),
        Object.hashAllUnordered(types),
        Object.hashAllUnordered(sports),
      );
}

/// Mínimo de caracteres para a busca começar a filtrar.
const int arenaBookingsSearchMinLength = 2;

/// A reserva casa com a busca? Procura, sem acento e sem caixa, no nome de
/// quem reservou ([athleteName] já resolvido), no cliente do balcão, na
/// turma, na quadra e no código `#NXG-…`. Vários termos: todos precisam
/// aparecer.
bool arenaBookingMatchesQuery(
  ArenaManagerBooking b,
  String query, {
  String? athleteName,
}) {
  final terms = query
      .split(RegExp(r'\s+'))
      .map(normalizeSearchTerm)
      .where((t) => t.isNotEmpty)
      .toList();
  if (terms.isEmpty) return true;
  final haystack = [
    athleteName,
    b.customerName,
    b.courtName,
    ArenaBookingsGrouping.displayCode(b.id),
  ].whereType<String>().map(normalizeSearchTerm).join(' ');
  return terms.every(haystack.contains);
}

/// Contexto da folha de filtros: o dia aberto e a busca. "Hoje, 18 de nov ·
/// vale também para a busca" ou "Sexta, 20 de nov · vale também para a
/// busca".
String arenaBookingsFilterScopeLabel(DateTime day, DateTime today) {
  final d = arenaDateOnly(day);
  final when = DateFormat("d 'de' MMM", 'pt_BR').format(d).replaceAll('.', '');
  final weekday = DateFormat('EEEE', 'pt_BR').format(d).split('-').first;
  final head = d == arenaDateOnly(today)
      ? 'Hoje'
      : '${weekday[0].toUpperCase()}${weekday.substring(1)}';
  return '$head, $when · vale também para a busca';
}

/// Texto do botão da folha para [count] reservas; `null` enquanto carrega.
/// Com zero, o botão vira "Fechar" (a folha avisa que não há reserva).
String arenaBookingsFilterDoneLabel(int? count) {
  if (count == null) return 'Ver reservas';
  if (count == 0) return 'Fechar';
  return count == 1 ? 'Ver 1 reserva' : 'Ver $count reservas';
}
