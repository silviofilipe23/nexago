import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/partner_search_service.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../../../domain/partner_search_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_logic.dart';
import 'tournament_registration_partner_candidate_tile.dart';
import 'tournament_registration_partner_phone_card.dart';
import 'tournament_registration_solo_card.dart';

class TournamentRegistrationPartnerStep extends ConsumerStatefulWidget {
  const TournamentRegistrationPartnerStep({
    super.key,
    required this.category,
    required this.selectedUserId,
    required this.onSelected,
    required this.onInviteByLink,
    this.onRegisterSolo,
    this.compact = false,
    this.invitingUserId,
    this.excludeUserIds = const <String>{},
    this.currentGenders = const <String?>[],
  });

  final TournamentCategoryOffer category;
  final String? selectedUserId;
  final ValueChanged<TournamentRegistrationPartnerCandidate> onSelected;
  final VoidCallback onInviteByLink;
  final VoidCallback? onRegisterSolo;

  /// Dentro do cartão "Sua inscrição" da tela única: o título do cartão já diz
  /// o que é, então o cabeçalho gigante do passo sai.
  final bool compact;

  /// Convite em voo — trava só a linha do atleta convidado.
  final String? invitingUserId;

  /// Atletas que já estão no elenco ou com convite pendente. Some da lista em
  /// vez de dar erro no envio, como o portal já fazia.
  final Set<String> excludeUserIds;

  /// Gênero de quem já ocupa vaga na inscrição (elenco + convites pendentes).
  /// Em dupla MISTA é o que define o gênero exigido do parceiro — o oposto.
  final List<String?> currentGenders;

  @override
  ConsumerState<TournamentRegistrationPartnerStep> createState() =>
      _TournamentRegistrationPartnerStepState();
}

class _TournamentRegistrationPartnerStepState
    extends ConsumerState<TournamentRegistrationPartnerStep> {
  final _searchController = TextEditingController();
  final _focusNode = FocusNode();

  List<AppUserProfile> _displayPartners = const [];
  bool _loadingPartners = false;
  bool _focused = false;
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() => setState(() => _focused = _focusNode.hasFocus));
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), _runPartnerSearch);
    setState(() {});
  }

  Future<void> _runPartnerSearch() async {
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    if (uid.isEmpty || !mounted) return;

    final query = _searchController.text.trim();
    // Abaixo do mínimo a tela volta ao estado vazio SEM ir ao servidor.
    if (!isPartnerQueryLongEnough(query)) {
      setState(() {
        _displayPartners = const [];
        _loadingPartners = false;
      });
      return;
    }

    setState(() => _loadingPartners = true);

    try {
      final service = ref.read(partnerSearchServiceProvider);
      final results = await service.searchPartners(
        currentUserId: uid,
        categoryGenderType: categoryGenderForPartnerFilter(widget.category),
        query: query,
      );
      if (!mounted) return;
      setState(() {
        _displayPartners = results;
        _loadingPartners = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingPartners = false);
    }
  }

  void _selectProfile(AppUserProfile profile, {String? tagLabel}) {
    widget.onSelected(
      partnerCandidateFromProfile(profile, tagLabel: tagLabel),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = _searchController.text.trim();
    final isFiltering = isPartnerQueryLongEnough(query);
    final requiredGender = requiredPartnerGenderTag(
      offer: widget.category,
      currentGenders: widget.currentGenders,
    );
    final displayProfiles = filterPartnersByRequiredGender(
      _displayPartners
          .where((p) => !widget.excludeUserIds.contains(p.uid))
          .toList(),
      requiredGender,
    );
    final resultsHeader = isFiltering
        ? partnerResultsHeader(
            count: displayProfiles.length,
            category: widget.category,
          )
        : '';

    final borderColor = _focused || query.isNotEmpty
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!widget.compact) ...[
          Text(
            'Quem joga\ncom você?',
            style: AppTypography.soraRegular(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
              height: 1.05,
              letterSpacing: -0.4,
            ),
          ),
          SizedBox(height: 18),
        ],
        TextField(
          controller: _searchController,
          focusNode: _focusNode,
          cursorColor: AppColors.brand,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: context.themeColors.onSurface,
            fontWeight: FontWeight.w500,
          ),
          decoration: InputDecoration(
            hintText: 'Buscar atleta por nome ou @',
            hintStyle: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.6),
            ),
            prefixIcon: Icon(
              Icons.search_rounded,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.62),
            ),
            filled: true,
            fillColor: context.themeColors.surfaceRaised,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: borderColor),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: AppColors.brand),
            ),
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
        if (resultsHeader.isNotEmpty) ...[
          SizedBox(height: 22),
          Text(
            resultsHeader,
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w600,
              fontSize: 10,
              letterSpacing: 1.4,
            ),
          ),
        ],
        SizedBox(height: 12),
        if (_loadingPartners)
          Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(
                color: AppColors.brand,
                strokeWidth: 2,
              ),
            ),
          )
        else if (displayProfiles.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              isFiltering
                  ? 'Nenhum atleta encontrado.'
                  : 'Digite ao menos 3 letras do nome ou do @ para buscar.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          )
        else
          ...displayProfiles.map(
            (profile) {
              final candidate = partnerCandidateFromProfile(
                profile,
                tagLabel: partnerGenderPendencyLabel(profile, requiredGender),
              );
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: TournamentRegistrationPartnerCandidateTile(
                  candidate: candidate,
                  sending: widget.invitingUserId == profile.uid,
                  selected: widget.selectedUserId == profile.uid,
                  onTap: () => _selectProfile(
                    profile,
                    tagLabel: candidate.tagLabel,
                  ),
                ),
              );
            },
          ),
        SizedBox(height: 8),
        TournamentRegistrationPartnerPhoneCard(onTap: widget.onInviteByLink),
        if (widget.onRegisterSolo != null) ...[
          const SizedBox(height: 16),
          TournamentRegistrationSoloCard(onTap: widget.onRegisterSolo!),
        ],
      ],
    );
  }
}
