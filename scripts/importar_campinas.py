"""
Importa paróquias de Campinas direto para o BuscaMissa.
1. Lê campinas-pilot.csv
2. Resolve endereços via ViaCEP (local, uma vez por CEP)
3. Faz POST /api/v1/admin/igrejas/lote com payload completo

Uso:
    python scripts/importar_campinas.py

Ou com variáveis explícitas:
    python scripts/importar_campinas.py --api https://busca-missa-dev.azurewebsites.net --token SEU_TOKEN

Se não passar --token, o script faz login automático (pedirá email/senha).
"""

import argparse
import csv
import getpass
import json
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

# Console Windows é cp1252 — força UTF-8 p/ não crashar ao imprimir ✓/✅/emojis
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent
CSV_PATH   = SCRIPT_DIR / "campinas-pilot.csv"
API_DEV    = "https://busca-missa-dev.azurewebsites.net"

# ---------------------------------------------------------------------------
# CLI args
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser()
parser.add_argument("--api",   default=API_DEV, help="Base URL da API")
parser.add_argument("--token", default="",      help="Bearer token (opcional)")
parser.add_argument("--dry-run", action="store_true", help="Só mostra o payload, não envia")
parser.add_argument("--cidade", default="", help="Cidade do lote (fallback SÓ se a linha do CSV não tiver Localidade; vazio = nunca inventa)")
parser.add_argument("--uf",     default="SP",       help="UF do lote (fallback quando ViaCEP não acha)")
parser.add_argument("--csv",    default=str(CSV_PATH), help="Caminho do CSV da diocese")
parser.add_argument("--chunk",  type=int, default=40, help="Igrejas por request (evita timeout)")
args = parser.parse_args()

API = args.api.rstrip("/")
CSV_PATH = args.csv
CIDADE_FALLBACK = args.cidade.strip()
UF_FALLBACK     = args.uf.strip().upper()[:2]

# UF -> (Estado por extenso, Região) — preenche Estado/Região que o coletor não traz
UF_ESTADO = {
    "AC": ("Acre", "Norte"), "AL": ("Alagoas", "Nordeste"), "AP": ("Amapá", "Norte"),
    "AM": ("Amazonas", "Norte"), "BA": ("Bahia", "Nordeste"), "CE": ("Ceará", "Nordeste"),
    "DF": ("Distrito Federal", "Centro-Oeste"), "ES": ("Espírito Santo", "Sudeste"),
    "GO": ("Goiás", "Centro-Oeste"), "MA": ("Maranhão", "Nordeste"),
    "MT": ("Mato Grosso", "Centro-Oeste"), "MS": ("Mato Grosso do Sul", "Centro-Oeste"),
    "MG": ("Minas Gerais", "Sudeste"), "PA": ("Pará", "Norte"), "PB": ("Paraíba", "Nordeste"),
    "PR": ("Paraná", "Sul"), "PE": ("Pernambuco", "Nordeste"), "PI": ("Piauí", "Nordeste"),
    "RJ": ("Rio de Janeiro", "Sudeste"), "RN": ("Rio Grande do Norte", "Nordeste"),
    "RS": ("Rio Grande do Sul", "Sul"), "RO": ("Rondônia", "Norte"), "RR": ("Roraima", "Norte"),
    "SC": ("Santa Catarina", "Sul"), "SP": ("São Paulo", "Sudeste"),
    "SE": ("Sergipe", "Nordeste"), "TO": ("Tocantins", "Norte"),
}

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def obter_token() -> str:
    if args.token:
        return args.token
    print(f"\nLogin em {API}")
    email = input("Email: ").strip()
    senha = getpass.getpass("Senha: ")
    r = requests.post(
        f"{API}/api/v1/usuario/autenticar",
        json={"email": email, "senha": senha},
        timeout=15,
    )
    r.raise_for_status()
    dados = r.json()
    token = dados.get("data", {}).get("usuario", {}).get("acessToken", {}).get("token", "")
    if not token:
        print("Erro: token não encontrado na resposta.")
        print(json.dumps(dados, indent=2, ensure_ascii=False))
        sys.exit(1)
    print("✓ Autenticado\n")
    return token

