import { buildOsmEmbedUrl } from './location-map.component';

describe('buildOsmEmbedUrl', () => {
  it('monta uma URL de embed do OpenStreetMap com bbox ao redor do ponto e um marcador', () => {
    const url = buildOsmEmbedUrl(-23.5505, -46.6333);
    expect(url).toBe(
      'https://www.openstreetmap.org/export/embed.html?bbox=-46.6393,-23.5565,-46.6273,-23.5445&layer=mapnik&marker=-23.5505,-46.6333',
    );
  });
});
