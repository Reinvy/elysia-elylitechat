# ElyLiteChat — Ultra-Efficient Chat Backend (Bun + ElysiaJS)

Klien perpesanan ultra-efisien: teks real-time + voice OPUS + fallback sosial dari ElyChat.
Frontend: `next-elylitechat`. Spesifikasi terkini ada di root **`docs/`**:

- Produk: `docs/prd/prd_elylitechat.md` (budget: First Load JS < 40 KB, FCP < 0.6 s @3G, RAM tab < 80 MB)
- Arsitektur: `docs/architecture/design.md`, interop: `docs/architecture/interoperability_protocol.md`
- API: `docs/technical/api_spec.md` (Eden Treaty — GraphQL/Apollo **dihapus 2026-09**)
- WS: `docs/technical/websocket_events.md` (Redis `room:<id>` pub/sub — aturan tanpa-Redis **dicabut**)
- Data: `docs/technical/data_models.md` (Prisma v7 dipertahankan, bukan Drizzle)

Aturan agen: [`AGENTS.md`](./AGENTS.md). Skill: `bash ../../skills.sh --verify`.

## Development

```bash
bun install
bunx prisma generate
bunx prisma migrate dev
bun run dev   # http://localhost:3000 (butuh PostgreSQL + Redis single-node)
```

```bash
docker compose up --build   # app + postgres + redis
bun test
```

## Legacy docs (arsip)

- `PRD.md`, `ELYCHAT_API_DOCUMENTATION.md` — arsip layanan; root `docs/` menang bila konflik.
  (Dokumen GraphQL dan §5 GraphQL di `ELYCHAT_API_DOCUMENTATION.md` sudah **dihapus 2026-09**.)
