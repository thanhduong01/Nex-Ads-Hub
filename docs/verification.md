# Biên bản kiểm thử Ads Hub

Ngày kiểm tra: 25/10/2026. Next.js 15.5.28, React 18.3.1. Chưa có credentials Supabase/Meta hoặc project Vercel thật được cung cấp.

## Kiểm thử tự động

`npm test`: **37/37 đạt**, bao gồm các test con chạy trên PostgreSQL PGlite.

| Phạm vi       | Đã xác minh                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database      | Schema tạo đúng 8 bảng, tất cả bật RLS; client chỉ đọc folder/account được gán; admin chỉ đọc workspace của mình                                                                      |
| Ghi dữ liệu   | Gán account ngoài workspace hoặc khác tiền tệ bị từ chối; lỗi không làm mất các account đang gán; replace insights có tính lặp lại và xóa dữ liệu cũ đã bị Meta điều chỉnh            |
| Phân quyền    | Client không ghi report config, không gọi RPC ghi, không đọc token mã hóa hoặc phiên đăng nhập                                                                                        |
| Phiên         | Không thể đăng nhập bằng localStorage giả; hết hạn trước khi gia hạn; user không tự đổi role; hoạt động hợp lệ gia hạn thêm 7 ngày                                                    |
| Bảo vệ API    | CSRF từ chối origin sai/thiếu; token AES-GCM phát hiện sửa dữ liệu; token phiên lưu dưới dạng hash; cron từ chối secret thiếu/sai                                                     |
| Meta fixtures | Phân trang BM/insights, loại trùng account, fallback System User/personal account, không theo URL next tùy ý, phát hiện cursor lặp; lỗi token không bị che; deadline ngăn request mới |
| Chỉ số        | ROAS/CPA/CTR từ tổng có trọng số; chia 0 không sinh Infinity; custom total tính lại công thức; input không thực thi mã; khoảng ngày qua tháng/năm/năm nhuận và timezone               |
| AI            | Tôn trọng phạm vi campaign/ngày; CTR giảm chỉ xét hai cửa sổ 3 ngày đầy đủ; không cộng trùng purchase aliases                                                                         |
| Xuất file     | XLSX đọc lại giữ tên tiếng Việt, ô số, định dạng VND, tổng và custom metrics; PDF nhúng font tiếng Việt và tạo nhiều trang                                                            |

`npm run build`: thành công, gồm trang giao diện và 13 API routes. `npm audit`: **0 vulnerabilities** được báo tại thời điểm kiểm tra. Kết quả audit không bảo đảm mọi dependency không có lỗi chưa được công bố.

## Kiểm tra giao diện đã thực hiện

Trên server production (`npm run build` → `npm run start`), 10 kiểm tra HTTP đều đạt: trang chủ/status trả 200; data/accounts/session chưa đăng nhập trả 401; cron với header `x-vercel-cron` giả trả 401; login sai Origin trả 403; đúng Origin nhưng thiếu cấu hình Supabase trả 503; PATCH account chưa đăng nhập trả 401; phương thức không hỗ trợ trả 405. API có `Cache-Control: no-store`, trang chủ có `X-Content-Type-Options: nosniff`.

Kiểm tra trong trình duyệt thật với chế độ dữ liệu mẫu:

- Mở login và dashboard; xem 3 account, 6 campaign. Desktop 1440px và mobile 390px không có tràn ngang toàn trang sau khi layout ổn định; bảng báo cáo cuộn trong vùng riêng.
- Chọn BM Growth Partners → danh sách account chỉ còn Nếp; chọn account → 2 campaign; chọn một campaign và Hôm nay → KPI/bảng chỉ còn phạm vi đó.
- Mở báo cáo Lá Natural, tháng 10/2026: đủ 31 ngày, chi tiêu 30.498.389 VND, doanh thu 159.683.335 VND, 276 đơn, ROAS 5,24.
- Đổi nhãn `spend` thành **Chi phí QC**; tạo **ROAS thực = purchase_value / spend**; cột xuất hiện và tổng bằng 5,24.
- Bật xem như khách hàng: chỉ còn folder được chọn và ẩn nút chỉnh sửa. Đây là preview UI; kiểm tra quyền thực được chạy riêng ở lớp auth/database.
- Tải lại trang: phiên mẫu, tên cột và công thức đã lưu vẫn còn.
- Bấm xuất Excel và PDF: trình duyệt tải file thật và hiển thị toast thành công.

