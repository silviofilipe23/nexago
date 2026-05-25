import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/ui/fade_slide_in.dart';
import '../../../domain/arena_slot.dart';
import '../../../domain/slots_page_logic.dart';
import 'slots_slot_tile.dart';

/// Lista de slots com cabeçalhos de período quando [periodFilter] é [SlotPeriodFilter.all].
class SlotsListSection extends StatelessWidget {
  const SlotsListSection({
    super.key,
    required this.slots,
    required this.periodFilter,
    required this.selectedDay,
    required this.scrollController,
    required this.isIndexSelected,
    required this.isSelectionAnchor,
    required this.onSlotTap,
    required this.priceLabelFor,
    this.mostPopularIndex,
    this.lastAvailableIndex,
    this.nextAvailableIndex,
    this.nextSlotKey,
    this.selectedSlotKey,
    this.slotsLoading = false,
    this.periodEmptyOnly = false,
  });

  final List<ArenaSlot> slots;
  final SlotPeriodFilter periodFilter;
  final DateTime selectedDay;
  final ScrollController scrollController;
  final bool Function(int index) isIndexSelected;
  final bool Function(int index) isSelectionAnchor;
  final void Function(int index) onSlotTap;
  final String? Function(ArenaSlot slot) priceLabelFor;
  final int? mostPopularIndex;
  final int? lastAvailableIndex;
  final int? nextAvailableIndex;
  final GlobalKey? nextSlotKey;
  final GlobalKey? selectedSlotKey;
  final bool slotsLoading;
  final bool periodEmptyOnly;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();

    if (slotsLoading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.brand, strokeWidth: 2),
      );
    }

    if (slots.isEmpty) {
      return const SizedBox.shrink();
    }

    final displaySlots = filterSlotsByPeriod(slots, periodFilter);
    if (displaySlots.isEmpty) {
      if (!periodEmptyOnly) return const SizedBox.shrink();
      return Center(
        child: Text(
          'Nenhum horário neste período.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: AppColors.onSurfaceMuted,
          ),
        ),
      );
    }

    if (periodFilter != SlotPeriodFilter.all) {
      return _buildFlatList(displaySlots, now);
    }

    final groups = groupSlotsByPeriod(displaySlots);
    final children = <Widget>[];
    for (final group in groups) {
      children.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
          child: Text(
            '${group.sectionLabel} · ${group.slots.length} SLOTS',
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
              color: AppColors.onSurfaceMuted,
            ),
          ),
        ),
      );
      for (var i = 0; i < group.slots.length; i++) {
        final slot = group.slots[i];
        final index = slots.indexOf(slot);
        if (index < 0) continue;
        children.add(_tileForIndex(index, slot, now));
        if (i < group.slots.length - 1) {
          children.add(const SizedBox(height: 10));
        }
      }
      children.add(const SizedBox(height: 8));
    }

    return ListView(
      controller: scrollController,
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: children,
    );
  }

  Widget _buildFlatList(List<ArenaSlot> displaySlots, DateTime now) {
    return ListView.separated(
      controller: scrollController,
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      itemCount: displaySlots.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final slot = displaySlots[i];
        final index = slots.indexOf(slot);
        return _tileForIndex(index, slot, now);
      },
    );
  }

  Widget _tileForIndex(int index, ArenaSlot slot, DateTime now) {
    final isPast = isPastBookableSlot(
      selectedDay: selectedDay,
      slot: slot,
      now: now,
    );
    final selected = isIndexSelected(index) && !isPast;
    final isNext = nextAvailableIndex == index;
    Widget tile = SlotsSlotTile(
      slot: slot,
      selected: selected,
      isPast: isPast,
      isMostPopular: mostPopularIndex == index && !selected,
      isLastSlot: lastAvailableIndex == index && !selected,
      priceLabel: priceLabelFor(slot),
      onTap: () => onSlotTap(index),
    );
    if (isNext && nextSlotKey != null) {
      tile = KeyedSubtree(key: nextSlotKey, child: tile);
    }
    if (selected && isSelectionAnchor(index) && selectedSlotKey != null) {
      tile = KeyedSubtree(key: selectedSlotKey, child: tile);
    }
    return staggeredFadeSlide(index: index, child: tile);
  }
}
