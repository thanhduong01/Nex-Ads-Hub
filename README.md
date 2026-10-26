# Ads Hub

Web app quản lý Facebook Ads cá nhân: nhiều Business Manager, tài khoản, chiến dịch và báo cáo theo khách hàng. Một repository, Next.js Pages Router + React 18 + Tailwind + Supabase, triển khai trên Vercel.

**Mã có backend thật.** Đăng nhập Supabase, OAuth Facebook, Graph API, lưu dữ liệu, phân quyền và cron gọi các dịch vụ thật khi được cấu hình. Chế độ **Dữ liệu mẫu** là lựa chọn riêng trên màn hình đăng nhập; không tự thay thế dữ liệu thật khi API lỗi. Đề xuất gọi Meta Model API theo prompt bạn quản lý, sau khi kết nối API key. Kết quả là nội dung phân tích; ứng dụng không thay đổi quảng cáo trên Meta.

## Chạy ngay trên máy

Yêu cầu Node.js 22 trở lên.

```bash
npm ci
npm run dev
```

Mở `http://localhost:3000`, chọn **Mở không gian dữ liệu mẫu** để kiểm tra giao diện, báo cáo, Excel/PDF mà chưa cần khóa dịch vụ.

Chạy dữ liệu thật:

```bash
cp .env.example .env.local
# Điền giá trị của bạn vào .env.local rồi khởi động lại server.
npm run dev
```

`NEXT_PUBLIC_SITE_URL` phải trùng origin thực tế đang mở, ví dụ `http://localhost:3000` hoặc `http://127.0.0.1:3000`. Không thêm dấu `/` ở cuối. Đây là origin được API kiểm tra cho các thao tác ghi.

Khi chạy local bằng HTTP, vào **Tài khoản quảng cáo → Kết nối Facebook → Kết nối bằng System User Token** để dùng `META_ACCESS_TOKEN` đã cấu hình. Ads Hub yêu cầu HTTPS cho cách **Tiếp tục với Facebook**; nếu chưa có HTTPS, nút này hiển thị lý do và không mở popup lỗi.

Cửa sổ kết nối đóng khi danh sách tài khoản đã được lấy và lưu. Đồng bộ chi tiêu tiếp tục với thông báo riêng trên giao diện; bạn có thể xem tài khoản và báo cáo trong lúc chờ. Tài khoản có hơn 500 chiến dịch được lấy Insights theo từng khoảng tối đa 7 ngày để giảm timeout; chỉ ghi lại khoảng dữ liệu sau khi đã đọc đủ các phần. Lỗi mạng tạm thời được thử lại có giới hạn. Nếu request quá lâu, giao diện báo timeout và yêu cầu tải lại để kiểm tra kết quả.

## Những thay đổi so với bản yêu cầu ban đầu