Trong giai đoạn cuối, công cụ báo **“Local browser use is disabled in Work settings”**. Vì vậy chưa chạy lại UI sau các sửa cuối: kiểu button trong form, hiệu ứng gõ chữ, xử lý localStorage lỗi và chỉnh PDF. Những thay đổi này đã qua production build; logic liên quan có test tự động. Không ghi nhận chúng là một lượt kiểm thử trình duyệt mới.

## Kiểm tra PDF bản cuối

Gọi chính hàm `pdfReport` của ứng dụng với dữ liệu Lá Natural, nhãn **Chi phí QC** và công thức **ROAS thực**. Render toàn bộ 2 trang bằng Poppler và xem ảnh từng trang:

- Font tiếng Việt hiển thị đầy đủ, bảng và header không bị cắt.
- Các ngày 26–31/10 chưa có dữ liệu hiển thị dấu “—”.
- Trang 1 không có dòng tổng; trang 2 có đúng một dòng tổng.
- Tổng chi tiêu 30.498.389 VND, doanh thu 159.683.335 VND và ROAS 5,24 khớp dữ liệu nguồn.
- Footer và số trang có trên cả hai trang. Nội dung cũng được đọc lại bằng pypdf/pdfplumber.

Đây là kiểm tra file tạo từ mã cuối, không phải một lượt bấm tải mới trên trình duyệt.

## Giới hạn kiểm chứng và kiểm tra sau triển khai

Code tích hợp dịch vụ thật đã được viết. Các kiểm tra fixture/PGlite không thay cho việc gọi project Supabase, tài khoản quảng cáo Meta hoặc lịch cron trên Vercel thật.

Sau khi cấu hình theo README:

1. Chạy schema trên Supabase mới, tạo admin và một user khách hàng; đăng nhập admin thành công.
2. Kết nối Meta bằng token được gán assets hoặc OAuth; đối chiếu BM/account với Business Settings. F5 và xác nhận vẫn có account.
3. Bật tracking một account, chạy đồng bộ. Đối chiếu vài ngày với Ads Manager dùng cùng timezone/attribution/reporting time. Kiểm tra `last_sync_error` rỗng.
4. Tạo client, gán account, tạo báo cáo tháng, đổi tên/chỉ số tùy chỉnh và xuất file.
5. Đăng nhập bằng user khách hàng trong phiên trình duyệt riêng. Xác nhận chỉ thấy folder được gán; thử gọi API ghi phải bị từ chối.
6. Trên môi trường thử nghiệm, đặt `expires_at` của phiên về quá khứ; request tiếp theo phải trả 401 và giao diện yêu cầu đăng nhập lại.
7. Deploy Vercel Pro với `CRON_SECRET`; xem Cron/Function logs sau mốc nửa giờ. Xác nhận request hợp lệ cập nhật `last_synced_at`, request không có bearer secret bị từ chối.
8. Nếu có account lỗi hoặc lượt sync chạm giới hạn thời gian, sửa quyền/token hoặc chạy lại; không coi báo cáo cũ là dữ liệu đã đồng bộ mới.

Chưa có deployment, repository từ xa hay job cron ngoài được tạo. ZIP và thư mục nguồn có thể cài bằng `npm ci`; dùng `npm run deploy:link -- <URL-repo-thật>` sau khi push để sinh link Vercel Deploy.

## Bổ sung: chẩn đoán lỗi đăng nhập sau khi cấu hình Supabase

Log thực tế cho thấy Auth chấp nhận đăng nhập, sau đó ghi `user_sessions` thất bại với `PGRST205`. Kiểm tra cấu hình chỉ in loại khóa xác nhận biến server đang chứa cùng JWT `anon` với biến public. Các truy vấn đọc metadata cũng báo thiếu bảng trong API/schema cache và thiếu cột `workspace_id` trên các bảng đã có. Chưa có quyền quản trị để xác nhận toàn bộ cấu trúc hoặc chạy migration; không kết luận các bảng cũ không có dữ liệu.

