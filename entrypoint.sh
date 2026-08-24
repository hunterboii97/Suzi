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

# Wait for Web GUI setup to complete before starting the bot (only if config.yaml does not exist AND DISCORD_BOT_TOKEN is not in environment)
if [ ! -f /app/data/config.yaml ] && [ -z "$DISCORD_BOT_TOKEN" ]; then
    echo "⏳ Waiting for Web GUI setup to complete..."
    echo "   Open your browser and go to http://localhost:17860 to finish setup"
    until [ -f /app/data/config.yaml ] || [ -n "$DISCORD_BOT_TOKEN" ]; do
        sleep 3
    done
    echo "✅ Setup complete, starting Bot..."
fi

exec uv run python main.py
