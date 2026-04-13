import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'dart:async';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/layout/app_scaffold.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arenas_providers.dart';
import '../domain/booking_providers.dart';
import '../domain/my_booking_item.dart';
import '../domain/my_bookings_providers.dart';

final _bookingDateFmt = DateFormat("EEEE, d 'de' MMMM", 'pt_BR');

/// Lista de reservas do atleta (`arenaBookings`), estilo Airbnb.
class MyBookingsPage extends ConsumerWidget {
  const MyBookingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myBookingsStreamProvider);

    return AppScaffold(
      title: 'Minhas reservas',
      body: SafeArea(
        child: async.when(
          data: (items) {
            if (items.isEmpty) {
              return AppEmptyView(
                icon: Icons.event_available_outlined,
                title: 'Nenhuma reserva ainda',
                subtitle:
                    'Quando você reservar uma quadra, ela aparecerá aqui com data, horário e status.',
              );
            }
            final grouped = _groupBookings(items);
            final sectionOrder = <String>['Hoje', 'Próximas', 'Passadas'];
            final children = <Widget>[];
            var animationIndex = 0;

            for (final section in sectionOrder) {
              final groupItems = grouped[section] ?? const <MyBookingItem>[];
              if (groupItems.isEmpty) continue;

              children.add(_SectionTitle(title: section, count: groupItems.length));
              for (final item in groupItems) {
                children.add(
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: staggeredFadeSlide(
                      index: animationIndex++,
                      child: _BookingCard(
                        item: item,
                        dateDisplay: _bookingDateFmt,
                      ),
                    ),
                  ),
                );
              }
              children.add(const SizedBox(height: 8));
            }

            return ListView(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: children,
            );
          },
          loading: () => const AppLoadingView(message: 'Carregando suas reservas…'),
          error: (e, _) => AppErrorView(
            title: 'Não foi possível carregar',
            message: e.toString().replaceFirst('Exception: ', ''),
            onRetry: () {
              showAppSnackBar(context, 'Atualizando lista…');
              ref.invalidate(myBookingsStreamProvider);
            },
          ),
        ),
      ),
    );
  }
}

Map<String, List<MyBookingItem>> _groupBookings(List<MyBookingItem> items) {
  final out = <String, List<MyBookingItem>>{
    'Hoje': <MyBookingItem>[],
    'Próximas': <MyBookingItem>[],
    'Passadas': <MyBookingItem>[],
  };

  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);

  for (final item in items) {
    final date = _bookingDateOnly(item);
    if (date == null) {
      out['Passadas']!.add(item);
      continue;
    }

    if (date.isAtSameMomentAs(today)) {
      out['Hoje']!.add(item);
    } else if (date.isAfter(today)) {
      out['Próximas']!.add(item);
    } else {
      out['Passadas']!.add(item);
    }
  }

  out['Hoje']!.sort((a, b) => _sortByStartMinutes(a).compareTo(_sortByStartMinutes(b)));
  out['Próximas']!.sort((a, b) {
    final ad = _bookingDateOnly(a);
    final bd = _bookingDateOnly(b);
    if (ad == null && bd == null) return 0;
    if (ad == null) return 1;
    if (bd == null) return -1;
    return ad.compareTo(bd);
  });
  out['Passadas']!.sort((a, b) {
    final ad = _bookingDateOnly(a);
    final bd = _bookingDateOnly(b);
    if (ad == null && bd == null) return 0;
    if (ad == null) return 1;
    if (bd == null) return -1;
    return bd.compareTo(ad);
  });

  return out;
}

DateTime? _bookingDateOnly(MyBookingItem item) {
  if (item.dateRaw.length < 10) return null;
  final date = DateTime.tryParse(item.dateRaw.substring(0, 10));
  if (date == null) return null;
  return DateTime(date.year, date.month, date.day);
}

int _sortByStartMinutes(MyBookingItem item) {
  final parts = item.startTime.split(':');
  final h = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
  final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return h * 60 + m;
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.title,
    required this.count,
  });

  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 6, 2, 12),
      child: Text(
        '$title ($count)',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: -0.2,
        ),
      ),
    );
  }
}

class _BookingCard extends ConsumerStatefulWidget {
  const _BookingCard({
    required this.item,
    required this.dateDisplay,
  });

  final MyBookingItem item;
  final DateFormat dateDisplay;

