import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_status_views.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../application/benefits_club_providers.dart';
import '../domain/benefit_event.dart';
import '../domain/benefits_club_logic.dart';
import '../domain/partner.dart';
import 'benefits_club_navigation.dart';
import 'widgets/benefits_club_parts.dart';
import 'widgets/partner_visuals.dart';

/// Tela do Clube de Vantagens: banner do patrocinador oficial, chips das
/// categorias presentes, lista dos parceiros e o aviso do pé. Grava
/// `club_view` com a origem da visita, que segue para as telas de parceiro.
class BenefitsClubPage extends ConsumerStatefulWidget {
  const BenefitsClubPage({super.key, required this.source});

  final BenefitSource source;

  @override
  ConsumerState<BenefitsClubPage> createState() => _BenefitsClubPageState();
}

class _BenefitsClubPageState extends ConsumerState<BenefitsClubPage> {
  PartnerCategory? _category;

  @override
  void initState() {
    super.initState();
    ref
        .read(benefitsClubTrackerProvider)
        .track(BenefitEventType.clubView, source: widget.source);
  }

  void _openPartner(Partner partner) =>
      openBenefitsPartner(context, partner.id, widget.source);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            BenefitsTitleHeader(
              title: 'Clube de Vantagens',
              subtitle: 'Descontos dos parceiros NexaGO',
              onBack: () => benefitsBack(context, AppRoutes.home),
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    final partners = ref.watch(benefitsVisiblePartnersProvider);
    final visible = partners.valueOrNull;
    if (visible == null) {
      final error = partners.error;
      if (error == null) return const AppLoadingView();
      return AppErrorView(
        title: 'Não deu para abrir o clube',
        message: friendlyErrorMessage(
          error,
          action: 'Não foi possível carregar os parceiros',
          logReason: 'clube:parceiros',
        ),
        onRetry: () => ref.invalidate(benefitsActivePartnersProvider),
      );
    }
    if (visible.isEmpty) {
      return const AppEmptyView(
        icon: Icons.card_giftcard_rounded,
        title: 'Nenhum parceiro por aqui ainda',
        subtitle: 'Novos descontos chegam em breve. Volte para conferir.',
      );
    }
    return _content(visible);
  }

  Widget _content(List<Partner> visible) {
    final sponsor = masterSponsor(visible);
    final categories = categoriesOf(visible);
    // Categoria que sumiu da lista (parceiro desligado) volta para Todos.
    final selected = categories.contains(_category) ? _category : null;
    final shown = partnersInCategory(visible, selected);
    final city = ref.watch(athleteProfileProvider).valueOrNull?.city;

    return ListView(
      padding: EdgeInsets.only(
        top: AppSpacing.xs,
        bottom: MediaQuery.paddingOf(context).bottom + AppSpacing.xxxl,
      ),
      children: [
        if (sponsor != null) ...[
          _padded(
            BenefitsSponsorBanner(
              key: const Key('benefits-sponsor-banner'),
              partner: sponsor,
              onTap: () => _openPartner(sponsor),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        BenefitsCategoryChips(
          categories: categories,
          selected: selected,
          onSelected: (category) => setState(() => _category = category),
        ),
        const SizedBox(height: AppSpacing.md),
        _padded(BenefitsEyebrow(partnersCountLabel(shown.length, city: city))),
        const SizedBox(height: AppSpacing.md),
        for (final partner in shown) ...[
          _padded(
            BenefitsPartnerCard(
              key: Key('benefits-partner-${partner.id}'),
              partner: partner,
              onTap: () => _openPartner(partner),
            ),
          ),
          const SizedBox(height: 10),
        ],
        const SizedBox(height: AppSpacing.xs),
        _padded(const BenefitsClubNote()),
      ],
    );
  }

  Widget _padded(Widget child) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
    child: child,
  );
}
