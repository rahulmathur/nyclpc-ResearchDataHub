#!/usr/bin/env bash
set -euo pipefail
BASE_URL=${BASE_URL:-"http://localhost:5000"}

echo "Checking health..."
curl -fsS "$BASE_URL/api/health" || { echo "Health check failed"; exit 2; }

echo "Fetching projects..."
projects=$(curl -fsS "$BASE_URL/api/projects" | jq -r '.data')
if [ "$projects" = "null" ] || [ -z "$projects" ]; then
  echo "No projects returned or failed to parse projects"; exit 3
fi

# try to get a project id
projectId=$(curl -fsS "$BASE_URL/api/projects" | jq -r '.data[0].id')
if [ -n "$projectId" ] && [ "$projectId" != "null" ]; then
  echo "Fetching sites for project $projectId..."
  curl -fsS "$BASE_URL/api/projects/$projectId/sites" >/dev/null || { echo "Failed to fetch sites for project $projectId"; exit 4; }
else
  echo "No project id found; skipping sites check"
fi

echo "Smoke tests passed"; exit 0
