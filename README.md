# Viral Network Web — Supabase (bản chuyển đổi đầu tiên)

Nguồn giao diện và quy tắc nghiệp vụ: V20.30.22 (bỏ thumbnail trong thông báo), ngày 13/10/2026.
Nền triển khai: Next.js từ ERP-Khung-Clone. Không còn phụ thuộc Google Apps Script/Google Sheets khi chạy.

## Những gì được chuyển

- Giao diện HTML/CSS và mã tương tác hiện tại, mobile/PC, thanh điều hướng, popup lỗi, tìm kiếm và bộ lọc ngày/thống kê.
- Quy tắc Công việc/Sản xuất của chính source V20.30.22, gồm phân công theo năng lực, nhiều VJ/Editor, Raw/Voice/Final, tiến độ, lịch sử, xóa mềm/khôi phục.
- Quyền giám đốc chỉ xem Công việc/Sản xuất theo bản hiện tại. Chức năng HR, tài chính và bảng tin giữ quy tắc source.
- Chấm công/GPS/đi quay, nghỉ phép, thiết bị, cuộc họp, bill/ảnh chuyển khoản, bảng tin/bình luận/thích, hiệu suất.
- Đăng nhập web bằng Supabase Auth; trong Telegram kiểm tra chữ ký initData bằng bot token phía server. Token Apps Script cũ không được chấp nhận.
- Đính kèm lưu trong Supabase Storage private. Thông báo dùng hàng đợi Supabase và tác vụ gửi mỗi phút.

## Kiến trúc và giới hạn cần biết

Đây là bản chuyển đổi tương thích, không phải bản viết lại từng nghiệp vụ thành bảng SQL riêng.
`web/server/viral/business.gs` giữ mã nghiệp vụ hiện hành. `runtime.mjs` cung cấp lớp tương thích dữ liệu để mã đó chạy trong Node.js. Dữ liệu các bảng được lưu dạng JSONB trong `viral_state`; CAS theo version chống ghi đè đồng thời. Những thao tác trình bày Google Sheets được bỏ qua vì giao diện web đảm nhiệm việc hiển thị. Các trigger Apps Script được thay bằng tác vụ web.

Bảng `viral_members` liên kết tài khoản web với nhân viên; vai trò nghiệp vụ lấy từ Employees trong dữ liệu, không lấy từ metadata do người dùng gửi. `viral_outbox` lưu việc gửi Telegram và chống enqueue trùng bằng khóa sự kiện. Chỉ server service role có quyền đọc các bảng này; API gọi lại kiểm tra quyền nghiệp vụ gốc.

Kiến trúc JSONB ưu tiên giữ đúng hành vi của bản hiện tại. Toàn bộ dữ liệu được nạp khi gọi API; cần đo tải thật và chuyển sang bảng quan hệ/index riêng nếu dữ liệu lớn hoặc có nhiều thao tác đồng thời. Không cam kết nhanh hơn bản hiện tại trước khi đo.

Module ERP gốc còn ở `erp-reference` để tham khảo, chưa nối dữ liệu với app mới. Không chạy bot ERP cũ hoặc migration ERP cũ cho app này.

Chưa tích hợp luồng /start xác nhận đăng nhập cũ: web dùng email/mật khẩu, Telegram dùng initData. Tài khoản được tạo trên app cho Telegram chưa tự có tài khoản email; dùng script cấp tài khoản web. Khi đăng xuất web không thu hồi initData Telegram; đóng/mở Telegram theo phiên của nền tảng.

Không có service worker/offline hay gói App Store/Google Play. Có manifest cho biểu tượng mở web.

## 1. Chuẩn bị Supabase mới

1. Tạo project Supabase mới để thử nghiệm, tắt tự đăng ký tài khoản nếu đây là hệ nội bộ.
2. Chạy **duy nhất** `supabase/viral-foundation.sql` trong SQL Editor. SQL tạo 3 bảng, hàm CAS/claim, và bucket private `viral-files`.
3. Sao chép `web/.env.local.example` thành `web/.env.local`, điền URL, anon key, service role key. Giữ service key/bot token/CRON_SECRET phía server.
4. Chọn khởi tạo dữ liệu mới hoặc nhập dữ liệu cũ ở bước dưới. Không thực hiện cả hai lên cùng một project.

## 2A. Khởi tạo dữ liệu mới để thử

Cần Node.js 22 trở lên. Cài dependency:

```bash
cd web
npm ci
cd ..
```

