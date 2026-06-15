import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/league_stage_create/league_stage_create_draft.dart';
import '../../../domain/league_stage_create/league_stage_create_logic.dart';
import '../../../domain/league_stage_create/league_stage_create_providers.dart';
import '../../../domain/tournament_create/organizer_arenas_provider.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../league_stage_create_navigation.dart';
import '../league_stage_create_wizard_scaffold.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

class LeagueStageCreateLocationPage extends ConsumerStatefulWidget {
  const LeagueStageCreateLocationPage({super.key});

  @override
  ConsumerState<LeagueStageCreateLocationPage> createState() =>
      _LeagueStageCreateLocationPageState();
}

class _LeagueStageCreateLocationPageState
    extends ConsumerState<LeagueStageCreateLocationPage> {
  late final TextEditingController _nameController;
  late final TextEditingController _cityController;
  late final TextEditingController _addressController;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _cityController = TextEditingController();
    _addressController = TextEditingController();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final leagueId = leagueIdFromRoute(context);
      if (leagueId.isEmpty) return;
      await ensureLeagueStageWizardLoaded(ref, leagueId);
      syncLeagueStageWizardStep(ref, LeagueStageCreateStep.location);
      _syncControllers();
    });
  }

  void _syncControllers() {
    final draft = ref.read(leagueStageCreateDraftProvider);
    if (_nameController.text != draft.stage.name) {
      _nameController.text = draft.stage.name;
    }
    if (_cityController.text != draft.stage.city) {
      _cityController.text = draft.stage.city;
    }
    if (_addressController.text != draft.locationAddress) {
      _addressController.text = draft.locationAddress;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _cityController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool isStart}) async {
    final draft = ref.read(leagueStageCreateDraftProvider);
    final initial = isStart
        ? (draft.stage.startAt ?? DateTime.now())
        : (draft.stage.endAt ?? draft.stage.startAt ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (picked == null) return;
    final notifier = ref.read(leagueStageCreateWizardProvider.notifier);
    if (isStart) {
      notifier.setStageStartAt(picked);
    } else {
      notifier.setStageEndAt(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(leagueStageCreateDraftProvider);
    final leagueId = leagueIdFromRoute(context);
    final isLoading = ref.watch(leagueStageCreateWizardProvider).isLoading;
    final arenasAsync = ref.watch(organizerArenaOptionsProvider);
    final canContinue = ref.watch(
      leagueStageCreateCanContinueProvider(LeagueStageCreateStep.location),
    );

    if (isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return LeagueStageCreateWizardScaffold(
      step: LeagueStageCreateStep.location,
      onClose: () => handleLeagueStageWizardClose(context, ref),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.25),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.emoji_events_outlined,
                  size: 16,
                  color: AppColors.brand,
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    leagueContextLabel(draft),
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('ETAPA'),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _nameController,
            hintText: 'Nome da etapa',
            onChanged: ref
                .read(leagueStageCreateWizardProvider.notifier)
                .setStageName,
          ),
          const SizedBox(height: 6),
          Text(
            stageOrderHint(draft),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('CIDADE'),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _cityController,
            hintText: 'Cidade da etapa',
            onChanged: ref
                .read(leagueStageCreateWizardProvider.notifier)
                .setStageCity,
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('LOCAL'),
          const SizedBox(height: 8),
          arenasAsync.when(
            loading: () => const LinearProgressIndicator(),
            error: (_, __) => const Text('Erro ao carregar arenas'),
            data: (arenas) {
              OrganizerArenaOption? selected;
              for (final arena in arenas) {
                if (arena.id == draft.arenaId) {
                  selected = arena;
                  break;
                }
              }
              return DropdownButtonFormField<OrganizerArenaOption?>(
                value: selected,
                decoration: InputDecoration(
                  filled: true,
                  fillColor: Theme.of(context).colorScheme.surface,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                hint: const Text('Selecione a arena ou clube'),
                items: [
                  for (final arena in arenas)
                    DropdownMenuItem(
                      value: arena,
                      child: Text(arena.name),
                    ),
                ],
                onChanged: (arena) {
                  if (arena == null) return;
                  ref.read(leagueStageCreateWizardProvider.notifier).setArena(
                        arenaId: arena.id,
                        locationName: arena.name,
                        address: arena.address,
                        city: arena.city,
                        stateCode: arena.state,
                      );
                  _cityController.text = arena.city;
                },
              );
            },
          ),
          const SizedBox(height: 12),
          OrganizerTextField(
            controller: _addressController,
            hintText: 'Endereço',
            onChanged: (value) {
              final notifier =
                  ref.read(leagueStageCreateWizardProvider.notifier);
              notifier.setArena(
                arenaId: draft.arenaId,
                locationName: draft.stage.locationName,
                address: value,
                city: draft.stage.city,
                stateCode: draft.stage.state,
              );
            },
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('QUADRAS DISPONÍVEIS'),
          const SizedBox(height: 8),
          OrganizerNumericStepper(
            valueLabel: draft.courtsCount == 1
                ? '1 quadra'
                : '${draft.courtsCount} quadras',
            minReached: draft.courtsCount <= 1,
            onDecrement: () => ref
                .read(leagueStageCreateWizardProvider.notifier)
                .setCourtsCount(draft.courtsCount - 1),
            onIncrement: () => ref
                .read(leagueStageCreateWizardProvider.notifier)
                .setCourtsCount(draft.courtsCount + 1),
          ),
          const SizedBox(height: 24),
          const OrganizerSectionLabel('QUANDO'),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OrganizerDateField(
                  label: 'INÍCIO',
                  value: formatShortDate(draft.stage.startAt),
                  onTap: () => _pickDate(isStart: true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OrganizerDateField(
                  label: 'FIM',
                  value: formatShortDate(draft.stage.endAt),
                  onTap: () => _pickDate(isStart: false),
                ),
              ),
            ],
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: leagueId.isEmpty
            ? null
            : () => goToNextLeagueStageCreateStep(
                  context,
                  ref,
                  LeagueStageCreateStep.location,
                  leagueId,
                ),
      ),
    );
  }
}
