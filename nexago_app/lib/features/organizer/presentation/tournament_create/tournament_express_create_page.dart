import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../athlete/presentation/widgets/br_state_city_fields.dart';
import '../../domain/tournament_create/tournament_create_draft.dart';
import '../../domain/tournament_create/tournament_create_logic.dart';
import '../../domain/tournament_create/tournament_create_providers.dart';
import 'tournament_published_page.dart';
import 'widgets/organizer_form_widgets.dart';

/// Criação expressa: 1 tela com o essencial (nome, local, datas, 1 categoria)
/// que já publica o torneio. Premiação, formato e regras são ajustados depois.
class TournamentExpressCreatePage extends ConsumerStatefulWidget {
  const TournamentExpressCreatePage({super.key});

  @override
  ConsumerState<TournamentExpressCreatePage> createState() =>
      _TournamentExpressCreatePageState();
}

class _TournamentExpressCreatePageState
    extends ConsumerState<TournamentExpressCreatePage> {
  final _nameController = TextEditingController();
  final _venueController = TextEditingController();
  String _city = '';
  String _state = '';

  DateTime? _startAt;
  DateTime? _endAt;
  TournamentCategoryGender _gender = TournamentCategoryGender.male;
  int _spots = 16;
  bool _submitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    _venueController.dispose();
    super.dispose();
  }

  bool get _canPublish =>
      _nameController.text.trim().isNotEmpty &&
      _venueController.text.trim().isNotEmpty &&
      _city.trim().isNotEmpty &&
      _state.trim().isNotEmpty &&
      _startAt != null;

  Future<void> _pickDate({required bool isStart}) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final initial = isStart
        ? (_startAt ?? today)
        : (_endAt ?? _startAt ?? today);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: today,
      lastDate: today.add(const Duration(days: 730)),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _startAt = picked;
        if (_endAt != null && _endAt!.isBefore(picked)) _endAt = picked;
      } else {
        _endAt = picked;
      }
    });
  }

  TournamentCreateDraft _buildDraft() {
    return buildExpressTournamentDraft(
      name: _nameController.text,
      locationName: _venueController.text,
      city: _city,
      state: _state,
      startAt: _startAt!,
      endAt: _endAt,
      gender: _gender,
      spots: _spots,
    );
  }

  Future<void> _publish() async {
    if (_submitting || !_canPublish) return;
    setState(() => _submitting = true);
    try {
      final result = await ref
          .read(organizerTournamentsRepositoryProvider)
          .saveTournament(draft: _buildDraft(), publish: true);
      if (!mounted) return;
      context.pushReplacementNamed(
        AppRouteNames.organizerTournamentPublished,
        extra: TournamentPublishedArgs(
          tournamentId: result.tournamentId,
          name: _nameController.text.trim(),
          published: result.published,
        ),
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao publicar: $e', isError: true);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 16, 0),
              child: Row(
                children: [
                  Material(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => context.pop(),
                      child: SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(
                          Icons.close_rounded,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'CRIAÇÃO EXPRESSA',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppColors.brand,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.8,
                          ),
                        ),
                        Text(
                          'Publique em 1 minuto',
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const OrganizerSectionLabel('NOME DO TORNEIO'),
                    const SizedBox(height: 8),
                    OrganizerTextField(
                      controller: _nameController,
                      hintText: 'Open Goiânia Beach',
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 20),
                    const OrganizerSectionLabel('NOME DO LOCAL'),
                    const SizedBox(height: 8),
                    OrganizerTextField(
                      controller: _venueController,
                      hintText: 'Arena, clube ou praia',
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 16),
                    const OrganizerSectionLabel('ESTADO E CIDADE'),
                    const SizedBox(height: 8),
                    BrStateCityFields(
                      useOrganizerFormStyle: true,
                      selectedState: _state.isEmpty ? null : _state,
                      selectedCity: _city.isEmpty ? null : _city,
                      onStateChanged: (uf) => setState(() {
                        _state = (uf ?? '').trim().toUpperCase();
                        _city = '';
                      }),
                      onCityChanged: (city) =>
                          setState(() => _city = (city ?? '').trim()),
                    ),
                    const SizedBox(height: 20),
                    const OrganizerSectionLabel('QUANDO'),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OrganizerDateField(
                            label: 'INÍCIO',
                            value: formatShortDate(_startAt),
                            onTap: () => _pickDate(isStart: true),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OrganizerDateField(
                            label: 'FIM (OPCIONAL)',
                            value: formatShortDate(_endAt),
                            onTap: () => _pickDate(isStart: false),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    const OrganizerSectionLabel('PRIMEIRA CATEGORIA'),
                    const SizedBox(height: 8),
                    OrganizerSegmentedControl(
                      options: TournamentCategoryGender.values,
                      selected: _gender,
                      labelBuilder: categoryGenderLabel,
                      onSelected: (value) => setState(() => _gender = value),
                    ),
                    const SizedBox(height: 12),
                    OrganizerNumericStepper(
                      valueLabel: _spots == 1 ? '1 dupla' : '$_spots duplas',
                      minReached: _spots <= 2,
                      onDecrement: () => setState(() => _spots -= 1),
                      onIncrement: () => setState(() => _spots += 1),
                    ),
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.brand.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.bolt_rounded,
                              color: AppColors.brand, size: 18),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Inscrições abrem agora e fecham no início. '
                              'Premiação, formato e mais categorias você ajusta '
                              'depois no torneio.',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: OrganizerWizardContinueButton(
                label: 'Publicar torneio',
                enabled: _canPublish,
                loading: _submitting,
                onPressed: _publish,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
