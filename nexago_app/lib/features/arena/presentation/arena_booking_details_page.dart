import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../athlete/domain/athlete_profile.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/arena_booking_labels.dart';
import '../domain/arena_date_utils.dart';
import '../domain/arena_manager_booking.dart';
import '../domain/arena_schedule_providers.dart';
import '../domain/arena_slot_detail_providers.dart';
import 'widgets/arena_async_state.dart';

/// Detalhe de uma reserva para o gestor da arena (painel).
class ArenaBookingDetailsPage extends ConsumerWidget {
  const ArenaBookingDetailsPage({
    super.key,
    required this.bookingId,
    this.initialBooking,
  });

  final String bookingId;
  final ArenaManagerBooking? initialBooking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final id = bookingId.trim();
    if (id.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Reserva')),
        body: const ArenaErrorState(message: 'ID da reserva inválido.'),
      );
    }

    final liveAsync = ref.watch(arenaBookingDetailMapProvider(id));
    final arenaAsync = ref.watch(managedArenaDetailProvider);
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';

    if (liveAsync.hasError && initialBooking == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Reserva')),
        body: ArenaErrorState(message: 'Erro ao carregar reserva.\n${liveAsync.error}'),
      );
    }

    final live = liveAsync.valueOrNull;
    final merged = _mergeBookingData(initialBooking?.data, live);

    if (merged == null && initialBooking == null) {
      if (liveAsync.isLoading) {
        return Scaffold(
          appBar: AppBar(title: const Text('Reserva')),
          body: const ArenaLoadingState(label: 'Carregando reserva...'),
        );
      }
      return Scaffold(
        appBar: AppBar(title: const Text('Reserva')),
        body: const ArenaEmptyState(
          title: 'Reserva não encontrada',
          message: 'Não foi possível carregar os dados desta reserva.',
          icon: Icons.event_busy_outlined,
        ),
      );
    }

    final booking = initialBooking ??
        (merged != null ? _bookingFromMerged(id, merged) : null);
    if (booking == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Reserva')),
        body: const ArenaLoadingState(label: 'Carregando reserva...'),
      );
    }
    final data = merged ?? booking.data;
    final athleteId = booking.athleteId.trim();
    final nameAsync = ref.watch(athleteDisplayLabelProvider(athleteId));
    final AsyncValue<AthleteProfile?>? profileAsync = athleteId.isEmpty
        ? null
        : ref.watch(athleteProfileByIdProvider(athleteId));

    final arenaName = arenaAsync.valueOrNull?.name.trim().isNotEmpty == true
        ? arenaAsync.valueOrNull!.name.trim()
        : 'Arena';
    final statusLabel = arenaBookingBusinessStatusLabel(data);
    final paymentTypeLabel = arenaBookingPaymentLabel(data);
    final amount = _amountReaisFromData(data);
    final amountStr = amount != null
        ? NumberFormat.currency(
                locale: 'pt_BR', symbol: r'R$', decimalDigits: 2)
            .format(amount)
        : '—';

    final dateParsed = DateTime.tryParse(booking.dateKey.length >= 10
        ? booking.dateKey.substring(0, 10)
        : '');
    final dateTitle = dateParsed != null
        ? _capitalize(
            DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(dateParsed))
        : booking.dateKey;
    final timeRange = '${booking.startTime} – ${booking.endTime}';

    final statusLower =
        (data['status'] as String?)?.toLowerCase().trim() ?? '';
    final canCancel = statusLower != 'cancelled' &&
        statusLower != 'canceled' &&
        statusLower != 'completed';

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        title: const Text('Reserva'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            }
          },
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        children: [
          _HeaderCard(
            athleteName: nameAsync.valueOrNull ?? '…',
            dateLabel: dateTitle,
            timeRange: timeRange,
            statusLabel: statusLabel,
            statusColor: _statusAccentColor(statusLabel),
          ),
          const SizedBox(height: 14),
          _AthleteCard(
            nameAsync: nameAsync,
            profileAsync: profileAsync,
            athleteId: athleteId,
            onViewProfile: athleteId.isEmpty
                ? null
                : () {
                    context.pushNamed(
                      AppRouteNames.athleteProfile,
                      queryParameters: {'userId': athleteId},
                    );
                  },
          ),
          const SizedBox(height: 14),
          _InfoCard(
            rows: [
              _InfoRow(
                  icon: Icons.storefront_outlined,
                  label: 'Arena',
                  value: arenaName),
              _InfoRow(
                icon: Icons.sports_tennis_outlined,
                label: 'Quadra',
                value: booking.courtName,
              ),
              _InfoRow(
                  icon: Icons.calendar_today_outlined,
                  label: 'Data',
                  value: dateTitle),
              _InfoRow(
                  icon: Icons.schedule_outlined,
                  label: 'Horário',
                  value: timeRange),
            ],
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Pagamento',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Valor',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.55),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  amountStr,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'Tipo de pagamento',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.55),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  paymentTypeLabel,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _ActionsCard(
            onContact: athleteId.isEmpty
                ? null
                : () => _contactAthlete(context, ref, athleteId),
            onCancel: canCancel && arenaId.isNotEmpty
                ? () => _confirmCancel(context, ref,
                    bookingId: id, arenaId: arenaId)
                : null,
          ),
        ],
      ),
    );
  }

  static Map<String, dynamic>? _mergeBookingData(
    Map<String, dynamic>? initial,
    Map<String, dynamic>? live,
  ) {
    if (initial == null && live == null) return null;
    if (live == null) return Map<String, dynamic>.from(initial!);
    if (initial == null) return Map<String, dynamic>.from(live);
    return {...initial, ...live};
  }

  static ArenaManagerBooking? _bookingFromMerged(
      String id, Map<String, dynamic> merged) {
    final aid = merged['athleteId'];
    final athleteId = aid is String && aid.trim().isNotEmpty ? aid.trim() : '';
    final courtRaw =
        merged['courtName'] ?? merged['court'] ?? merged['courtId'];
    final courtName = courtRaw is String && courtRaw.trim().isNotEmpty
        ? courtRaw.trim()
        : 'Quadra';
    final dateKey = arenaDateKeyFromDynamic(merged['date']);
    if (dateKey.length < 10) return null;

    String timeStr(dynamic v) {
      if (v == null) return '--:--';
      if (v is String) {
        final t = v.trim();
        return t.length >= 5 ? t.substring(0, 5) : t;
      }
      return '--:--';
    }

    return ArenaManagerBooking(
      id: id,
      athleteId: athleteId,
      courtName: courtName,
      dateKey: dateKey,
      startTime: timeStr(merged['startTime']),
      endTime: timeStr(merged['endTime']),
      data: merged,
    );
  }

  static String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }

  static double? _amountReaisFromData(Map<String, dynamic>? d) {
    if (d == null) return null;
    return (d['amountReais'] as num?)?.toDouble() ??
        (d['priceReais'] as num?)?.toDouble();
  }

  static Color _statusAccentColor(String statusLabel) {
    final s = statusLabel.toLowerCase();
    if (s.contains('cancel')) return const Color(0xFF9E9E9E);
    if (s.contains('ativa')) return const Color(0xFF2E7D32);
    if (s.contains('conclu')) return const Color(0xFF1565C0);
    return AppColors.brand;
  }

  static Future<void> _contactAthlete(
    BuildContext context,
    WidgetRef ref,
    String athleteId,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final profile = ref.read(athleteProfileByIdProvider(athleteId)).valueOrNull;
    final email = await ref.read(athleteUserEmailProvider(athleteId).future);
    final phone = profile?.phoneNumber?.trim();

    Uri? uri;
    if (phone != null && phone.isNotEmpty) {
      final digits = String.fromCharCodes(
        phone.runes.where((r) => r >= 0x30 && r <= 0x39),
      );
      if (digits.length >= 10) {
        var n = digits;
        if (n.startsWith('0')) n = n.substring(1);
        if (!n.startsWith('55') && n.length <= 11) {
          n = '55$n';
        }
        uri = Uri.parse('https://wa.me/$n');
      } else {
        uri = Uri(scheme: 'tel', path: phone);
      }
    }
    uri ??= (email != null && email.isNotEmpty)
        ? Uri(
            scheme: 'mailto',
            path: email,
            queryParameters: {'subject': 'Reserva — Nexago'},
          )
        : null;

    if (uri == null) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Contato do atleta indisponível.')),
      );
      return;
    }

    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      messenger.showSnackBar(
        const SnackBar(
            content: Text('Não foi possível abrir o app de contato.')),
      );
    }
  }

  static Future<void> _confirmCancel(
    BuildContext context,
    WidgetRef ref, {
    required String bookingId,
    required String arenaId,
  }) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar reserva'),
        content: const Text(
          'Tem certeza que deseja cancelar esta reserva? Essa ação notifica o fluxo da arena.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Voltar')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
              foregroundColor: Theme.of(ctx).colorScheme.onError,
            ),
            child: const Text('Cancelar reserva'),
          ),
        ],
      ),
    );
    if (go != true || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(bookingServiceProvider).cancelBookingByArenaManager(
            bookingId: bookingId,
            arenaId: arenaId,
          );
      if (context.mounted) {
        messenger
            .showSnackBar(const SnackBar(content: Text('Reserva cancelada.')));
        context.pop();
      }
    } catch (e) {
      if (context.mounted) {
        messenger.showSnackBar(
          SnackBar(content: Text('Não foi possível cancelar: $e')),
        );
      }
    }
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({
    required this.athleteName,
    required this.dateLabel,
    required this.timeRange,
    required this.statusLabel,
    required this.statusColor,
  });

  final String athleteName;
  final String dateLabel;
  final String timeRange;
  final String statusLabel;
  final Color statusColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(18),
        border:
            Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.1)),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.shadow.withValues(alpha: 0.06),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            athleteName,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 4,
                height: 48,
                decoration: BoxDecoration(
                  color: statusColor,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      dateLabel,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      timeRange,
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
              _StatusPill(label: statusLabel, color: statusColor),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelLarge?.copyWith(
          color: color.withValues(alpha: 0.95),
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _AthleteCard extends StatelessWidget {
  const _AthleteCard({
    required this.nameAsync,
    required this.profileAsync,
    required this.athleteId,
    required this.onViewProfile,
  });

  final AsyncValue<String> nameAsync;
  final AsyncValue<AthleteProfile?>? profileAsync;
  final String athleteId;
  final VoidCallback? onViewProfile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _SectionCard(
      title: 'Atleta',
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _AthleteAvatar(
            profileAsync: profileAsync,
            nameAsync: nameAsync,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                nameAsync.when(
                  data: (n) => Text(
                    n,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.2,
                    ),
                  ),
                  loading: () => Text(
                    'Carregando…',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.45),
                    ),
                  ),
                  error: (_, __) => const Text('—'),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: onViewProfile,
                  child: const Text('Ver perfil'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AthleteAvatar extends StatelessWidget {
  const _AthleteAvatar({
    required this.profileAsync,
    required this.nameAsync,
  });

  final AsyncValue<AthleteProfile?>? profileAsync;
  final AsyncValue<String> nameAsync;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const size = 72.0;
    final name = nameAsync.valueOrNull ?? '';
    final initial = _initialLetter(name);

    final url = profileAsync?.valueOrNull?.avatarUrl?.trim();

    if (url != null && url.isNotEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.15),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          placeholder: (_, __) => const Center(
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
          errorWidget: (_, __, ___) =>
              _FallbackAvatar(size: size, initial: initial),
        ),
      );
    }

    return _FallbackAvatar(size: size, initial: initial);
  }
}

String _initialLetter(String name) {
  final t = name.trim();
  if (t.isEmpty) return '?';
  final it = t.runes.iterator;
  if (!it.moveNext()) return '?';
  return String.fromCharCode(it.current).toUpperCase();
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
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color:
            theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.85),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Text(
        initial,
        style: theme.textTheme.headlineSmall
            ?.copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _InfoRow {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.rows});

  final List<_InfoRow> rows;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _SectionCard(
      title: 'Informações',
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0)
              Divider(
                  height: 22,
                  color: theme.colorScheme.outline.withValues(alpha: 0.12)),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(rows[i].icon,
                    size: 22, color: AppColors.brand.withValues(alpha: 0.9)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        rows[i].label,
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.55),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        rows[i].value,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.child,
    this.title,
  });

  final Widget child;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border:
            Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(
              title!,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 12),
          ],
          child,
        ],
      ),
    );
  }
}

class _ActionsCard extends StatelessWidget {
  const _ActionsCard({
    required this.onContact,
    required this.onCancel,
  });

  final VoidCallback? onContact;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _SectionCard(
      title: 'Ações',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FilledButton.tonalIcon(
            onPressed: onContact,
            icon: const Icon(Icons.chat_bubble_outline_rounded),
            label: const Text('Falar com atleta'),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: onCancel,
            icon: Icon(Icons.cancel_outlined, color: theme.colorScheme.error),
            label: Text(
              'Cancelar reserva',
              style: TextStyle(
                color: onCancel != null
                    ? theme.colorScheme.error
                    : theme.colorScheme.onSurface.withValues(alpha: 0.38),
                fontWeight: FontWeight.w700,
              ),
            ),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              side: BorderSide(
                color: onCancel != null
                    ? theme.colorScheme.error.withValues(alpha: 0.55)
                    : theme.colorScheme.outline.withValues(alpha: 0.25),
              ),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ],
      ),
    );
  }
}
