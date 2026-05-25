import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/slot_vacancy_alert.dart';
import '../../../domain/slot_vacancy_alerts_provider.dart';
import '../../../domain/slots_suggestion_models.dart';
import '../../../domain/slots_suggestions_providers.dart';
import 'slots_fully_booked_banner.dart';
import 'slots_notify_when_available_card.dart';
import 'slots_suggestions_section.dart';

class SlotsFullyBookedBody extends ConsumerWidget {
  const SlotsFullyBookedBody({
    super.key,
    required this.bannerTitle,
    required this.bannerSubtitle,
    required this.suggestionsParams,
    required this.courtName,
    required this.weekdayLabel,
    required this.onSuggestionAction,
    required this.onSeeAllSuggestions,
    required this.onNotifyToggle,
    this.notifyLoading = false,
  });

  final String bannerTitle;
  final String bannerSubtitle;
  final SlotsSuggestionsParams suggestionsParams;
  final String courtName;
  final String weekdayLabel;
  final void Function(SlotsSuggestion suggestion) onSuggestionAction;
  final VoidCallback onSeeAllSuggestions;
  final VoidCallback onNotifyToggle;
  final bool notifyLoading;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final suggestionsAsync =
        ref.watch(slotsSmartSuggestionsProvider(suggestionsParams));

    final alertKey = SlotVacancyAlertKey(
      arenaId: suggestionsParams.arena.id,
      courtId: suggestionsParams.courtId,
      date: suggestionsParams.selectedDay,
    );
    final alertActive =
        ref.watch(slotVacancyAlertActiveProvider(alertKey)).valueOrNull ?? false;

    return suggestionsAsync.when(
      loading: () => ListView(
        physics: const BouncingScrollPhysics(),
        children: [
          SlotsFullyBookedBanner(
            title: bannerTitle,
            subtitle: bannerSubtitle,
          ),
          SlotsSuggestionsSection(
            suggestions: const [],
            onSuggestionAction: onSuggestionAction,
            onSeeAll: onSeeAllSuggestions,
            loading: true,
          ),
          SlotsNotifyWhenAvailableCard(
            courtName: courtName,
            weekdayLabel: weekdayLabel,
            isActive: alertActive,
            isLoading: notifyLoading,
            onToggle: onNotifyToggle,
          ),
        ],
      ),
      error: (_, _) => _content(
        context,
        suggestions: const [],
        alertActive: alertActive,
      ),
      data: (suggestions) => _content(
        context,
        suggestions: suggestions,
        alertActive: alertActive,
      ),
    );
  }

  Widget _content(
    BuildContext context, {
    required List<SlotsSuggestion> suggestions,
    required bool alertActive,
  }) {
    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 8),
      children: [
        SlotsFullyBookedBanner(
          title: bannerTitle,
          subtitle: bannerSubtitle,
        ),
        SlotsSuggestionsSection(
          suggestions: suggestions,
          onSuggestionAction: onSuggestionAction,
          onSeeAll: onSeeAllSuggestions,
        ),
        SlotsNotifyWhenAvailableCard(
          courtName: courtName,
          weekdayLabel: weekdayLabel,
          isActive: alertActive,
          isLoading: notifyLoading,
          onToggle: onNotifyToggle,
        ),
      ],
    );
  }
}
