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
import time
from collections import defaultdict
from pathlib import Path

import requests

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
args = parser.parse_args()

API = args.api.rstrip("/")

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
        "missas": []
    })

    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = f"{row['Nome'].strip()}||{row['CEP'].strip()}"
            ig  = igrejas[key]
            ig["nome"]     = row["Nome"].strip()
            ig["paroco"]   = row.get("Paroco", "").strip() or None
            ig["cep"]      = row["CEP"].strip()
            ig["numero"]   = int(row.get("Numero", "0").strip() or 0)
            ig["email"]    = row.get("Email",    "").strip() or None
            ig["telefone"] = row.get("Telefone", "").strip() or None
            ig["whatsApp"] = row.get("WhatsApp", "").strip() or None
            ig["site"]     = row.get("Site",     "").strip() or None
            # Coluna opcional — URL pública da foto; backend baixa e sobe pro blob
            ig["imagemUrl"] = (row.get("ImagemUrl") or row.get("Imagem") or "").strip() or None
            dia = row.get("DiaSemana", "").strip()
            hor = row.get("Horario",   "").strip()
            if dia and hor:
                ig["missas"].append({"diaSemana": dia, "horario": hor})

    return list(igrejas.values())

# ---------------------------------------------------------------------------
# Resolve endereços via ViaCEP
# ---------------------------------------------------------------------------
def resolver_ceps(igrejas):
    ceps_unicos = {ig["cep"].replace("-", "") for ig in igrejas}
    print(f"Resolvendo {len(ceps_unicos)} CEPs via ViaCEP...")

    cache = {}
    for cep in sorted(ceps_unicos):
        try:
            r = requests.get(f"https://viacep.com.br/ws/{cep}/json/", timeout=10)
            data = r.json()
            if data.get("erro"):
                print(f"  ✗ {cep} — não encontrado")
                cache[cep] = None
            else:
                cache[cep] = {
                    "logradouro": data.get("logradouro", ""),
                    "bairro":     data.get("bairro",     ""),
                    "localidade": data.get("localidade", ""),
                    "uf":         data.get("uf",         ""),
                    "estado":     data.get("estado",     ""),
                    "regiao":     data.get("regiao",     ""),
                }
                print(f"  ✓ {cep} — {cache[cep]['localidade']}/{cache[cep]['uf']}")
        except Exception as e:
            print(f"  ✗ {cep} — erro: {e}")
            cache[cep] = None
        time.sleep(0.1)  # educado com o ViaCEP

    # Injeta endereço em cada igreja
    sem_endereco = []
    for ig in igrejas:
        cep_key = ig["cep"].replace("-", "")
        end = cache.get(cep_key)
        if end:
            ig.update(end)
        else:
            sem_endereco.append(ig["nome"])

    if sem_endereco:
        print(f"\n⚠️  {len(sem_endereco)} igrejas sem endereço resolvido:")
        for n in sem_endereco:
            print(f"   - {n}")

    return igrejas

# ---------------------------------------------------------------------------
# Envia para a API
# ---------------------------------------------------------------------------
def importar(igrejas, token):
    payload = {"igrejas": igrejas}

    if args.dry_run:
        print("\n--- DRY RUN (payload não enviado) ---")
        print(json.dumps(payload, indent=2, ensure_ascii=False)[:3000], "...")
        return

    print(f"\nEnviando {len(igrejas)} igrejas para {API}/api/v1/admin/igrejas/lote ...")
    r = requests.post(
        f"{API}/api/v1/admin/igrejas/lote",
        json=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        timeout=120,
    )

    if r.status_code == 200:
        res = r.json()
        print(f"\n✅ Resultado:")
        print(f"   Inseridas : {res.get('inseridas', 0)}")
        print(f"   Puladas   : {res.get('puladas', 0)}")
        erros = res.get("erros", [])
        if erros:
            print(f"   Erros ({len(erros)}):")
            for e in erros:
                print(f"     linha {e.get('linha')} — {e.get('nome')}: {e.get('motivo')}")
    else:
        print(f"\n❌ HTTP {r.status_code}")
        print(r.text[:1000])
        sys.exit(1)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=== BuscaMissa — Importação Campinas ===\n")

    igrejas = ler_csv()
    print(f"CSV: {len(igrejas)} paróquias, {sum(len(i['missas']) for i in igrejas)} missas\n")

    igrejas = resolver_ceps(igrejas)

    token = obter_token()
    importar(igrejas, token)
