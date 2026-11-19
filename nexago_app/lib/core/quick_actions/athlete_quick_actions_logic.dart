import 'package:flutter/foundation.dart';

import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/athlete/domain/athlete_shell_providers.dart';
import 'package:nexago_app/features/athlete/domain/booking_played_today.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_logic.dart';

/// Ações do toque longo no ícone do app (Home Screen Quick Actions do iOS).
///
/// Modelo "Contextual": o menu se monta com a situação do atleta. A próxima
/// reserva vira o título, o Modo Focus aparece no dia de torneio (e fica mais
/// perto do ícone) e Mensagens mostra as não lidas.
///
/// Todos os itens são dinâmicos (`UIApplication.shortcutItems`): um item fixo
/// no Info.plist seria sempre o primeiro e o Focus não conseguiria subir.
enum AthleteQuickAction {
  reservar('nexago.quick.reservar'),
  agenda('nexago.quick.agenda'),
  booking('nexago.quick.booking'),
  torneios('nexago.quick.torneios'),
  focus('nexago.quick.focus'),
  mensagens('nexago.quick.mensagens');

  const AthleteQuickAction(this.type);

  /// `UIApplicationShortcutItem.type`.
  final String type;

  static AthleteQuickAction? fromType(String type) {
    for (final action in values) {
      if (action.type == type) return action;
    }
    return null;
  }
}

/// O iOS mostra no máximo 4 ações do app no menu.
const maxQuickActions = 4;

/// Chaves do `userInfo` gravado em cada item.
const quickActionBookingIdKey = 'bookingId';
const quickActionTournamentIdKey = 'tournamentId';

/// Epoch em ms até quando o item contextual vale. O menu fica gravado com o
/// app fechado; o toque confere isto e cai na aba genérica se já passou.
const quickActionValidUntilKey = 'validUntil';

/// Reserva sem horário de fim legível vale até 1h depois do início.
const _bookingFallbackDuration = Duration(hours: 1);
const _maxUnreadShown = 99;

const _weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/// Um item do menu, já no formato que o lado nativo grava.
@immutable
class QuickActionItem {
  const QuickActionItem({
    required this.type,
    required this.title,
    required this.sfSymbol,
    this.subtitle,
    this.payload = const {},
  });

  final String type;
  final String title;
  final String? subtitle;

  /// Nome do SF Symbol (`UIApplicationShortcutIcon(systemImageName:)`).
  final String sfSymbol;
  final Map<String, String> payload;

  Map<String, Object?> toChannelMap() => {
        'type': type,
        'title': title,
        'subtitle': subtitle,
        'icon': sfSymbol,
        'payload': payload,
      };

  @override
  bool operator ==(Object other) =>
      other is QuickActionItem &&
      other.type == type &&
      other.title == title &&
      other.subtitle == subtitle &&
      other.sfSymbol == sfSymbol &&
      mapEquals(other.payload, payload);

  @override
  int get hashCode => Object.hash(
        type,
        title,
        subtitle,
        sfSymbol,
        Object.hashAllUnordered(
          payload.entries.map((e) => Object.hash(e.key, e.value)),
        ),
      );
}

/// Para onde o toque leva. [shellTabIndex] troca a aba da casca do atleta
/// quando ela já está montada (o `?tab=` só vale ao criá-la).
@immutable
class QuickActionDestination {
  const QuickActionDestination(this.path, {this.shellTabIndex});

  final String path;
  final int? shellTabIndex;
}

/// Monta o menu na ordem do iOS: o primeiro item fica mais perto do ícone.
///
/// - Sem login: só "Reservar quadra" (o toque passa pelo login antes).
/// - Logado em outro papel (arena, organizador, professor, CT): nada.
/// - Papel ainda resolvendo: só "Reservar quadra", como sem login.
List<QuickActionItem> buildAthleteQuickActions({
  required bool signedIn,
  required AppMobileRole? role,
  required DateTime now,
  MyBookingItem? nextBooking,
  AthleteFocusHomeTarget? focus,
  int unreadMessages = 0,
}) {
  if (signedIn && role != null && role != AppMobileRole.athlete) {
    return const [];
  }
  if (!signedIn || role == null) return List.unmodifiable([_reservarItem]);

  final scheduleItem = _bookingItem(nextBooking) ?? _agendaItem;
  final messagesItem = _messagesItem(unreadMessages);
  final focusItem = _focusItem(focus, now);

  final items = focusItem != null
      ? [focusItem, _reservarItem, scheduleItem, messagesItem]
      : [_reservarItem, scheduleItem, _torneiosItem, messagesItem];
  return List.unmodifiable(items.take(maxQuickActions));
}

