import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

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
    _notesController = TextEditingController(
      text: ref.read(tournamentCreateDraftProvider).regulationNotes,
    );
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
    ref
        .read(tournamentCreateWizardProvider.notifier)
        .setRegulationPdfPath(path);
  }

  Future<void> _handleClose() => handleWizardClose(context, ref);

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(tournamentCreateDraftProvider);
    final canContinue = ref.watch(
      tournamentCreateCanContinueProvider(TournamentCreateStep.rules),
    );

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
                    color: context.themeColors.onSurfaceMuted.withValues(
                      alpha: 0.12,
                    ),
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
                      child: const Icon(
                        Icons.description_outlined,
                        color: AppColors.brand,
                      ),
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
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          Text(
                            draft.regulationPdfPath != null
                                ? 'PDF anexado'
                                : 'Opcional · até 5 MB',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
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
          const OrganizerSectionLabel('UNIFORME NA INSCRIÇÃO'),
          const SizedBox(height: 8),
          OrganizerToggleSettingRow(
            icon: Icons.checkroom_outlined,
            title: 'Kit do torneio na inscrição',
            subtitle: 'Atletas escolhem o tamanho da camisa ao se inscrever.',
            value: draft.uniformRequired,
            onChanged: (value) => ref
                .read(tournamentCreateWizardProvider.notifier)
                .setUniformRequired(value),
            nested: [
              OrganizerToggleSettingRow(
                icon: Icons.tag_outlined,
                title: 'Solicitar número na inscrição',
                subtitle:
                    'Cada atleta informa o número que vai na camisa (1–99).',
                value: draft.uniformNumberOnShirt,
                onChanged: (value) => ref
                    .read(tournamentCreateWizardProvider.notifier)
                    .setUniformNumberOnShirt(value),
              ),
              const SizedBox(height: 8),
              OrganizerToggleSettingRow(
                icon: Icons.badge_outlined,
                title: 'Solicitar nome na inscrição',
                subtitle:
                    'Cada atleta informa o sobrenome impresso na camisa.',
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
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: context.themeColors.surfaceCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color:
                      context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.emoji_events_outlined,
                      color: AppColors.brand, size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Padrão nexaGO · Etapa avulsa',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const _RankingPointsPreviewGrid(),
          ],
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () =>
            goToNextCreateStep(context, ref, TournamentCreateStep.rules),
      ),
    );
  }
}

class _RankingPointsPreviewGrid extends StatelessWidget {
  const _RankingPointsPreviewGrid();

  @override
  Widget build(BuildContext context) {
    final entries = defaultRankingPointsPreview.entries.toList(growable: false);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          for (var row = 0; row < entries.length; row += 2) ...[
            if (row > 0) const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _RankingPointCell(
                    label: entries[row].key,
                    points: entries[row].value,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: row + 1 < entries.length
                      ? _RankingPointCell(
                          label: entries[row + 1].key,
                          points: entries[row + 1].value,
                        )
                      : const SizedBox.shrink(),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _RankingPointCell extends StatelessWidget {
  const _RankingPointCell({required this.label, required this.points});

  final String label;
  final int points;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
          ),
        ),
        const Spacer(),
        Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: '$points',
                style: AppTypography.mono(fontWeight: FontWeight.w800),
              ),
              TextSpan(
                text: ' pts',
                style: AppTypography.mono(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
