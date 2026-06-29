import { TipoRedeSocial } from "../../core/services/redes-sociais.service";

export function getSocialIconFromTipos(url: string, tipos: TipoRedeSocial[]): string {
  if (!url) return "pi pi-link";
  const tipo = tipos.find((t) => url.includes(new URL(t.urlBase).hostname));
  return tipo?.icone ?? "pi pi-link";
}
