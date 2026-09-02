#!/usr/bin/env bash
set -euo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly project_directory="$(cd -- "${script_directory}/.." && pwd)"
readonly user_unit_directory="${HOME}/.config/systemd/user"

export NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"

# Use the owner's active NVM Node version, matching the API service launcher.
source "${NVM_DIR}/nvm.sh"
cd "${project_directory}"

npm run check
docker compose up -d --wait postgres
npm run migrate
docker compose build web

install -D -m 0644 \
  ops/systemd/raspi5-api.service \
  "${user_unit_directory}/raspi5-api.service"
systemctl --user daemon-reload
systemctl --user enable raspi5-api.service

systemctl --user restart raspi5-api.service
curl --fail --silent \
  --retry 10 --retry-delay 1 --retry-connrefused \
  http://127.0.0.1:3001/health >/dev/null

docker compose up -d --wait web

if [[ "$(loginctl show-user "${USER}" --property=Linger --value)" != "yes" ]]; then
  echo "UYARI: Kullanici servisini boot sirasinda baslatmak icin linger etkin degil." >&2
  echo "Bir kez calistirin: loginctl enable-linger ${USER}" >&2
fi

systemctl --user --no-pager --full status raspi5-api.service
docker compose ps
