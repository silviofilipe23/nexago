import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../../../domain/tournament_create/tournament_create_providers.dart';
import '../tournament_create_navigation.dart';
import '../tournament_create_wizard_scaffold.dart';
import '../widgets/organizer_form_widgets.dart';

class TournamentCreateRulesPage extends ConsumerStatefulWidget {
  const TournamentCreateRulesPage({super.key});

  @override
  ConsumerState<TournamentCreateRulesPage> createState() =>
      _TournamentCreateRulesPageState();
}

class _TournamentCreateRulesPageState
    extends ConsumerState<TournamentCreateRulesPage> {
  late final TextEditingController _notesController;

  @override
  void initState() {
    super.initState();
    _notesController =
        TextEditingController(text: ref.read(tournamentCreateDraftProvider).regulationNotes);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      syncWizardStep(ref, TournamentCreateStep.rules);
    });
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickPdf() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
    );
    final path = result?.files.single.path;
    if (path == null) return;
    ref.read(tournamentCreateWizardProvider.notifier).setRegulationPdfPath(path);
  }

  Future<void> _handleClose() => handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue =
        ref.watch(tournamentCreateCanContinueProvider(TournamentCreateStep.rules));

    return TournamentCreateWizardScaffold(
      step: TournamentCreateStep.rules,
      onBack: () {
        syncWizardStep(ref, TournamentCreateStep.prizes);
        Navigator.of(context).maybePop();
      },
      onClose: _handleClose,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OrganizerSectionLabel('REGULAMENTO'),
          const SizedBox(height: 8),
          Material(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: _pickPdf,
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AppColors.brand.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.description_outlined,
                          color: AppColors.brand),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            draft.regulationPdfPath != null
                                ? draft.regulationPdfPath!.split('/').last
                                : 'Anexar regulamento em PDF',
                            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                          Text(
                            draft.regulationPdfPath != null
                                ? 'PDF anexado'
                                : 'Opcional · até 5 MB',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: context.themeColors.onSurfaceMuted,
                                ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      'Trocar',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: AppColors.brand,
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('OBSERVAÇÕES', optional: true),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _notesController,
            hintText: 'Regras adicionais para os atletas…',
            maxLines: 4,
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setRegulationNotes(value),
          ),
          const SizedBox(height: 20),
          OrganizerToggleSettingRow(
            icon: Icons.checkroom_outlined,
            title: 'Uniforme obrigatório',
            subtitle: 'As duplas precisam jogar com camisa padronizada.',
            value: draft.uniformRequired,
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setUniformRequired(value),
            nested: [
              OrganizerToggleSettingRow(
                icon: Icons.tag_outlined,
                title: 'Número na camisa',
                subtitle: 'Cada atleta com um número de identificação.',
                value: draft.uniformNumberOnShirt,
                onChanged: (value) => ref
                    .read(tournamentCreateWizardProvider.notifier)
                    .setUniformNumberOnShirt(value),
              ),
              const SizedBox(height: 8),
              OrganizerToggleSettingRow(
                icon: Icons.badge_outlined,
                title: 'Nome do atleta',
                subtitle: 'Sobrenome impresso na camisa.',
                value: draft.uniformNameOnShirt,
                onChanged: (value) => ref
                    .read(tournamentCreateWizardProvider.notifier)
                    .setUniformNameOnShirt(value),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('RANKING NEXAGO'),
          const SizedBox(height: 8),
          OrganizerToggleSettingRow(
            icon: Icons.emoji_events_outlined,
            title: 'Vale pontos no ranking',
            subtitle: 'Resultados contam para o ranking oficial da categoria.',
            value: draft.rankingEnabled,
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setRankingEnabled(value),
          ),
          if (draft.rankingEnabled) ...[
            const SizedBox(height: 12),
            const OrganizerSectionLabel('TABELA DE PONTUAÇÃO'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: draft.rankingTableId,
              decoration: InputDecoration(
                filled: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
              ),
              items: const [
                DropdownMenuItem(
                  value: 'nexago_standalone',
                  child: Text('Padrão nexaGO · Etapa avulsa'),
                ),
              ],
              onChanged: (value) {
                if (value != null) {
                  ref
                      .read(tournamentCreateWizardProvider.notifier)
                      .setRankingTableId(value);
                }
              },
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: context.themeColors.surfaceCard,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  for (final entry in defaultRankingPointsPreview.entries)
                    Text(
                      '${entry.key}: ${entry.value} pts',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextCreateStep(
          context,
          ref,
          TournamentCreateStep.rules,
        ),
      ),
    );
  }
}
