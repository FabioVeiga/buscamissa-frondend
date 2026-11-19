import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
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

  describe('busca por CEP (consultas com prazo, pelo GeolocationService)', () => {
    const endereco = { cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' };
    const buscarCep = async (cep = '01001-000') => {
      comp.cepBusca = cep;
      comp.buscarPorCep();
      await esvaziar();
    };
    /** Parte de "GPS negado": a tela já está no estado de fallback quando o usuário digita o CEP. */
    const montarComGpsNegado = async () => {
      geo.obterPosicaoAtual.and.rejectWith(new ErroGeolocalizacao('negada', 1));
      montar();
      await esvaziar();
    };

    it('CEP válido: busca as missas nas coordenadas do CEP e mostra a cidade', async () => {
      await montarComGpsNegado();
      geo.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco });
      geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });

      await buscarCep();

      expect(geo.consultarCepDetalhado).toHaveBeenCalledWith('01001000');
      expect(church.proximasMissas).toHaveBeenCalledWith(-23.55, -46.63, 10);
      expect(comp.geoStatus).toBe('found');
      expect(comp.cidadeDetectada).toBe('São Paulo');
      expect(comp.cidadeDetectadaUf).toBe('SP');
      expect(comp.isLoadingCep).toBeFalse();
    });

    it('CEP com menos de 8 dígitos: avisa e não consulta ninguém', async () => {
      await montarComGpsNegado();

      await buscarCep('0100');

      expect(geo.consultarCepDetalhado).not.toHaveBeenCalled();
      expect(toast.calls.mostRecent().args[0].summary).toBe('CEP inválido');
    });

    it('CEP inexistente: tela de "sem resultados", sem consultar a coordenada', async () => {
      await montarComGpsNegado();
      geo.consultarCepDetalhado.and.resolveTo({ status: 'inexistente' });

      await buscarCep();

      expect(geo.geocodificarCepProvisorio).not.toHaveBeenCalled();
      expect(comp.geoStatus).toBe('found');
      expect(comp.missas).toEqual([]);
      expect(toast.calls.mostRecent().args[0].summary).toBe('Local não encontrado');
    });

    (['timeout', 'rede'] as const).forEach((status) => {
      it(`ViaCEP "${status}": não vira "sem resultados"; volta ao estado anterior e avisa`, async () => {
        await montarComGpsNegado();
        geo.consultarCepDetalhado.and.resolveTo({ status });

        await buscarCep();

        expect(geo.geocodificarCepProvisorio).not.toHaveBeenCalled();
        expect(church.proximasMissas).not.toHaveBeenCalled();
        expect(comp.geoStatus).toBe('denied'); // o que a tela já mostrava; nada de "found" vazio
        expect(comp.isLoadingCep).toBeFalse();
        expect(toast.calls.mostRecent().args[0].summary).toBe('Não conseguimos buscar o CEP agora');
      });

      it(`geocodificação "${status}": mesma resposta, sem busca de missas`, async () => {
        await montarComGpsNegado();
        geo.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco });
        geo.geocodificarCepProvisorio.and.resolveTo({ status });

        await buscarCep();

        expect(church.proximasMissas).not.toHaveBeenCalled();
        expect(comp.geoStatus).toBe('denied');
        expect(comp.isLoadingCep).toBeFalse();
        expect(toast.calls.mostRecent().args[0].summary).toBe('Não conseguimos buscar o CEP agora');
      });
    });

    it('endereço sem coordenada no Nominatim: "sem resultados" (o serviço respondeu)', async () => {
      await montarComGpsNegado();
      geo.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco });
      geo.geocodificarCepProvisorio.and.resolveTo({ status: 'sem-coordenadas' });

      await buscarCep();

      expect(comp.geoStatus).toBe('found');
      expect(toast.calls.mostRecent().args[0].summary).toBe('Local não encontrado');
    });
  });

  describe('GPS tardio não sobrescreve a escolha do usuário', () => {
    const endereco = { cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' };

    it('GPS ainda pendente + CEP resolvido + GPS chega depois: vale o CEP', async () => {
      const gps = adiavel<{ lat: number; lng: number }>();
      geo.obterPosicaoAtual.and.returnValue(gps.promessa);
      geo.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco });
      geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });
      montar();

      comp.cepBusca = '01001000';
      comp.buscarPorCep();
      await esvaziar();
      expect(comp.cidadeDetectada).toBe('São Paulo');

      gps.resolver({ lat: -3.1, lng: -60.0 }); // GPS responde tarde, em outro lugar
      await esvaziar();

      expect(church.proximasMissas).toHaveBeenCalledTimes(1);
      expect(church.proximasMissas).toHaveBeenCalledWith(-23.55, -46.63, 10);
      expect(church.cidadesProximas).toHaveBeenCalledTimes(1);
      expect(geo.reverseGeocode).not.toHaveBeenCalled();
      expect(comp.cidadeDetectada).toBe('São Paulo');
    });

    it('GPS pendente + CEP: o GPS que falha depois não apaga o resultado do CEP', async () => {
      const gps = adiavel<{ lat: number; lng: number }>();
      geo.obterPosicaoAtual.and.returnValue(gps.promessa);
      geo.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco });
      geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });
      montar();
      comp.cepBusca = '01001000';
      comp.buscarPorCep();
      await esvaziar();

      gps.rejeitar(new ErroGeolocalizacao('timeout', 3));
      await esvaziar();

      expect(comp.geoStatus).toBe('found');
      expect(toast).not.toHaveBeenCalled();
    });

    it('CEP ainda pendente + usuário toca em "Usar minha localização": a resposta do CEP é descartada', async () => {
      const viaCep = adiavel<any>();
      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.4, lng: -51.9 });
      montar();
      await esvaziar();
      church.proximasMissas.calls.reset();
      geo.consultarCepDetalhado.and.returnValue(viaCep.promessa);
      comp.cepBusca = '01001000';
      comp.buscarPorCep();

      comp.tentar(); // novo GPS invalida o CEP em voo
      await esvaziar();
      expect(comp.isLoadingCep).toBeFalse(); // botão do CEP não fica preso
      church.proximasMissas.calls.reset();

      viaCep.resolver({ status: 'ok', endereco });
      await esvaziar();

      expect(geo.geocodificarCepProvisorio).not.toHaveBeenCalled();
      expect(church.proximasMissas).not.toHaveBeenCalled();
    });

    it('busca de missas do GPS ainda em voo não substitui a do CEP', async () => {
      const buscaGps = new Subject<any>();
      const buscaCep = new Subject<any>();
      church.proximasMissas.and.returnValues(buscaGps, buscaCep);
      geo.obterPosicaoAtual.and.resolveTo({ lat: -23.4, lng: -51.9 });
      geo.consultarCepDetalhado.and.resolveTo({ status: 'ok', endereco });
      geo.geocodificarCepProvisorio.and.resolveTo({ status: 'ok', coords: { lat: -23.55, lng: -46.63 } });
      montar();
      await esvaziar(); // GPS resolveu e a busca dele está em voo

      comp.cepBusca = '01001000';
      comp.buscarPorCep();
      await esvaziar(); // CEP resolveu e a busca dele também está em voo

      const item = (nome: string) => ({ igrejaId: 1, nome, missa: { id: 1, diaSemana: 0, horario: '10:00' } });
      buscaCep.next({ data: [item('Do CEP')] });
      buscaCep.complete();
      buscaGps.next({ data: [item('Do GPS')] }); // chega por último, mas é obsoleta
      buscaGps.complete();

      expect(comp.missas.map(m => m.churchName)).toEqual(['Do CEP']);
      expect(comp.isLoading).toBeFalse();
    });
  });
});
