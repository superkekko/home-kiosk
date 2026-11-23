FROM node:20-slim

ENV NODE_ENV=production \
    TZ=Europe/Rome

WORKDIR /usr/src/app
COPY app/ ./
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8085

# 503 se una schermata non si rigenera da più di 3 intervalli (vedi /api/status)
HEALTHCHECK --interval=60s --timeout=5s --start-period=180s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8085)+'/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
