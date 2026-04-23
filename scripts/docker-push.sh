#!/bin/bash
set -e

IMAGE="ghcr.io/iankulin/piksto"
VERSION=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")
MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f1-2)

echo "Building $IMAGE with tags: latest, $MAJOR, $MINOR, $VERSION"

docker build \
  --platform linux/amd64 \
  -t "$IMAGE:latest" \
  -t "$IMAGE:$MAJOR" \
  -t "$IMAGE:$MINOR" \
  -t "$IMAGE:$VERSION" \
  .

docker push "$IMAGE:latest"
docker push "$IMAGE:$MAJOR"
docker push "$IMAGE:$MINOR"
docker push "$IMAGE:$VERSION"
