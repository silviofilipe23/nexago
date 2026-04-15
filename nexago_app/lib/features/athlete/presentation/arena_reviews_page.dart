import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/theme/app_colors.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../domain/arena_review.dart';

class ArenaReviewsPage extends ConsumerStatefulWidget {
  const ArenaReviewsPage({
    super.key,
    required this.arenaId,
    this.arenaName,
  });

  final String arenaId;
  final String? arenaName;

  @override
  ConsumerState<ArenaReviewsPage> createState() => _ArenaReviewsPageState();
}

class _ArenaReviewsPageState extends ConsumerState<ArenaReviewsPage> {
  static const int _pageSize = 10;

  final List<ArenaReview> _reviews = <ArenaReview>[];
  DocumentSnapshot<Map<String, dynamic>>? _lastDoc;
  bool _loadingInitial = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => _loadPage(reset: true));
  }

  Future<List<ArenaReview>> _enrichAthleteNames(
    FirebaseFirestore firestore,
    List<ArenaReview> reviews,
  ) async {
    final ids = reviews
        .map((e) => e.userId.trim())
        .where((e) => e.isNotEmpty)
        .toSet()
        .toList(growable: false);
    if (ids.isEmpty) return reviews;

    final names = <String, String>{};
    for (var i = 0; i < ids.length; i += 10) {
      final chunk = ids.sublist(i, i + 10 > ids.length ? ids.length : i + 10);
      final usersSnap = await firestore
          .collection('users')
          .where(FieldPath.documentId, whereIn: chunk)
          .get();
      for (final doc in usersSnap.docs) {
        final name = (doc.data()['name'] as String?)?.trim();
        if (name != null && name.isNotEmpty) {
          names[doc.id] = name;
        }
      }
    }

    return reviews
        .map((r) => r.copyWith(athleteName: names[r.userId]))
        .toList(growable: false);
  }

  Future<void> _loadPage({required bool reset}) async {
    if (_loadingMore) return;
    final firestore = ref.read(firestoreProvider);
    if (reset) {
      setState(() {
        _loadingInitial = true;
        _errorMessage = null;
        _hasMore = true;
        _lastDoc = null;
        _reviews.clear();
      });
    } else {
      if (!_hasMore) return;
      setState(() {
        _loadingMore = true;
        _errorMessage = null;
      });
    }

    try {
      Query<Map<String, dynamic>> query = firestore
          .collection('arena_reviews')
          .where('arenaId', isEqualTo: widget.arenaId.trim())
          .limit(_pageSize);

      if (!reset && _lastDoc != null) {
        query = query.startAfterDocument(_lastDoc!);
      }

      final snap = await query.get();
      final page = snap.docs.map(ArenaReview.fromFirestore).toList(growable: false);
      final enriched = await _enrichAthleteNames(firestore, page);

      if (!mounted) return;
      setState(() {
        _lastDoc = snap.docs.isNotEmpty ? snap.docs.last : _lastDoc;
        _hasMore = snap.docs.length == _pageSize;
        _reviews.addAll(enriched);
        _reviews.sort((a, b) {
          final aMs = a.createdAt?.millisecondsSinceEpoch ?? 0;
          final bMs = b.createdAt?.millisecondsSinceEpoch ?? 0;
          return bMs.compareTo(aMs);
        });
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Não foi possível carregar avaliações.\n$e';
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _loadingInitial = false;
        _loadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = (widget.arenaName?.trim().isNotEmpty == true)
        ? 'Avaliações • ${widget.arenaName!.trim()}'
        : 'Avaliações';
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: _loadingInitial
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null && _reviews.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _errorMessage!,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: () => _loadPage(reset: true),
                          child: const Text('Tentar novamente'),
                        ),
                      ],
                    ),
                  ),
                )
              : _reviews.isEmpty
                  ? const Center(child: Text('Ainda não há avaliações.'))
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
                      itemCount: _reviews.length + 1,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        if (index == _reviews.length) {
                          if (_loadingMore) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 8),
                              child: Center(child: CircularProgressIndicator()),
                            );
                          }
                          if (!_hasMore) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 8),
                              child: Center(
                                child: Text(
                                  'Você chegou ao fim das avaliações.',
                                  style: TextStyle(color: AppColors.onSurfaceMuted),
                                ),
                              ),
                            );
                          }
                          return Center(
                            child: OutlinedButton(
                              onPressed: () => _loadPage(reset: false),
                              child: const Text('Carregar mais'),
                            ),
                          );
                        }

                        final review = _reviews[index];
                        final date = review.createdAt;
                        final athleteName =
                            (review.athleteName?.trim().isNotEmpty == true)
                                ? review.athleteName!.trim()
                                : 'Atleta';
                        return Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: Theme.of(context)
                                  .colorScheme
                                  .outline
                                  .withValues(alpha: 0.12),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                athleteName,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleSmall
                                    ?.copyWith(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Row(
                                    children: List.generate(5, (starIndex) {
                                      final filled = starIndex < review.rating;
                                      return Padding(
                                        padding:
                                            const EdgeInsets.only(right: 2),
                                        child: Icon(
                                          filled
                                              ? Icons.star_rounded
                                              : Icons.star_outline_rounded,
                                          size: 18,
                                          color: filled
                                              ? const Color(0xFFFFC107)
                                              : Theme.of(context)
                                                  .colorScheme
                                                  .outline,
                                        ),
                                      );
                                    }),
                                  ),
                                  const Spacer(),
                                  if (date != null)
                                    Text(
                                      DateFormat('dd/MM/yyyy', 'pt_BR')
                                          .format(date),
                                      style: Theme.of(context)
                                          .textTheme
                                          .labelMedium
                                          ?.copyWith(
                                            color: AppColors.onSurfaceMuted,
                                          ),
                                    ),
                                ],
                              ),
                              if (review.comment != null) ...[
                                const SizedBox(height: 8),
                                Text(
                                  review.comment!,
                                  style:
                                      Theme.of(context).textTheme.bodyMedium,
                                ),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
    );
  }
}
