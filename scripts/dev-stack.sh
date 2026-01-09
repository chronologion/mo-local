#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-start}"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

print_summary() {
  echo "Stack: mo-local"
  echo "Ports:"
  echo "  Postgres: 5434"
  echo "  API: 4000"
  echo "  Web: 5173"
  echo "  Kratos Public: 4455"
  echo "  Kratos Admin: 4434"
}

case "$ACTION" in
  start)
    print_summary
    echo "Starting stack..."
    ./scripts/ensure-key-service-wasm.sh
    docker compose -f "$COMPOSE_FILE" up -d
    echo "Stack started."
    ;;
  stop)
    echo "Stopping stack..."
    docker compose -f "$COMPOSE_FILE" down
    echo "Stack stopped."
    ;;
  reset)
    print_summary
    echo "Resetting stack (including volumes)..."
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
    echo "Stack reset."
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps
    ;;
  *)
    echo "Unknown action: $ACTION"
    echo "Usage: $0 [start|stop|reset|logs|status]"
    exit 1
    ;;
esac
