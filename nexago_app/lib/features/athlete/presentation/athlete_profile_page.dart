import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../arenas/domain/my_booking_item.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_profile_providers.dart';

/// Perfil público do atleta (visualização).
///
/// Se [embedded] for true (ex.: aba do [AthleteShellPage]), não renderiza
/// [Scaffold] nem [AppBar] — o contêiner pai fornece o layout.
class AthleteProfilePage extends ConsumerWidget {
  const AthleteProfilePage({
    super.key,
    this.embedded = false,
    this.viewedUserId,
  });

  /// Quando `true`, apenas o conteúdo do perfil (sem barra superior).
  final bool embedded;

  /// Se preenchido, exibe o perfil deste atleta (somente leitura), ex.: gestor.
  final String? viewedUserId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final user = ref.watch(authProvider).valueOrNull;
    final viewed = viewedUserId?.trim();

    Widget bodyNotSignedIn() {
      return const Center(child: Text('Faça login para ver seu perfil.'));
    }

    if (viewed != null && viewed.isNotEmpty) {
      final profileAsync = ref.watch(athleteProfileByIdProvider(viewed));
      final emailAsync = ref.watch(athleteUserEmailProvider(viewed));

      Widget bodyOther() {
        if (user == null) return bodyNotSignedIn();
        return profileAsync.when(
          data: (doc) {
            final profile = doc ??
                AthleteProfile(
                  id: viewed,
                  name: 'Atleta',
                  sport: '',
                  level: '',
                  city: '',
                );
            final email = emailAsync.maybeWhen(
              data: (e) => e,
              orElse: () => null,
            );
            return _AthleteProfileBody(
              profile: profile,
              email: email,
              totalBookings: 0,
              nextBooking: null,
              readOnly: true,
              onEdit: () {},
              onOpenAgenda: () {},
              onOpenSettings: () {},
              onSignOut: () async {},
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Não foi possível carregar o perfil.\n$e',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ),
          ),
        );
      }

      if (embedded) {
        return ColoredBox(
          color: theme.colorScheme.surfaceContainerLowest,
          child: bodyOther(),
        );
      }

      return Scaffold(
        backgroundColor: theme.colorScheme.surfaceContainerLowest,
        appBar: AppBar(
          title: const Text('Perfil do atleta'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () {
              if (context.canPop()) {
                context.pop();
              } else {
                context.go(AppRoutes.discover);
              }
            },
          ),
        ),
        body: bodyOther(),
      );
    }

    final profileAsync = ref.watch(athleteProfileProvider);
    final bookingsAsync = ref.watch(myBookingsStreamProvider);

    Widget bodyContent() {
      if (user == null) return bodyNotSignedIn();
      return profileAsync.when(
        data: (doc) {
          final profile = doc ?? AthleteProfile.draft(user);
          return bookingsAsync.when(
            data: (bookings) => _AthleteProfileBody(
              profile: profile,
              email: user.email,
              totalBookings: _countCompletedBookings(bookings),
              nextBooking: _findNextBooking(bookings),
              readOnly: false,
              onEdit: () => context.pushNamed(AppRouteNames.athleteProfileEdit),
              onOpenAgenda: () => context.pushNamed(AppRouteNames.myBookings),
              onOpenSettings: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Configurações em breve.')),
                );
              },
              onSignOut: () async {
                await ref.read(authServiceProvider).signOut();
              },
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Não foi possível carregar reservas.\n$e',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.error,
                  ),
                ),
              ),
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o perfil.\n$e',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ),
        ),
      );
    }

    if (embedded) {
      return ColoredBox(
        color: theme.colorScheme.surfaceContainerLowest,
        child: bodyContent(),
      );
    }

    if (user == null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Meu perfil'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () {
              if (context.canPop()) {
                context.pop();
              } else {
                context.go(AppRoutes.discover);
              }
            },
          ),
        ),
        body: bodyNotSignedIn(),
      );
    }

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        title: const Text('Meu perfil'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(AppRoutes.discover);
            }
          },
        ),
      ),
      body: bodyContent(),
    );
  }
}

class _AthleteProfileBody extends StatelessWidget {
  const _AthleteProfileBody({
    required this.profile,
    required this.email,
    required this.totalBookings,
    required this.nextBooking,
    this.readOnly = false,
    required this.onEdit,
    required this.onOpenAgenda,
    required this.onOpenSettings,
    required this.onSignOut,
  });

  final AthleteProfile profile;
  final String? email;
  final int totalBookings;
  final MyBookingItem? nextBooking;
  final bool readOnly;
  final VoidCallback onEdit;
  final VoidCallback onOpenAgenda;
  final VoidCallback onOpenSettings;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const avatarSize = 120.0;

