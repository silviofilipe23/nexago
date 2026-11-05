import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';

void main() {
  test('sem docs: as 6 de origem, na ordem, com as cores da fase 1', () {
    final t = BlogTaxonomy.merge(const {});
    expect(t.all.map((c) => c.key), [
      'torneios',
      'treino',
      'regras',
      'arenas',
      'guia',
      'loja',
    ]);
    expect(t.of('torneios')!.color, 0xFFFF6A1A);
    expect(t.of('torneios')!.colorLight, 0xFFAE3A0A);
    expect(t.of('guia')!.label, 'Guia do app');
    expect(BlogTaxonomy.defaults, t);
  });

  test('doc vence no mesmo id; campo inválido fica com o de origem', () {
    final t = BlogTaxonomy.merge({
      'torneios': {
        'label': 'Competições',
        'color': 'laranja', // inválida: fica a de origem
        'colorLight': '#123456',
        'order': 9,
      },
    });
    final c = t.of('torneios')!;
    expect(c.label, 'Competições');
    expect(c.color, 0xFFFF6A1A);
    expect(c.colorLight, 0xFF123456);
    expect(c.order, 9);
    expect(c.active, isTrue);
    expect(t.all.last.key, 'torneios');
  });

  test('categoria nova entra; sem rótulo/cor válidos ou id fora do formato, '
      'fica de fora', () {
    final t = BlogTaxonomy.merge({
      'saude-corpo': {
        'label': 'Saúde e corpo',
        'color': '#33CCAA',
        'colorLight': '#11664F',
        'order': 2,
        'active': true,
      },
      'sem-cor': {'label': 'Sem cor', 'order': 1},
      'Com Espaço': {'label': 'X', 'color': '#000000', 'colorLight': '#000000'},
    });
    expect(t.of('saude-corpo')!.label, 'Saúde e corpo');
    expect(t.of('saude-corpo')!.color, 0xFF33CCAA);
    expect(t.of('sem-cor'), isNull);
    expect(t.of('Com Espaço'), isNull);
    expect(t.all, hasLength(7));
  });

  test('ordem por `order` e depois rótulo', () {
    final t = BlogTaxonomy.merge({
      'zeta': {
        'label': 'Zeta',
        'color': '#111111',
        'colorLight': '#111111',
        'order': 2,
      },
      'alfa': {
        'label': 'Alfa',
        'color': '#111111',
        'colorLight': '#111111',
        'order': 2,
      },
    });
    // regras tem order 2 de origem: Alfa, Regras, Zeta.
    final two = [
      for (final c in t.all)
        if (c.order == 2) c.label,
    ];
    expect(two, ['Alfa', 'Regras', 'Zeta']);
  });

  test('inativa fica na lista (post antigo) mas sai das ativas', () {
    final t = BlogTaxonomy.merge({
      'loja': {'active': false},
    });
    expect(t.of('loja')!.label, 'Loja');
    expect(t.of('loja')!.active, isFalse);
    expect(t.active.map((c) => c.key), isNot(contains('loja')));
    expect(t.active, hasLength(5));
  });

  test('id desconhecido = "Blog"', () {
    expect(BlogTaxonomy.defaults.of('podcast'), isNull);
    expect(BlogTaxonomy.defaults.of(''), isNull);
    expect(BlogTaxonomy.defaults.labelOf('podcast'), 'Blog');
  });

  test('formato de id e de cor', () {
    expect(isBlogCategoryId('saude-corpo'), isTrue);
    expect(isBlogCategoryId('Saude'), isFalse);
    expect(isBlogCategoryId('a--b'), isFalse);
    expect(isBlogCategoryId('x' * 33), isFalse);
    expect(parseBlogHexColor('#ff6a1a'), 0xFFFF6A1A);
    expect(parseBlogHexColor('#FFF'), isNull);
    expect(parseBlogHexColor(null), isNull);
  });

  test('autor: foto https e id opcionais', () {
    final withPhoto = BlogPost.fromMap('p', {
      'title': 'T',
      'author': {
        'id': 'a1',
        'name': 'Marcelo R.',
        'role': 'Liga',
        'photoUrl': 'https://img/m.jpg',
      },
    })!;
    expect(withPhoto.authorId, 'a1');
    expect(withPhoto.authorPhotoUrl, 'https://img/m.jpg');

    final old = BlogPost.fromMap('p', {
      'title': 'T',
      'author': {'name': 'Marcelo R.', 'role': 'Liga'},
    })!;
    expect(old.authorId, isNull);
    expect(old.authorPhotoUrl, isNull);

    final insecure = BlogPost.fromMap('p', {
      'title': 'T',
      'author': {'id': null, 'name': 'X', 'photoUrl': 'http://img/x.jpg'},
    })!;
    expect(insecure.authorPhotoUrl, isNull);
  });
}
