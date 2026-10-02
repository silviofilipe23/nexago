import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
import '../domain/organizer_public_profile_logic.dart';
import '../domain/organizer_public_profile_models.dart';
import '../domain/organizer_public_profile_providers.dart';
import 'widgets/organizer_profile_hero.dart';

const _horizontalPadding = 20.0;

/// Lista "Organizadores" do hub Competir (`/competir/organizadores`): só perfis com
/// `listed == true`; busca por nome e cidade feita no cliente, sem acento.
class OrganizersDirectoryPage extends ConsumerStatefulWidget {
  const OrganizersDirectoryPage({super.key});

  @override
  ConsumerState<OrganizersDirectoryPage> createState() =>
      _OrganizersDirectoryPageState();
}

class _OrganizersDirectoryPageState
    extends ConsumerState<OrganizersDirectoryPage> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _back() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.go(AppRoutes.discover);
  }

  void _open(OrganizerPublicProfile organizer) {
    context.pushNamed(
      AppRouteNames.organizerPublicProfile,
      pathParameters: {'organizerId': organizer.uid},
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final organizersAsync = ref.watch(organizersDirectoryProvider);
    final query = _searchController.text;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        top: false,
        bottom: false,
        child: NexaPageHeader(
          padding: const EdgeInsets.fromLTRB(
            _horizontalPadding,
            0,
            _horizontalPadding,
            12,
          ),
          topGap: 4,
          header: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Material(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      onTap: _back,
                      borderRadius: BorderRadius.circular(12),
                      child: SizedBox(
                        width: 40,
                        height: 40,
                        child: Icon(
                          Icons.chevron_left_rounded,
                          color: colors.onSurface,
                          semanticLabel: 'Voltar',
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Organizadores',
                      style: AppTypography.soraRegular(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _searchController,
                onChanged: (_) => setState(() {}),
                textInputAction: TextInputAction.search,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  color: colors.onSurface,
                ),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: 'Buscar por nome ou cidade',
                  hintStyle: AppTypography.soraRegular(
                    fontSize: 13,
                    color: colors.onSurfaceMuted,
                  ),
                  prefixIcon: Icon(
                    Icons.search_rounded,
                    size: 20,
                    color: colors.onSurfaceMuted,
                  ),
                  prefixIconConstraints: const BoxConstraints(
                    minWidth: 40,
                    minHeight: 36,
                  ),
                  suffixIcon: query.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Limpar busca',
                          icon: Icon(
                            Icons.close_rounded,
                            size: 18,
                            color: colors.onSurfaceMuted,
                          ),
                          onPressed: () => setState(_searchController.clear),
                        ),
                  suffixIconConstraints: const BoxConstraints(
                    minWidth: 36,
                    minHeight: 36,
                  ),
                  filled: true,
                  fillColor: colors.surfaceRaised,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                ),
              ),
            ],
          ),
          child: organizersAsync.when(
            skipLoadingOnReload: true,
            loading: () => ListView(
              padding: const EdgeInsets.fromLTRB(
                _horizontalPadding,
                4,
                _horizontalPadding,
                24,
              ),
              children: [
                for (var i = 0; i < 4; i++) ...const [
                  NexaSkeleton(height: 92, radius: AppRadii.lgAll),
                  SizedBox(height: 12),
                ],
              ],
            ),
            error: (error, stackTrace) => AppErrorView(
              title: 'Não foi possível carregar',
              message: 'Confira sua conexão e tente de novo.',
              retryLabel: 'Tentar de novo',
              onRetry: () => ref.invalidate(organizersDirectoryProvider),
            ),
            data: (organizers) {
              if (organizers.isEmpty) {
                return const AppEmptyView(
                  icon: Icons.storefront_outlined,
                  title: 'Nenhum organizador por aqui ainda',
                  subtitle:
                      'Quando os organizadores publicarem eventos, eles aparecem nesta lista.',
                );
              }
              final filtered = filterOrganizersDirectory(organizers, query);
              if (filtered.isEmpty) {
                return AppEmptyView(
                  icon: Icons.search_off_rounded,
                  title: 'Nenhum organizador encontrado',
                  subtitle: 'Nada com "${query.trim()}". Tente outro nome ou '
                      'cidade.',
                );
              }
              return ListView.separated(
                padding: EdgeInsets.fromLTRB(
                  _horizontalPadding,
                  4,
                  _horizontalPadding,
                  MediaQuery.paddingOf(context).bottom + 24,
                ),
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                itemCount: filtered.length,
                separatorBuilder: (context, index) =>
                    const SizedBox(height: 12),
                itemBuilder: (context, index) => OrganizerDirectoryCard(
                  organizer: filtered[index],
                  onTap: () => _open(filtered[index]),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Card da lista: logo, nome, selo, cidade/UF, nota (com reputação pública), eventos
/// realizados, seguidores e "N com inscrição aberta".
class OrganizerDirectoryCard extends ConsumerWidget {
  const OrganizerDirectoryCard({
    super.key,
    required this.organizer,
    required this.onTap,
  });

  final OrganizerPublicProfile organizer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final reputation =
        ref.watch(organizerReputationProvider(organizer.uid)).valueOrNull;
    final location = organizerLocationLine(organizer.city, organizer.state);
    final open = organizerOpenEventsLabel(organizer.stats.openEvents);
    final logo = organizerNetworkImage(organizer.logoUrl);

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: colors.onSurfaceMuted.withValues(alpha: 0.14),
            ),
          ),
          child: Row(
            children: [
              _DirectoryLogo(
                image: logo,
                initials: organizerInitials(organizer.name),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            organizer.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                        if (organizer.verified) ...[
                          const SizedBox(width: 4),
                          const Icon(
                            Icons.verified_rounded,
                            size: 16,
                            color: AppColors.brand,
                            semanticLabel: 'Organizador verificado',
                          ),
                        ],
                      ],
                    ),
                    if (location != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        location,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      organizerDirectoryMetaLine(organizer, reputation),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    if (open != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.win.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          open,
                          style: AppTypography.soraRegular(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: AppColors.win,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _DirectoryLogo extends StatelessWidget {
  const _DirectoryLogo({required this.image, required this.initials});

  final ImageProvider? image;
  final String initials;

  @override
  Widget build(BuildContext context) {
    final fallback = ColoredBox(
      color: AppColors.brand,
      child: Center(
        child: Text(
          initials,
          style: AppTypography.soraRegular(
            fontSize: 16,
            fontWeight: FontWeight.w900,
            color: AppColors.black,
          ),
        ),
      ),
    );
    final provider = image;
    return SizedBox(
      width: 52,
      height: 52,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: provider == null
            ? fallback
            : Image(
                image: provider,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => fallback,
              ),
      ),
    );
  }
}
