FROM eclipse-temurin:21-jre

ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        curl \
        ca-certificates \
        bash \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN python3 -m pip install --upgrade pip --break-system-packages \
    && python3 -m pip install --break-system-packages -r requirements.txt

COPY . .

RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
