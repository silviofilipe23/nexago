import 'dart:math' as math;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

/// Soma [gap] abaixo do [child] só quando ele ocupa altura. Serve para um
/// grupo de seções que somem sozinhas (cada uma decide se aparece): com
/// alguma visível o grupo fecha com o respiro; todas vazias, nada sobra.
class TrailingGapIfVisible extends SingleChildRenderObjectWidget {
  const TrailingGapIfVisible({
    super.key,
    required this.gap,
    required Widget super.child,
  });

  final double gap;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderTrailingGap(gap);

  @override
  void updateRenderObject(
    BuildContext context,
    covariant _RenderTrailingGap renderObject,
  ) {
    renderObject.gap = gap;
  }
}

class _RenderTrailingGap extends RenderProxyBox {
  _RenderTrailingGap(this._gap);

  double _gap;
  set gap(double value) {
    if (value == _gap) return;
    _gap = value;
    markNeedsLayout();
  }

  Size _withGap(Size child, BoxConstraints constraints) => constraints
      .constrain(Size(child.width, child.height > 0 ? child.height + _gap : 0));

  @override
  void performLayout() {
    final child = this.child;
    if (child == null) {
      size = constraints.smallest;
      return;
    }
    child.layout(constraints.copyWith(minHeight: 0), parentUsesSize: true);
    size = _withGap(child.size, constraints);
  }

  @override
  Size computeDryLayout(covariant BoxConstraints constraints) {
    final child = this.child;
    if (child == null) return constraints.smallest;
    return _withGap(
        child.getDryLayout(constraints.copyWith(minHeight: 0)), constraints);
  }

  double _intrinsicHeight(double h) => h > 0 ? h + _gap : 0;

  @override
  double computeMinIntrinsicHeight(double width) =>
      _intrinsicHeight(super.computeMinIntrinsicHeight(width));

  @override
  double computeMaxIntrinsicHeight(double width) =>
      _intrinsicHeight(math.max(0, super.computeMaxIntrinsicHeight(width)));
}
