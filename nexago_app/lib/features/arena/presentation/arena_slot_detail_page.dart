import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../arenas/domain/arena_slot.dart';
import '../data/slot_service.dart';
import '../domain/arena_booking_labels.dart';
import '../domain/arena_slot_detail_args.dart';
import '../domain/arena_slot_detail_providers.dart';
import '../domain/arena_schedule_providers.dart';
import 'widgets/arena_async_state.dart';

/// Detalhe de um horário da agenda do gestor: reservado, livre ou bloqueado.
class ArenaSlotDetailPage extends ConsumerWidget {
  const ArenaSlotDetailPage({
    super.key,
    required this.args,
  });

  final ArenaSlotDetailArgs args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final initial = args.slot;
    final liveAsync = ref.watch(arenaSlotLiveProvider(initial.id));
    final hasError = liveAsync.hasError;

    final ArenaSlot slot = liveAsync.maybeWhen(
      data: (s) => s ?? initial,
      orElse: () => initial,
    );

    final dateStr = DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(slot.date);
    final titleTime = '${slot.startTime} – ${slot.endTime}';

    return AppScaffold(
      title: 'Horário',
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          children: [
            Text(
              _capitalize(dateStr),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.55),
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              titleTime,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              args.courtName,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            if (hasError) ...[
              const SizedBox(height: 12),
              ArenaErrorState(message: 'Não foi possível sincronizar este horário agora.'),
            ],
            const SizedBox(height: 24),
            FadeSlideIn(
              child: slot.isBooked
                  ? _BookedSection(slot: slot)
                  : slot.isBlocked
                      ? _BlockedSection(slot: slot)
                      : _AvailableSection(slot: slot),
            ),
          ],
        ),
      ),
    );
  }

  static String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }
}

class _BookedSection extends ConsumerWidget {
  const _BookedSection({required this.slot});

  final ArenaSlot slot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bookingId = slot.bookingId;
    final bookingAsync = bookingId != null
        ? ref.watch(arenaBookingDetailMapProvider(bookingId))
        : const AsyncValue<Map<String, dynamic>?>.data(null);

    final athleteUid = slot.bookingAthleteId ??
        bookingAsync.valueOrNull?['athleteId'] as String?;
    final nameAsync = athleteUid != null
        ? ref.watch(athleteDisplayLabelProvider(athleteUid))
        : const AsyncValue<String>.data('—');

    final bookingMap = bookingAsync.valueOrNull;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StatusPill(label: 'Reservado', color: const Color(0xFFE53935)),
        const SizedBox(height: 20),
        _LabeledRow(
          label: 'Atleta',
          value: nameAsync.when(
            data: (s) => s,
            loading: () => 'Carregando…',
            error: (_, __) => '—',
          ),
        ),
        const SizedBox(height: 12),
        _LabeledRow(
          label: 'Horário',
          value: '${slot.startTime} – ${slot.endTime}',
        ),
        const SizedBox(height: 12),
        _LabeledRow(
          label: 'Pagamento',
          value: arenaBookingPaymentLabel(bookingMap),
        ),
        const SizedBox(height: 12),
        _LabeledRow(
          label: 'Status',
          value: arenaBookingStatusLabel(bookingMap),
        ),
        if (bookingAsync.isLoading) ...[
          const SizedBox(height: 24),
          const ArenaLoadingState(label: 'Carregando dados da reserva...'),
        ],
      ],
    );
  }
}

class _AvailableSection extends ConsumerStatefulWidget {
  const _AvailableSection({required this.slot});

  final ArenaSlot slot;

  @override
  ConsumerState<_AvailableSection> createState() => _AvailableSectionState();
}

class _AvailableSectionState extends ConsumerState<_AvailableSection> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StatusPill(label: 'Disponível', color: const Color(0xFF2E7D32)),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: _busy ? null : () => _block(context),
          icon: _busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.block),
          label: const Text('Bloquear horário'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
      ],
    );
  }

  Future<void> _block(BuildContext context) async {
    setState(() => _busy = true);
    try {
      final service = ref.read(slotServiceProvider);
      if (widget.slot.isVirtual) {
        await service.blockVirtualSlot(widget.slot);
      } else {
        await service.blockSlot(widget.slot.id);
      }
      if (!context.mounted) return;
      showAppSnackBar(context, 'Horário bloqueado.');
      context.pop();
    } on SlotServiceException catch (e) {
      if (!context.mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!context.mounted) return;
      showAppSnackBar(context, 'Não foi possível bloquear: $e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _BlockedSection extends ConsumerStatefulWidget {
  const _BlockedSection({required this.slot});

  final ArenaSlot slot;

  @override
  ConsumerState<_BlockedSection> createState() => _BlockedSectionState();
}

class _BlockedSectionState extends ConsumerState<_BlockedSection> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StatusPill(label: 'Bloqueado', color: const Color(0xFF9E9E9E)),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: _busy || widget.slot.isVirtual ? null : () => _unblock(context),
          icon: _busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.lock_open_outlined),
          label: const Text('Desbloquear'),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
        if (widget.slot.isVirtual)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              'Este horário ainda não está salvo no Firestore; desbloqueie após sincronizar a agenda.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.55),
                  ),
            ),
          ),
      ],
    );
  }

  Future<void> _unblock(BuildContext context) async {
    setState(() => _busy = true);
    try {
      await ref.read(slotServiceProvider).unblockSlot(widget.slot.id);
      if (!context.mounted) return;
      showAppSnackBar(context, 'Horário desbloqueado.');
      context.pop();
    } on SlotServiceException catch (e) {
      if (!context.mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!context.mounted) return;
      showAppSnackBar(context, 'Não foi possível desbloquear: $e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
        ),
      ),
    );
  }
}

class _LabeledRow extends StatelessWidget {
  const _LabeledRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
            fontWeight: FontWeight.w600,
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
    );
  }
}