- **Next.js 15.5.28**, theo lựa chọn dùng bản đã vá của bạn; giữ React 18.3.1 và Pages Router. Không dùng Next.js 14 vì cảnh báo bảo mật. [Thông báo bản vá](https://nextjs.org/blog/nextjs-security-update-october-14-2026).
- Phiên bản Graph API đọc từ `META_API_VERSION`, giá trị khởi đầu là `v25.0`. Không khóa cứng bản legacy `v19.0`. Trước khi chạy thật, kiểm tra phiên bản Marketing API được Meta App của bạn hỗ trợ và điều chỉnh biến này. [Changelog Meta](https://developers.facebook.com/docs/graph-api/changelog/).
- Công thức dùng cấu trúc `left / operator / right` và evaluator giới hạn phép toán, không chạy `Function()` hay `eval()` trên nội dung người dùng.
- LocalStorage chỉ lưu metadata phiên và cache. Quyền truy cập thực sự được kiểm tra bằng cookie HttpOnly, phiên phía máy chủ và email từ Supabase Auth.
- Cron bắt buộc `Authorization: Bearer CRON_SECRET`. Header `x-vercel-cron` riêng lẻ không được chấp nhận vì có thể bị giả mạo.
- Unique insights là `(workspace_id, campaign_id, date)` để không xung đột dữ liệu giữa các workspace.
- Giao diện nằm trực tiếp ở `pages/index.js`; không cần copy `public/dashboard.html` hay redirect.

## 1. Chuẩn bị Supabase

1. Tạo project tại Supabase.
2. Mở SQL Editor, chạy toàn bộ `supabase/schema.sql` **một lần trên project mới**. Script tạo đúng 8 bảng: `bms`, `ad_accounts`, `campaigns`, `daily_insights`, `clients`, `client_accounts`, `report_configs`, `user_sessions`, cùng indexes, RLS và hai RPC giao dịch.
3. Vào Authentication → Users → Add user, tạo tài khoản quản trị bằng email/mật khẩu. Tài khoản phải được xác nhận email.
4. Đặt `ADMIN_EMAIL` bằng email đó. Đây là workspace cá nhân với một admin, không phải hệ thống đăng ký admin công khai.
5. Lấy Project URL, publishable/anon key và Secret key (hoặc legacy service*role); điền đúng các biến tương ứng trong `.env.local` hoặc Vercel. Biến `SUPABASE_SERVICE_ROLE_KEY` chấp nhận Secret key mới dạng `sb_secret*...`; không điền anon/publishable vào biến này.
6. Khi cấp quyền cho khách hàng: tạo user Supabase Auth cho email khách hàng, rồi trong Ads Hub tạo khách hàng với `owner_email` trùng email đó và gán tài khoản quảng cáo. Không có luồng gửi email tự động trong mã nguồn.

Không đặt service-role key vào biến `NEXT_PUBLIC_*`, localStorage hay mã trình duyệt. Tất cả ghi dữ liệu chạy qua API server. RLS và quyền cột chặn đọc token mã hóa và bảng phiên từ anon/authenticated.

### Lỗi đăng nhập do cấu hình

Chạy `npm run setup:check` trong thư mục project. Lệnh chỉ đọc, không in khóa/token hoặc dữ liệu trong bảng.

- **Khóa server là anon/publishable:** vào Supabase → Settings → API Keys, lấy Secret key dành cho backend (`sb_secret_...`) hoặc legacy `service_role`. Đặt vào `SUPABASE_SERVICE_ROLE_KEY` trong `.env.local`; giữ khóa publishable/anon ở `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Khởi động lại server. [Các loại API key](https://supabase.com/docs/guides/getting-started/api-keys).
- **Thiếu `user_sessions`, `campaigns`, `client_accounts` hoặc cột `workspace_id`:** project chưa có đúng schema của repository này. Tạo email trong Authentication chỉ tạo user xác thực, không tạo các bảng ứng dụng.
- Trên **project Supabase mới**, chạy toàn bộ `supabase/schema.sql` trong SQL Editor. Nếu các bảng cùng tên đã tồn tại nhưng khác cấu trúc, không chạy lại mù quáng và không xóa bảng: cần kiểm tra dữ liệu/cấu trúc hiện có rồi chuẩn bị migration, hoặc dùng project mới dành riêng cho Ads Hub. Việc restart Next.js không tự tạo bảng Supabase.

Thông báo API dùng mã `SUPABASE_SERVER_KEY_REQUIRED` hoặc `SUPABASE_SCHEMA_REQUIRED` để phân biệt hai lỗi thiết lập này với lỗi mật khẩu. Đây là kiểm tra cấu hình; khóa vẫn được Supabase xác thực ở mỗi request.

<<<<<<< HEAD
Migration sửa cấu trúc legacy đã được lưu tại `supabase/migrations/20261025143207_align_ads_hub_schema.sql`. Migration này dành riêng cho bộ 5 bảng legacy đã kiểm tra: chỉ chạy khi cả 5 bảng còn trống, khóa bảng trong giao dịch, chuyển chúng sang schema riêng `ads_hub_legacy`, rồi tạo 8 bảng ứng dụng. Nó dừng và rollback nếu thấy dữ liệu. Không chạy migration này trên project mới hoặc cấu trúc khác; project mới dùng `supabase/schema.sql`.

Các hàm hỗ trợ RLS ở schema riêng `ads_hub_private`; hai RPC ghi dữ liệu chạy dưới quyền caller và chỉ cấp cho `service_role`. Các bảng legacy được giữ nguyên cấu trúc, không cấp quyền truy cập schema cho trình duyệt.

=======
>>>>>>> 7045534 (Diagnose Supabase login setup errors without exposing credentials)
## 2. Chuẩn bị Meta

### Cách nhanh: System User Token

1. Tạo Meta App loại/use case Business phù hợp tại Meta for Developers và cấu hình Marketing API.
2. Trong Business Settings → Users → System Users, tạo/chọn System User Admin.
3. Gán app, Business Manager và từng tài khoản quảng cáo cho System User.
4. Generate Token cho app với các quyền được app/tài khoản cho phép: `ads_read`, `business_management`; `read_insights` nếu cần và có sẵn cho use case. App chỉ đọc quảng cáo nên không cần `ads_management` để thay đổi camp.
5. Chọn thời hạn “Never expire” nếu Meta cho phép. Token vẫn có thể bị thu hồi hoặc mất quyền; không xem đây là bảo đảm hoạt động vĩnh viễn.
6. Đặt token vào **META_ACCESS_TOKEN** trên server. Đăng nhập Ads Hub → Tài khoản quảng cáo → Kết nối Facebook → **Kết nối bằng System User Token**.

Sau khi các biến Supabase, admin, site URL đã cấu hình, chỉ cần thêm token server hợp lệ để dùng đường kết nối này; không cần nhập token vào trình duyệt.

Mã lấy `/me/businesses`, `owned_ad_accounts`, `client_ad_accounts` và `/me/adaccounts`, phân trang và loại trùng ID. Trường `business{id,name}` trên tài khoản bổ sung BM sở hữu, kể cả khi `/me/businesses` rỗng hoặc System User không có edge này. Tài khoản được chia sẻ vẫn thuộc BM sở hữu, không bị gán sang BM đối tác. Tài khoản chưa có thông tin BM nằm trong nhóm **Chưa xác định BM**. Lỗi token hết hạn/quyền bị từ chối được báo lỗi, không chuyển sang dữ liệu mẫu.

Trong trang **Tài khoản quảng cáo**, mục **Nguồn kết nối Facebook** xác minh trực tiếp với Meta và hiển thị tên, ID nguồn, loại token, ứng dụng cấp token và số tài khoản đã lưu. System User là danh tính do doanh nghiệp cấp quyền; tài khoản Facebook đang đăng nhập trong trình duyệt không quyết định nguồn khi dùng token máy chủ. Để đổi nguồn này, cập nhật `META_ACCESS_TOKEN` trong `.env.local`, khởi động lại server rồi kết nối lại. Panel cảnh báo nếu danh tính token mới khác nguồn dữ liệu đã lưu. API chỉ trả thông tin danh tính cho admin, không trả token hay ciphertext; khi Meta không xác minh được, giao diện hiển thị trạng thái chưa xác minh.

### Tùy chọn: Facebook OAuth thật

1. Chạy ứng dụng ở địa chỉ HTTPS có chứng chỉ hợp lệ. Đặt `NEXT_PUBLIC_SITE_URL` bằng đúng origin HTTPS đó, cùng với `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENCRYPTION_KEY`; khởi động lại server hoặc redeploy. Mở và đăng nhập Ads Hub bằng chính địa chỉ HTTPS này để cookie phiên và cookie OAuth dùng cùng host.
2. Trong Meta App **Nex Ads**, mở cài đặt **Facebook Login / Facebook Login for Business**, bật **Client OAuth Login** và **Web OAuth Login**. Thêm URL dưới đây (thay tên miền thực) vào **Valid OAuth Redirect URIs**, giữ HTTPS và lưu:

```text
https://TEN-MIEN-CUA-BAN/api/facebook/callback
```

3. Bật sản phẩm/use case Facebook Login phù hợp, cấu hình app domain, policy URLs và App Review/Business Verification theo quyền và người dùng mà Meta yêu cầu. Ở Development mode chỉ các tài khoản có vai trò phù hợp trong app mới đăng nhập được.
4. Nhấn **Tiếp tục với Facebook**. Popup thực hiện OAuth, kiểm tra state, đổi code sang token, đổi sang token dài hạn rồi kéo dữ liệu.
5. Token OAuth được mã hóa AES-256-GCM và lưu vào `ad_accounts.meta_token_encrypted` để cron còn dùng khi tab đã đóng. Không đổi `TOKEN_ENCRYPTION_KEY` tùy tiện; đổi khóa cần kết nối lại.

Nếu Facebook báo ứng dụng “không sử dụng kết nối bảo mật”, kiểm tra callback có đang dùng `http://127.0.0.1:3000` không. Không chỉ đổi chữ `http` thành `https` trong env khi server chưa phục vụ HTTPS. Với local HTTP, dùng nút System User Token; để thử OAuth, hoàn tất HTTPS và đăng ký callback như trên. Một số cấu hình Development cho phép `http://localhost`, nhưng Ads Hub dùng HTTPS cho OAuth để không phụ thuộc ngoại lệ này. Xem [hướng dẫn tích hợp Facebook của Firebase](https://firebase.google.com/docs/auth/web/facebook-login) về HTTPS và ngoại lệ localhost.

Tạo khóa mã hóa và cron secret trên máy của bạn:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Giá trị đầu dành cho `TOKEN_ENCRYPTION_KEY`, giá trị sau dành cho `CRON_SECRET`. Không đưa khóa thật vào Git.

## 3. Biến môi trường

| Biến                            | Bắt buộc khi                 | Nội dung                                                           |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Dữ liệu thật                 | URL project Supabase                                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dữ liệu thật                 | Public anon key                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`     | Dữ liệu thật                 | Secret, chỉ server                                                 |
| `ADMIN_EMAIL`                   | Dữ liệu thật                 | Email user Supabase làm admin                                      |
| `NEXT_PUBLIC_SITE_URL`          | Dữ liệu thật                 | Origin ứng dụng, ví dụ `https://ads-hub.example.com`               |
| `META_ACCESS_TOKEN`             | Kết nối bằng System User     | Token đọc các tài khoản đã được gán                                |
| `META_API_VERSION`              | Khuyến nghị đặt rõ           | Phiên bản Marketing API còn được app hỗ trợ                        |
| `META_APP_ID`                   | OAuth                        | ID Meta App                                                        |
| `META_APP_SECRET`               | OAuth                        | Secret app; cũng dùng tạo appsecret_proof nếu có                   |
| `TOKEN_ENCRYPTION_KEY`          | OAuth / token / khóa Meta AI | Khóa 32 byte mã hóa base64                                         |
| `MODEL_API_KEY`                 | Tùy chọn                     | Khóa Meta Model API dự phòng phía server; có thể nhập từ giao diện |
| `CRON_SECRET`                   | Cron                         | Chuỗi ngẫu nhiên bí mật                                            |
| `APP_TIMEZONE`                  | Tùy chọn                     | Mặc định `Asia/Ho_Chi_Minh`; sync từng account dùng timezone Meta  |

Trang **Cài đặt & kết nối** chỉ báo biến đã có, không chứng nhận token còn hợp lệ. Kết nối/sync thành công mới xác nhận truy cập thực tế.

### Kết nối Meta AI và quản lý prompt

1. Mở **Meta AI & prompt** trong menu. Nút **Đăng nhập Meta Model API** mở cổng chính thức của Meta; đăng nhập/đăng ký rồi vào **API keys → Create API key**. Meta xác thực lời gọi bằng API key, theo [hướng dẫn chính thức](https://dev.meta.ai/docs/authentication). Phiên đăng nhập Facebook Ads hoặc Meta AI trên web không tự cấp quyền API cho Ads Hub.
2. Đặt tên kết nối, nhập API key, chọn **Tự động chọn model khả dụng** và nhấn **Kiểm tra & kết nối**. Server gọi `/models`, chọn model hợp lệ rồi lưu khóa mã hóa AES-GCM. Sau khi lấy được danh sách, bạn có thể đổi model và kiểm tra lại. Tên kết nối do người dùng đặt; không phải danh tính tài khoản được API xác minh.
3. Tạo/sửa/nhân bản/xóa prompt và chọn **Dùng mặc định**. Có hai prompt khởi đầu. Các biến hỗ trợ: `{{since}}`, `{{until}}`, `{{target_cpa}}`, `{{campaign_count}}`, `{{account_count}}`, `{{currency}}`. Tối đa 50 prompt, mỗi prompt 20–20.000 ký tự.
4. Trở về Tổng quan, chọn bộ lọc và prompt rồi nhấn **Phân tích bằng Meta AI**, hoặc nút phân tích ở một chiến dịch. Mỗi lượt đọc lại prompt mới nhất từ server, lấy dữ liệu đúng workspace và các bộ lọc, tổng hợp kỳ hiện tại/kỳ trước, rồi gọi `https://api.meta.ai/v1/chat/completions`.
5. Kết quả hiển thị model, prompt đã gửi, phạm vi và token sử dụng nếu Meta trả về. Lỗi API, giới hạn hoặc thiếu cấu hình được báo trực tiếp; không tạo đề xuất giả. Demo chỉ xem giao diện, không gọi AI hoặc lưu khóa.

Kết nối và prompt được lưu dạng JSON trong bucket Supabase Storage riêng tư `ads-hub-ai`, chia thư mục theo workspace. Bucket được tạo tự động khi lưu lần đầu; không cần migration SQL bổ sung. Server dùng Secret/service key; API quản lý chỉ dành cho admin. Khóa luôn mã hóa, không trả ra API/localStorage. Đọc cấu hình không dùng cache; upload đặt cache 0 để lượt sau nhận prompt mới nhất. Không đổi `TOKEN_ENCRYPTION_KEY` tùy tiện. Ngắt kết nối cũng tắt khóa dự phòng từ env cho workspace đó.

Phân tích chỉ dùng dữ liệu VND đang theo dõi. Các chiến dịch không có insight trong cả hai kỳ được đếm và ghi rõ, thay vì tạo số liệu. Phạm vi quá 500.000 ký tự phải thu hẹp bộ lọc; ứng dụng không âm thầm cắt dữ liệu. Tổng quan dùng trạng thái chiến dịch hiện tại đã đồng bộ. Kết quả chỉ tồn tại trong lượt xem; có thể sao chép nội dung. Chưa có khóa thì chưa thể kiểm chứng phân tích trực tiếp với tài khoản Meta AI của bạn.

## 4. Deploy lên Vercel

1. Đẩy thư mục repository này lên GitHub/GitLab/Bitbucket của bạn. Không đưa `.env.local`, `node_modules`, `.next` vào repo.
2. Import repository tại Vercel, Framework Preset **Next.js**, Node.js **22.x**.
3. Điền env theo bảng trên. Nếu chưa biết domain chính thức, chọn tên project trước; sau deployment, cập nhật `NEXT_PUBLIC_SITE_URL` đúng domain và redeploy.
4. Dùng gói **Vercel Pro** để giữ lịch 30 phút trong `vercel.json`. Vercel Hobby chỉ cho cron hằng ngày và sẽ từ chối lịch `*/30 * * * *`. [Giới hạn cron chính thức](https://vercel.com/docs/cron-jobs/usage-and-pricing).
5. Deploy. Vercel đăng ký cron từ file cấu hình; `CRON_SECRET` được gửi trong Authorization header khi Vercel gọi cron. [Bảo vệ cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
6. Đăng nhập → kết nối Meta → bật theo dõi → đồng bộ → tạo khách hàng và báo cáo tháng.

### Tạo link Deploy một lần bấm cho repo của bạn

```bash
npm run deploy:link -- https://github.com/OWNER/REPO
```

Thay URL bằng **repo thực đã push**. Lệnh in link Vercel Deploy đã điền repository và danh sách biến cần nhập. Có thể dùng link này cho nút “Deploy with Vercel” trong README của repo. Chưa có repo từ xa hoặc khóa dịch vụ thì không thể tạo một deployment hoạt động thật chỉ bằng file ZIP.

Nếu dùng Hobby, bỏ `crons` khỏi `vercel.json` và dùng scheduler ngoài gọi GET `/api/cron/sync` mỗi 30 phút với đúng bearer secret; hoặc đổi lịch thành hằng ngày. Không có scheduler ngoài được tự tạo trong dự án này.

## Tính năng và quy tắc dữ liệu

- Bộ lọc BM → tài khoản → chiến dịch tự reset cấp con; khoảng hôm nay, hôm qua, 3/7/14 ngày thay đổi KPI, biểu đồ, bảng và phân tích. Mặc định 7 ngày.
- Bộ lọc trạng thái chiến dịch mặc định **Tất cả trạng thái**, gồm Đang chạy, Tạm dừng, Đã lưu trữ, Đã xóa và các trạng thái khác có trong dữ liệu. Dùng trạng thái hiện tại đã đồng bộ từ Meta; áp dụng cho lựa chọn chiến dịch, KPI, biểu đồ, bảng và phân tích. Đổi trạng thái bỏ chọn chiến dịch cụ thể và trở về trang 1.
- Cả ba bảng chiến dịch, tài khoản quảng cáo và báo cáo theo ngày có phân trang **20 / 50 / 100 dòng**, mặc định 20. Đổi bộ lọc, tìm kiếm, sắp xếp, khách hàng, tháng hoặc số dòng sẽ về trang 1; dữ liệu giảm tự chuyển về trang hợp lệ. KPI, tổng tháng và file xuất vẫn dùng toàn bộ dữ liệu trong phạm vi đã chọn.
- Dashboard chỉ cộng tài khoản VND để tránh trộn tiền tệ. Mỗi khách hàng chỉ gán các tài khoản cùng một đơn vị tiền; quy tắc được kiểm tra cả API và SQL.
- KPI ROAS = tổng doanh thu / tổng chi tiêu; CPA = chi tiêu / số mua; CTR = nhấp / hiển thị × 100. Không lấy trung bình số trung bình. Kết quả của dashboard là **lượt mua**, không tự coi mọi loại action là conversion.
- Biểu đồ cho thấy ba chuỗi theo thang tương đối riêng để không nhầm VND với ROAS; tooltip có số thật. Chọn 14 ngày để xem đủ 14 điểm.
- `balance` của Meta được gọi rõ là số dư cần thanh toán; không coi là tiền còn trong ví. Chi tiêu tháng lấy từ daily insights, không dùng `amount_spent` lifetime làm chi tiêu tháng.
- `daily_budget` là ngân sách cấp campaign. Nếu camp dùng ngân sách cấp ad set, UI ghi “Theo nhóm QC”.
- Reach cộng dồn theo ngày/camp có thể trùng người; được ghi chú rõ, không quảng bá là unique reach tháng. Rule tần suất dùng giá trị campaign-day từ Meta.
- Chỉ số Meta dạng action được chuẩn hóa về `actions:lead`, `actions:purchase`; không cộng trùng aliases `purchase`, `omni_purchase`, `offsite_conversion.fb_pixel_purchase`.
- Meta insights dùng attribution của account và `action_report_time=conversion`; số liệu có thể khác Ads Manager nếu giao diện Ads Manager chọn attribution, timezone hoặc reporting time khác.
- Báo cáo có đủ ngày trong tháng, sort từng cột, dòng tổng và các cột tùy chỉnh. Chia cho 0 trả “—”; ngày tương lai không tạo số liệu giả. Ngày quá khứ chưa đồng bộ có thể là 0: xem thời gian đồng bộ và lỗi account trước khi gửi khách hàng.
- Excel giữ ô số, định dạng tiền, tên cột, chỉ số tùy chỉnh và thứ tự sort đang xem. PDF nhúng Noto Sans tiếng Việt, tự phân trang và chỉ có tổng ở cuối tài liệu.
- Admin “Xem như Khách hàng” là preview của email đang chọn; tài khoản khách hàng thật đăng nhập bằng email riêng và server chỉ trả các thư mục/tài khoản được gán.
- Khách hàng có thể xuất báo cáo; không thể tạo/sửa report config, gán account, kết nối Meta hay kích hoạt sync.
- Meta AI dùng prompt đã lưu và dữ liệu lọc được đọc lại từ server. Kết quả cũ bị ẩn khi đổi phạm vi, prompt, CPA mục tiêu hoặc phiên bản dữ liệu. Không tự áp dụng thay đổi quảng cáo.
- Cỡ chữ dùng thang 16px cho nội dung, 14px cho dữ liệu/nút và tối thiểu 12px cho chú thích trên cả mobile. Nhãn ngày biểu đồ giữ kích thước chữ theo chiều rộng thực của vùng vẽ.

## Phiên đăng nhập và lưu trữ

`ads_hub_session` có `email`, `fb_user_id`, `loginAt`, `lastActive`, `role`, thêm cờ `demo` nếu dùng mẫu. Mỗi click cập nhật lastActive, timer 60 giây kiểm tra 7 ngày không hoạt động. Tab quay lại cũng kiểm tra hết hạn. Phiên quá hạn bị đưa về login với thông báo đúng yêu cầu.

Cookie `ads_hub_sid`: token ngẫu nhiên, HttpOnly, SameSite=Lax, Secure trong production. DB chỉ giữ SHA-256 của token. API kiểm tra expiry và user Supabase trước khi trả dữ liệu; hoạt động người dùng gia hạn phiên phía server, throttle tối đa khoảng 1 request/phút. Poll/sync nền không gia hạn phiên. Logout xóa phiên server và cache metadata; mẫu vẫn lưu riêng trong `ads_hub_demo_data`.

`ads_hub_fb_accounts` là cache có scope email. Supabase là nguồn dữ liệu thật; app luôn tải dữ liệu được phân quyền từ server sau F5. Không có Meta token hay service key trong browser cache.

## Đồng bộ và cron

```json
{ "crons": [{ "path": "/api/cron/sync", "schedule": "*/30 * * * *" }] }
```

Cron lấy account `is_tracked=true`, đồng bộ tháng hiện tại, mở rộng ngược tối thiểu 28 ngày để KPI có kỳ so sánh. Từng account dùng timezone do Meta trả về. Đồng bộ tháng lịch sử dùng nút **Đồng bộ tháng**; cron không kéo lại toàn bộ lịch sử mỗi lượt.

Meta có phân trang, timeout, retry lỗi tạm thời/rate limit. Account có lease chống chạy đồng thời. Chỉ thay dữ liệu ngày sau khi đã tải xong toàn bộ range: RPC xóa và ghi range trong một transaction, nên dữ liệu attribution bị Meta sửa/xóa không để lại bản ghi cũ. Lỗi giữa chừng giữ dữ liệu cũ và lưu `last_sync_error`.

Lượt chạy giới hạn khoảng 240 giây trước trần function 300 giây, ưu tiên account lâu chưa cập nhật; account chưa làm xong sẽ chờ lượt sau hoặc người dùng chạy lại. Vì vậy không hứa mọi account rất lớn đều xong trong một lượt 30 phút. Với hàng trăm account hoặc insights lớn, cần chuyển sang async insights jobs/queue; thiết kế này dành cho workspace cá nhân.

Timer trình duyệt 30 phút gọi sync khi admin đang xem báo cáo; client chỉ tải lại dữ liệu được cron cập nhật. Vercel cron tiếp tục chạy khi đóng browser. Báo cáo cũ được giữ trong DB sau khi đóng tab.

## API

Các endpoint ghi cần cookie hợp lệ và Origin bằng `NEXT_PUBLIC_SITE_URL`, trừ callback OAuth dùng `state`.

| Endpoint                            | Quyền                     | Chức năng                                                                          |
| ----------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/auth/login`              | Public                    | `{email,password}` → tạo phiên sau xác thực Supabase                               |
| `GET /api/auth/session`             | Đã đăng nhập              | Đọc phiên không gia hạn                                                            |
| `POST /api/auth/session`            | Đã đăng nhập              | Gia hạn sau hoạt động                                                              |
| `POST /api/auth/logout`             | Đã đăng nhập              | Thu hồi phiên                                                                      |
| `POST /api/connect`                 | Admin                     | Dùng env token; hỗ trợ `{token}` và xác minh `/me`, không tin `fbUserId` client    |
| `GET /api/accounts`                 | Admin                     | Danh sách account đang tracked                                                     |
| `PATCH /api/accounts`               | Admin                     | `{id,is_tracked}`                                                                  |
| `DELETE /api/accounts`              | Admin                     | Ngắt kết nối; xóa account/BM/camp/insights/link gán, giữ client và cấu hình report |
| `GET /api/data?month=YYYY-MM`       | Đã đăng nhập              | Dữ liệu đúng phạm vi user; không trả encrypted token                               |
| `GET/POST/PUT /api/clients`         | GET theo quyền; ghi Admin | Quản lý folder và gán tài khoản                                                    |
| `POST /api/reports`                 | Admin                     | `{client_id,month,config}` upsert cấu hình                                         |
| `POST /api/sync`                    | Admin                     | `{month?,client_id?}`                                                              |
| `GET /api/cron/sync`                | Bearer secret             | Đồng bộ tracked accounts; 207 nếu có account lỗi/bị hoãn                           |
| `GET /api/facebook/start`           | Admin                     | Bắt đầu OAuth popup                                                                |
| `GET /api/facebook/callback`        | Admin + OAuth state       | Hoàn tất kết nối                                                                   |
| `GET /api/facebook/connection`      | Admin                     | Xác minh danh tính các nguồn token đang dùng cho tài khoản đã lưu                  |
| `GET /api/ai/settings`              | Admin                     | Cấu hình kết nối và thư viện prompt, không trả khóa                                |
| `POST/DELETE /api/ai/connection`    | Admin                     | Xác minh/lưu model và khóa mã hóa; ngắt kết nối                                    |
| `POST/PATCH/DELETE /api/ai/prompts` | Admin                     | Lưu prompt, chọn mặc định, xóa                                                     |
| `POST /api/ai/analyze`              | Admin                     | Lấy lại dữ liệu theo workspace/bộ lọc, gọi Meta AI với prompt đã lưu               |
| `GET /api/status`                   | Public                    | Chỉ trạng thái có/chưa có env, không lộ giá trị                                    |

## Kiểm thử

```bash
npm test
npm run build
npm audit
```

Test chạy không cần credentials thật: PostgreSQL engine PGlite kiểm tra schema/RLS/giao dịch, test phiên/CSRF/mã hóa, Meta response fixtures, toán báo cáo và xuất file. Chi tiết kiểm thử thủ công và giới hạn xác minh ở `docs/verification.md`.

Không thể xác nhận OAuth thật, permissions Meta, dự án Supabase hay cron Vercel của bạn khi chưa có cấu hình dịch vụ. Build thành công và chế độ mẫu không thay cho kiểm thử kết nối thật. Trước khi đưa khách hàng vào dùng, thực hiện checklist triển khai trong tài liệu verification.

## Cấu trúc

```text
components/      Login, layout, dashboard, accounts, report builder, UI primitives
pages/api/      Auth, Meta connect/OAuth, data, clients, reports, sync, cron
lib/            Supabase, auth/security, Meta client, sync, metrics, export, demo
supabase/       schema.sql (8 bảng + RLS + transactional RPCs)
public/fonts/   Noto Sans và giấy phép OFL
styles/         Tailwind directives và hệ thống giao diện responsive
tests/          Logic, Postgres/RLS, bảo mật, Meta pagination và xuất file
scripts/        Sinh link Vercel Deploy cho repository thật
docs/           Thiết kế và biên bản kiểm thử
```

Nếu gặp `401`: đăng nhập lại hoặc kiểm tra session/user bị thu hồi. `403 Origin`: kiểm tra site URL. `503`: bổ sung env được chỉ ra. Lỗi Meta 190: kết nối/token lại; lỗi quyền: kiểm tra app và assets gán System User. Xem lỗi từng account ở trang tài khoản và Vercel function logs; không dán token vào log khi tự debug.
