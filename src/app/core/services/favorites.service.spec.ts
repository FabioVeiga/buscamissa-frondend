import { TestBed } from '@angular/core/testing';
import { FavoritesService, IgrejaFavorita } from './favorites.service';

describe('FavoritesService', () => {
  let service: FavoritesService;

  const igreja = (id: number): IgrejaFavorita => ({
    id,
    nome: `Igreja ${id}`,
    uf: 'sp',
    cidadeSlug: 'sao-paulo',
    slug: `igreja-${id}`,
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(FavoritesService);
  });

  afterEach(() => localStorage.clear());

  it('começa vazio quando não há nada no localStorage', () => {
    expect(service.listar()).toEqual([]);
    expect(service.quantidade()).toBe(0);
  });

  it('adiciona uma favorita e persiste', () => {
    service.adicionar(igreja(1));
    expect(service.isFavorita(1)).toBeTrue();
    expect(service.quantidade()).toBe(1);
    const bruto = JSON.parse(localStorage.getItem('buscamissa_favoritas')!);
    expect(bruto[0].id).toBe(1);
  });

  it('não duplica ao adicionar o mesmo id', () => {
    service.adicionar(igreja(1));
    service.adicionar(igreja(1));
    expect(service.quantidade()).toBe(1);
  });

  it('remove uma favorita', () => {
    service.adicionar(igreja(1));
    service.remover(1);
    expect(service.isFavorita(1)).toBeFalse();
    expect(service.quantidade()).toBe(0);
  });

  it('alterna o estado e retorna o novo valor', () => {
    expect(service.alternar(igreja(9))).toBeTrue();
    expect(service.isFavorita(9)).toBeTrue();
    expect(service.alternar(igreja(9))).toBeFalse();
    expect(service.isFavorita(9)).toBeFalse();
  });

  it('emite a lista atualizada via favoritas$', (done) => {
    const emissoes: number[] = [];
    const sub = service.favoritas$.subscribe((lista) => emissoes.push(lista.length));
    service.adicionar(igreja(1));
    service.adicionar(igreja(2));
    service.remover(1);
    // emissões: inicial(0), +1(1), +1(2), -1(1)
    expect(emissoes).toEqual([0, 1, 2, 1]);
    sub.unsubscribe();
    done();
  });

  it('é tolerante a JSON inválido no localStorage', () => {
    localStorage.setItem('buscamissa_favoritas', '{lixo}');
    expect(service.listar()).toEqual([]);
  });
});
