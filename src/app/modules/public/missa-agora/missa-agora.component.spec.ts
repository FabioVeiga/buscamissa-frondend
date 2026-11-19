import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { MissaAgoraComponent } from './missa-agora.component';
import { ChurchesService } from '../../../core/services/churches.service';
import { SeoService } from '../../../core/services/seo.service';
import { SeoPaginasService } from '../../../core/services/seo-paginas.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { FavoritesService } from '../../../core/services/favorites.service';
import { MetricasService } from '../../../core/services/metricas.service';
import { ErroGeolocalizacao, GeolocationService, MotivoErroGeo } from '../../../core/services/geolocation.service';

describe('MissaAgoraComponent — GPS e CEP', () => {
  let fixture: ComponentFixture<MissaAgoraComponent>;
  let comp: MissaAgoraComponent;
  let toast: jasmine.Spy;
  let geo: jasmine.SpyObj<GeolocationService>;
  let church: jasmine.SpyObj<ChurchesService>;

  /** Promise que o teste resolve/rejeita quando quiser (simula GPS/rede lentos). */
  const adiavel = <T>() => {
    let resolver!: (v: T) => void;
    let rejeitar!: (e: unknown) => void;
    const promessa = new Promise<T>((ok, erro) => { resolver = ok; rejeitar = erro; });
    return { promessa, resolver, rejeitar };
  };
  const esvaziar = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

  const montar = () => {
    fixture = TestBed.createComponent(MissaAgoraComponent);
    comp = fixture.componentInstance;
    toast = spyOn(fixture.debugElement.injector.get(MessageService), 'add');
    fixture.detectChanges(); // ngOnInit → pede o GPS
  };

  beforeEach(() => {
    geo = jasmine.createSpyObj<GeolocationService>('GeolocationService', [
      'obterPosicaoAtual', 'reverseGeocode', 'consultarCepDetalhado', 'geocodificarCepProvisorio',
    ]);
    geo.reverseGeocode.and.resolveTo(null);
    church = jasmine.createSpyObj<ChurchesService>('ChurchesService', ['proximasMissas', 'cidadesProximas']);
    church.proximasMissas.and.returnValue(of({ data: [] }));
    church.cidadesProximas.and.returnValue(of({ data: [] }));

    TestBed.configureTestingModule({
      imports: [MissaAgoraComponent],
      providers: [
        provideRouter([]),
        { provide: GeolocationService, useValue: geo },
        { provide: ChurchesService, useValue: church },
        { provide: SeoService, useValue: { update: () => {} } },
        { provide: SeoPaginasService, useValue: { getEstados: () => of([]) } },
        { provide: AnalyticsService, useValue: { searchStarted: () => {}, getDirections: () => {} } },
        { provide: FavoritesService, useValue: { listar: () => [] } },
        { provide: MetricasService, useValue: { registrarVisualizacaoPagina: () => {} } },
      ],
    });
  });

  afterEach(() => fixture?.destroy());

  describe('falha do GPS não é tratada como permissão negada', () => {
    it('recusa do usuário ("negada") → denied e aviso de permissão, sem toast de indisponibilidade', async () => {
      geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao('negada', 1));

      montar();
      await esvaziar();

      expect(comp.geoStatus).toBe('denied');
      expect(comp.permissaoNegadaPeloBrowser).toBeTrue();
      expect(toast).not.toHaveBeenCalled();
    });

    (['indisponivel', 'timeout', 'inesperado', 'inseguro', 'sem-suporte'] as MotivoErroGeo[]).forEach((motivo) => {
      it(`"${motivo}" → error, sem culpar a permissão, e avisa do fallback por cidade/CEP`, async () => {
        geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao(motivo));

        montar();
        await esvaziar();

        expect(comp.geoStatus).toBe('error');
        expect(comp.permissaoNegadaPeloBrowser).toBeFalse();
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.calls.mostRecent().args[0].detail).toContain('cidade ou CEP');
      });
    });

    it('erro que não é ErroGeolocalizacao → error (nunca "denied")', async () => {
      geo.obterPosicaoAtual.and.rejectWith(new Error('boom'));

      montar();
      await esvaziar();

      expect(comp.geoStatus).toBe('error');
      expect(comp.permissaoNegadaPeloBrowser).toBeFalse();
    });
  });
});
