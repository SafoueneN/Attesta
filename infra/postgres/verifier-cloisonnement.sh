#!/usr/bin/env bash
# Vérifie le cloisonnement des bases (docs/adr/0013) sur la pile compose démarrée :
# chaque rôle se connecte à sa base, et à aucune autre.
# Usage : bash infra/postgres/verifier-cloisonnement.sh
set -euo pipefail

bases=(attesta_auth attesta_profiles attesta_cvgen attesta_jobs attesta_watch attesta_letters attesta_web)
suffixe="-dev-uniquement"
echecs=0

connexion() { # rôle base -> code de sortie de psql
  docker compose exec -T -e PGPASSWORD="$1$suffixe" db \
    psql -h localhost -U "$1" -d "$2" -tAc "select 1" >/dev/null 2>&1
}

for role in "${bases[@]}"; do
  for base in "${bases[@]}" postgres attesta; do
    if connexion "$role" "$base"; then obtenu="autorisée"; else obtenu="refusée"; fi
    if [[ "$role" == "$base" ]]; then attendu="autorisée"; else attendu="refusée"; fi
    if [[ "$obtenu" != "$attendu" ]]; then
      echo "ÉCHEC : connexion de $role à $base $obtenu (attendu : $attendu)"
      echecs=$((echecs + 1))
    fi
  done
done

vector=$(docker compose exec -T db psql -U attesta -d attesta_jobs -tAc \
  "select count(*) from pg_extension where extname = 'vector'")
[[ "$vector" == "1" ]] || { echo "ÉCHEC : extension vector absente de attesta_jobs"; echecs=$((echecs + 1)); }

if ((echecs > 0)); then
  echo "$echecs vérification(s) en échec."
  exit 1
fi
echo "Cloisonnement vérifié : ${#bases[@]} rôles, chacun limité à sa base ; pgvector dans attesta_jobs."
