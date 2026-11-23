# Notain mailer — the Node sidecar that runs @sendust/ts.
#
# Debian, not Alpine: the prebuilt addon published for Linux is the glibc
# (`linux-x64-gnu`) target. Alpine would need the musl build, and a mismatch
# fails at module load rather than at build time.
#
# The image is pinned to a Node 22 line because @sendust/ts requires Node >=
# 22.23.5; `node:22-bookworm-slim` tracks the newest 22.x patch.

FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# Dependency layer first so a source edit does not reinstall the addon.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

# Nothing writes to the filesystem: no database, no uploads, no temp files.
USER node

EXPOSE 8080

# Exec form, so SIGTERM reaches Node directly and the shutdown hook can release
# the pooled SMTP sessions.
CMD ["node", "src/server.mjs"]
