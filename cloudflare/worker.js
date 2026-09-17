// krua-baan backend: relay (wongnai เท่านั้น) + cloud sync (KV)
// Deploy บน Cloudflare Workers — วิธีทำดูใน README.md ไฟล์ข้างๆ
// ต้องมี: KV binding ชื่อ KV, secret ชื่อ SYNC_TOKEN

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json;charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,PUT,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "cache-control": "no-store"
    }
  });

export default {
  async fetch(req, env) {
    const u = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,PUT,OPTIONS",
          "access-control-allow-headers": "content-type,authorization",
          "access-control-max-age": "86400"
        }
      });
    }

    // ทางผ่านดึงหน้าเว็บ (จำกัด host กันคนอื่นเอาไปใช้ยิงเว็บอื่น)
    if (u.pathname === "/relay") {
      const target = u.searchParams.get("url") || "";
      const ALLOW = [
        /^https:\/\/(www\.)?wongnai\.com\//,
        /^https:\/\/(www\.)?allkaset\.com\//,
        /^https:\/\/(www\.)?kasetsomboon\.com\//
      ];
      if (!ALLOW.some(re => re.test(target))) {
        return new Response("host not allowed", { status: 400 });
      }
      const r = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "th-TH,th;q=0.9,en;q=0.8"
        }
      });
      const html = await r.text();
      return new Response(html, {
        status: r.status,
        headers: {
          "content-type": "text/html;charset=utf-8",
          "access-control-allow-origin": "*",
          "cache-control": "max-age=300"
        }
      });
    }

    // ที่เก็บสูตร+รายการโปรด
    if (u.pathname === "/api/state") {
      if (req.headers.get("authorization") !== "Bearer " + (env.SYNC_TOKEN || "")) {
        return json({ error: "unauthorized" }, 401);
      }
      if (req.method === "GET") {
        const cur = (await env.KV.get("krua-state-v1", "json")) || {
          recipes: [],
          favs: [],
          updatedAt: 0,
          rev: 0
        };
        return json(cur);
      }
      if (req.method === "PUT") {
        let body = null;
        try {
          body = await req.json();
        } catch (e) {
          body = null;
        }
        if (!body || !Array.isArray(body.recipes) || !Array.isArray(body.favs)) {
          return json({ error: "bad request" }, 400);
        }
        if (JSON.stringify(body).length > 5000000) {
          return json({ error: "too big" }, 413);
        }
        const cur = (await env.KV.get("krua-state-v1", "json")) || { rev: 0 };
        const next = {
          recipes: body.recipes.filter(r => r && r.id && r.title).slice(0, 500),
          favs: [...new Set(body.favs.map(String))].slice(0, 500),
          updatedAt: Date.now(),
          rev: (cur.rev || 0) + 1
        };
        await env.KV.put("krua-state-v1", JSON.stringify(next));
        return json({ ok: true, updatedAt: next.updatedAt, rev: next.rev });
      }
      return json({ error: "method not allowed" }, 405);
    }

    return new Response("krua-baan sync+relay", { status: 404 });
  }
};
