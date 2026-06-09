import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/location/user_location_providers.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../arenas/domain/arena_booking_success_actions.dart';
import '../../../../arenas/domain/arenas_providers.dart';
import '../../../../arenas/domain/my_booking_item.dart';
import '../../../../tournaments/domain/my_tournaments_logic.dart';
import '../../../../tournaments/domain/tournament_discovery_models.dart';
import '../../../domain/athlete_booking_helpers.dart';
import '../../../domain/athlete_home_featured_logic.dart';

const _featuredCardRadius = 24.0;

const _featuredPremiumGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [
    Color(0xFFFF8A4A),
    Color(0xFFFF6A1A),
    Color(0xFFE5560E),
    Color(0xFFC93A12),
  ],
);

class AthleteHomeFeaturedCard extends StatelessWidget {
  const AthleteHomeFeaturedCard({
    super.key,
    required this.featured,
    required this.onReserveTap,
    this.onBookingTap,
    this.onTournamentTap,
  });

  final AthleteHomeFeatured? featured;
  final VoidCallback onReserveTap;
  final VoidCallback? onBookingTap;
  final VoidCallback? onTournamentTap;

  @override
  Widget build(BuildContext context) {
    return switch (featured) {
      null => AthleteHomeReserveCtaCard(onTap: onReserveTap),
      AthleteHomeFeaturedBooking(:final booking) =>
        _FeaturedBookingCard(booking: booking, onTap: onBookingTap),
      AthleteHomeFeaturedTournament(:final registration) =>
        _FeaturedTournamentCard(
          registration: registration,
          onTap: onTournamentTap,
        ),
    };
  }
}

