FROM python:3.12-bookworm

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openjdk-21-jre-headless \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Lavalink 4.2.2
RUN curl -fsSL \
    https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar \
    -o /app/Lavalink.jar

COPY . .

RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
