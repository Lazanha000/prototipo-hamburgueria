FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 MIRANTE_DATA=/data
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt && useradd -m mirante && mkdir /data && chown mirante /data
COPY mirante_worker ./mirante_worker
USER mirante
VOLUME /data
CMD ["python", "-m", "mirante_worker", "run"]
