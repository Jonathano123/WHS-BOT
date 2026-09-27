FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        python3 \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L \
    https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

RUN python3 --version \
    && /usr/local/bin/yt-dlp --version \
    && ffmpeg -version \
    && node --version

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

ENV YTDLP_PATH=/usr/local/bin/yt-dlp

CMD ["npm", "start"]
