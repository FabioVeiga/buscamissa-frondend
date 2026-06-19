import { Mass } from '../../core/interfaces/church.interface';

export type ConfidenceLevel = 'confirmed' | 'parish' | 'unverified';

export type MassUrgency = 'urgent' | 'soon' | 'later' | null;

export interface MassCardData {
  churchId: number;
  churchName: string;
  slug: string;
  uf: string;
  cidadeSlug: string;
  bairro: string;
  localidade: string;
  imagemUrl?: string;
  mass: Mass;
  distanceMeters?: number;
  latitude?: number;
  longitude?: number;
}
