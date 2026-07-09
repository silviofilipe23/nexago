import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../core/observability/analytics_service.dart';
import '../../../core/router/routes.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/friendly_match_models.dart';
import '../domain/friendly_match_providers.dart';
import 'widgets/friendly_match_arena_picker_sheet.dart';
import 'widgets/friendly_match_invite_builder_sections.dart';

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
  DateTime? _selectedDay;
  TimeOfDay? _selectedTime;
  DateTime? _scheduledAt;
  final List<DateTime> _alternativeTimes = [];
  InviteBuilderLocationMode _locationMode = InviteBuilderLocationMode.catalog;
  ArenaListItem? _arena;
  final _freeTextController = TextEditingController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    _selectedDay = DateTime(tomorrow.year, tomorrow.month, tomorrow.day);
    _selectedTime = const TimeOfDay(hour: 19, minute: 0);
    _syncScheduledAt();
    ref.read(analyticsServiceProvider).logFriendlyMatchBuilderOpened();
  }

  @override
  void dispose() {
    _freeTextController.dispose();
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

  void _syncScheduledAt() {
    final day = _selectedDay;
    final time = _selectedTime;
    if (day == null || time == null) {
      _scheduledAt = null;
      return;
    }
    _scheduledAt = DateTime(day.year, day.month, day.day, time.hour, time.minute);
  }

  Future<DateTime?> _pickAlternativeDateTime({DateTime? initial}) async {
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

  Future<void> _pickArena() async {
    final arena = await showFriendlyMatchArenaPickerSheet(context);
    if (arena != null) {
      setState(() => _arena = arena);
    }
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
    if (_locationMode == InviteBuilderLocationMode.catalog && _arena == null) {
      showAppSnackBar(
        context,
        'Escolha uma arena do catálogo.',
        isError: true,
      );
      return;
    }
    if (_locationMode == InviteBuilderLocationMode.other && freeText.isEmpty) {
      showAppSnackBar(context, 'Descreva o local.', isError: true);
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
          arenaId: _locationMode == InviteBuilderLocationMode.catalog
              ? _arena?.id
              : null,
          arenaName: _locationMode == InviteBuilderLocationMode.catalog
              ? _arena?.name
              : null,
          freeText: _locationMode == InviteBuilderLocationMode.other
              ? freeText
              : null,
        ),
        message: '',
      );
      if (!mounted) return;
      ref.read(analyticsServiceProvider).logFriendlyMatchInviteSent(
            objective: _objective.firestoreValue,
            sport: sport,
            hasArena: _arena != null,
          );
      showAppSnackBar(context, 'Convite enviado para ${widget.toName}! 🏐');
      context.pushReplacement(
        AppRoutes.friendlyMatchDetail.replaceFirst(':matchId', matchId),
      );
    } on FriendlyMatchActionException catch (e) {
      if (mounted) showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível enviar o convite.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String get _inviteFirstName {
    final parts = widget.toName.trim().split(' ').where((p) => p.isNotEmpty);
    return parts.isNotEmpty ? parts.first : widget.toName;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sports = _mySports();
    _sport ??= sports.isNotEmpty ? sports.first : null;
    final dayOptions = inviteBuilderDayOptions();
    final timeOptions = inviteBuilderTimeOptions(_selectedTime);
    final altFormat = DateFormat("EEE, d 'de' MMM · HH:mm", 'pt_BR');

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        automaticallyImplyLeading: false,
        centerTitle: false,
        leadingWidth: 52,
        leading: Padding(
          padding: const EdgeInsets.only(left: 12),
          child: Center(
            child: Material(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                onTap: () => context.pop(),
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 40,
                  height: 40,
                  child: Icon(
                    Icons.chevron_left_rounded,
                    color: colors.onSurface,
                  ),
                ),
              ),
            ),
          ),
        ),
        title: Text(
          'Convidar $_inviteFirstName',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
                letterSpacing: -0.3,
              ),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                const InviteBuilderSectionTitle(label: 'Objetivo'),
                const SizedBox(height: 10),
                InviteBuilderObjectivePicker(
                  selected: _objective,
                  onSelected: (value) => setState(() => _objective = value),
                ),
                const SizedBox(height: 24),
                const InviteBuilderSectionTitle(label: 'Esporte'),
                const SizedBox(height: 10),
                if (sports.isEmpty)
                  Text(
                    'Complete seu perfil esportivo para convidar alguém.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                  )
                else
                  InviteBuilderSportChips(
                    sports: sports,
                    selectedSport: _sport,
                    onSelected: (sport) => setState(() => _sport = sport),
                  ),
                const SizedBox(height: 24),
                const InviteBuilderSectionTitle(
                  label: 'Quando',
                  icon: Icons.event_rounded,
                ),
                const SizedBox(height: 10),
                InviteBuilderDateRow(
                  days: dayOptions,
                  selectedDay: _selectedDay,
                  onDaySelected: (day) => setState(() {
                    _selectedDay = day;
                    _syncScheduledAt();
                  }),
                ),
                const SizedBox(height: 10),
                InviteBuilderTimeRow(
                  times: timeOptions,
                  selectedTime: _selectedTime,
                  onTimeSelected: (time) => setState(() {
                    _selectedTime = time;
                    _syncScheduledAt();
                  }),
                ),
                if (_alternativeTimes.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  for (var i = 0; i < _alternativeTimes.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _AlternativeTimeChip(
                        label: altFormat
                            .format(_alternativeTimes[i].toLocal())
                            .replaceAll('.', ''),
                        onRemove: () =>
                            setState(() => _alternativeTimes.removeAt(i)),
                      ),
                    ),
                ],
                if (_alternativeTimes.length < 2 && _scheduledAt != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () async {
                        final picked = await _pickAlternativeDateTime();
                        if (picked != null) {
                          setState(() => _alternativeTimes.add(picked));
                        }
                      },
                      icon: const Icon(Icons.add_rounded, size: 18),
                      label: const Text('Adicionar horário alternativo'),
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.brand,
                        textStyle: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                const SizedBox(height: 24),
                const InviteBuilderSectionTitle(
                  label: 'Onde',
                  icon: Icons.place_outlined,
                ),
                const SizedBox(height: 10),
                InviteBuilderWhereSection(
                  mode: _locationMode,
                  onModeChanged: (mode) => setState(() {
                    _locationMode = mode;
                    if (mode == InviteBuilderLocationMode.catalog) {
                      _freeTextController.clear();
                    } else {
                      _arena = null;
                    }
                  }),
                  onPickArena: _pickArena,
                  arena: _arena,
                  freeTextController: _freeTextController,
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: InviteBuilderSendButton(
                busy: _sending,
                onPressed: _send,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AlternativeTimeChip extends StatelessWidget {
  const _AlternativeTimeChip({
    required this.label,
    required this.onRemove,
  });

  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colors.outline.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Icon(Icons.more_time_rounded, size: 16, color: colors.onSurfaceMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Alternativa: $label',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            icon: Icon(Icons.close_rounded, size: 18, color: colors.onSurfaceMuted),
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}
