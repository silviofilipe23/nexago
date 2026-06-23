import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../athlete/presentation/widgets/br_state_city_fields.dart';
import '../../../domain/tournament_create/organizer_arenas_provider.dart';
import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_form_widgets.dart';

class TournamentCreateLocationPage extends ConsumerStatefulWidget {
  const TournamentCreateLocationPage({super.key});

  @override
  ConsumerState<TournamentCreateLocationPage> createState() =>
      _TournamentCreateLocationPageState();
}

class _TournamentCreateLocationPageState
    extends ConsumerState<TournamentCreateLocationPage> {
  late final TextEditingController _venueController;
  late final TextEditingController _addressController;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(tournamentCreateDraftProvider);
    _venueController = TextEditingController(text: draft.locationName);
    _addressController = TextEditingController(text: draft.locationAddress);
  }

  @override
  void dispose() {
    _venueController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  /// Reaplica nome/endereço mantendo cidade/UF já definidos no draft.
  void _applyManual() {
    final draft = ref.read(tournamentCreateDraftProvider);
    ref.read(tournamentCreateWizardProvider.notifier).setLocationManual(
          locationName: _venueController.text.trim(),
          address: _addressController.text.trim(),
          city: draft.city,
          stateCode: draft.state,
        );
  }

  void _setStateManual(String? uf) {
    // Trocar a UF limpa a cidade (lista muda) — espelha o BrStateCityFields.
    ref.read(tournamentCreateWizardProvider.notifier).setLocationManual(
          locationName: _venueController.text.trim(),
          address: _addressController.text.trim(),
          city: '',
          stateCode: (uf ?? '').trim().toUpperCase(),
        );
  }

  void _setCityManual(String? city) {
    final draft = ref.read(tournamentCreateDraftProvider);
    ref.read(tournamentCreateWizardProvider.notifier).setLocationManual(
          locationName: _venueController.text.trim(),
          address: _addressController.text.trim(),
          city: (city ?? '').trim(),
          stateCode: draft.state,
        );
  }

  void _applyArena(OrganizerArenaOption arena) {
    _venueController.text = arena.name;
    _addressController.text = arena.address;
    ref.read(tournamentCreateWizardProvider.notifier).setArena(
          arenaId: arena.id,
          locationName: arena.name,
          address: arena.address,
          city: arena.city,
          stateCode: arena.state,
        );
  }

  Future<void> _pickDate(BuildContext context, {required bool isStart}) async {
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
    final notifier = ref.read(tournamentCreateWizardProvider.notifier);
    if (isStart) {
      notifier.setStartAt(picked);
    } else {
      notifier.setEndAt(picked);
    }
  }

  Future<void> _pickFirstMatch(BuildContext context) async {
    final draft = ref.read(tournamentCreateDraftProvider);
    final base = draft.firstMatchAt ?? draft.startAt ?? DateTime.now();
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
    );
    if (time == null) return;
    final date = draft.startAt ?? DateTime.now();
    final combined =
        DateTime(date.year, date.month, date.day, time.hour, time.minute);
    ref.read(tournamentCreateWizardProvider.notifier).setFirstMatchAt(combined);
  }

  Future<void> _handleClose() => handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final arenasAsync = ref.watch(organizerArenaOptionsProvider);
    final canContinue = ref.watch(
      tournamentCreateCanContinueProvider(TournamentCreateStep.location),
    );

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.location,
      onBack: () {
        syncWizardStep(ref, TournamentCreateStep.identity);
        Navigator.of(context).maybePop();
      },
      onClose: _handleClose,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Atalho opcional: arena cadastrada autopreenche os campos abaixo.
          arenasAsync.maybeWhen(
            data: (arenas) => arenas.isEmpty
                ? const SizedBox.shrink()
                : Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const OrganizerSectionLabel(
                          'ARENA CADASTRADA',
                          optional: true,
                        ),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<OrganizerArenaOption>(
                          initialValue: _selectedArena(arenas, draft.arenaId),
                          isExpanded: true,
                          decoration: InputDecoration(
                            filled: true,
                            fillColor: Theme.of(context).colorScheme.surface,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          hint: const Text('Selecione para autopreencher'),
                          items: [
                            for (final arena in arenas)
                              DropdownMenuItem(
                                value: arena,
                                child: Text(
                                  arena.name,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: (arena) {
                            if (arena != null) _applyArena(arena);
                          },
                        ),
                      ],
                    ),
                  ),
            orElse: () => const SizedBox.shrink(),
          ),
          const OrganizerSectionLabel('NOME DO LOCAL'),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _venueController,
            hintText: 'Arena, clube ou praia',
            onChanged: (_) => _applyManual(),
          ),
          const SizedBox(height: 16),
          const OrganizerSectionLabel('ESTADO E CIDADE'),
          const SizedBox(height: 8),
          BrStateCityFields(
            useOrganizerFormStyle: true,
            selectedState: draft.state.trim().isEmpty ? null : draft.state,
            selectedCity: draft.city.trim().isEmpty ? null : draft.city,
            onStateChanged: _setStateManual,
            onCityChanged: _setCityManual,
          ),
          const SizedBox(height: 16),
          const OrganizerSectionLabel('ENDEREÇO', optional: true),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _addressController,
            hintText: 'Rua, número, bairro',
            onChanged: (_) => _applyManual(),
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
                  onTap: () => _pickDate(context, isStart: true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OrganizerDateField(
                  label: 'FIM',
                  value: formatShortDate(draft.endAt),
                  onTap: () => _pickDate(context, isStart: false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          OrganizerDateField(
            label: 'HORÁRIO DO 1º JOGO',
            value: formatFirstMatchLabel(draft.firstMatchAt),
            onTap: () => _pickFirstMatch(context),
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

  OrganizerArenaOption? _selectedArena(
    List<OrganizerArenaOption> arenas,
    String? arenaId,
  ) {
    if (arenaId == null) return null;
    for (final arena in arenas) {
      if (arena.id == arenaId) return arena;
    }
    return null;
  }
}
