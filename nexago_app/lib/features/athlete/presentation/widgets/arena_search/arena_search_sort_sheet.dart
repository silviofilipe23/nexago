import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../arenas/domain/arena_search_filters.dart';

Future<ArenaSearchSortBy?> showArenaSearchSortSheet({
  required BuildContext context,
  required ArenaSearchSortBy current,
}) {
  return showModalBottomSheet<ArenaSearchSortBy>(
    context: context,
    backgroundColor: AppColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Ordenar',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
              ),
              const SizedBox(height: 12),
              ...ArenaSearchSortBy.values.map(
                (sort) => ListTile(
                  title: Text(
                    _sortLabel(sort),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.onSurface,
                    ),
                  ),
                  trailing: current == sort
                      ? const Icon(Icons.check_rounded, color: AppColors.brand)
                      : null,
                  onTap: () => Navigator.pop(context, sort),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

String _sortLabel(ArenaSearchSortBy sort) {
  return switch (sort) {
    ArenaSearchSortBy.distance => 'Distância',
    ArenaSearchSortBy.price => 'Menor preço',
    ArenaSearchSortBy.rating => 'Melhor avaliação',
    ArenaSearchSortBy.score => 'Score NexaGO',
  };
}
