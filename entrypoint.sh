#!/bin/sh
set -e

# Auto-copy example configs on first run (volume is empty)
[ -f /app/config/runtime.yml ] || \
    cp /app/config.examples/runtime.yml.example /app/config/runtime.yml

[ -f /app/config/chat_sys_prompt.txt ] || \
    cp /app/config.examples/chat_sys_prompt.txt.example /app/config/chat_sys_prompt.txt

# Seed custom-extension templates into the mounted ./custom on first run (empty volume).
# Only .example templates are copied — never an active commands.py/tools.py.
[ -f /app/custom/commands.py.example ] || { \
    mkdir -p /app/custom && cp /app/custom.examples/* /app/custom/ 2>/dev/null || true; }

# Seed skill templates into the mounted ./skills on first run (empty volume).
# Only the README and example/ template are copied — never an active SKILL.md.
[ -f /app/skills/example/SKILL.md.example ] || { \
    mkdir -p /app/skills && cp -r /app/skills.examples/. /app/skills/ 2>/dev/null || true; }

# If explicitly requested to run bot alone (e.g. docker-compose bot service)
if [ "$1" = "bot" ] || [ "$APP_MODE" = "bot" ]; then
    exec uv run python main.py
fi

# Default (Render / Cloud / Web GUI mode): Start Web GUI which serves the dashboard and manages the bot
exec uv run uvicorn web.main:app --host 0.0.0.0 --port "${PORT:-17860}"