Đã bổ sung kiểm tra khóa public bị đặt nhầm vào biến server, thông báo thiếu schema có thể xử lý được, và `npm run setup:check` chỉ đọc, không in khóa hoặc dữ liệu. Backend trả mã 503 `SUPABASE_SERVER_KEY_REQUIRED` hoặc `SUPABASE_SCHEMA_REQUIRED` thay vì lỗi 500 chung.

Sau thay đổi: **41/41 test đạt**. Kiểm tra HTTP trên dev server xác nhận login trả đúng 503 và hướng dẫn sửa khóa; không gọi đăng nhập Supabase khi đã phát hiện khóa server sai. Các thay đổi này được kiểm tra qua test và API local; không ghi nhận là một lần đăng nhập thật thành công hoặc một lần build production mới. Database và file `.env.local` không bị thay đổi trong bước chẩn đoán này.

## Cập nhật sau khi kết nối Supabase

Đã xác nhận project Nex Ads đúng với URL trong `.env.local`, user admin tồn tại và email đã được xác nhận. Truy vấn đếm thực tế cho thấy cả 5 bảng legacy đều trống; không có view, trigger hoặc hàm ứng dụng public phụ thuộc vào chúng.

Đã áp dụng migration `20261025143207_align_ads_hub_schema` bằng kết nối Supabase. Migration giữ 5 bảng cũ ở `ads_hub_legacy`, tạo 8 bảng public đúng cấu trúc, bật RLS, phân quyền cột/RPC và bổ sung indexes cho các khóa ngoại. Hàm SECURITY DEFINER hỗ trợ RLS nằm trong schema riêng `ads_hub_private`, có kiểm tra UID; hai RPC public chạy SECURITY INVOKER.

Kiểm tra trực tiếp sau migration:

- Có đúng 8 bảng ứng dụng public, tất cả bật RLS; 5 bảng legacy vẫn được giữ.
- Anon và authenticated không có quyền đọc bảng phiên; authenticated không đọc token mã hóa và không gọi được hai RPC ghi.
- Không có SECURITY DEFINER function trong public.
- INSERT một phiên thử đã hết hạn bằng role `service_role` thành công, sau đó rollback toàn bộ giao dịch. Không tạo cookie hoặc đăng nhập thay người dùng.
- **43/43 test local đạt**, gồm migration chạy thành công trên cấu trúc legacy, giữ các bảng gốc và từ chối/rollback khi có dữ liệu.

