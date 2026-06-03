import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../athlete/domain/athlete_profile.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_bookings_grouping.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_slot_detail_providers.dart';
import 'arena_dashboard_tokens.dart';

class ArenaBookingCard extends ConsumerWidget {
  const ArenaBookingCard({
    super.key,
    required this.booking,
  });

  final ArenaManagerBooking booking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final athleteId = booking.athleteId.trim();
    final nameAsync = ref.watch(athleteDisplayLabelProvider(athleteId));
    final profileAsync = athleteId.isEmpty
        ? null
        : ref.watch(athleteProfileByIdProvider(athleteId));

    final statusBadge = _businessStatusBadge(booking.data);
    final statusColor = _statusBadgeColor(statusBadge);
    final paymentLabel = _shortPaymentLabel(arenaBookingPaymentLabel(booking.data));
    final attendanceLabel = ArenaBookingsGrouping.attendanceChipLabel(booking);
    final isAttendancePending = attendanceLabel.toLowerCase() == 'pendente';
    final participants =
        (booking.data['confirmedParticipants'] as num?)?.toInt() ?? 1;
    final amount = ArenaBookingsGrouping.amountReais(booking.data);
    final amountStr = amount != null
        ? NumberFormat.currency(locale: 'pt_BR', symbol: r'R$').format(amount)
        : null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          context.pushNamed(
            AppRouteNames.arenaBookingDetail,
            pathParameters: {'bookingId': booking.id},
            extra: booking,
          );
        },
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        child: Ink(
          decoration: ArenaDashboardTokens.cardDecoration(context),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 14, 16, 14),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Container(
                      width: 3,
                      decoration: BoxDecoration(
                        color: statusColor,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Expanded(
                              child: Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      '${booking.startTime} – ${booking.endTime}',
                                      style: _monoStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.onSurface,
                                      ),
                                    ),
                                  ),
                                  SizedBox(width: 8),
                                  _StatusBadge(
                                    label: statusBadge,
                                    color: statusColor,
                                  ),
                                ],
                              ),
                            ),
                            if (amountStr != null) ...[
                              SizedBox(width: 8),
                              Text(
                                amountStr,
                                style: _monoStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.onSurface,
                                ),
                              ),
                            ],
                          ],
                        ),
                        SizedBox(height: 14),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            _AthleteAvatarRow(
                              nameAsync: nameAsync,
                              profileAsync: profileAsync,
                              showSecond: participants >= 2,
                            ),
                            SizedBox(width: 12),
                            Expanded(
                              child: nameAsync.when(
                                data: (name) => Text(
                                  name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                    height: 1.25,
                                    color: AppColors.onSurface,
                                  ),
                                ),
                                loading: () => Text(
                                  'Carregando…',
                                  style: TextStyle(
                                    color: AppColors.onSurfaceMuted,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                                error: (_, __) => Text(
                                  'Atleta',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                    color: AppColors.onSurface,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _MetaChip(
                              icon: Icons.sports_tennis_rounded,
                              label: booking.courtName,
                            ),
                            _MetaChip(
                              icon: Icons.account_balance_wallet_outlined,
                              label: paymentLabel,
                            ),
                          ],
                        ),
                        SizedBox(height: 8),
                        _MetaChip(
                          icon: Icons.schedule_rounded,
                          label: attendanceLabel,
                          accent: isAttendancePending
                              ? AppColors.pending
                              : null,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  static String _businessStatusBadge(Map<String, dynamic> data) {
    final status = (data['status'] as String?)?.toLowerCase().trim() ?? '';
    return switch (status) {
      'active' => 'ATIVA',
      'completed' => 'CONCLUÍDA',
      'cancelled' || 'canceled' => 'CANCELADA',
      _ => 'ATIVA',
    };
  }

  static Color _statusBadgeColor(String badge) {
    return switch (badge) {
      'ATIVA' => AppColors.win,
      'CONCLUÍDA' => AppColors.onSurfaceMuted,
      'CANCELADA' => AppColors.live,
      _ => AppColors.win,
    };
  }

  static String _shortPaymentLabel(String label) {
    final l = label.toLowerCase();
    if (l.contains('pago integral')) return 'PIX · Pago integral';
    if (l.contains('sinal pago')) return 'PIX · Sinal pago';
    if (l.contains('aguardando')) return 'PIX · Aguardando';
    if (l.contains('não concluído')) return 'PIX · Não pago';
    if (l.contains('direto')) return 'Direto / sem link';
    if (l.contains('mercado pago')) return 'Mercado Pago';
    if (l.contains('na arena')) return 'Pagamento na arena';
    if (l.contains('app') || l.contains('plataforma')) {
      return 'App / plataforma';
    }
    return label;
  }

  static TextStyle _monoStyle({
    required double fontSize,
    required FontWeight fontWeight,
    required Color color,
  }) {
    return TextStyle(
      fontFamily: 'monospace',
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: 0.2,
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w800,
              fontSize: 10,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _AthleteAvatarRow extends StatelessWidget {
  const _AthleteAvatarRow({
    required this.nameAsync,
    required this.profileAsync,
    required this.showSecond,
  });

  final AsyncValue<String> nameAsync;
  final AsyncValue<AthleteProfile?>? profileAsync;
  final bool showSecond;

  @override
  Widget build(BuildContext context) {
    final name = nameAsync.valueOrNull ?? '';
    final initials = ArenaBookingsGrouping.athleteInitials(name);
    final url = profileAsync?.valueOrNull?.avatarUrl?.trim();

    return SizedBox(
      width: showSecond ? 44 : 32,
      height: 32,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            child: _BookingAvatar(
              imageUrl: url,
              initials: initials,
              size: 32,
              borderColor: AppColors.surfaceCard,
            ),
          ),
          if (showSecond)
            Positioned(
              left: 18,
              child: _BookingAvatar(
                imageUrl: null,
                initials: '+1',
                size: 32,
                borderColor: AppColors.surfaceCard,
                backgroundColor: AppColors.win.withValues(alpha: 0.25),
                foregroundColor: AppColors.win,
              ),
            ),
        ],
      ),
    );
  }
}

class _BookingAvatar extends StatelessWidget {
  const _BookingAvatar({
    required this.imageUrl,
    required this.initials,
    required this.size,
    required this.borderColor,
    this.backgroundColor,
    this.foregroundColor,
  });

  final String? imageUrl;
  final String initials;
  final double size;
  final Color borderColor;
  final Color? backgroundColor;
  final Color? foregroundColor;

  @override
  Widget build(BuildContext context) {
    final radius = size / 2;
    final bg = backgroundColor ?? AppColors.brand.withValues(alpha: 0.22);
    final fg = foregroundColor ?? AppColors.brand;
    final displayInitials =
        initials.length > 2 ? initials.substring(0, 2) : initials;

    if (imageUrl != null && imageUrl!.isNotEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: borderColor, width: 2),
        ),
        child: ClipOval(
          child: CachedNetworkImage(
            imageUrl: imageUrl!,
            width: size,
            height: size,
            fit: BoxFit.cover,
            placeholder: (_, __) => _initialsPlaceholder(
              radius: radius,
              bg: bg,
              fg: fg,
              initials: displayInitials,
            ),
            errorWidget: (_, __, ___) => _initialsPlaceholder(
              radius: radius,
              bg: bg,
              fg: fg,
              initials: displayInitials,
            ),
          ),
        ),
      );
    }

    return CircleAvatar(
      radius: radius,
      backgroundColor: bg,
      foregroundColor: fg,
      child: Text(
        displayInitials,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: size * 0.34,
          color: fg,
        ),
      ),
    );
  }

  static Widget _initialsPlaceholder({
    required double radius,
    required Color bg,
    required Color fg,
    required String initials,
  }) {
    return CircleAvatar(
      radius: radius,
      backgroundColor: bg,
      child: Text(
        initials,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: radius * 0.68,
          color: fg,
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.icon,
    required this.label,
    this.accent,
  });

  final IconData icon;
  final String label;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final fg = accent ?? AppColors.onSurfaceMuted;
    final bg = accent != null
        ? accent!.withValues(alpha: 0.14)
        : AppColors.surfaceRaised;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: accent != null
            ? Border.all(color: accent!.withValues(alpha: 0.35))
            : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}
