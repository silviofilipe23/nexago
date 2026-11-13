import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../arenas/domain/booking_players.dart';
import '../../../athlete/domain/athlete_profile.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../domain/arena_bookings_grouping.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_slot_detail_providers.dart';
import 'arena_dashboard_tokens.dart';

class ArenaBookingDetailAthletes extends ConsumerWidget {
  const ArenaBookingDetailAthletes({
    super.key,
    required this.arenaId,
    required this.primaryAthleteId,
    required this.participants,
    this.bookingData = const {},
  });

  final String arenaId;
  final String primaryAthleteId;
  final int participants;

  /// Doc da reserva: de onde sai quem joga além do dono — convidados
  /// (`participants` e legado) e quem está no placar (`resultPlayers`).
  final Map<String, dynamic> bookingData;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final athleteId = primaryAthleteId.trim();
    if (athleteId.isEmpty) return const SizedBox.shrink();

    final nameAsync = ref.watch(athleteDisplayLabelProvider(athleteId));
    final profileAsync = ref.watch(athleteProfileByIdProvider(athleteId));
    final historyAsync = arenaId.isEmpty
        ? const AsyncData<List<ArenaManagerBooking>>([])
        : ref.watch(
            athleteArenaHistoryProvider(
              AthleteArenaHistoryArgs(
                athleteId: athleteId,
                arenaId: arenaId,
              ),
            ),
          );

    final guests = bookingGuestsOf(bookingData, ownerUid: athleteId);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _AthleteDetailCard(
          nameAsync: nameAsync,
          profileAsync: profileAsync,
          historyAsync: historyAsync,
        ),
        for (final guest in guests) ...[
          SizedBox(height: 10),
          _GuestAthleteCard(guest: guest),
        ],
        // Reserva antiga que só contou o convidado, sem dizer quem é.
        if (guests.isEmpty && participants >= 2) ...[
          SizedBox(height: 10),
          const _GuestAthleteCard(),
        ],
      ],
    );
  }
}

class _AthleteDetailCard extends StatelessWidget {
  const _AthleteDetailCard({
    required this.nameAsync,
    required this.profileAsync,
    required this.historyAsync,
  });

  final AsyncValue<String> nameAsync;
  final AsyncValue<AthleteProfile?> profileAsync;
  final AsyncValue<List<ArenaManagerBooking>> historyAsync;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            profileAsync.when(
              data: (profile) => _DetailAvatar(
                imageUrl: profile?.avatarUrl,
                name: nameAsync.valueOrNull ?? '',
              ),
              loading: () => _DetailAvatar(
                imageUrl: null,
                name: nameAsync.valueOrNull ?? '',
              ),
              error: (_, __) => _DetailAvatar(
                imageUrl: null,
                name: nameAsync.valueOrNull ?? '',
              ),
            ),
            SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: nameAsync.when(
                          data: (name) => Text(
                            name,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                            ),
                          ),
                          loading: () => Text(
                            'Carregando…',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: context.themeColors.onSurfaceMuted,
                            ),
                          ),
                          error: (_, __) => Text('Atleta'),
                        ),
                      ),
                      historyAsync.maybeWhen(
                        data: (h) => h.length >= 10
                            ? const _VipBadge()
                            : const SizedBox.shrink(),
                        orElse: () => const SizedBox.shrink(),
                      ),
                    ],
                  ),
                  SizedBox(height: 6),
                  historyAsync.when(
                    data: (history) {
                      final since =
                          ArenaBookingsGrouping.clientSinceLabel(history);
                      final n = history.length;
                      final reservas = n == 1 ? '1 reserva' : '$n reservas';
                      final subtitle = since != null
                          ? 'Cliente desde $since · $reservas'
                          : reservas;
                      return Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      );
                    },
                    loading: () => Text(
                      'Carregando histórico…',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Quem joga além do dono: convidado ou atleta do placar. Sem [guest], o
/// cartão genérico de reserva antiga que só contou "+1".
class _GuestAthleteCard extends ConsumerWidget {
  const _GuestAthleteCard({this.guest});

  final BookingGuest? guest;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final athlete = guest?.athlete;
    final uid = athlete?.userId?.trim() ?? '';
    final storedName = athlete?.displayName?.trim() ?? '';
    // Entrada só com o uid (legado): o nome vem do perfil.
    final name = guest == null
        ? 'Atleta convidado'
        : storedName.isNotEmpty
            ? storedName
            : uid.isNotEmpty
                ? ref.watch(athleteDisplayLabelProvider(uid)).valueOrNull ??
                    'Atleta'
                : 'Atleta';
    final subtitle = guest == null
        ? 'Dados do parceiro em breve'
        : guest!.fromResult
            ? 'No placar do jogo'
            : 'Convidado';

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            if (guest == null)
              CircleAvatar(
                radius: 24,
                backgroundColor: AppColors.win.withValues(alpha: 0.22),
                child: Text(
                  '+1',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.win,
                  ),
                ),
              )
            else
              _DetailAvatar(imageUrl: athlete?.avatarUrl, name: name),
            SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VipBadge extends StatelessWidget {
  const _VipBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.45)),
      ),
      child: Text(
        'VIP',
        style: TextStyle(
          color: AppColors.brand,
          fontWeight: FontWeight.w800,
          fontSize: 10,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _DetailAvatar extends StatelessWidget {
  const _DetailAvatar({
    required this.imageUrl,
    required this.name,
  });

  final String? imageUrl;
  final String name;

  @override
  Widget build(BuildContext context) {
    const size = 48.0;
    final initials = ArenaBookingsGrouping.athleteInitials(name);
    final url = imageUrl?.trim();

    if (url != null && url.isNotEmpty) {
      return SizedBox(
        width: size,
        height: size,
        child: ClipOval(
          child: CachedNetworkImage(
            imageUrl: url,
            width: size,
            height: size,
            fit: BoxFit.cover,
            placeholder: (_, __) => _initials(size, initials),
            errorWidget: (_, __, ___) => _initials(size, initials),
          ),
        ),
      );
    }

    return _initials(size, initials);
  }

  Widget _initials(double size, String initials) {
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: AppColors.brand.withValues(alpha: 0.22),
      child: Text(
        initials.length > 2 ? initials.substring(0, 2) : initials,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          color: AppColors.brand,
        ),
      ),
    );
  }
}
