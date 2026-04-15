FROM oven/bun:latest

RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends \
       git curl ca-certificates jq \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /reeve
COPY verify.sh e2e.sh ./
COPY fixtures/ /fixtures/
RUN chmod +x verify.sh e2e.sh
