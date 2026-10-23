#!/usr/bin/env bash
# Sends three sample requests to the API and prints each response.
# Usage: BASE_URL=http://localhost:3000 SERVICE_API_KEY=your-key ./scripts/test-requests.sh
set -euo pipefail

: "${BASE_URL:?Set BASE_URL, e.g. http://localhost:3000}"
: "${SERVICE_API_KEY:?Set SERVICE_API_KEY}"
BASE_URL="${BASE_URL%/}"

request() {
  local title="$1" body="$2"
  echo "=== $title"
  echo "Request:  $body"
  echo -n "Response: "
  # --max-time allows for a free-tier cold start plus the model call
  curl -sS --max-time 90 -w '\nHTTP %{http_code}\n\n' \
    -X POST "$BASE_URL/api/generate" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $SERVICE_API_KEY" \
    -d "$body"
}

request "1. Normal request" \
  '{"text": "Summarize the benefits of unit testing in two sentences."}'

request "2. With a system prompt and maxTokens" \
  '{"text": "Explain what an API rate limit is.", "system": "You are a concise technical writer. Answer in one short paragraph.", "maxTokens": 200}'

request "3. Invalid request (empty text)" \
  '{"text": ""}'
