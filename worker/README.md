# BT Locations — Cloudflare Worker Proxy

## Architecture
```
Browser → Cloudflare Worker (เก็บ token) → GitHub API
```
- Token อยู่ฝั่ง server เท่านั้น ไม่เคยส่งให้ client
- ทุกคนเรียก Worker URL แทน GitHub API โดยตรง

## Setup

### 1. ติดตั้ง Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 2. ตั้ง Secret
```bash
cd worker
wrangler secret put GITHUB_TOKEN
# ใส่ GitHub Personal Access Token (repo scope)
```

### 3. Deploy
```bash
wrangler deploy
```

### 4. (Optional) ตั้ง API Key
```bash
wrangler secret put API_SECRET
# ใส่ key ที่ต้องส่งใน X-API-Key header
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/file?path=<path>` | ดึงไฟล์ + SHA จาก GitHub |
| PUT | `/api/file` | สร้าง/อัปเดตไฟล์บน GitHub |
| GET | `/api/raw?path=<path>` | ดึง raw file (ไม่ต้อง auth) |

## PUT /api/file Body
```json
{
  "path": "all_locations.json",
  "content": "<base64>",
  "sha": "<current sha>",
  "message": "Sync from web"
}
```
