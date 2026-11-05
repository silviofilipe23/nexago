import { BLOG_IMAGE_SPECS, blogImageWarning } from './blog-image';

describe('blog-image', () => {
  it('cada tipo tem a sua dica de tamanho', () => {
    expect(BLOG_IMAGE_SPECS.cover).toContain('1600×900 px (16:9)');
    expect(BLOG_IMAGE_SPECS.body).toContain('1200 px de largura');
    expect(BLOG_IMAGE_SPECS.author).toContain('400×400 px');
  });

  it('capa: avisa largura pequena e proporção fora de 16:9', () => {
    expect(blogImageWarning({ width: 1600, height: 900 }, 'cover')).toBeNull();
    expect(blogImageWarning({ width: 1920, height: 1080 }, 'cover')).toBeNull();
    expect(blogImageWarning({ width: 800, height: 450 }, 'cover')).toContain('pode borrar');
    expect(blogImageWarning({ width: 1600, height: 1600 }, 'cover')).toContain('proporção 1,00');
    expect(blogImageWarning({ width: 3000, height: 1000 }, 'cover')).toContain('fora de 16:9');
  });

  it('corpo: só a largura importa', () => {
    expect(blogImageWarning({ width: 1200, height: 2000 }, 'body')).toBeNull();
    expect(blogImageWarning({ width: 900, height: 600 }, 'body')).toContain('abaixo de 1200 px');
  });

  it('autor: avisa foto pequena ou não quadrada', () => {
    expect(blogImageWarning({ width: 400, height: 400 }, 'author')).toBeNull();
    expect(blogImageWarning({ width: 300, height: 300 }, 'author')).toContain('pode borrar');
    expect(blogImageWarning({ width: 800, height: 500 }, 'author')).toContain('não é quadrada');
  });
});