  @override
  ConsumerState<_BookingCard> createState() => _BookingCardState();
}

class _BookingCardState extends ConsumerState<_BookingCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arenaAsync = widget.item.arenaId == null
        ? null
        : ref.watch(arenaByIdProvider(widget.item.arenaId!));
    final arena = arenaAsync?.valueOrNull;
    final dateLabel = _formatDateLabel(widget.item.dateRaw);
    final statusUi = _statusUi(widget.item.rawStatus);
    final logoUrl = widget.item.logoUrl ?? arena?.logoUrl;
    final coverUrl = widget.item.coverUrl ?? arena?.coverUrl;
    final hasLogo = logoUrl != null && logoUrl.isNotEmpty;
    final hasCover = coverUrl != null && coverUrl.isNotEmpty;

    return AnimatedScale(
      scale: _pressed ? 0.985 : 1,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOut,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => _openDetailsSheet(context, arena),
          onHighlightChanged: (v) => setState(() => _pressed = v),
          borderRadius: BorderRadius.circular(18),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: _pressed ? 0.04 : 0.09),
                  blurRadius: _pressed ? 12 : 22,
                  offset: Offset(0, _pressed ? 4 : 10),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: SizedBox(
                      width: 56,
                      height: 56,
                      child: hasLogo
                          ? CachedNetworkImage(
                              imageUrl: logoUrl,
                              fit: BoxFit.cover,
                              fadeInDuration: const Duration(milliseconds: 220),
                              placeholder: (context, _) => const ColoredBox(color: Color(0xFFE0E0E0)),
                              errorWidget: (context, _, __) => const ColoredBox(color: Color(0xFFE0E0E0)),
                            )
                          : Container(
                              color: const Color(0xFFE0E0E0),
                              child: hasCover
                                  ? CachedNetworkImage(
                                      imageUrl: coverUrl,
                                      fit: BoxFit.cover,
                                      placeholder: (context, _) => const SizedBox.shrink(),
                                      errorWidget: (context, _, __) =>
                                          const Icon(Icons.sports_volleyball_rounded, color: AppColors.brand),
                                    )
                                  : const Icon(Icons.sports_volleyball_rounded, color: AppColors.brand),
                            ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.item.arenaName,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.2,
                            height: 1.2,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (widget.item.courtName != null && widget.item.courtName!.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(
                            widget.item.courtName!,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: AppColors.onSurfaceMuted,
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                        const SizedBox(height: 10),
                        _MetaRow(icon: Icons.calendar_today_outlined, text: dateLabel),
                        const SizedBox(height: 6),
                        _MetaRow(
                          icon: Icons.schedule_rounded,
                          text: '${widget.item.startTime} – ${widget.item.endTime}',
                        ),
                        const SizedBox(height: 8),
                        BookingLiveStatus(
                          dateRaw: widget.item.dateRaw,
                          startTime: widget.item.startTime,
                          endTime: widget.item.endTime,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _StatusChip(
                    label: statusUi.label,
                    icon: statusUi.icon,
                    fg: statusUi.fg,
                    bg: statusUi.bg,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _formatDateLabel(String raw) {
    if (raw.length < 10) return raw.isEmpty ? '—' : raw;
    final d = DateTime.tryParse(raw.substring(0, 10));
    if (d == null) return raw;
    try {
      return widget.dateDisplay.format(d);
    } catch (_) {
      return raw;
    }
  }

  Future<void> _openDetailsSheet(BuildContext context, dynamic arena) async {
    final bookingService = ref.read(bookingServiceProvider);
    final currentUser = ref.read(authProvider).valueOrNull;
    final locationQuery = (arena?.locationLabel as String?) ?? widget.item.arenaName;
    final startAt = _bookingStartDateTime(widget.item);
    final canCancelByTime = startAt != null &&
        DateTime.now().isBefore(startAt.subtract(const Duration(hours: 2)));

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return BookingDetailsSheet(
          item: widget.item,
          dateLabel: _formatDateLabel(widget.item.dateRaw),
          onOpenMaps: () async {
            final q = Uri.encodeComponent(locationQuery);
            final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$q');
            if (await canLaunchUrl(uri)) {
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            } else if (mounted) {
              showAppSnackBar(context, 'Não foi possível abrir o Google Maps.');
            }
          },
          onPayNow: () {
            showAppSnackBar(context, 'Fluxo de pagamento em breve.');
          },
          onCancelBooking: () async {
            if (!canCancelByTime) {
              if (mounted) {
                showAppSnackBar(
                  context,
                  'Cancelamento disponível apenas até 2h antes do horário da reserva.',
                );
              }
              return;
            }
            final uid = currentUser?.uid;
            if (uid == null) {
              if (mounted) showAppSnackBar(context, 'Faça login para cancelar.');
              return;
            }
            try {
              await bookingService.cancelBooking(
                bookingId: widget.item.id,
                athleteId: uid,
              );
              if (mounted) {
                Navigator.of(sheetContext).pop();
                showAppSnackBar(context, 'Reserva cancelada com sucesso.');
                ref.invalidate(myBookingsStreamProvider);
              }
            } catch (e) {
              if (mounted) {
                showAppSnackBar(context, e.toString().replaceFirst('Exception: ', ''));
              }
            }
          },
          canCancelBooking: canCancelByTime,
        );
      },
    );
  }

  DateTime? _bookingStartDateTime(MyBookingItem item) {
    if (item.dateRaw.length < 10) return null;
    final date = DateTime.tryParse(item.dateRaw.substring(0, 10));
    if (date == null) return null;
    final parts = item.startTime.split(':');
    if (parts.length < 2) return null;
    final h = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 0;
    return DateTime(date.year, date.month, date.day, h, m);
  }
}

class BookingDetailsSheet extends StatelessWidget {
  const BookingDetailsSheet({
    super.key,
    required this.item,
    required this.dateLabel,
    required this.onOpenMaps,
    required this.onPayNow,
    required this.onCancelBooking,
    required this.canCancelBooking,
  });

  final MyBookingItem item;
  final String dateLabel;
  final VoidCallback onOpenMaps;
  final VoidCallback onPayNow;
  final VoidCallback onCancelBooking;
  final bool canCancelBooking;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusUi = _statusUi(item.rawStatus);
    final canPayNow = item.rawStatus.trim().toLowerCase() == 'pending';

    return AnimatedPadding(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.arenaName,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2,
                  ),
                ),
                if (item.courtName != null && item.courtName!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    item.courtName!,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                _MetaRow(icon: Icons.calendar_today_outlined, text: dateLabel),
                const SizedBox(height: 8),
                _MetaRow(icon: Icons.schedule_rounded, text: '${item.startTime} – ${item.endTime}'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _StatusChip(
                      label: statusUi.label,
                      icon: statusUi.icon,
                      fg: statusUi.fg,
                      bg: statusUi.bg,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: BookingLiveStatus(
                        dateRaw: item.dateRaw,
                        startTime: item.startTime,
                        endTime: item.endTime,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: onOpenMaps,
                        icon: const Icon(Icons.navigation_rounded),
                        label: const Text('Como chegar'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: canPayNow ? onPayNow : null,
                        icon: const Icon(Icons.payment_rounded),
                        label: const Text('Pagar agora'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: TextButton.icon(
                    onPressed: canCancelBooking ? onCancelBooking : null,
                    icon: const Icon(Icons.cancel_outlined),
                    label: const Text('Cancelar reserva'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({
    required this.icon,
    required this.text,
  });

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          icon,
          size: 18,
          color: AppColors.onSurfaceMuted,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.88),
              height: 1.35,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.icon,
    required this.fg,
    required this.bg,
  });

  final String label;
  final IconData icon;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusUi {
  const _StatusUi({
    required this.label,
    required this.icon,
    required this.fg,
    required this.bg,
  });

  final String label;
  final IconData icon;
  final Color fg;
  final Color bg;
}

_StatusUi _statusUi(String raw) {
  final s = raw.trim().toLowerCase();
  switch (s) {
    case 'active':
      return _StatusUi(
        label: 'Ativa',
        icon: Icons.check_circle_rounded,
        fg: const Color(0xFF0E7A35),
        bg: const Color(0xFFDDF8E7),
      );
    case 'canceled':
    case 'cancelled':
      return _StatusUi(
        label: 'Cancelada',
        icon: Icons.cancel_rounded,
        fg: const Color(0xFF7A1E1E),
        bg: const Color(0xFFFFE3E3),
      );
    case 'pending':
    case 'processing':
      return _StatusUi(
        label: 'Pendente',
        icon: Icons.hourglass_top_rounded,
        fg: const Color(0xFFB45A00),
        bg: const Color(0xFFFFEDD8),
      );
    case 'checkin_open':
      return _StatusUi(
        label: 'Check-in',
        icon: Icons.qr_code_scanner_rounded,
        fg: const Color(0xFF1565C0),
        bg: const Color(0xFFDDF0FF),
      );
    default:
      final pretty = s.isEmpty
          ? '—'
          : s.replaceAll('_', ' ').split(' ').map((w) {
              if (w.isEmpty) return w;
              return w[0].toUpperCase() + w.substring(1);
            }).join(' ');
      return _StatusUi(
        label: pretty,
        icon: Icons.info_rounded,
        fg: const Color(0xFF424242),
        bg: const Color(0xFFEEEEEE),
      );
  }
}

enum _LiveBookingState { ongoing, future, finished, unknown }

class BookingLiveStatus extends StatefulWidget {
  const BookingLiveStatus({
    super.key,
    required this.dateRaw,
    required this.startTime,
    required this.endTime,
  });

  final String dateRaw;
  final String startTime;
  final String endTime;

  @override
  State<BookingLiveStatus> createState() => _BookingLiveStatusState();
}

class _BookingLiveStatusState extends State<BookingLiveStatus> {
  Timer? _timer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final range = _buildRange(widget.dateRaw, widget.startTime, widget.endTime);
    if (range == null) return const SizedBox.shrink();

    final start = range.$1;
    final end = range.$2;
    final state = _stateFor(_now, start, end);
    switch (state) {
      case _LiveBookingState.ongoing:
        return _LiveChip(
          icon: Icons.local_fire_department_rounded,
          text: 'Em andamento',
          fg: const Color(0xFF0E7A35),
          bg: const Color(0xFFDDF8E7),
        );
      case _LiveBookingState.future:
        final diff = start.difference(_now);
        final urgent = diff.inMinutes <= 10;
        return _LiveChip(
          icon: Icons.hourglass_top_rounded,
          text: _formatCountdown(diff),
          fg: urgent ? const Color(0xFFB93800) : const Color(0xFF1E5FFF),
          bg: urgent ? const Color(0xFFFFE6DE) : const Color(0xFFEAF1FF),
        );
      case _LiveBookingState.finished:
        return _LiveChip(
          icon: Icons.check_circle_rounded,
          text: 'Finalizado',
          fg: const Color(0xFF616161),
          bg: const Color(0xFFEEEEEE),
        );
      case _LiveBookingState.unknown:
        return const SizedBox.shrink();
    }
  }

  (DateTime, DateTime)? _buildRange(String rawDate, String rawStart, String rawEnd) {
    if (rawDate.length < 10) return null;
    final date = DateTime.tryParse(rawDate.substring(0, 10));
    if (date == null) return null;
    final sm = _toMinutes(rawStart);
    final em = _toMinutes(rawEnd);
    if (sm == null || em == null) return null;
    final start = DateTime(date.year, date.month, date.day, sm ~/ 60, sm % 60);
    final end = DateTime(date.year, date.month, date.day, em ~/ 60, em % 60);
    return (start, end);
  }

  int? _toMinutes(String hhmm) {
    final parts = hhmm.split(':');
    if (parts.length < 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return null;
    return h * 60 + m;
  }

  _LiveBookingState _stateFor(DateTime now, DateTime start, DateTime end) {
    if (!now.isBefore(start) && !now.isAfter(end)) return _LiveBookingState.ongoing;
    if (now.isBefore(start)) return _LiveBookingState.future;
    if (now.isAfter(end)) return _LiveBookingState.finished;
    return _LiveBookingState.unknown;
  }

  String _formatCountdown(Duration d) {
    if (d.inSeconds <= 59) return 'Começando agora';
    if (d.inMinutes < 60) return 'Começa em ${d.inMinutes}min';
    final h = d.inHours;
    final min = d.inMinutes.remainder(60);
    if (min == 0) return 'Começa em ${h}h';
    return 'Começa em ${h}h ${min}min';
  }
}

class _LiveChip extends StatelessWidget {
  const _LiveChip({
    required this.icon,
    required this.text,
    required this.fg,
    required this.bg,
  });

  final IconData icon;
  final String text;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

