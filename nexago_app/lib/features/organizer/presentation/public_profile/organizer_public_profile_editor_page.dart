import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../athlete/presentation/widgets/br_state_city_fields.dart';
import '../../../organizer_public_profile/domain/organizer_public_profile_logic.dart';
import '../../../organizer_public_profile/presentation/widgets/organizer_profile_hero.dart';
import '../../domain/public_profile/organizer_profile_editor_logic.dart';
import '../../domain/public_profile/organizer_profile_editor_providers.dart';
import '../../domain/public_profile/organizer_profile_save_session.dart';
import '../tournament_create/widgets/organizer_form_widgets.dart';

Uint8List _resizeForUpload(Uint8List bytes) => resizeOrganizerImageJpeg(bytes);

/// "Perfil público" no modo organizador (`/organizer/perfil-publico`): nome da organização,
/// logo, capa, bio, cidade/UF, telefone de contato e o switch do WhatsApp público, com a prévia
/// do cabeçalho que o atleta vê. Grava só o que mudou, por caminho pontilhado.
class OrganizerPublicProfileEditorPage extends ConsumerStatefulWidget {
  const OrganizerPublicProfileEditorPage({super.key});

  @override
  ConsumerState<OrganizerPublicProfileEditorPage> createState() =>
      _OrganizerPublicProfileEditorPageState();
}