/// Resolve o toque. `null` para tipo desconhecido (não navega).
QuickActionDestination? resolveAthleteQuickAction({
  required String type,
  required Map<String, String> payload,
  required DateTime now,
}) {
  final action = AthleteQuickAction.fromType(type);
  if (action == null) return null;

  return switch (action) {
    AthleteQuickAction.reservar => _reservarDestination,
    AthleteQuickAction.agenda => _agendaDestination,
    AthleteQuickAction.torneios => _torneiosDestination,
    AthleteQuickAction.mensagens =>
      const QuickActionDestination(AppRoutes.athleteMessages),
    AthleteQuickAction.booking => _contextualDestination(
        payload: payload,
        idKey: quickActionBookingIdKey,
        now: now,
        build: (id) => AppRoutes.bookingDetailsById
            .replaceFirst(':bookingId', Uri.encodeComponent(id)),
        fallback: _agendaDestination,
      ),
    AthleteQuickAction.focus => _contextualDestination(
        payload: payload,
        idKey: quickActionTournamentIdKey,
        now: now,
        build: (id) => AppRoutes.tournamentFocus
            .replaceFirst(':tournamentId', Uri.encodeComponent(id)),
        fallback: _torneiosDestination,
      ),
  };
}

final _reservarItem = QuickActionItem(
  type: AthleteQuickAction.reservar.type,
  title: 'Reservar quadra',
  sfSymbol: 'plus.circle',
);

final _agendaItem = QuickActionItem(
  type: AthleteQuickAction.agenda.type,
  title: 'Agenda',
  subtitle: 'Nada marcado',
  sfSymbol: 'calendar',
);

final _torneiosItem = QuickActionItem(
  type: AthleteQuickAction.torneios.type,
  title: 'Torneios',
  sfSymbol: 'trophy',
);

QuickActionItem? _bookingItem(MyBookingItem? booking) {
  if (booking == null) return null;
  final start = parseBookingStartAt(booking);
  if (start == null) return null;
  // Fim vazio vira meia-noite no parser compartilhado: aqui cai no fallback.
  final end =
      booking.endTime.trim().isEmpty ? null : parseBookingEndAt(booking);
  final validUntil = end ?? start.add(_bookingFallbackDuration);

  return QuickActionItem(
    type: AthleteQuickAction.booking.type,
    title: '${_weekdays[start.weekday - 1]}, ${_dayMonth(start)} · '
        '${_hourLabel(start)}',
    subtitle: _bookingPlace(booking),
    sfSymbol: 'calendar.badge.clock',
    payload: {
      quickActionBookingIdKey: booking.id,
      quickActionValidUntilKey: validUntil.millisecondsSinceEpoch.toString(),
    },
  );
}

QuickActionItem? _focusItem(AthleteFocusHomeTarget? focus, DateTime now) {
  if (focus == null) return null;
  final name = focus.tournamentName.trim();
  // Vale até a meia-noite do dia do evento (São Paulo, o fuso dos torneios,
  // não o do aparelho): depois disso o toque cai em Torneios.
  final eventToday = toNexagoEventLocal(now);
  final endOfDay = nexagoEventDateTime(
    year: eventToday.year,
    month: eventToday.month,
    day: eventToday.day + 1,
  );

  return QuickActionItem(
    type: AthleteQuickAction.focus.type,
    title: 'Modo Focus',
    subtitle: name.isEmpty ? 'Hoje' : '$name · hoje',
    sfSymbol: 'flame.fill',
    payload: {
      quickActionTournamentIdKey: focus.tournamentId,
      quickActionValidUntilKey: endOfDay.millisecondsSinceEpoch.toString(),
    },
  );
}

QuickActionItem _messagesItem(int unread) {
  return QuickActionItem(
    type: AthleteQuickAction.mensagens.type,
    title: 'Mensagens',
    subtitle: _unreadLabel(unread),
    sfSymbol: 'bubble.left.and.bubble.right',
  );
}

String? _unreadLabel(int unread) {
  if (unread <= 0) return null;
  if (unread == 1) return '1 não lida';
  if (unread > _maxUnreadShown) return '$_maxUnreadShown+ não lidas';
  return '$unread não lidas';
}

String _bookingPlace(MyBookingItem booking) {
  final arena = booking.arenaName.trim();
  final court = booking.courtName?.trim() ?? '';
  if (court.isEmpty) return arena;
  if (arena.isEmpty) return court;
  return '$arena · $court';
}

String _dayMonth(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';

String _hourLabel(DateTime d) {
  if (d.minute == 0) return '${d.hour}h';
  return '${d.hour}h${d.minute.toString().padLeft(2, '0')}';
}

QuickActionDestination _discoverTab(String tab, int index) {
  final path = Uri(
    path: AppRoutes.discover,
    queryParameters: {'tab': tab},
  ).toString();
  return QuickActionDestination(path, shellTabIndex: index);
}

final _reservarDestination =
    _discoverTab('reservar', athleteShellReservarTabIndex);
final _agendaDestination = _discoverTab('agenda', athleteShellAgendaTabIndex);
final _torneiosDestination =
    _discoverTab('torneios', athleteShellCompeteTabIndex);

QuickActionDestination _contextualDestination({
  required Map<String, String> payload,
  required String idKey,
  required DateTime now,
  required String Function(String id) build,
  required QuickActionDestination fallback,
}) {
  final id = payload[idKey]?.trim() ?? '';
  final validUntilMs = int.tryParse(payload[quickActionValidUntilKey] ?? '');
  if (id.isEmpty || validUntilMs == null) return fallback;

  final validUntil = DateTime.fromMillisecondsSinceEpoch(validUntilMs);
  if (!now.isBefore(validUntil)) return fallback;
  return QuickActionDestination(build(id));
}
