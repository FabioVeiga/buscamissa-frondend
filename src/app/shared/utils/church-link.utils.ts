// Usa a URL canônica nova (/paroquia/:uf/:cidadeSlug/:slug) se a igreja tiver slug+cidadeSlug;
// senão cai na rota legada /igrejas/:nomeUnico. Sem esse fallback, igrejas sem slug geram
// links quebrados (.../undefined) que nunca chegam a carregar a página de detalhes.
export function linkParoquia(church: any): string[] {
  const uf = church?.endereco?.uf;
  const cidadeSlug = church?.endereco?.cidadeSlug;
  if (uf && cidadeSlug && church?.slug) {
    return ["/paroquia", uf.toLowerCase(), cidadeSlug, church.slug];
  }
  return ["/igrejas", church?.nomeUnico];
}
