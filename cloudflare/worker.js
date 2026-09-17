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

    // บอร์ดกลาง: อ่านได้ทุกคน, โพสต์/ไลก์เปิดแต่จำกัดอัตรา, ลบด้วย token ของเจ้าของ
    if (u.pathname === "/api/shared" && req.method === "GET") {
      const arr = (await env.KV.get("krua-shared-v1", "json")) || [];
      return json({ items: arr.map(({ delToken, likedBy, ...p }) => p).slice(0, 200) });
    }
    if (u.pathname === "/api/shared" && req.method === "POST") {
      const ip = req.headers.get("cf-connecting-ip") || "unknown";
      const day = new Date().toISOString().slice(0, 10);
      const rk = "krua-rl-" + ip + "-" + day;
      const n = parseInt((await env.KV.get(rk)) || "0", 10) || 0;
      if (n >= 5) return json({ error: "rate limited" }, 429);
      let b = null;
      try {
        b = await req.json();
      } catch (e) {
        b = null;
      }
      if (!b || !b.title || !Array.isArray(b.ings) || !Array.isArray(b.steps)) {
        return json({ error: "bad request" }, 400);
      }
      if (JSON.stringify(b).length > 200000) return json({ error: "too big" }, 413);
      const num = (v, fb, lo, hi) => {
        const x = +v;
        return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fb;
      };
      const taste = {};
      for (const k of ["เผ็ด", "เปรี้ยว", "เค็ม", "หวาน"]) {
        taste[k] = num(b.taste && b.taste[k], 0, 0, 5);
      }
      const arr = (await env.KV.get("krua-shared-v1", "json")) || [];
      const rnd = [...crypto.getRandomValues(new Uint8Array(16))]
        .map(x => x.toString(16).padStart(2, "0"))
        .join("");
      const item = {
        id: "s-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        title: String(b.title).slice(0, 60),
        desc: String(b.desc || "").slice(0, 140),
        cat: String(b.cat || "ต้ม").slice(0, 10),
        time: num(b.time, 20, 1, 720),
        diff: String(b.diff || "ง่าย").slice(0, 10),
        serves: num(b.serves, 2, 1, 12),
        serveLabel: String(b.serveLabel || "").slice(0, 40),
        spicy: num(b.spicy, 0, 0, 3),
        taste,
        ings: b.ings.map(String).map(s => s.slice(0, 120)).slice(0, 30),
        steps: b.steps.map(String).map(s => s.slice(0, 500)).slice(0, 30),
        img: String(b.img || "").slice(0, 300),
        author: String(b.author || "").slice(0, 40),
        source: String(b.source || "").slice(0, 300),
        by: String(b.by || "ไม่ประสงค์ออกนาม").slice(0, 24),
        sharedAt: Date.now(),
        likes: 0,
        likedBy: [],
        delToken: rnd
      };
      arr.unshift(item);
      await env.KV.put("krua-shared-v1", JSON.stringify(arr.slice(0, 200)));
      await env.KV.put(rk, String(n + 1), { expirationTtl: 86400 });
      const { delToken, likedBy, ...pub } = item;
      return json({ ok: true, item: pub, delToken });
    }
    if (u.pathname.startsWith("/api/shared/") && req.method === "DELETE") {
      const sid = decodeURIComponent(u.pathname.slice("/api/shared/".length));
      let b = null;
      try {
        b = await req.json();
      } catch (e) {
        b = null;
      }
      const arr = (await env.KV.get("krua-shared-v1", "json")) || [];
      const ix = arr.findIndex(x => x && x.id === sid);
      if (ix < 0) return json({ error: "not found" }, 404);
      if (!b || b.delToken !== arr[ix].delToken) return json({ error: "forbidden" }, 403);
      arr.splice(ix, 1);
      await env.KV.put("krua-shared-v1", JSON.stringify(arr));
      return json({ ok: true });
    }
    if (u.pathname.endsWith("/like") && u.pathname.startsWith("/api/shared/") && req.method === "POST") {
      const sid = decodeURIComponent(
        u.pathname.slice("/api/shared/".length, -"/like".length)
      );
      const ip = req.headers.get("cf-connecting-ip") || "unknown";
      const arr = (await env.KV.get("krua-shared-v1", "json")) || [];
      const it = arr.find(x => x && x.id === sid);
      if (!it) return json({ error: "not found" }, 404);
      it.likedBy = Array.isArray(it.likedBy) ? it.likedBy : [];
      if (!it.likedBy.includes(ip)) {
        it.likedBy.push(ip);
        it.likes = (it.likes || 0) + 1;
        await env.KV.put("krua-shared-v1", JSON.stringify(arr));
      }
      return json({ ok: true, likes: it.likes || 0 });
    }

    return new Response("krua-baan sync+relay", { status: 404 });
  }
};
