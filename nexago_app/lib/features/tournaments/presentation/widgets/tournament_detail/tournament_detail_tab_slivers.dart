import 'package:flutter/material.dart';

List<Widget> tournamentDetailTabSliversFromChildren({
  EdgeInsetsGeometry? padding,
  required List<Widget> children,
}) {
  final list = SliverList(delegate: SliverChildListDelegate(children));
  if (padding == null) return [list];
  return [SliverPadding(padding: padding, sliver: list)];
}

List<Widget> tournamentDetailTabSliversFromBuilder({
  EdgeInsetsGeometry? padding,
  required int itemCount,
  required NullableIndexedWidgetBuilder itemBuilder,
}) {
  final list = SliverList(
    delegate: SliverChildBuilderDelegate(itemBuilder, childCount: itemCount),
  );
  if (padding == null) return [list];
  return [SliverPadding(padding: padding, sliver: list)];
}
