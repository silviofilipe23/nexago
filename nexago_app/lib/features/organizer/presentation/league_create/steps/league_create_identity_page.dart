import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/league_create/league_create_draft.dart';
import '../../../domain/league_create/league_create_providers.dart';
import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import '../league_create_navigation.dart';
import '../league_create_wizard_scaffold.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

class LeagueCreateIdentityPage extends ConsumerStatefulWidget {
  const LeagueCreateIdentityPage({super.key});

  @override
  ConsumerState<LeagueCreateIdentityPage> createState() =>
      _LeagueCreateIdentityPageState();
}

class _LeagueCreateIdentityPageState
    extends ConsumerState<LeagueCreateIdentityPage> {
  late final TextEditingController _nameController;
  late final TextEditingController _organizationController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _cityController;
  late final TextEditingController _stateController;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(leagueCreateDraftProvider);
    _nameController = TextEditingController(text: draft.name);
    _organizationController =
        TextEditingController(text: draft.organizationName);
    _descriptionController = TextEditingController(text: draft.description);
    _cityController = TextEditingController(text: draft.city);
    _stateController = TextEditingController(text: draft.state);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      syncLeagueWizardStep(ref, LeagueCreateStep.identity);
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _organizationController.dispose();
    _descriptionController.dispose();
    _cityController.dispose();
    _stateController.dispose();
    super.dispose();
  }

  Future<void> _pickCover() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      maxHeight: 1080,
      imageQuality: 85,
    );
    if (file == null) return;
    ref.read(leagueCreateWizardProvider.notifier).setCoverImagePath(file.path);
  }

  Future<void> _handleClose() => handleLeagueWizardClose(context, ref);

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(leagueCreateDraftProvider);
    final canContinue = ref.watch(
      leagueCreateCanContinueProvider(LeagueCreateStep.identity),
    );

    return LeagueCreateWizardScaffold(
      step: LeagueCreateStep.identity,
      onClose: _handleClose,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OrganizerSectionLabel('ESPORTE'),
          const SizedBox(height: 8),
          DropdownButtonFormField<TournamentSport>(
            value: draft.sport,
            decoration: _fieldDecoration(context),
            items: [
              for (final sport in TournamentSport.values)
                DropdownMenuItem(
                  value: sport,
                  child: Text(sportLabel(sport)),
                ),
            ],
            onChanged: (value) {
              if (value != null) {
                ref.read(leagueCreateWizardProvider.notifier).setSport(value);
              }
            },
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('NOME DO CIRCUITO'),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _nameController,
            hintText: 'Circuito Goiânia Beach',
            onChanged: (value) =>
                ref.read(leagueCreateWizardProvider.notifier).setName(value),
          ),
          const SizedBox(height: 6),
          Text(
            'Aparece em destaque no card e na página da liga.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('ORGANIZAÇÃO'),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _organizationController,
            hintText: 'Federação ou produtora',
            onChanged: (value) => ref
                .read(leagueCreateWizardProvider.notifier)
                .setOrganizationName(value),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('IMAGEM DE CAPA', optional: true),
          const SizedBox(height: 8),
          Material(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: _pickCover,
              child: Container(
                height: 140,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: context.themeColors.onSurfaceMuted
                        .withValues(alpha: 0.2),
                  ),
                ),
                child: draft.coverImagePath != null
                    ? Stack(
                        fit: StackFit.expand,
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(14),
                            child: Image.file(
                              File(draft.coverImagePath!),
                              fit: BoxFit.cover,
                              width: double.infinity,
                            ),
                          ),
                          Positioned(
                            right: 12,
                            bottom: 12,
                            child: FilledButton.tonal(
                              onPressed: _pickCover,
                              style: FilledButton.styleFrom(
                                backgroundColor:
                                    context.themeColors.surfaceCard,
                                foregroundColor: context.themeColors.onSurface,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 8,
                                ),
                              ),
                              child: const Text(
                                'Trocar',
                                style: TextStyle(fontWeight: FontWeight.w800),
                              ),
                            ),
                          ),
                        ],
                      )
                    : _coverPlaceholder(context),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('DESCRIÇÃO', optional: true),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _descriptionController,
            hintText: 'Conte o que os atletas podem esperar da temporada…',
            maxLines: 4,
            onChanged: (value) => ref
                .read(leagueCreateWizardProvider.notifier)
                .setDescription(value),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('CIDADE', optional: true),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _cityController,
            hintText: 'Goiânia',
            onChanged: (value) =>
                ref.read(leagueCreateWizardProvider.notifier).setCity(value),
          ),
          const SizedBox(height: 16),
          const OrganizerSectionLabel('ESTADO', optional: true),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _stateController,
            hintText: 'GO',
            onChanged: (value) => ref
                .read(leagueCreateWizardProvider.notifier)
                .setStateCode(value),
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextLeagueCreateStep(
          context,
          ref,
          LeagueCreateStep.identity,
        ),
      ),
    );
  }

  Widget _coverPlaceholder(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.image_outlined, color: AppColors.brand),
        ),
        const SizedBox(height: 10),
        Text(
          'Adicionar imagem de capa',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        Text(
          'JPG ou PNG · proporção 16:9',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
        ),
      ],
    );
  }

  InputDecoration _fieldDecoration(BuildContext context) {
    return InputDecoration(
      filled: true,
      fillColor: context.themeColors.surfaceCard,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
    );
  }
}
