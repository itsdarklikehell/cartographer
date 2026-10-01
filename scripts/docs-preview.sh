#!/bin/sh

# Build the production files and serve them through the same Jekyll build
# that GitHub Pages runs, at http://127.0.0.1:4000/docs/. Needs Docker. The
# preview does not rebuild on an edit, so run it again after a change.
set -e

pnpm run build

# The image holds the github-pages gem, which pins the Jekyll version and the
# plugins of the server. The first run builds it, which takes a few minutes.
if ! docker image inspect campaign-builder-pages >/dev/null 2>&1; then
  printf 'FROM ruby:3.3\nRUN gem install github-pages webrick --no-document\n' |
    docker build -t campaign-builder-pages -
fi

# The github-pages command applies the settings of the server on top of
# _config.yml, and plain jekyll does not. PAGES_REPO_NWO names the
# repository, so jekyll-github-metadata does not look for a git remote. The
# relative link rewrite resolves paths from the working directory, so the
# container starts in the site directory.
docker run --rm -p 127.0.0.1:4000:4000 -v "$PWD/dist":/site:ro -w /site \
  -e PAGES_REPO_NWO=wetherc/cartographer -e JEKYLL_ENV=production \
  campaign-builder-pages sh -c \
  'github-pages build -s /site -d /tmp/site && ruby -run -e httpd /tmp/site -p 4000 -b 0.0.0.0'
