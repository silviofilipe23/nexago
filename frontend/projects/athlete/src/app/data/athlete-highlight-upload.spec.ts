import {
  HIGHLIGHT_ASPECT_RATIO,
  HIGHLIGHT_JPEG_QUALITY,
  HIGHLIGHT_MAX_OUTPUT_WIDTH,
  MAX_HIGHLIGHT_PHOTOS,
  buildHighlightPhotoId,
} from './athlete-highlight-upload';

describe('athlete-highlight-upload', () => {
  // Estes números existem em dois lugares (aqui e no app Flutter). Se alguém
  // mudar um lado sem o outro, web e app passam a gerar fotos diferentes.
  it('mantém a paridade com athlete_profile.dart e profile_image_crop_config.dart', () => {
    expect(MAX_HIGHLIGHT_PHOTOS).toBe(6);
    expect(HIGHLIGHT_ASPECT_RATIO).toBe(1);
    expect(HIGHLIGHT_MAX_OUTPUT_WIDTH).toBe(1600);
    expect(HIGHLIGHT_JPEG_QUALITY).toBe(0.88);
  });

  describe('buildHighlightPhotoId', () => {
    it('combina timestamp e índice', () => {
      expect(buildHighlightPhotoId(2, 1_700_000_000_000)).toBe('1700000000000_2');
    });

    it('não colide entre duas fotos do mesmo milissegundo', () => {
      const now = 1_700_000_000_000;
      expect(buildHighlightPhotoId(0, now)).not.toBe(buildHighlightPhotoId(1, now));
    });
  });
});