Sao chép `viral-members.example.json` thành `viral-members.json`, thay toàn bộ thông tin ví dụ, đặc biệt Telegram ID thật, email và mật khẩu >=12 ký tự. Có ít nhất một Leader để tạo dự án/Idea vì giám đốc chỉ xem Sản xuất. `job_title` cần rõ VJ, Editor, Cam-op... để bộ chọn người nhận diện năng lực.

```bash
node --env-file=web/.env.local scripts/viral-init.mjs viral-members.json
```

Script không ghi đè dữ liệu đã có. Nếu lỗi giữa bước tạo tài khoản, kiểm tra Supabase Auth và bảng viral_members trước khi tiếp tục; không xóa dữ liệu để chạy lại. Giữ tệp chứa mật khẩu an toàn và không commit.

## 2B. Nhập dữ liệu hiện tại

Xuất từng tab dữ liệu gốc Google Sheets thành CSV UTF-8 và đặt tên đúng tab: Employees.csv, ProductionItems.csv, Tasks.csv, Attendance.csv, Settings.csv, Projects.csv... Đừng xuất tab trình bày tổng hợp thay cho tab dữ liệu gốc. Dùng định dạng ngày ISO như source, ID/STK giữ nguyên chuỗi và không bị Excel đổi sang số khoa học.

Cấu trúc thư mục:

- `export/main/`: các bảng vận hành chính.
- `export/private/`: BankProfiles và các bảng nhân sự riêng, nếu có.

```bash
node --env-file=web/.env.local scripts/viral-import-csv.mjs export
```

Chỉ nhập vào project chưa có `viral_state.main`. Header phải là tên cột gốc từ source, không phải nhãn đã dịch của tab hiển thị. Các thông báo pending/failed cũ được chuyển thành migration_hold để tránh gửi lại. So sánh số bản ghi, ID, mốc ngày, lịch sử và thử với tài khoản từng vai trò trước khi chuyển hệ đang dùng. Script CSV không chuyển ảnh Drive cũ: cần di chuyển tệp ảnh và cập nhật metadata/ID tương ứng; đừng chuyển production khi chưa hoàn tất việc này.

Cấp tài khoản web cho nhân viên đã có trong dữ liệu (đặt biến môi trường VIRAL_USER_EMAIL, VIRAL_USER_PASSWORD, VIRAL_EMPLOYEE_ID):

```bash
node --env-file=web/.env.local scripts/viral-add-web-user.mjs
```

## 3. Chạy và kiểm tra

```bash
cd web
npm run typecheck
npm run test:viral
npm run build
npm run dev
```

Mở http://localhost:3000. Trang đầu chuyển sang giao diện Viral. Đăng nhập bằng tài khoản được cấp. Chưa cấu hình Supabase thì chỉ hiện màn hình đăng nhập; không giả dữ liệu production.

## 4. Đưa lên Vercel

- Đẩy source vào repository private, không đẩy node_modules, .next, .env.local, viral-members.json hoặc tệp xuất dữ liệu.
- Import repo trên Vercel, Root Directory = `web`, Framework = Next.js.
- Điền biến từ web/.env.local.example trong cấu hình môi trường của Vercel.
- Deploy, đặt VIRAL_WEB_URL thành URL HTTPS được cấp rồi redeploy.
- Nếu mở trong Telegram, đặt URL đó cho Mini App trong BotFather và dùng đúng TELEGRAM_BOT_TOKEN. Bản hiện tại không thay webhook hoặc bot đang chạy.

## 5. Thông báo Telegram

Đặt CRON_SECRET ngẫu nhiên dài, TELEGRAM_BOT_TOKEN và VIRAL_WEB_URL.
Tác vụ máy chủ gọi GET /api/viral/cron mỗi phút với Authorization: Bearer <CRON_SECRET>. Hoặc chạy:

```bash
node --env-file=web/.env.local scripts/viral-notifications.mjs
```

Giữ tiến trình này chạy trên máy chủ. Source không tự cài dịch vụ scheduler hay tự cấp hosting cho bot. Không chạy thêm bot cũ cùng gửi các sự kiện tương tự khi chuyển hệ.

Thiết lập group_chat_id, HR/kế toán, tọa độ văn phòng, lịch làm việc theo công ty. Thông báo chỉ gửi khi có scheduler và token hợp lệ. Gửi Telegram theo cơ chế retry; trường hợp mạng đứt sau khi Telegram nhận nhưng trước khi lưu kết quả có thể gây gửi lại. Kiểm tra hàng đợi khi attempts đạt giới hạn.

## Kiểm chứng đã thực hiện

Xem VALIDATION.md. Build/kiểm thử cục bộ không thay cho kiểm thử tích hợp Supabase/Telegram với tài khoản và dữ liệu thật.