Advisors không báo lỗi trên các policy của 8 bảng đang dùng. Các thông tin còn lại: [RLS không có policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) trên 5 bảng lưu trữ không cho browser truy cập; [thiếu primary key](https://supabase.com/docs/guides/database/database-linter?lint=0004_no_primary_key) trên bản lưu cấu trúc report_configs cũ; [indexes chưa được dùng](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) vì database mới; và cài đặt Auth [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) chưa bật. Các mục lưu trữ được giữ để bảo toàn cấu trúc gốc; không thay chính sách mật khẩu ngoài phạm vi sửa login.

Tại thời điểm sửa schema, còn chờ Secret key/service_role đúng trong `.env.local`. Kiểm tra INSERT trong database ở bước này chưa phải một lần đăng nhập thành công trên giao diện.

## Cập nhật 26/10/2026: đăng nhập thật qua API local đã đạt

Sau khi người dùng cập nhật khóa server, `npm run setup:check` xác nhận đầy đủ biến cấu hình, cấu trúc 8 bảng và quyền Supabase Auth Admin hợp lệ. Đã khởi động lại dev server ở `http://127.0.0.1:3000` để nạp cấu hình mới.

Kiểm tra qua API HTTP của ứng dụng với Supabase thật, dùng user và folder tạm:

- User quản trị hiện có tồn tại và đã xác nhận email.
- Khóa server có quyền tạo user Auth tạm và gọi RPC tạo folder.
- Mật khẩu sai trả 401; mật khẩu đúng trả 200 với cookie HttpOnly.
- Role được server cấp; gửi `role: admin` trong request không nâng quyền user khách hàng.
- Request tiếp theo đọc được phiên, expiry khoảng 7 ngày; hoạt động gia hạn phiên.
- Data API của ứng dụng chỉ trả folder của user thử; folder khác bị loại khỏi kết quả.
- User khách hàng không sửa được báo cáo (403).
- Logout trả 200 và cookie cũ không còn xác thực được (401).
- Đã xóa user Auth tạm, các folder thử và phiên thử sau khi hoàn thành.

Không đọc hoặc thay mật khẩu của user thật. Kết quả này xác minh luồng đăng nhập email/mật khẩu và session qua API local, không phải lượt kiểm tra bằng trình duyệt với mật khẩu của người dùng. Kết nối Meta và deploy Vercel vẫn ngoài phạm vi lượt kiểm tra này.

## Cập nhật 26/10/2026: sửa lỗi bắt đầu kết nối Facebook

Lỗi 503 ở `/api/facebook/start` do thiếu `TOKEN_ENCRYPTION_KEY`; App ID, App Secret và token Meta đã có. Đã tạo khóa ngẫu nhiên 32 byte dạng base64 trong `.env.local`, giữ khóa ở máy chủ và không đưa vào Git/ZIP. Kiểm tra mã hóa/giải mã AES-256-GCM bằng cấu hình local thành công.

Luồng OAuth kiểm tra chính xác biến còn thiếu, độ dài khóa và site URL trước khi chuyển sang Facebook. Lỗi ở bước bắt đầu được chuyển về luồng thông báo của ứng dụng thay vì để popup hiện JSON. Start và callback dùng chung cách tạo redirect URI; API status chỉ báo OAuth đã có cấu hình khi các kiểm tra này đạt.

- **47/47 test đạt**, gồm lỗi thiếu/sai khóa, URL OAuth không chứa secret, callback nhất quán và từ chối bắt đầu OAuth khi chưa đăng nhập.
- `npm run build` thành công.
- Gọi Graph API thật bằng token đang cấu hình xác nhận token hợp lệ và đọc được **20 tài khoản quảng cáo**; lượt truy vấn không trả về BM. Chỉ đọc dữ liệu để kiểm tra, chưa lưu tài khoản hay chạy đồng bộ chi tiêu trong lượt này.
- Khởi động lại dev server tại `http://127.0.0.1:3000`; cấu hình callback dùng cùng origin.

Đây chưa phải kiểm chứng trọn luồng OAuth: người dùng vẫn cần đăng nhập và cấp quyền trong cửa sổ Facebook. Chưa xác nhận cấu hình redirect URI hoặc trạng thái xét duyệt quyền trong Meta App Dashboard.

## Cập nhật tiếp theo: Facebook từ chối callback HTTP

Sau khi bổ sung khóa, người dùng gặp thông báo Facebook cho rằng Nex Ads không dùng kết nối bảo mật. Callback local đang dùng `http://127.0.0.1:3000/api/facebook/callback`. Kiểm tra cấu hình trước đó chấp nhận HTTP nên chưa phát hiện được điều kiện này.

Ads Hub hiện yêu cầu HTTPS cho OAuth ở cả bước kiểm tra trạng thái và bước tạo URL đăng nhập. Trên local HTTP, màn kết nối hiển thị lý do, vô hiệu hóa nút OAuth và làm nổi bật **Kết nối bằng System User Token** nếu token đã có. Demo vẫn dùng được. Đây là lựa chọn kết nối rõ ràng của người dùng; ứng dụng không tự đổi phương thức hoặc lưu thêm tài khoản.

Đã bổ sung hướng dẫn HTTPS/callback trong README. Cần có server HTTPS thật, đặt đúng `NEXT_PUBLIC_SITE_URL`, đăng ký URL `/api/facebook/callback` trong Meta App, và mở/đăng nhập ứng dụng qua cùng origin HTTPS. Chưa triển khai HTTPS hoặc thay đổi Meta App Dashboard trong lượt này. Token máy chủ đã được kiểm tra đọc 20 tài khoản ở lượt trước; không gọi lại hoặc thay đổi tài khoản Meta ở lượt này.

- **48/48 test đạt**, gồm từ chối HTTP trước khi tạo URL Facebook và kiểm tra URL HTTPS hợp lệ.
- `npm run build` thành công; dev server được khởi động lại tại `http://127.0.0.1:3000`.
- HTTP `/api/status` xác nhận OAuth chưa sẵn sàng vì HTTPS, trong khi token máy chủ vẫn có cấu hình.

## Cập nhật: cửa sổ kết nối chờ đồng bộ chi tiêu

Log local cho thấy `/api/connect` thành công trong khoảng 3,8–4,4 giây, nhưng hàm kết nối phía giao diện tiếp tục `await` cả `/api/sync` trước khi đóng cửa sổ. Các lượt sync ghi nhận mất khoảng 38 và 99 giây; trong lúc đó nút vẫn ghi “Đang lấy BM & tài khoản”. Kiểm tra Supabase xác nhận đã có 20 tài khoản, 19 tài khoản đồng bộ thành công và 1 tài khoản timeout.

Đã tách kết nối tài khoản và đồng bộ chi tiêu: cửa sổ đóng sau khi danh sách sẵn sàng, rồi sync chạy với thông báo trạng thái riêng. Bổ sung timeout cho API phía trình duyệt, giới hạn thời gian gọi Meta khi lấy tài khoản và thử lại có giới hạn với lỗi mạng tạm thời.

Tài khoản timeout có 2.315 chiến dịch. Kiểm tra riêng xác nhận danh sách chiến dịch đọc được qua 12 trang; Insights một ngày hoàn thành khoảng 3,5 giây, 7 ngày đầu tháng khoảng 10 giây, trong khi truy vấn cả tháng vẫn timeout. Với tài khoản có hơn 500 chiến dịch, sync hiện lấy Insights theo từng khoảng tối đa 7 ngày không chồng lặp. Chỉ gọi RPC thay dữ liệu sau khi lấy đủ mọi khoảng; lỗi giữa chừng không ghi bộ dữ liệu thiếu.

- **56/56 test đạt**, gồm API timeout, lỗi xác thực, retry có giới hạn thời gian, phân trang, chia khoảng ngày và từ chối trả kết quả thiếu khi một khoảng lỗi.
- Connector Supabase gặp lỗi transport trong lượt này; trạng thái dữ liệu được kiểm tra qua SDK của ứng dụng, chỉ in số lượng và lỗi đã lọc, không in khóa/token.
- Sau khi xác nhận workspace khớp admin đã cấu hình, chạy lại riêng tài khoản bị lỗi bằng `syncAccounts` với cách chia khoảng ngày: thành công trong khoảng **54 giây**. Đọc lại database xác nhận **20/20 tài khoản có thời điểm đồng bộ và không còn lỗi**; 19 tài khoản đã thành công trước đó không bị chạy lại trong bước này. Không thay đổi quảng cáo trên Meta.
- Build production thành công sau các thay đổi cuối. Dev server được khởi động lại và giữ chạy ở `http://127.0.0.1:3000`. Kiểm chứng gồm test, build, log HTTP và dữ liệu thật qua SDK; chưa kiểm tra thao tác đóng cửa sổ bằng trình duyệt tự động.

## Cập nhật: khôi phục BM và xác minh nguồn Facebook

Meta xác nhận token đang cấu hình là `SYSTEM_USER`; `/me/businesses` trả danh sách rỗng, nhưng `business{id,name}` trên 20 tài khoản trả đủ 7 BM sở hữu. Trước sửa, cả 20 tài khoản có `bm_id` rỗng nên dropdown chỉ có “Tất cả BM”. Mã lấy thêm trường business, lưu BM sở hữu và không gán tài khoản chia sẻ sang BM đối tác.

Đã chạy lại bước lấy danh sách tài khoản trong đúng workspace của admin, kiểm tra danh tính token khớp nguồn đã lưu trước khi ghi. Kết quả: **7 BM, 20 tài khoản đều có BM**, giữ nguyên ID, tracking, thời điểm đồng bộ và trạng thái lỗi. Không chạy lại đồng bộ chi tiêu. Tổng các phạm vi BM khớp toàn bộ tài khoản VND đang theo dõi và toàn bộ dòng báo cáo tương ứng; mỗi phạm vi chỉ chứa chiến dịch và báo cáo của tài khoản thuộc BM đó.

Trang tài khoản có panel **Nguồn kết nối Facebook**: tên, ID, loại token, app cấp token, cách kết nối và thời điểm xác minh. Kiểm tra trực tiếp xác nhận nguồn máy chủ khớp danh tính lưu trên cả 20 tài khoản. Panel cảnh báo khi token đổi danh tính hoặc không thể xác minh; không trả credential ra API.

- **65/65 test đạt**, gồm BM từ tài khoản System User, BM sở hữu của tài khoản chia sẻ, phạm vi lọc tài khoản/chiến dịch/báo cáo, nhóm chưa xác định BM, nhiều nguồn token, cảnh báo đổi danh tính, deadline kiểm tra danh tính và loại bỏ thông tin bí mật khỏi response.
- Production build thành công, bao gồm endpoint `/api/facebook/connection` và component hiển thị nguồn kết nối.
- Server local đã khởi động lại: `/` và `/api/status` trả 200; endpoint danh tính trả 401 khi không có phiên đăng nhập.
- Chưa chạy lại thao tác UI bằng trình duyệt tự động vì công cụ trình duyệt local đang bị tắt.

## Cập nhật: phân trang toàn bộ bảng dữ liệu

Ba bảng chiến dịch, tài khoản quảng cáo và báo cáo theo ngày dùng chung phân trang, mặc định 20 dòng với lựa chọn 50 và 100. Có nút trước/sau, số trang và khoảng dòng trên tổng số kết quả. Phân trang diễn ra sau tìm kiếm/sắp xếp; đổi phạm vi lọc hoặc số dòng trở về trang 1, dữ liệu giảm tự giới hạn trang hiện tại. Thanh điều khiển nằm ngoài vùng cuộn ngang của bảng. Dòng tổng báo cáo ghi rõ “Tổng tháng”; KPI, tổng tháng và đầu vào xuất Excel/PDF không bị cắt theo trang.

- **69/69 test đạt**. Kiểm tra các kích thước trang bao phủ dữ liệu theo đúng thứ tự, không thiếu/trùng dòng; trang cuối, bảng rỗng, dữ liệu giảm và điều hướng bảng lớn.
- Báo cáo 31 ngày chia 20 + 11 dòng; khi chọn 50 hiển thị đủ 31. Workbook Excel vẫn chứa đủ ngày và tổng chi tiêu toàn tháng.
- Production build thành công. Chưa chạy kiểm tra tương tác trình duyệt tự động do công cụ local bị tắt.

## Cập nhật: lọc trạng thái chiến dịch

Trang Tổng quan có dropdown trạng thái mặc định “Tất cả trạng thái”: Đang chạy, Tạm dừng, Đã lưu trữ, Đã xóa và các trạng thái khác xuất hiện trong dữ liệu. Bộ lọc dùng trạng thái hiện tại đã đồng bộ; kết hợp với BM/tài khoản để lọc lựa chọn chiến dịch, dữ liệu KPI, kỳ so sánh, biểu đồ, bảng và phân tích. Đổi trạng thái bỏ chọn chiến dịch cụ thể, reset phân tích và trở về trang 1. Nhãn bảng phân biệt trạng thái đã lưu trữ, đã xóa, chưa xác định và trạng thái Meta khác; chiến dịch đang chạy có nhãn hiệu quả vẫn ghi rõ trạng thái đang chạy.

- **71/71 test đạt**, gồm kết hợp BM/tài khoản/trạng thái, giới hạn nguồn dữ liệu chỉ số, trạng thái thiếu/khác và kết quả rỗng.
- Production build thành công. Kiểm tra bằng mã và build; chưa có lượt kiểm tra tương tác trình duyệt tự động mới.

## Cập nhật: Meta AI, prompt và cỡ chữ

Đã thay phần đề xuất theo luật bằng tích hợp Meta Model API thật: kết nối bằng API key, xác minh danh sách model, lưu model/khóa mã hóa, ngắt kết nối, quản lý prompt và chọn prompt mặc định. Nút đăng nhập mở cổng chính thức của Meta để người dùng đăng nhập/tạo khóa; không mô phỏng phiên đăng nhập Meta AI trong Ads Hub. Tên kết nối là nhãn người dùng đặt, không phải danh tính tài khoản đã được API xác minh.

Mỗi lượt phân tích đọc lại prompt mới nhất và truy vấn dữ liệu bằng workspace trong phiên server. Kết hợp đầy đủ bộ lọc, kỳ hiện tại/kỳ trước, CPA mục tiêu; chỉ gửi các trường số liệu tổng hợp và tên/ID cần thiết. Không gửi token quảng cáo, email đăng nhập hoặc khóa khác. Chiến dịch thiếu insight được đếm và ghi rõ; phạm vi quá lớn phải thu hẹp, không âm thầm cắt. Response hiển thị prompt thực tế, model, thời điểm, phạm vi và token nếu có; lỗi provider không chuyển sang đề xuất giả. Kết quả được render như văn bản, không thực thi HTML từ model.

Kiểm chứng:

- **78/78 test đạt** sau thay đổi: khóa mã hóa và không trả credential ra API, không ghi đè khóa đang dùng khi xác minh thất bại, cô lập workspace, prompt mới nhất mỗi lượt, mặc định/xóa prompt, tắt env fallback khi ngắt, các bộ lọc/ngày/kỳ trước, lỗi/timeout/rate limit và chặn truy cập chưa đăng nhập/cross-origin.
- Supabase thật: đã tạo bucket riêng tư `ads-hub-ai`, lưu/đọc một prompt tạm, xác nhận anonymous download bị từ chối, rồi xóa file thử. Hai prompt khởi đầu còn nguyên; không thay đổi tài khoản quảng cáo hoặc dữ liệu chi tiêu.
- Production build thành công với 4 endpoint AI. Chưa có API key Meta Model API trên máy nên **chưa xác minh lượt sinh phân tích thật với tài khoản của người dùng**; các lượt provider trong test dùng response giả lập và được phân biệt với kiểm chứng Storage thật.
- Cỡ chữ CSS chuyển sang thang 16px/14px/12px, bao gồm breakpoint mobile; tăng chiều cao điều khiển và cho phép nội dung nút xuống dòng. SVG biểu đồ dùng ResizeObserver theo chiều rộng thực, chữ nhãn 13px và bớt mốc ngày trên màn hình hẹp.
- Chưa có lượt kiểm tra trực quan/tương tác bằng trình duyệt tự động mới vì công cụ browser local trước đó bị tắt.

## Cập nhật: chẩn đoán cấu hình đăng nhập trên Vercel

Endpoint production `/api/status` trả `database: false`: ít nhất một biến bắt buộc chưa có trên bản deploy. Đây là kiểm tra trước Supabase Auth, không phải kết luận mật khẩu sai. Đã thay thông báo chung bằng mã `SUPABASE_ENV_REQUIRED` kèm danh sách tên biến còn thiếu; `/api/status` bổ sung `databaseMissing`, không trả giá trị hoặc email admin. Giá trị chỉ gồm khoảng trắng cũng được tính là thiếu.

- **79/79 test đạt**, bao gồm từng biến thiếu riêng lẻ, biến trống, lỗi login 503 trước khi gọi Auth và kiểm tra response không chứa các giá trị cấu hình.
- Đã dọn các dấu conflict Git còn sót trong README, tài liệu kiểm chứng và script chẩn đoán; giữ nguyên nội dung phía đã có. `node --check scripts/check-supabase.mjs` đạt.
- Production build local thành công. Thay đổi environment trên Vercel cần áp dụng đúng Production/Preview và tạo deployment mới; không sửa khóa hay cấu trúc database để bỏ qua điều kiện cấu hình.

Sau khi đối chiếu tên biến qua kết nối Vercel, xác nhận project đã có `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` nhưng mã yêu cầu các tên chuẩn khác. Đã bổ sung resolver server dùng chung cho trạng thái, login, Supabase clients và script kiểm tra. Hỗ trợ hai cách đặt tên, ưu tiên biến chuẩn, bỏ khoảng trắng đầu/cuối; vẫn từ chối anon/publishable trong khóa server. Không đọc hay đổi giá trị secret trên Vercel trong bước chẩn đoán này. **80/80 test đạt** sau sửa, gồm resolver alias, client thực sự dùng khóa đã resolve và ưu tiên biến chuẩn.
