import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/br_phone_format.dart';
import '../../../core/theme/app_borders.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_status_views.dart';
import '../../athlete/domain/athlete_profile.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../payment_card/domain/card_input_validation.dart'
    show CepInputFormatter;
import '../application/benefits_club_providers.dart';
import '../domain/benefit_event.dart';
import '../domain/partner.dart';
import '../domain/partner_lead.dart';
import 'benefits_club_navigation.dart';
import 'widgets/benefit_partner_parts.dart';
import 'widgets/benefits_club_parts.dart';
import 'widgets/partner_lead_fields.dart';
import 'widgets/partner_lead_success_view.dart';
import 'widgets/partner_visuals.dart';

/// Formulário "Quero contratar": nome e WhatsApp vêm do perfil, bairro e CEP
/// o atleta preenche, e o envio só existe com a autorização marcada. Quem
/// grava é a callable `submitPartnerLead` (que guarda o texto aceito).
class PartnerLeadFormPage extends ConsumerStatefulWidget {
  const PartnerLeadFormPage({
    super.key,
    required this.partnerId,
    required this.source,
  });

  final String partnerId;
  final BenefitSource source;

  @override
  ConsumerState<PartnerLeadFormPage> createState() =>
      _PartnerLeadFormPageState();
}

class _LeadSent {
  const _LeadSent({
    required this.message,
    required this.whatsapp,
    required this.neighborhood,
  });

  final String message;
  final String whatsapp;
  final String neighborhood;
}

class _PartnerLeadFormPageState extends ConsumerState<PartnerLeadFormPage> {
  final _name = TextEditingController();
  final _whatsapp = TextEditingController();
  final _neighborhood = TextEditingController();
  final _cep = TextEditingController();
  bool _prefilled = false;
  bool _nameFromProfile = false;
  bool _whatsappFromProfile = false;
  bool _consent = false;
  bool _submitting = false;
  String? _error;
  _LeadSent? _sent;

  @override
  void initState() {
    super.initState();
    ref.listenManual<AsyncValue<AthleteProfile?>>(
      athleteProfileProvider,
      (_, next) => _prefill(next.valueOrNull),
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _whatsapp.dispose();
    _neighborhood.dispose();
    _cep.dispose();
    super.dispose();
  }

  /// Uma vez só, e sem passar por cima do que o atleta já digitou.
  void _prefill(AthleteProfile? profile) {
    if (_prefilled || profile == null) return;
    _prefilled = true;
    final name = profile.name.trim();
    final phone = formatPhoneBrDisplay(profile.phoneNumber) ?? '';
    if (_name.text.isEmpty && name.isNotEmpty) {
      _name.text = name;
      _nameFromProfile = true;
    }
    if (_whatsapp.text.isEmpty && phone.isNotEmpty) {
      _whatsapp.text = phone;
      _whatsappFromProfile = true;
    }
    if (mounted) setState(() {});
  }

  void _back() => benefitsBack(context, benefitsClubLocation(widget.source));

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(benefitsPartnerProvider(widget.partnerId));
    final partner = async.valueOrNull;
    if (partner == null || partner.ctaType != PartnerCtaType.leadForm) {
      return _unavailable(async);
    }
    final sent = _sent;
    if (sent != null) {
      return PartnerLeadSuccessView(
        partnerName: partner.name,
        whatsapp: sent.whatsapp,
        neighborhood: sent.neighborhood,
        message: sent.message,
        onBackToClub: () => finishLeadAndBackToClub(context, widget.source),
      );
    }
    return _form(partner);
  }