    final avatarUrl = profile.avatarUrl;
    final bio = profile.bio?.trim();
    final sport = profile.sport.trim();
    final level = profile.level.trim();
    final city = profile.city.trim();
    final phoneNumber = profile.phoneNumber?.trim();

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 8),
              _AvatarCircle(
                size: avatarSize,
                imageUrl: avatarUrl,
                name: profile.name,
              ),
              const SizedBox(height: 20),
              Text(
                profile.name.isNotEmpty ? profile.name : 'Atleta',
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.3,
                ),
              ),
              if (email != null && email!.trim().isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  email!.trim(),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              if (!readOnly)
                OutlinedButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Editar perfil'),
                ),
              if (bio != null && bio.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  bio,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: AppColors.onSurfaceMuted,
                    height: 1.45,
                  ),
                ),
              ],
              if (!readOnly) ...[
                const SizedBox(height: 28),
                _SummaryCard(
                  totalBookings: totalBookings,
                  nextBooking: nextBooking,
                ),
                const SizedBox(height: 20),
              ] else
                const SizedBox(height: 8),
              _InfoTile(
                icon: Icons.sports_volleyball_outlined,
                label: 'Esporte',
                value: sport.isNotEmpty ? sport : '—',
              ),
              const SizedBox(height: 12),
              _InfoTile(
                icon: Icons.trending_up_rounded,
                label: 'Nível',
                value: level.isNotEmpty ? level : '—',
              ),
              const SizedBox(height: 12),
              _InfoTile(
                icon: Icons.location_on_outlined,
                label: 'Cidade',
                value: city.isNotEmpty ? city : '—',
              ),
              const SizedBox(height: 12),
              _InfoTile(
                icon: Icons.phone_outlined,
                label: 'Telefone',
                value: (phoneNumber != null && phoneNumber.isNotEmpty)
                    ? phoneNumber
                    : '—',
              ),
              // const SizedBox(height: 20),
              // _ActionItem(
              //   icon: Icons.calendar_month_outlined,
              //   label: 'Minha agenda',
              //   onTap: onOpenAgenda,
              // ),
              if (!readOnly) ...[
                const SizedBox(height: 10),
                _ActionItem(
                  icon: Icons.settings_outlined,
                  label: 'Configurações',
                  onTap: onOpenSettings,
                ),
                const SizedBox(height: 10),
                _ActionItem(
                  icon: Icons.logout_rounded,
                  label: 'Sair da conta',
                  onTap: onSignOut,
                  danger: true,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

String _initialLetter(String name) {
  final t = name.trim();
  if (t.isEmpty) return '?';
  final it = t.runes.iterator;
  if (!it.moveNext()) return '?';
  return String.fromCharCode(it.current).toUpperCase();
}

class _AvatarCircle extends StatelessWidget {
  const _AvatarCircle({
    required this.size,
    required this.imageUrl,
    required this.name,
  });

  final double size;
  final String? imageUrl;
  final String name;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final initial = _initialLetter(name);

    final border = BoxDecoration(
      shape: BoxShape.circle,
      border: Border.all(
        color: theme.colorScheme.outline.withValues(alpha: 0.2),
        width: 1,
      ),
      boxShadow: [
        BoxShadow(
          color: theme.colorScheme.shadow.withValues(alpha: 0.08),
          blurRadius: 24,
          offset: const Offset(0, 8),
        ),
      ],
    );

    if (imageUrl != null && imageUrl!.isNotEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: border,
        clipBehavior: Clip.antiAlias,
        child: CachedNetworkImage(
          imageUrl: imageUrl!,
          fit: BoxFit.cover,
          placeholder: (_, __) => const Center(
            child: SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
          errorWidget: (_, __, ___) => _FallbackAvatar(
            size: size,
            initial: initial,
          ),
        ),
      );
    }

    return Container(
      width: size,
      height: size,
      decoration: border.copyWith(
        color: theme.colorScheme.surfaceContainerHigh,
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: theme.textTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w600,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.75),
        ),
      ),
    );
  }
}

class _FallbackAvatar extends StatelessWidget {
  const _FallbackAvatar({required this.size, required this.initial});

  final double size;
  final String initial;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: size,
      height: size,
      color: theme.colorScheme.surfaceContainerHigh,
      alignment: Alignment.center,
      child: Text(
        initial,
        style: theme.textTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: AppColors.brand),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.totalBookings,
    required this.nextBooking,
  });

  final int totalBookings;
  final MyBookingItem? nextBooking;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Resumo',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '$totalBookings reservas realizadas',
            style: theme.textTheme.bodyLarge?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _nextBookingLabel(nextBooking),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionItem extends StatelessWidget {
  const _ActionItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = danger ? theme.colorScheme.error : theme.colorScheme.onSurface;
    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Icon(icon, size: 20, color: color),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w500,
                    color: color,
                  ),
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: color.withValues(alpha: 0.6)),
            ],
          ),
        ),
      ),
    );
  }
}

int _countCompletedBookings(List<MyBookingItem> bookings) {
  return bookings.where((b) {
    final s = b.rawStatus.trim().toLowerCase();
    return s != 'canceled' && s != 'cancelled';
  }).length;
}

MyBookingItem? _findNextBooking(List<MyBookingItem> bookings) {
  final now = DateTime.now();
  MyBookingItem? next;
  DateTime? nextStart;
  for (final booking in bookings) {
    final status = booking.rawStatus.trim().toLowerCase();
    if (status == 'canceled' || status == 'cancelled') continue;
    final start = _parseBookingStart(booking);
    if (start == null || !start.isAfter(now)) continue;
    if (nextStart == null || start.isBefore(nextStart)) {
      nextStart = start;
      next = booking;
    }
  }
  return next;
}

DateTime? _parseBookingStart(MyBookingItem item) {
  if (item.dateRaw.length < 10) return null;
  final day = DateTime.tryParse(item.dateRaw.substring(0, 10));
  if (day == null) return null;
  final parts = item.startTime.split(':');
  final hh = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
  final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return DateTime(day.year, day.month, day.day, hh, mm);
}

String _nextBookingLabel(MyBookingItem? next) {
  if (next == null) return 'Próxima reserva: nenhuma';
  final start = _parseBookingStart(next);
  if (start == null) return 'Próxima reserva em ${next.arenaName}';
  final fmt = DateFormat("dd/MM 'às' HH:mm", 'pt_BR');
  return 'Próxima reserva: ${next.arenaName} • ${fmt.format(start)}';
}
