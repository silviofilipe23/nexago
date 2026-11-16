import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/links/open_external_url.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/system_ui_overlay_style.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../application/benefits_club_providers.dart';
import '../domain/benefit_event.dart';
import '../domain/benefits_club_logic.dart';
import '../domain/partner.dart';
import 'benefits_club_navigation.dart';
import 'widgets/benefit_partner_parts.dart';
import 'widgets/benefits_club_parts.dart';
import 'widgets/partner_visuals.dart';

/// Tela de um parceiro: hero na cor da marca, benefício, cupom copiável,
/// "Como usar", termos e o botão fixo no pé. Grava `partner_view`,
/// `code_copy` e `cta_click` com a origem com que a pessoa entrou no clube.
class BenefitPartnerPage extends ConsumerStatefulWidget {
  const BenefitPartnerPage({
    super.key,
    required this.partnerId,
    required this.source,
  });

  final String partnerId;
  final BenefitSource source;

  @override
  ConsumerState<BenefitPartnerPage> createState() => _BenefitPartnerPageState();
}

class _BenefitPartnerPageState extends ConsumerState<BenefitPartnerPage> {
  bool _viewTracked = false;

  @override
  void initState() {
    super.initState();
    // `partner_view` uma vez, quando o parceiro carrega (e só se ele existe
    // para este atleta: o backend recusaria o evento de qualquer forma).
    ref.listenManual<AsyncValue<Partner?>>(
      benefitsPartnerProvider(widget.partnerId),
      (_, next) {
        if (_viewTracked || next.valueOrNull == null) return;
        _viewTracked = true;
        _track(BenefitEventType.partnerView);
      },
      fireImmediately: true,
    );
  }

  void _track(BenefitEventType type) => ref
      .read(benefitsClubTrackerProvider)
      .track(type, source: widget.source, partnerId: widget.partnerId);

  void _back() => benefitsBack(context, benefitsClubLocation(widget.source));

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(benefitsPartnerProvider(widget.partnerId));
    final partner = async.valueOrNull;
    if (partner != null) return _partnerView(partner);

    final error = async.error;
    final Widget body;
    if (async.isLoading && error == null) {
      body = const AppLoadingView();
    } else if (error != null) {
      body = AppErrorView(
        title: 'Não deu para abrir o benefício',
        message: friendlyErrorMessage(
          error,
          action: 'Não foi possível carregar o parceiro',
          logReason: 'clube:parceiro',
        ),
        onRetry: () => ref.invalidate(benefitsActivePartnersProvider),
      );
    } else {
      body = AppEmptyView(
        icon: Icons.card_giftcard_rounded,
        title: 'Benefício indisponível',
        subtitle:
            'Este parceiro não está mais no clube ou não atende a sua '
            'cidade.',
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
              title: 'Clube de Vantagens',
              subtitle: 'Descontos dos parceiros NexaGO',
              onBack: _back,
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }

  Widget _partnerView(Partner partner) {
    final uid = ref.watch(benefitsClubUidProvider);
    final city = ref.watch(athleteProfileProvider).valueOrNull?.city;
    final coupon = couponFor(partner, uid);
    final isLead = partner.ctaType == PartnerCtaType.leadForm;
    // O hero na cor da marca fica atrás da barra de status: os ícones seguem
    // a marca, não o tema (marca escura no tema claro sumiria com ícone escuro).
    final heroIsDark =
        onPartnerBrand(partnerBrandColor(partner)) == AppColors.white;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: systemUiOverlayForBrightness(
        heroIsDark ? Brightness.dark : Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: Column(
          children: [
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  BenefitPartnerHero(
                    partner: partner,
                    locationLabel: partnerLocationLabel(
                      partner,
                      athleteCity: city,
                    ),
                    onBack: _back,
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screenH,
                      AppSpacing.lg,
                      AppSpacing.screenH,
                      AppSpacing.xl,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        BenefitDetailsCard(partner: partner),
                        if (coupon != null) ...[
                          const SizedBox(height: AppSpacing.md + 2),
                          BenefitCouponBox(
                            coupon: coupon,
                            onCopy: () => _copyCoupon(coupon),
                          ),
                        ],
                        const SizedBox(height: AppSpacing.lg + 2),
                        BenefitsEyebrow(isLead ? 'Como funciona' : 'Como usar'),
                        const SizedBox(height: 10),
                        BenefitSteps(
                          steps: howToUseSteps(partner, coupon: coupon),
                          bold: [
                            partner.ctaLabel,
                            if (coupon != null) coupon,
                            'WhatsApp',
                          ],
                        ),
                        if (partner.terms.isNotEmpty) ...[
                          const SizedBox(height: AppSpacing.md),
                          BenefitTermsSection(terms: partner.terms),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            isLead ? _leadBar(partner) : _linkBar(partner, uid),
          ],
        ),
      ),
    );
  }

  Widget _linkBar(Partner partner, String uid) {
    final url = trackedPartnerUrl(partner.link, athleteCode(uid));
    return BenefitCtaBar(
      buttonKey: const Key('benefits-partner-cta'),
      label: partner.ctaLabel,
      icon: Icons.open_in_new_rounded,
      hint: url == null
          ? 'O site deste parceiro está indisponível agora.'
          : 'Abre o site da ${partner.name}',
      onPressed: url == null ? null : () => _openLink(partner, url),
    );
  }

  Widget _leadBar(Partner partner) => BenefitCtaBar(
    buttonKey: const Key('benefits-partner-cta'),
    label: partner.ctaLabel,
    hint: 'Seus dados só vão para a ${partner.name} com a sua autorização',
    onPressed: _openLeadForm,
  );

  Future<void> _copyCoupon(String coupon) async {
    await Clipboard.setData(ClipboardData(text: coupon));
    _track(BenefitEventType.codeCopy);
    if (!mounted) return;
    showAppSnackBar(context, 'Cupom copiado');
  }

  Future<void> _openLink(Partner partner, String url) async {
    _track(BenefitEventType.ctaClick);
    final opened = await openExternalUrl(url);
    if (opened || !mounted) return;
    showAppSnackBar(
      context,
      'Não foi possível abrir o site da ${partner.name}.',
      isError: true,
    );
  }

  Future<void> _openLeadForm() async {
    _track(BenefitEventType.ctaClick);
    final sent = await openBenefitsLeadForm(
      context,
      widget.partnerId,
      widget.source,
    );
    // Enviou e tocou em "Voltar ao clube": esta tela sai junto.
    if (sent == true && mounted) _back();
  }
}