  Widget _form(Partner partner) {
    final colors = context.themeColors;
    final error = _error;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            BenefitsTitleHeader(
              title: partner.ctaLabel.isEmpty
                  ? 'Quero contratar'
                  : partner.ctaLabel,
              subtitle: partner.name,
              onBack: _back,
            ),
            Expanded(
              child: AutofillGroup(
                child: ListView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenH,
                    AppSpacing.xs,
                    AppSpacing.screenH,
                    AppSpacing.xxl,
                  ),
                  children: [
                    _PartnerSummary(partner: partner),
                    const SizedBox(height: AppSpacing.md + 2),
                    PartnerLeadField(
                      key: const Key('benefits-lead-name'),
                      label: 'Nome',
                      controller: _name,
                      fromProfile: _nameFromProfile,
                      textCapitalization: TextCapitalization.words,
                      autofillHints: const [AutofillHints.name],
                    ),
                    const SizedBox(height: AppSpacing.md + 2),
                    PartnerLeadField(
                      key: const Key('benefits-lead-whatsapp'),
                      label: 'WhatsApp',
                      controller: _whatsapp,
                      fromProfile: _whatsappFromProfile,
                      hint: '(00) 00000-0000',
                      keyboardType: TextInputType.phone,
                      inputFormatters: [BrPhoneInputFormatter()],
                      autofillHints: const [AutofillHints.telephoneNumber],
                    ),
                    const SizedBox(height: AppSpacing.md + 2),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          flex: 13,
                          child: PartnerLeadField(
                            key: const Key('benefits-lead-neighborhood'),
                            label: 'Bairro',
                            controller: _neighborhood,
                            textCapitalization: TextCapitalization.words,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          flex: 10,
                          child: PartnerLeadField(
                            key: const Key('benefits-lead-cep'),
                            label: 'CEP',
                            controller: _cep,
                            hint: '00000-000',
                            mono: true,
                            keyboardType: TextInputType.number,
                            inputFormatters: [CepInputFormatter()],
                            autofillHints: const [AutofillHints.postalCode],
                            textInputAction: TextInputAction.done,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    PartnerLeadConsent(
                      partner: partner,
                      value: _consent,
                      onChanged: (value) => setState(() {
                        _consent = value;
                        _error = null;
                      }),
                    ),
                    if (error != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          error,
                          key: const Key('benefits-lead-error'),
                          style: AppTypography.bodyS.copyWith(
                            fontWeight: FontWeight.w600,
                            color: colors.live,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            BenefitCtaBar(
              buttonKey: const Key('benefits-lead-submit'),
              label: 'Enviar',
              hint: _consent ? null : 'Marque a autorização para enviar',
              busy: _submitting,
              onPressed: _consent ? () => _submit(partner) : null,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit(Partner partner) async {
    FocusScope.of(context).unfocus();
    final draft = PartnerLeadDraft(
      partnerId: partner.id,
      name: _name.text,
      whatsapp: _whatsapp.text,
      neighborhood: _neighborhood.text,
      cep: _cep.text,
      consent: _consent,
    );
    final invalid = partnerLeadError(draft);
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final message = await ref
          .read(benefitsClubServiceProvider)
          .submitLead(
            PartnerLeadSubmission.fromDraft(draft, source: widget.source),
          );
      if (!mounted) return;
      setState(() {
        _sent = _LeadSent(
          message: leadSuccessMessageOrDefault(message, partner),
          whatsapp: formatPhoneBrDisplay(draft.whatsapp) ?? draft.whatsapp,
          neighborhood: collapseLeadText(draft.neighborhood),
        );
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyErrorMessage(
          error,
          action: 'Não foi possível enviar seus dados',
          logReason: 'clube:lead',
        );
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _unavailable(AsyncValue<Partner?> async) {
    final error = async.error;
    final Widget body;
    if (async.isLoading && error == null) {
      body = const AppLoadingView();
    } else if (error != null) {
      body = AppErrorView(
        title: 'Não deu para abrir o formulário',
        message: friendlyErrorMessage(
          error,
          action: 'Não foi possível carregar o parceiro',
          logReason: 'clube:lead_parceiro',
        ),
        onRetry: () => ref.invalidate(benefitsActivePartnersProvider),
      );
    } else {
      body = AppEmptyView(
        icon: Icons.card_giftcard_rounded,
        title: 'Cadastro indisponível',
        subtitle: 'Este parceiro não recebe cadastro pelo app.',
        actionLabel: 'Ver o clube',
        onAction: _back,
      );
    }
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            BenefitsTitleHeader(
              title: 'Quero contratar',
              subtitle: 'Clube de Vantagens',
              onBack: _back,
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

/// Quem vai receber os dados: logo, benefício e como o parceiro fala com a
/// pessoa.
class _PartnerSummary extends StatelessWidget {
  const _PartnerSummary({required this.partner});

  final Partner partner;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: AppBorders.subtle(colors),
      ),
      child: Row(
        children: [
          PartnerLogo(
            partner: partner,
            size: benefitsTapTarget,
            borderRadius: AppRadii.mdAll,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  partner.benefitTitle,
                  style: AppTypography.titleS.copyWith(color: colors.onSurface),
                ),
                const SizedBox(height: 2),
                Text(
                  'A ${partner.name} fala com você pelo WhatsApp',
                  style: AppTypography.bodyS.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