class _OrganizerPublicProfileEditorPageState
    extends ConsumerState<OrganizerPublicProfileEditorPage> {
  final _nameController = TextEditingController();
  final _bioController = TextEditingController();
  final _phoneController = TextEditingController();
  String _city = '';
  String _state = '';
  bool _publicWhatsapp = false;

  /// Nasce com o snapshot do doc na abertura da tela e é a base de todo payload (ver
  /// [OrganizerProfileSaveSession]). `null` até o primeiro valor do stream.
  OrganizerProfileSaveSession? _session;

  bool _submitted = false;
  bool _saving = false;
  bool _pickingImage = false;

  @override
  void dispose() {
    _nameController.dispose();
    _bioController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  OrganizerProfileForm get _form => OrganizerProfileForm(
    orgName: _nameController.text,
    bio: _bioController.text,
    city: _city,
    state: _state,
    contactPhone: _phoneController.text,
    publicWhatsapp: _publicWhatsapp,
  );

  /// Preenche a tela com o doc uma vez só: atualizações posteriores do stream (inclusive a do
  /// próprio save, ou uma edição feita no painel web) não atropelam o que o organizador está
  /// digitando, não entram no payload e não ligam o "Salvar".
  void _initFrom(OrganizerProfileSource source) {
    if (_session != null) return;
    final form = OrganizerProfileForm.fromSource(source);
    _nameController.text = form.orgName;
    _bioController.text = form.bio;
    _phoneController.text = form.contactPhone;
    _city = form.city;
    _state = form.state;
    _publicWhatsapp = form.publicWhatsapp;
    _session = OrganizerProfileSaveSession(source);
  }

  void _back() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.go(AppRoutes.organizerHome);
  }

  Future<void> _pickImage({required bool cover}) async {
    if (_pickingImage) return;
    setState(() => _pickingImage = true);
    try {
      // O seletor nativo já reduz (e converte HEIC em JPEG): é a única forma de ler a foto do
      // iPhone. O redimensionamento abaixo garante JPEG ≤ 1600 px de largura.
      final file = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: kOrganizerImageMaxWidth.toDouble(),
        imageQuality: 85,
        requestFullMetadata: false,
      );
      if (file == null) return;
      final raw = await file.readAsBytes();
      final sizeError = validateOrganizerImageSize(raw.length);
      if (sizeError != null) {
        if (mounted) showAppSnackBar(context, sizeError, isError: true);
        return;
      }
      final jpeg = await compute(_resizeForUpload, raw);
      final session = _session;
      if (!mounted || session == null) return;
      setState(() {
        if (cover) {
          session.pickCover(jpeg);
        } else {
          session.pickLogo(jpeg);
        }
      });
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível carregar esta imagem. Tente outra.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _pickingImage = false);
    }
  }

  void _removeCurrentCover() {
    setState(() => _session?.markCoverRemoved());
  }

  Future<void> _save(OrganizerProfileSaveSession session) async {
    if (_saving) return;
    final form = _form;
    final errors = validateOrganizerProfileForm(
      form,
      baseline: session.baseline,
    );
    setState(() => _submitted = true);
    if (errors.isNotEmpty) {
      showAppSnackBar(context, 'Revise os campos destacados.', isError: true);
      return;
    }
    final uid = ref.read(organizerEditorUidProvider);
    if (uid.isEmpty) return;

    setState(() => _saving = true);
    final repository = ref.read(organizerPublicProfileEditorRepositoryProvider);
    try {
      await session.save(
        form,
        uploadLogo: (bytes) => repository.uploadLogo(uid, bytes),
        uploadCover: (bytes) => repository.uploadCover(uid, bytes),
        persist: (update) => repository.save(uid, update),
      );
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        'Perfil público salvo. Os atletas veem a mudança em instantes.',
      );
    } catch (_) {
      if (!mounted) return;
      // O que já foi gravado (ex.: o logo) saiu da fila; o resto continua pendente e a próxima
      // tentativa não sobe de novo a imagem que já subiu.
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        'Não foi possível salvar. Confira sua conexão e tente de novo.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final sourceAsync = ref.watch(organizerProfileSourceProvider);
    final source = sourceAsync.valueOrNull;
    if (source != null) _initFrom(source);
    final session = _session;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 16, 0),
              child: Row(
                children: [
                  Material(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: _back,
                      child: SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(
                          Icons.arrow_back_rounded,
                          color: colors.onSurface,
                          semanticLabel: 'Voltar',
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
                          'PERFIL PÚBLICO',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppColors.brand,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.8,
                          ),
                        ),
                        Text(
                          'Como os atletas te veem',
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
              // Aberta a tela, o formulário fica: um erro posterior do stream não o derruba.
              child: session != null
                  ? _buildForm(context, session)
                  : sourceAsync.hasError
                  ? AppErrorView(
                      title: 'Não foi possível carregar',
                      message: 'Confira sua conexão e tente de novo.',
                      retryLabel: 'Tentar de novo',
                      onRetry: () =>
                          ref.invalidate(organizerProfileSourceProvider),
                    )
                  : const Center(child: CircularProgressIndicator()),
            ),
            if (session != null)
              OrganizerWizardContinueButton(
                label: 'Salvar perfil',
                enabled: session.isDirty(_form) && !_pickingImage,
                loading: _saving,
                onPressed: () => _save(session),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildForm(BuildContext context, OrganizerProfileSaveSession session) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final source = session.baseline;
    final form = _form;
    final errors = _submitted
        ? validateOrganizerProfileForm(form, baseline: source)
        : const <OrganizerProfileField, String>{};
    final whatsappEnabled = organizerWhatsappSwitchEnabled(form);
    final previewName = form.orgName.trim().isEmpty
        ? source.displayName
        : form.orgName.trim();
    final hasCover = session.hasCover;
    final newLogo = session.logo?.bytes;
    final newCover = session.cover?.bytes;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OrganizerSectionLabel('PRÉVIA'),
          const SizedBox(height: 8),
          Container(
            clipBehavior: Clip.antiAlias,
            padding: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: colors.canvas,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: colors.onSurfaceMuted.withValues(alpha: 0.18),
              ),
            ),
            child: OrganizerProfileHero(
              name: previewName,
              initials: organizerInitials(previewName),
              locationLine: organizerLocationLine(_city, _state),
              logo: newLogo != null
                  ? MemoryImage(newLogo)
                  : organizerNetworkImage(source.logoUrl),
              cover: newCover != null
                  ? MemoryImage(newCover)
                  : (session.removeCover
                        ? null
                        : organizerNetworkImage(source.coverUrl)),
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => context.pushNamed(
                AppRouteNames.organizerPublicProfilePreview,
              ),
              style: TextButton.styleFrom(foregroundColor: AppColors.brand),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('Ver meu perfil'),
            ),
          ),
          const SizedBox(height: 12),
          const OrganizerSectionLabel('IMAGENS'),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _ImageButton(
                  label: 'Trocar logo',
                  icon: Icons.account_box_outlined,
                  onPressed: _pickingImage || _saving
                      ? null
                      : () => _pickImage(cover: false),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ImageButton(
                  label: hasCover ? 'Trocar capa' : 'Adicionar capa',
                  icon: Icons.panorama_outlined,
                  onPressed: _pickingImage || _saving
                      ? null
                      : () => _pickImage(cover: true),
                ),
              ),
            ],
          ),
          if (hasCover)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _saving ? null : _removeCurrentCover,
                style: TextButton.styleFrom(
                  foregroundColor: colors.onSurfaceMuted,
                ),
                icon: const Icon(Icons.delete_outline_rounded, size: 18),
                label: const Text('Remover capa'),
              ),
            ),
          const SizedBox(height: 4),
          Text(
            'Imagens de até 5 MB. O logo aparece quadrado; a capa, numa faixa larga '
            '(1600 × 400 no portal).',
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 24),
          const OrganizerSectionLabel('NOME DA ORGANIZAÇÃO'),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _nameController,
            hintText: 'Liga Amadora Goiânia',
            maxLength: kOrganizerNameMaxLength,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) => setState(() {}),
          ),
          _FieldError(errors[OrganizerProfileField.orgName]),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('BIO', optional: true),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _bioController,
            hintText: 'Conte o que torna seus eventos especiais.',
            maxLines: 4,
            maxLength: kOrganizerBioMaxLength,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              '${_bioController.text.length}/$kOrganizerBioMaxLength',
              style: AppTypography.mono(
                fontSize: 11,
                color: colors.onSurfaceMuted,
              ),
            ),
          ),
          _FieldError(errors[OrganizerProfileField.bio]),
          const SizedBox(height: 16),
          const OrganizerSectionLabel('ESTADO E CIDADE'),
          const SizedBox(height: 8),
          BrStateCityFields(
            useOrganizerFormStyle: true,
            selectedState: _state.isEmpty ? null : _state,
            selectedCity: _city.isEmpty ? null : _city,
            stateValidator: (_) => null,
            cityValidator: (_) => null,
            onStateChanged: (uf) => setState(() {
              _state = (uf ?? '').trim().toUpperCase();
              _city = '';
            }),
            onCityChanged: (city) =>
                setState(() => _city = (city ?? '').trim()),
          ),
          _FieldError(errors[OrganizerProfileField.state]),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('TELEFONE DE CONTATO (WHATSAPP)'),
          const SizedBox(height: 8),
          OrganizerTextField(
            controller: _phoneController,
            hintText: '(62) 99999-9999',
            keyboardType: TextInputType.phone,
            maxLength: 20,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9()+\- ]')),
            ],
            onChanged: (_) => setState(() {}),
          ),
          _FieldError(errors[OrganizerProfileField.contactPhone]),
          const SizedBox(height: 12),
          // Material (não Container decorado): o ListTile pinta o ripple no Material mais
          // próximo, e um fundo decorado no meio o esconderia.
          Material(
            color: colors.surfaceCard,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(
                color: colors.onSurfaceMuted.withValues(alpha: 0.15),
              ),
            ),
            child: SwitchListTile(
              key: const ValueKey('organizer-public-whatsapp-switch'),
              value: whatsappEnabled && _publicWhatsapp,
              onChanged: whatsappEnabled
                  ? (value) => setState(() => _publicWhatsapp = value)
                  : null,
              activeThumbColor: AppColors.brand,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              title: Text(
                'Mostrar botão de WhatsApp no meu perfil',
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: whatsappEnabled
                      ? colors.onSurface
                      : colors.onSurfaceMuted,
                ),
              ),
              subtitle: Text(
                whatsappEnabled
                    ? 'Os atletas abrem uma conversa com você direto do perfil.'
                    : 'Preencha o telefone de contato para ligar.',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ImageButton extends StatelessWidget {
  const _ImageButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return OutlinedButton.icon(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: colors.onSurface,
        minimumSize: const Size(0, 46),
        side: BorderSide(color: colors.onSurfaceMuted.withValues(alpha: 0.3)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      icon: Icon(icon, size: 18),
      label: Text(label),
    );
  }
}

class _FieldError extends StatelessWidget {
  const _FieldError(this.message);

  final String? message;

  @override
  Widget build(BuildContext context) {
    final text = message;
    if (text == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(
        text,
        style: AppTypography.soraRegular(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppColors.live,
        ),
      ),
    );
  }
}
