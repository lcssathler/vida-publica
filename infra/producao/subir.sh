#!/usr/bin/env bash
# Sobe (ou para) os serviços desta máquina. Rodado pelo serviço systemd
# vida-publica, com a configuração da máquina (/etc/vida-publica/ambiente:
# PAPEL, VERSAO, IMAGENS, AWS_REGION, SEGREDO e o resto, sem segredo).
#
# Os segredos vêm do AWS Secrets Manager, com o papel da máquina, direto para
# as variáveis deste processo (e daí para os contêineres): nunca para arquivo.
set -euo pipefail

: "${PAPEL:?}" "${VERSAO:?}" "${IMAGENS:?}" "${AWS_REGION:?}" "${SEGREDO:?}"
cd "$(dirname "$0")"
arquivo="$PAPEL.compose.yml"
export PAPEL VERSAO IMAGENS AWS_REGION

if [ "${1:-}" = parar ]; then
  docker compose -f "$arquivo" down
  exit 0
fi

json=$(aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$SEGREDO" \
  --query SecretString --output text)
eval "$(jq -r 'to_entries[] | "export \(.key)=\(.value | tostring | @sh)"' <<<"$json")"
unset json

if [ "$PAPEL" = banco ]; then
  # IP privado da máquina (IMDSv2): o banco só escuta nele.
  token=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
    -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
  VP_DB_IP_PRIVADO=$(curl -fsS -H "X-aws-ec2-metadata-token: $token" \
    http://169.254.169.254/latest/meta-data/local-ipv4)
  export VP_DB_IP_PRIVADO
  mkdir -p /srv/dados/postgres /srv/dados/restauracao
  docker compose -f "$arquivo" pull --quiet
  docker compose -f "$arquivo" up -d --wait postgres
  # Migrações da versão desta tag (db/migrations do repositório clonado).
  docker compose -f "$arquivo" run --rm migrate
  docker compose -f "$arquivo" up -d --wait --remove-orphans
else
  docker compose -f "$arquivo" pull --quiet
  docker compose -f "$arquivo" up -d --wait --remove-orphans
fi
docker compose -f "$arquivo" ps
