import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { buildOsmEmbedUrl, LocationMapComponent } from './location-map.component';

describe('buildOsmEmbedUrl', () => {
  it('monta uma URL de embed do OpenStreetMap com bbox ao redor do ponto e um marcador', () => {
    const url = buildOsmEmbedUrl(-23.5505, -46.6333);
    expect(url).toBe(
      'https://www.openstreetmap.org/export/embed.html?bbox=-46.6393,-23.5565,-46.6273,-23.5445&layer=mapnik&marker=-23.5505,-46.6333',
    );
  });

  it('arredonda a bbox em 6 casas decimais para evitar dígitos de ponto flutuante', () => {
    const url = buildOsmEmbedUrl(10.005, 20.003);
    expect(url).toBe(
      'https://www.openstreetmap.org/export/embed.html?bbox=19.997,9.999,20.009,10.011&layer=mapnik&marker=10.005,20.003',
    );
  });
});

describe('LocationMapComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LocationMapComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('não renderiza iframe quando lat e lng são null', () => {
    const fixture = TestBed.createComponent(LocationMapComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });

  it('não renderiza iframe quando só lat está presente', () => {
    const fixture = TestBed.createComponent(LocationMapComponent);
    fixture.componentRef.setInput('lat', -23.5505);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });

  it('não renderiza iframe quando só lng está presente', () => {
    const fixture = TestBed.createComponent(LocationMapComponent);
    fixture.componentRef.setInput('lng', -46.6333);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });

  it('renderiza o iframe quando lat e lng estão presentes', () => {
    const fixture = TestBed.createComponent(LocationMapComponent);
    fixture.componentRef.setInput('lat', -23.5505);
    fixture.componentRef.setInput('lng', -46.6333);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).not.toBeNull();
  });
});
