#!/bin/bash
# Mem0 CLI wrapper — calls Mem0 REST API from inside agent containers
# Usage: mem0 remember "fact" | mem0 recall "query" | mem0 list
#
# Uses node for JSON handling (always available in agent containers, jq is not)

set -euo pipefail

MEM0_URL="${MEM0_API_URL:-http://host.docker.internal:8050}"
AGENT_ID="${NANOCLAW_AGENT_ID:-default}"
DEFAULT_USER="logan"

usage() {
  echo "Usage: mem0 <command> [args]"
  echo ""
  echo "Commands:"
  echo "  remember <text> [--user <id>]   Store a memory"
  echo "  recall <query> [--user <id>]    Search memories"
  echo "  list [--user <id>]              List all memories"
  exit 1
}

[ $# -lt 1 ] && usage

COMMAND="$1"
shift

# Parse arguments
TEXT=""
USER_ID="$DEFAULT_USER"

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --user)
        USER_ID="${2:-$DEFAULT_USER}"
        shift 2
        ;;
      *)
        if [ -z "$TEXT" ]; then
          TEXT="$1"
        else
          TEXT="$TEXT $1"
        fi
        shift
        ;;
    esac
  done
}

# Build JSON safely using node (handles escaping)
build_json() {
  node -e "console.log(JSON.stringify(JSON.parse(process.argv[1])))" "$1"
}

# Parse mem0 response using node
parse_response() {
  local response="$1"
  local mode="$2"
  node -e "
    const data = JSON.parse(process.argv[1]);
    const items = Array.isArray(data) ? data : (data.results || data.memories || []);
    if (items.length === 0) { process.exit(1); }
    items.forEach(m => {
      if ('${mode}' === 'add') {
        console.log('• [' + (m.event || 'stored') + '] ' + (m.memory || 'ok'));
      } else if ('${mode}' === 'search') {
        console.log('• ' + m.memory);
      } else {
        console.log('• ' + m.memory + ' (id: ' + m.id + ')');
      }
    });
  " "$response" 2>/dev/null
}

case "$COMMAND" in
  remember)
    parse_args "$@"
    [ -z "$TEXT" ] && { echo "Error: provide text to remember"; exit 1; }

    # Build JSON body — team memories omit agent_id so all agents can access them
    if [ "$USER_ID" = "team" ]; then
      JSON_BODY=$(node -e "console.log(JSON.stringify({messages:[{role:'user',content:process.argv[1]}],user_id:process.argv[2]}))" "$TEXT" "$USER_ID")
    else
      JSON_BODY=$(node -e "console.log(JSON.stringify({messages:[{role:'user',content:process.argv[1]}],user_id:process.argv[2],agent_id:process.argv[3]}))" "$TEXT" "$USER_ID" "$AGENT_ID")
    fi

    RESPONSE=$(curl -sf --max-time 15 -X POST "${MEM0_URL}/v1/memories/" \
      -H "Content-Type: application/json" \
      -d "$JSON_BODY" 2>&1) || {
      echo "Error: Failed to connect to Mem0 at ${MEM0_URL}"
      exit 1
    }

    RESULTS=$(parse_response "$RESPONSE" "add") && {
      echo "Remembered:"
      echo "$RESULTS"
    } || echo "Memory stored."
    ;;

  recall|search)
    parse_args "$@"
    [ -z "$TEXT" ] && { echo "Error: provide a search query"; exit 1; }

    if [ "$USER_ID" = "team" ]; then
      JSON_BODY=$(node -e "console.log(JSON.stringify({query:process.argv[1],user_id:process.argv[2]}))" "$TEXT" "$USER_ID")
    else
      JSON_BODY=$(node -e "console.log(JSON.stringify({query:process.argv[1],user_id:process.argv[2],agent_id:process.argv[3]}))" "$TEXT" "$USER_ID" "$AGENT_ID")
    fi

    RESPONSE=$(curl -sf --max-time 10 -X POST "${MEM0_URL}/v1/memories/search/" \
      -H "Content-Type: application/json" \
      -d "$JSON_BODY" 2>&1) || {
      echo "Error: Failed to connect to Mem0 at ${MEM0_URL}"
      exit 1
    }

    RESULTS=$(parse_response "$RESPONSE" "search") && {
      echo "Relevant memories:"
      echo "$RESULTS"
    } || echo "No relevant memories found."
    ;;

  list)
    parse_args "$@"

    if [ "$USER_ID" = "team" ]; then
      LIST_URL="${MEM0_URL}/v1/memories/?user_id=${USER_ID}"
    else
      LIST_URL="${MEM0_URL}/v1/memories/?user_id=${USER_ID}&agent_id=${AGENT_ID}"
    fi

    RESPONSE=$(curl -sf --max-time 10 "$LIST_URL" 2>&1) || {
      echo "Error: Failed to connect to Mem0 at ${MEM0_URL}"
      exit 1
    }

    RESULTS=$(parse_response "$RESPONSE" "list") && {
      echo "All memories (user=$USER_ID, agent=$AGENT_ID):"
      echo "$RESULTS"
    } || echo "No memories found."
    ;;

  *)
    echo "Unknown command: $COMMAND"
    usage
    ;;
esac
