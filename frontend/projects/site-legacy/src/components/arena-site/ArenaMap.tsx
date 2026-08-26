'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import styles from './arena-site.module.css';

/** Mapa da arena (Leaflet + tiles do OpenStreetMap) com pino da marca.
 *  O Leaflet toca `window` no import, então entra por import dinâmico dentro do
 *  efeito — o container já ocupa o espaço final, sem salto de layout. */
export function ArenaMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: { remove: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      const instance = L.map(container, {
        scrollWheelZoom: false,
        attributionControl: true,
      }).setView([lat, lng], 15);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(instance);

      L.marker([lat, lng], {
        alt: label,
        icon: L.divIcon({
          className: '',
          html: `<div class="${styles.pin}"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).addTo(instance);

      map = instance;
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, label]);

  return <div ref={containerRef} className={styles.map} role="img" aria-label={`Mapa — ${label}`} />;
}
