import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_status_views.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../application/benefits_club_providers.dart';
import '../domain/benefit_event.dart';
import '../domain/benefits_club_logic.dart';
import '../domain/benefits_club_premium_logic.dart';
import '../domain/partner.dart';
import 'benefits_club_navigation.dart';
import 'widgets/benefits_club_parts.dart';
import 'widgets/benefits_discovery.dart';
import 'widgets/benefits_partner_cards.dart';
import 'widgets/benefits_skeleton.dart';
import 'widgets/partner_visuals.dart';

/// Busca do Clube de Vantagens (artboard `Clube2-app-09-busca-mapa`): campo de
/// busca, Lista|Mapa, "Perto de você" (só com a localização já liberada) e o
/// mapa dos parceiros — o mesmo `ArenaMapView` (Mapbox) da busca de arenas.
/// Abre no mapa quando há mapa (token e parceiro com unidade); senão, na lista.
/// Parceiro aberto pelo mapa grava origem `map`; pela lista, `search`.
class BenefitsSearchPage extends ConsumerStatefulWidget {
  const BenefitsSearchPage({super.key});

  @override
  ConsumerState<BenefitsSearchPage> createState() => _BenefitsSearchPageState();
}

class _BenefitsSearchPageState extends ConsumerState<BenefitsSearchPage> {
  final _search = TextEditingController();
  String _query = '';

  /// `null` = ainda não escolhido: abre no mapa se houver mapa.
  BenefitsView? _view;
  bool _near = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

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
              subtitle: 'Buscar parceiros',
              onBack: () => benefitsBack(
                context,
                benefitsClubLocation(BenefitSource.search),
              ),
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
      if (error == null) return const BenefitsClubSkeleton();
      return AppErrorView(
        title: 'Não deu para abrir a busca',
        message: friendlyErrorMessage(
          error,
          action: 'Não foi possível carregar os parceiros',
          logReason: 'clube:busca',
        ),
        onRetry: () => ref.invalidate(benefitsActivePartnersProvider),
      );
    }
    return _content(visible);
  }

  Widget _content(List<Partner> visible) {
    final now = ref.watch(benefitsClockProvider)();
    final eligible = ref.watch(benefitsEligibleIdsProvider);
    final coords = _coordinates();
    final query = _query.trim();
    final nearOn = _near && coords != null;

    var shown = searchPartners(visible, query);
    if (nearOn) {
      shown = sortByDistance(shown, coords.latitude, coords.longitude);
    }

    final mapAvailable = benefitsMapAvailable(visible);
    final view = _view ?? (mapAvailable ? BenefitsView.map : BenefitsView.list);
    final mapOn = view == BenefitsView.map && mapAvailable;

    String? distanceOf(Partner p) {
      if (coords == null) return null;
      final km = nearestDistanceKm(p, coords.latitude, coords.longitude);
      return km == null ? null : formatDistanceKm(km);
    }

    final count = shown.length == 1
        ? '1 parceiro'
        : '${shown.length} parceiros';
    final label = nearOn
        ? '$count perto de você'
        : partnersCountLabel(
            shown.length,
            city: ref.watch(athleteProfileProvider).valueOrNull?.city,
          );

    final header = Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.xs,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BenefitsSearchField(
            controller: _search,
            onChanged: (value) => setState(() => _query = value),
          ),
          const SizedBox(height: AppSpacing.sm),
          BenefitsViewControls(
            view: view,
            onView: (value) => setState(() => _view = value),
            showMapToggle: mapAvailable,
            nearAvailable: coords != null,
            near: nearOn,
            onNear: (near) => setState(() => _near = near),
          ),
          const SizedBox(height: AppSpacing.sm),
          BenefitsEyebrow(label),
        ],
      ),
    );

    final Widget results;
    if (shown.isEmpty) {
      results = _NoResults(query: query);
    } else if (mapOn) {
      results = Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          MediaQuery.paddingOf(context).bottom + AppSpacing.md,
        ),
        child: BenefitsPartnerMap(
          key: const Key('benefits-search-map'),
          partners: shown,
          center: coords,
          showUserLocation: coords != null,
          distanceOf: distanceOf,
          onOpenPartner: (p) =>
              openBenefitsPartner(context, p.id, BenefitSource.map),
        ),
      );
    } else {
      results = ListView(
        key: const Key('benefits-search-list'),
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          MediaQuery.paddingOf(context).bottom + AppSpacing.xxxl,
        ),
        children: [
          for (final partner in shown) ...[
            BenefitsPartnerCard(
              key: Key('benefits-partner-${partner.id}'),
              partner: partner,
              badges: PartnerCardBadges(
                isNew: isNewPartner(partner, now),
                ending: endingBadge(partner, now),
                locked: isPartnerLocked(partner, eligible),
                distance: distanceOf(partner),
              ),
              onTap: () => openBenefitsPartner(
                context,
                partner.id,
                BenefitSource.search,
              ),
            ),
            const SizedBox(height: 10),
          ],
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        header,
        Expanded(child: results),
      ],
    );
  }

  /// Coordenadas do GPS só com a permissão JÁ concedida (o provider nunca
  /// pede; ver `userLocationProvider`).
  ({double latitude, double longitude})? _coordinates() {
    final location = ref.watch(userLocationProvider).valueOrNull;
    final lat = location?.latitude;
    final lng = location?.longitude;
    if (lat == null || lng == null || !lat.isFinite || !lng.isFinite) {
      return null;
    }
    return (latitude: lat, longitude: lng);
  }
}

class _NoResults extends StatelessWidget {
  const _NoResults({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenH,
        vertical: AppSpacing.xl,
      ),
      child: Text(
        query.isEmpty
            ? 'Nenhum parceiro por aqui ainda.'
            : 'Nenhum parceiro encontrado para "$query".',
        textAlign: TextAlign.center,
        style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}
