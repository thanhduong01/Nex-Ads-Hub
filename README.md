# Ads Hub - Fullstack FB Ads Manager

## 1-Click Deploy lên Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-repo/ads-hub)

### Bước 1: Chuẩn bị
- Supabase project: chạy file `supabase/schema.sql` trong SQL Editor
- Meta System User Token vĩnh viễn: developers.facebook.com -> Business -> System User -> Token với quyền ads_read, business_management

### Bước 2: Deploy
1. Push folder này lên Github
2. Vào vercel.com -> Add New Project -> Import repo
3. Add Env Vars từ `.env.example`
4. Deploy -> Xong

### Bước 3: Dán Frontend
Copy file dashboard v3 (`ads-hub-dashboard-v3.html`) vào `/public/dashboard.html` rồi redeploy, hoặc dùng file `/pages/index.js` hiện tại sẽ redirect.

### Cron 30p
Vercel tự đọc `vercel.json` và chạy `/api/cron/sync` mỗi 30 phút. Kiểm tra log tại Vercel Dashboard -> Cron Jobs.

### Test local
```
npm install
cp .env.example .env.local
npm run dev
```
Mở http://localhost:3000/api/accounts để check TK, http://localhost:3000/api/cron/sync?secret=YOUR_SECRET để sync thủ công.

### Custom Metrics
Công thức lưu trong report_configs.custom_metrics dạng:
[{"name":"ROAS thực","formula":"purchase_value / spend"}, {"name":"CPA thực","formula":"spend / actions.lead"}]
Engine tính bằng new Function.

### Phân quyền khách hàng
Thêm client trong bảng `clients` với owner_email, map TK trong `client_accounts`. Frontend check ?client=slug để filter.