import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

type OgInput = { eyebrow?: string; title: string; subtitle?: string };

/** Imagem OG com a identidade nexaGO (dark + laranja). Usada por todas as rotas. */
export function renderOg({ eyebrow, title, subtitle }: OgInput) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: '#050505',
          padding: 72,
          justifyContent: 'space-between',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* glow laranja */}
        <div
          style={{
            position: 'absolute',
            top: -160,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background: '#FF6A1A',
            opacity: 0.16,
          }}
        />

        {/* wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#FF6A1A' }} />
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#F4F4F5' }}>
            <span>nexa</span>
            <span style={{ color: '#FF6A1A' }}>GO</span>
          </div>
        </div>

        {/* conteúdo */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {eyebrow && (
            <div
              style={{
                display: 'flex',
                fontSize: 24,
                letterSpacing: 4,
                color: '#FF6A1A',
                fontWeight: 600,
              }}
            >
              {eyebrow.toUpperCase()}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              fontSize: 70,
              fontWeight: 800,
              color: '#F4F4F5',
              lineHeight: 1.04,
              marginTop: 18,
              maxWidth: 960,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                display: 'flex',
                fontSize: 30,
                color: '#A1A1AA',
                marginTop: 22,
                maxWidth: 880,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* rodapé */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 24, color: '#71717A' }}>nexago.com.br</div>
          <div style={{ display: 'flex', width: 120, height: 6, borderRadius: 999, background: '#FF6A1A' }} />
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
