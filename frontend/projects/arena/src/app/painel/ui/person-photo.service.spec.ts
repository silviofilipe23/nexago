import { galleryIndex, stepGallery, type PersonPhoto, type PersonPhotoEntry } from './person-photo.service';

const entry = (name: string): PersonPhotoEntry => ({ photoUrl: `https://x/${name}.jpg`, role: 'Atleta', name, meta: null });
const gallery = [entry('ana'), entry('bia'), entry('caio')];

function open(name: string, withGallery = true): PersonPhoto {
  return { ...entry(name), origin: { cx: 1, cy: 1, size: 40 }, returnFocusTo: null, ...(withGallery ? { gallery } : {}) };
}

describe('galeria do visualizador de foto', () => {
  it('anda pra frente e pra trás dando a volta, e zera a origem', () => {
    expect(stepGallery(open('ana'), 1).name).toBe('bia');
    expect(stepGallery(open('ana'), -1).name).toBe('caio');
    expect(stepGallery(open('caio'), 1).name).toBe('ana');
    expect(stepGallery(open('ana'), 1).origin).toBeNull();
    expect(galleryIndex(stepGallery(open('ana'), 1))).toBe(1);
  });

  it('sem galeria fica parado', () => {
    const photo = open('ana', false);
    expect(stepGallery(photo, 1)).toBe(photo);
    expect(galleryIndex(photo)).toBe(-1);
  });
});
