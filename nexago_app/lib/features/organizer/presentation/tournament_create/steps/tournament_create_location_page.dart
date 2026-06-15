import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/tournament_create/organizer_arenas_provider.dart';
import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_form_widgets.dart';

class TournamentCreateLocationPage extends ConsumerWidget {
  const TournamentCreateLocationPage({super.key});

  Future<void> _pickDate(
    BuildContext context,
    WidgetRef ref, {
    required bool isStart,
  }) async {
    final draft = ref.read(tournamentCreateDraftProvider);
    final initial = isStart
        ? (draft.startAt ?? DateTime.now())
        : (draft.endAt ?? draft.startAt ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (picked == null) return;
    if (isStart) {
      ref.read(tournamentCreateWizardProvider.notifier).setStartAt(picked);
    } else {
      ref.read(tournamentCreateWizardProvider.notifier).setEndAt(picked);
    }
  }

  Future<void> _pickFirstMatch(BuildContext context, WidgetRef ref) async {
    final draft = ref.read(tournamentCreateDraftProvider);
    final base = draft.firstMatchAt ?? draft.startAt ?? DateTime.now();
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(base));
    if (time == null) return;
    final date = draft.startAt ?? DateTime.now();
    final combined = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    ref.read(tournamentCreateWizardProvider.notifier).setFirstMatchAt(combined);
  }

  Future<void> _handleClose(BuildContext context, WidgetRef ref) =>
      handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final arenasAsync = ref.watch(organizerArenaOptionsProvider);
    final canContinue =
        ref.watch(tournamentCreateCanContinueProvider(TournamentCreateStep.location));

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.location,
      onBack: () {
        syncWizardStep(ref, TournamentCreateStep.identity);
        Navigator.of(context).maybePop();
      },
      onClose: () => _handleClose(context, ref),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
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
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                ),
                hint: const Text('Selecione a arena'),
                items: [
                  for (final arena in arenas)
                    DropdownMenuItem(
                      value: arena,
                      child: Text(arena.name),
                    ),
                ],
                onChanged: (arena) {
                  if (arena == null) return;
                  ref.read(tournamentCreateWizardProvider.notifier).setArena(
                        arenaId: arena.id,
                        locationName: arena.name,
                        address: arena.address,
                        city: arena.city,
                        stateCode: arena.state,
                      );
                },
              );
            },
          ),
          const SizedBox(height: 12),
          OrganizerTextField(
            controller: TextEditingController(text: draft.locationAddress),
            hintText: 'Endereço',
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setLocationManual(
                  locationName: draft.locationName,
                  address: value,
                  city: draft.city,
                  stateCode: draft.state,
                ),
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
                .read(tournamentCreateWizardProvider.notifier)
                .setCourtsCount(draft.courtsCount - 1),
            onIncrement: () => ref
                .read(tournamentCreateWizardProvider.notifier)
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
                  value: formatShortDate(draft.startAt),
                  onTap: () => _pickDate(context, ref, isStart: true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OrganizerDateField(
                  label: 'FIM',
                  value: formatShortDate(draft.endAt),
                  onTap: () => _pickDate(context, ref, isStart: false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          OrganizerDateField(
            label: 'HORÁRIO DO 1º JOGO',
            value: formatFirstMatchLabel(draft.firstMatchAt),
            onTap: () => _pickFirstMatch(context, ref),
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextCreateStep(
          context,
          ref,
          TournamentCreateStep.location,
        ),
      ),
    );
  }
}