# ---------------------------------------------------------------------------
# Lê CSV
# ---------------------------------------------------------------------------
def ler_csv():
    igrejas = defaultdict(lambda: {
        "nome": "", "paroco": None, "cep": "", "numero": 0,
        "email": None, "telefone": None, "whatsApp": None, "site": None,
        "imagemUrl": None,
        "ativo": None,
        "latitude": None, "longitude": None,
        # Endereço opcional vindo do CSV (coletor de diocese) — evita ViaCEP
        "logradouro": "", "bairro": "", "localidade": "", "uf": "",
        "estado": "", "regiao": "",
        "missas": []
    })

    with open(CSV_PATH, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            nome = row["Nome"].strip()
            cep  = (row.get("CEP") or "").strip()
            logr = (row.get("Logradouro") or "").strip()
            loc  = (row.get("Localidade") or "").strip()
            bai  = (row.get("Bairro") or "").strip()
            # chave inclui logradouro + localidade + bairro p/ não fundir homônimas
            # sem CEP de cidades/bairros diferentes (dioceses multi-cidade: Araçatuba,
            # ABC) — capelas rurais sem rua compartilham nome entre municípios.
            key  = f"{nome}||{cep}||{logr}||{loc}||{bai}"
            ig   = igrejas[key]
            ig["nome"]     = nome
            ig["paroco"]   = row.get("Paroco", "").strip() or None
            ig["cep"]      = cep
            ig["numero"]   = int((row.get("Numero") or "0").strip() or 0)
            ig["email"]    = row.get("Email",    "").strip() or None
            ig["telefone"] = row.get("Telefone", "").strip() or None
            ig["whatsApp"] = row.get("WhatsApp", "").strip() or None
            ig["site"]     = row.get("Site",     "").strip() or None
            # Coluna opcional — URL pública da foto; backend baixa e sobe pro blob
            ig["imagemUrl"] = (row.get("ImagemUrl") or row.get("Imagem") or "").strip() or None
            # Status ativo opcional (coluna "Ativo": true/false/1/0); ausente = ativo
            av = (row.get("Ativo") or "").strip().lower()
            if av in ("false", "0", "nao", "não", "inativo"):
                ig["ativo"] = False
            elif av in ("true", "1", "sim", "ativo"):
                ig["ativo"] = True
            # Coordenadas geocodificadas (opcionais)
            try:
                ig["latitude"] = float(row["Latitude"]) if (row.get("Latitude") or "").strip() else ig["latitude"]
                ig["longitude"] = float(row["Longitude"]) if (row.get("Longitude") or "").strip() else ig["longitude"]
            except ValueError:
                pass
            # Endereço do CSV (quando o coletor já trouxe) — backend usa direto, sem ViaCEP
            ig["logradouro"] = logr
            ig["bairro"]     = (row.get("Bairro")     or "").strip()
            ig["localidade"] = (row.get("Localidade") or "").strip()
            ig["uf"]         = (row.get("Uf")         or "").strip().upper()[:2]
            dia = row.get("DiaSemana", "").strip()
            hor = row.get("Horario",   "").strip()
            obs = (row.get("ObsMissa") or "").strip() or None
            if dia and hor:
                ig["missas"].append({"diaSemana": dia, "horario": hor, "observacao": obs})

    return list(igrejas.values())

# ---------------------------------------------------------------------------
# Resolve endereços via ViaCEP
# ---------------------------------------------------------------------------
def _consultar_cep(cep):
    try:
        r = requests.get(f"https://viacep.com.br/ws/{cep}/json/", timeout=10)
        data = r.json()
        if data.get("erro"):
            print(f"  ✗ {cep} — não encontrado")
            return cep, None
        end = {
            "logradouro": data.get("logradouro", ""),
            "bairro":     data.get("bairro",     ""),
            "localidade": data.get("localidade", ""),
            "uf":         (data.get("uf", "") or "").strip().upper()[:2],
            "estado":     data.get("estado",     ""),
            "regiao":     data.get("regiao",     ""),
        }
        print(f"  ✓ {cep} — {end['localidade']}/{end['uf']}")
        return cep, end
    except Exception as e:
        print(f"  ✗ {cep} — erro: {e}")
        return cep, None


def _tem_endereco(ig):
    """Já tem endereço suficiente (do CSV) para o backend pular o ViaCEP."""
    return bool(ig["logradouro"] and ig["localidade"] and ig["uf"])

def resolver_ceps(igrejas):
    # Só consulta ViaCEP para quem NÃO veio com endereço no CSV
    pendentes = [ig for ig in igrejas if not _tem_endereco(ig)]
    com_csv = len(igrejas) - len(pendentes)
    if com_csv:
        print(f"{com_csv} igreja(s) já com endereço no CSV — sem ViaCEP.")

    ceps_unicos = sorted({ig["cep"].replace("-", "") for ig in pendentes if ig["cep"]})
    cache = {}
    if ceps_unicos:
        print(f"Resolvendo {len(ceps_unicos)} CEPs via ViaCEP (paralelo)...")
        with ThreadPoolExecutor(max_workers=10) as pool:
            for cep, end in pool.map(_consultar_cep, ceps_unicos):
                cache[cep] = end

    fallback = []
    sem_cidade = []
    for ig in pendentes:
        end = cache.get(ig["cep"].replace("-", ""))
        if end:
            ig.update(end)
        else:
            # ViaCEP não achou / sem CEP — usa a Localidade/UF da PRÓPRIA linha do CSV.
            # NUNCA inventa a cidade do lote (regra: melhor vazio do que errado).
            loc = (ig.get("localidade") or "").strip()
            uf  = (ig.get("uf") or "").strip().upper()[:2]
            if not loc:
                # Sem cidade na linha → só usa o fallback global SE foi passado
                # explicitamente (--cidade); senão, marca para revisão e não inventa.
                if CIDADE_FALLBACK:
                    loc = CIDADE_FALLBACK
                    fallback.append(ig["nome"])
                else:
                    sem_cidade.append(ig["nome"])
            ig.update({"logradouro": ig["logradouro"], "bairro": ig["bairro"],
                       "localidade": loc, "uf": uf or UF_FALLBACK,
                       "estado": "", "regiao": ""})

    # Preenche Estado/Região por extenso a partir da UF (coletor só traz a sigla)
    for ig in igrejas:
        est, reg = UF_ESTADO.get((ig.get("uf") or "").upper(), ("", ""))
        if not ig.get("estado"):
            ig["estado"] = est
        if not ig.get("regiao"):
            ig["regiao"] = reg

    if fallback:
        print(f"\n⚠️  {len(fallback)} CEP(s) não resolvidos — inseridos como {CIDADE_FALLBACK}/{UF_FALLBACK} (--cidade):")
        for n in fallback:
            print(f"   - {n}")
    if sem_cidade:
        print(f"\n❗ {len(sem_cidade)} igreja(s) SEM Localidade no CSV e sem CEP resolvido"
              f" — corrija o CSV antes de importar (não foram mascaradas como outra cidade):")
        for n in sem_cidade:
            print(f"   - {n}")

    return igrejas

# ---------------------------------------------------------------------------
# Envia para a API
# ---------------------------------------------------------------------------
def importar(igrejas, token):
    if args.dry_run:
        print("\n--- DRY RUN (payload não enviado) ---")
        print(json.dumps({"igrejas": igrejas}, indent=2, ensure_ascii=False)[:3000], "...")
        return

    # Envia em lotes — cada request termina rápido (evita timeout em diocese grande
    # com download de imagem). Idempotente: o dedup do backend pula o que já entrou.
    total = len(igrejas)
    n = args.chunk
    tot_ins = tot_pul = 0
    erros_all = []
    print(f"\nEnviando {total} igrejas em lotes de {n} para {API}/api/v1/admin/igrejas/lote ...")

    for i in range(0, total, n):
        lote = igrejas[i:i + n]
        ini, fim = i + 1, min(i + n, total)
        try:
            r = requests.post(
                f"{API}/api/v1/admin/igrejas/lote",
                json={"igrejas": lote},
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {token}"},
                timeout=300,
            )
        except requests.exceptions.RequestException as e:
            print(f"   lote {ini}-{fim}: ⚠ falha de rede ({e.__class__.__name__}) — "
                  f"rode de novo depois; o dedup pula o que já entrou")
            continue

        if r.status_code == 200:
            res = r.json()
            tot_ins += res.get("inseridas", 0)
            tot_pul += res.get("puladas", 0)
            erros_all += res.get("erros", [])
            print(f"   lote {ini}-{fim}: inseridas {res.get('inseridas',0)}, "
                  f"puladas {res.get('puladas',0)}")
        else:
            print(f"   lote {ini}-{fim}: ❌ HTTP {r.status_code} — {r.text[:200]}")

    print(f"\n✅ Total: inseridas {tot_ins}, puladas {tot_pul}")
    if erros_all:
        print(f"   Erros ({len(erros_all)}):")
        for e in erros_all[:20]:
            print(f"     {e.get('nome')}: {e.get('motivo')}")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=== BuscaMissa — Importação Campinas ===\n")

    igrejas = ler_csv()
    print(f"CSV: {len(igrejas)} paróquias, {sum(len(i['missas']) for i in igrejas)} missas\n")

    igrejas = resolver_ceps(igrejas)

    token = "" if args.dry_run else obter_token()
    importar(igrejas, token)
