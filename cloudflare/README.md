# Cloud สำหรับครัวบ้านๆ (Cloudflare Workers + KV)

Worker ตัวเดียวจบ 2 หน้าที่: `relay` ดึงหน้า wongnai (ใช้ส่วนตัว)
กับ `api/state` เก็บสูตร + รายการโปรด

## วิธีเปิดใช้ (ทำครั้งเดียว ~10 นาที)

1. สมัคร/ล็อกอิน https://dash.cloudflare.com
   → **Workers & Pages** → **Create Worker** → ตั้งชื่อ (เช่น `krua-baan`)
   → **Deploy** → **Edit code** → ลบของเดิมทิ้ง วางเนื้อหา `worker.js`
   ทั้งไฟล์ → **Save and deploy**
2. กลับมาหน้า Worker → **Bindings** → **Add binding** →
   **KV namespace** → **Create new namespace** (ชื่อเช่น `krua-kv`)
   → **Variable name** ใส่ `KV` เป๊ะๆ → Deploy ใหม่อีกรอบ
3. **Settings** → **Variables and Secrets** → **Add** →
   ชื่อ `SYNC_TOKEN` ค่า = รหัสยาวๆ ที่คิดเอง
   (สุ่มได้ด้วย: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`)
4. ก็อป address ของ Worker (เช่น `https://krua-baan.xxx.workers.dev`)
   + token ไปใส่ในแอปตรงท้ายเว็บ **ตั้งค่า cloud** → **จำไว้ในเครื่องนี้**
   → กด **☁ ซิงก์**

## ตรวจว่าใช้ได้

- เปิด `https://xxx.workers.dev/relay?url=https://www.wongnai.com/`
  ต้องได้ HTML กลับมา (ไม่ใช่ 400)
- ในแอปกด ☁ ซิงก์ ต้องขึ้น "ซิงก์แล้ว" พร้อมเวลา

## หมายเหตุ

- relay จำกัดให้ดึงได้แค่ `wongnai.com` กันคนอื่นเอาไปใช้ยิงเว็บอื่น
- ข้อมูลซิงก์เก็บแค่สูตรที่เพิ่มเอง + รายการโปรด (ไม่เก็บนาฬิกาจับเวลา)
- แก้พร้อมกัน 2 เครื่อง: ฝั่งที่ซิงก์ทีหลังชนะเป็นรายสูตร
  (ลบสูตรที่เครื่องนึงขณะที่อีกเครื่องออฟไลน์ อาจโผล่กลับมาได้)
- สาย CLI: `npx wrangler login` → `npx wrangler kv:namespace create krua-kv`
  → ใส่ id ใน `wrangler.toml` → `echo TOKEN | npx wrangler secret put SYNC_TOKEN`
  → `npx wrangler deploy`

## หมายเหตุเรื่องราคาตลาด

- relay อนุญาตเพิ่มให้ดึงตารางราคาจาก `allkaset.com`
  (กับ `kasetsomboon.com` สำรอง) ได้ด้วย — แก้ worker.js แล้วต้อง
  **Save and deploy ใหม่** ทุกครั้ง ไม่งั้นแอปจะดึงราคาผ่านช่องสำรองอื่นแทน
- ราคาตลาดเป็นค่าเฉลี่ย 3 ตลาด (ต่อ กก.) ส่วนหมู/ไก่/ไข่/เครื่องปรุง
  ใช้ราคาประมาณในแอป — ตัวเลขในแอปคือ "ประเมิน" ไม่ใช่บิลจริง

## บอร์ดกลาง "เมนูจากทุกคน" (v0.4+)

- `GET /api/shared` อ่านได้ทุกคน (ตัด token ลบกับ IP ออกให้แล้ว)
- `POST /api/shared` เปิดโพสต์ได้ไม่ต้องล็อกอิน แต่จำกัด
  **IP ละ 5 สูตร/วัน** + เก็บสูงสุด 200 สูตร (ใหม่ดันเก่าตก)
- `POST /api/shared/:id/like` กดได้ IP ละครั้ง
- `DELETE /api/shared/:id` ต้องแนบ `delToken` ที่ได้ตอนโพสต์
- แก้ worker.js แล้ว **Save and deploy ใหม่** ทุกครั้ง