class AthleteHomeReserveCtaCard extends StatelessWidget {
  const AthleteHomeReserveCtaCard({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Nenhuma reserva confirmada',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              SizedBox(height: 6),
              Text(
                'Reserve uma quadra e apareça aqui com countdown e detalhes.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.35,
                ),
              ),
              SizedBox(height: 16),
              FilledButton.icon(
                onPressed: onTap,
                icon: Icon(Icons.add_rounded, size: 20),
                label: Text('Reservar quadra'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeaturedBookingCard extends ConsumerWidget {
  const _FeaturedBookingCard({required this.booking, this.onTap});

  final MyBookingItem booking;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final start = parseBookingStart(booking);
    final countdown = start != null
        ? formatCountdownLabel(now, start)
        : 'EM BREVE';
    final courtSuffix =
        booking.courtName != null && booking.courtName!.isNotEmpty
        ? ' · ${booking.courtName}'
        : '';
    final arenaLine = '${booking.arenaName}$courtSuffix';
    final partner = bookingPartnerLabel(booking);
    final scheduleLine = _scheduleLine(booking, start);
    final subtitle = partner != null
        ? '$scheduleLine · com $partner'
        : scheduleLine;

    return Material(
      borderRadius: BorderRadius.circular(_featuredCardRadius),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(_featuredCardRadius),
            gradient: _featuredPremiumGradient,
          ),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: AppColors.black,
                            shape: BoxShape.circle,
                          ),
                        ),
                        SizedBox(width: 6),
                        Text(
                          countdown,
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: AppColors.black.withValues(alpha: 0.75),
                          ),
                        ),
                      ],
                    ),
                    Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.black.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'CONFIRMADA',
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: AppColors.black,
                          fontSize: 9,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 14),
                Text(
                  arenaLine,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: AppColors.black,
                    height: 1.1,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.black.withValues(alpha: 0.7),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => _openDirections(context, ref),
                        icon: Icon(Icons.location_on_outlined, size: 18),
                        label: Text('Como chegar'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.black,
                          foregroundColor: AppColors.brand,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                    // SizedBox(width: 8),
                    // _IconAction(
                    //   icon: Icons.ios_share_rounded,
                    //   onTap: () => showAppSnackBar(context, 'Em breve.'),
                    // ),
                    // SizedBox(width: 8),
                    // _IconAction(
                    //   icon: Icons.more_horiz_rounded,
                    //   onTap: () => showAppSnackBar(context, 'Em breve.'),
                    // ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openDirections(BuildContext context, WidgetRef ref) async {
    final arenaAsync = booking.arenaId == null
        ? null
        : ref.read(arenaByIdProvider(booking.arenaId!));
    final arena = arenaAsync?.valueOrNull;
    final destination = ArenaBookingSuccessActions.resolveMapsDestination(
      arenaName: booking.arenaName,
      locationLabel: arena?.locationLabel,
      addressLine: arena?.addressLine,
      latitude: arena?.latitude,
      longitude: arena?.longitude,
    );

    final location = await ref.read(userLocationProvider.future);
    final origin = ArenaBookingSuccessActions.resolveMapsOrigin(
      latitude: location.latitude,
      longitude: location.longitude,
    );

    final uri = Uri.parse(
      ArenaBookingSuccessActions.buildMapsDirectionsUrl(
        destination: destination,
        origin: origin,
      ),
    );
    if (!await canLaunchUrl(uri)) {
      if (context.mounted) {
        showAppSnackBar(
          context,
          'Não foi possível abrir o mapa.',
          isError: true,
        );
      }
      return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  String _scheduleLine(MyBookingItem booking, DateTime? start) {
    if (start == null) {
      return 'Hoje · ${booking.startTime}';
    }
    final now = DateTime.now();
    final isToday =
        start.year == now.year &&
        start.month == now.month &&
        start.day == now.day;
    if (isToday) {
      return 'Hoje · ${DateFormat('HH:mm', 'pt_BR').format(start)}';
    }
    return DateFormat("d MMM · HH:mm", 'pt_BR').format(start);
  }
}

class _FeaturedTournamentCard extends StatelessWidget {
  const _FeaturedTournamentCard({
    required this.registration,
    this.onTap,
  });

  final MyTournamentRegistration registration;
  final VoidCallback? onTap;

  static const _eyebrowStyle = TextStyle(
    fontWeight: FontWeight.w900,
    color: AppColors.black,
    fontSize: 10,
    letterSpacing: 0.6,
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final start = registration.startDate;
    final isLiveToday = registrationShowsAsLiveToday(registration);
    final eyebrow = _tournamentEyebrow(now, start, isLiveToday);
    final detailsLine = _tournamentDetailsLine(registration);

    return Material(
      borderRadius: BorderRadius.circular(_featuredCardRadius),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(_featuredCardRadius),
            gradient: _featuredPremiumGradient,
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: AppColors.black,
                              shape: BoxShape.circle,
                            ),
                          ),
                          SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              eyebrow,
                              style: _eyebrowStyle.copyWith(
                                color: AppColors.black.withValues(alpha: 0.8),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.black.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'INSCRITO',
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: AppColors.black,
                          fontSize: 9,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 14),
                Text(
                  registration.tournamentName,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: AppColors.black,
                    height: 1.05,
                    letterSpacing: -0.3,
                  ),
                ),
                if (detailsLine.isNotEmpty) ...[
                  SizedBox(height: 8),
                  Text(
                    detailsLine,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.black.withValues(alpha: 0.72),
                      fontWeight: FontWeight.w600,
                      height: 1.3,
                    ),
                  ),
                ],
                SizedBox(height: 20),
                Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton(
                    onPressed: onTap,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.black,
                      foregroundColor: AppColors.brand,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 28,
                        vertical: 14,
                      ),
                      shape: const StadiumBorder(),
                      elevation: 0,
                    ),
                    child: Text(
                      'Ver torneio',
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _tournamentEyebrow(DateTime now, DateTime? start, bool isLiveToday) {
    if (isLiveToday) {
      if (registration.listingStatus == TournamentListingStatus.live) {
        return 'AO VIVO · TORNEIO HOJE';
      }
      if (start != null && start.isAfter(now)) {
        return '${formatCountdownLabel(now, start)} · TORNEIO';
      }
      return 'DIA DO EVENTO';
    }
    if (start != null && start.isAfter(now)) {
      return '${formatCountdownLabel(now, start)} · TORNEIO';
    }
    return 'SEU PRÓXIMO TORNEIO';
  }

  String _tournamentDetailsLine(MyTournamentRegistration registration) {
    final parts = <String>[];
    final location = registration.locationLine?.trim();
    if (location != null && location.isNotEmpty) {
      parts.add(location);
    }
    final date = registration.dateLabel.trim();
    if (date.isNotEmpty) parts.add(date);
    return parts.join(' · ');
  }
}
