import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../core/router/routes.dart';
import '../../athlete/domain/athlete_firestore_codes.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/friendly_match_models.dart';
import '../domain/friendly_match_providers.dart';
import 'widgets/friendly_match_arena_picker_sheet.dart';

/// Construtor do convite de jogo: objetivo → esporte → horário(s) → local →
/// mensagem → enviar. O rascunho é só local; nada persiste antes do envio.
class FriendlyMatchInviteBuilderPage extends ConsumerStatefulWidget {
  const FriendlyMatchInviteBuilderPage({
    super.key,
    required this.toUid,
    required this.toName,
  });

  final String toUid;
  final String toName;

  @override
  ConsumerState<FriendlyMatchInviteBuilderPage> createState() =>
      _FriendlyMatchInviteBuilderPageState();
}

class _FriendlyMatchInviteBuilderPageState
    extends ConsumerState<FriendlyMatchInviteBuilderPage> {
  FriendlyMatchObjective _objective = FriendlyMatchObjective.friendly;
  String? _sport;
  DateTime? _scheduledAt;
  final List<DateTime> _alternativeTimes = [];
  String? _arenaId;
  String? _arenaName;
  final _freeTextController = TextEditingController();
  final _messageController = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _freeTextController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  List<String> _mySports() {
    final profile = ref.read(athleteProfileProvider).value;
    if (profile == null) return const [];
    final sports = <String>{
      if (profile.primarySportFirestoreId != null)
        profile.primarySportFirestoreId!,
      ...profile.levelsBySportFirestore.keys,
    }..removeWhere((s) => s.isEmpty);
    return sports.toList();
  }

  Future<DateTime?> _pickDateTime({DateTime? initial}) async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: initial ?? now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 60)),
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: initial != null
          ? TimeOfDay.fromDateTime(initial)
          : const TimeOfDay(hour: 19, minute: 0),
    );
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<void> _send() async {
    final sport = _sport;
    final scheduledAt = _scheduledAt;
    if (sport == null) {
      showAppSnackBar(context, 'Escolha o esporte.', isError: true);
      return;
    }
    if (scheduledAt == null) {
      showAppSnackBar(context, 'Escolha o horário do jogo.', isError: true);
      return;
    }
    final freeText = _freeTextController.text.trim();
    if (_arenaId == null && freeText.isEmpty) {
      showAppSnackBar(
          context, 'Informe uma arena ou descreva o local.', isError: true);
      return;
    }

    setState(() => _sending = true);
    try {
      final service = ref.read(friendlyMatchServiceProvider);
      final matchId = await service.sendInvite(
        toUid: widget.toUid,
        sport: sport,
        objective: _objective,
        scheduledAt: scheduledAt,
        alternativeTimes: _alternativeTimes,
        location: FriendlyMatchLocation(
          arenaId: _arenaId,
          arenaName: _arenaName,
          freeText: freeText.isEmpty ? null : freeText,
        ),
        message: _messageController.text,
      );
      if (!mounted) return;
      showAppSnackBar(context, 'Convite enviado para ${widget.toName}! 🏐');
      context.pushReplacement(
          AppRoutes.friendlyMatchDetail.replaceFirst(':matchId', matchId));
    } on FriendlyMatchActionException catch (e) {
      if (mounted) showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, 'Não foi possível enviar o convite.',
            isError: true);
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final sports = _mySports();
    _sport ??= sports.isNotEmpty ? sports.first : null;
    final dateFormat = DateFormat("EEE, d 'de' MMM • HH:mm", 'pt_BR');

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: NexaAppBar(title: Text('Convidar ${widget.toName}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Objetivo',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          SegmentedButton<FriendlyMatchObjective>(
            segments: [
              for (final objective in FriendlyMatchObjective.values)
                ButtonSegment(value: objective, label: Text(objective.label)),
            ],
            selected: {_objective},
            onSelectionChanged: (selection) =>
                setState(() => _objective = selection.first),
          ),
          const SizedBox(height: 20),
          Text('Esporte',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (sports.isEmpty)
            Text(
              'Complete seu perfil esportivo para convidar alguém.',
              style:
                  theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted),
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final sport in sports)
                  ChoiceChip(
                    label: Text(
                        AthleteFirestoreCodes.sportFirestoreToLabel(sport) ??
                            sport),
                    selected: _sport == sport,
                    onSelected: (_) => setState(() => _sport = sport),
                  ),
              ],
            ),
          const SizedBox(height: 20),
          Text('Quando',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          _PickerTile(
            icon: Icons.event_rounded,
            label: _scheduledAt == null
                ? 'Escolher data e hora'
                : dateFormat.format(_scheduledAt!),
            onTap: () async {
              final picked = await _pickDateTime(initial: _scheduledAt);
              if (picked != null) setState(() => _scheduledAt = picked);
            },
          ),
          for (var i = 0; i < _alternativeTimes.length; i++)
            _PickerTile(
              icon: Icons.more_time_rounded,
              label: 'Alternativa: ${dateFormat.format(_alternativeTimes[i])}',
              trailing: IconButton(
                icon: const Icon(Icons.close_rounded, size: 18),
                onPressed: () => setState(() => _alternativeTimes.removeAt(i)),
              ),
              onTap: () async {
                final picked =
                    await _pickDateTime(initial: _alternativeTimes[i]);
                if (picked != null) {
                  setState(() => _alternativeTimes[i] = picked);
                }
              },
            ),
          if (_alternativeTimes.length < 2 && _scheduledAt != null)
            TextButton.icon(
              onPressed: () async {
                final picked = await _pickDateTime();
                if (picked != null) {
                  setState(() => _alternativeTimes.add(picked));
                }
              },
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Adicionar horário alternativo'),
            ),
          const SizedBox(height: 20),
          Text('Onde',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          _PickerTile(
            icon: Icons.stadium_outlined,
            label: _arenaName ?? 'Escolher arena do catálogo',
            trailing: _arenaId != null
                ? IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    onPressed: () => setState(() {
                      _arenaId = null;
                      _arenaName = null;
                    }),
                  )
                : null,
            onTap: () async {
              final arena = await showFriendlyMatchArenaPickerSheet(context);
              if (arena != null) {
                setState(() {
                  _arenaId = arena.id;
                  _arenaName = arena.name;
                });
              }
            },
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _freeTextController,
            decoration: const InputDecoration(
              labelText: 'Ou descreva o local',
              hintText: 'Ex.: quadra da Praia de Camburi',
            ),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _messageController,
            maxLength: 300,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Mensagem (opcional)',
              hintText: 'Quebra o gelo: conta como você joga.',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            onPressed: _sending ? null : _send,
            child: _sending
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Enviar convite'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _PickerTile extends StatelessWidget {
  const _PickerTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: ListTile(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: Icon(icon, color: AppColors.brand),
        title: Text(label,
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(fontWeight: FontWeight.w600)),
        trailing: trailing ?? const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
      ),
    );
  }
}
