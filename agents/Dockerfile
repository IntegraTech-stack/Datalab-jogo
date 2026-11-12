# DataLab · Agent Gateway — the isolated environment where the crew's AI agents run.
# The image holds ONLY the gateway and OpenCode: no game files, no Supabase secrets, no curl/wget.
# Run it with docker-compose.yml (read-only root, no capabilities, CPU / memory / process limits).
FROM node:22-bookworm-slim

ARG OPENCODE_VERSION=1.19.4
# git: version control inside workspaces · python3: the "run scripts" level
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "opencode-ai@${OPENCODE_VERSION}" \
 && npm cache clean --force \
 && useradd --create-home --uid 10001 --shell /usr/sbin/nologin agent

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    AGENT_DATA_DIR=/data \
    SANDBOX_TRUSTED=1

RUN mkdir -p /data && chown agent:agent /data
VOLUME /data
USER agent
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
