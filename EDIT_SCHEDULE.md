# Lịch quay và lịch dựng

Mục **Tiện ích → Lịch quay và lịch dựng** và thẻ cùng tên ở Trang chủ hiển thị Google Sheet **"Order lịch quay & Dựng"** theo tuần, ngày, kênh. Trang có 2 phần, chuyển qua lại bằng 2 nút ở đầu trang:

- **🎥 Lịch quay:** đọc các tab `THÁNG <số> | LỊCH QUAY`.
- **✂ Lịch dựng:** đọc các tab `THÁNG <số> | TASK DỰNG`.

App **chỉ đọc**: không có nút thêm hay sửa, không bao giờ ghi vào Sheet. Muốn đổi lịch thì sửa trên Sheet.

## Cài đặt

1. **Chia sẻ Sheet:** chia sẻ Sheet cho email trong biến `GOOGLE_SERVICE_ACCOUNT_EMAIL` trên Vercel, quyền **Người xem**.
2. **ID Sheet:** mặc định là `1caT7N_ZIeSvnYW_i7I3aze-5C2YltF-mTHiCxspi7Os`. Muốn đổi sang Sheet khác thì đặt biến `EDIT_SCHEDULE_SHEET_ID` trên Vercel.
3. Không cần chạy SQL.

## Khung Sheet app đọc được

**Tab:**
- Mỗi tháng một tab. Tên tab có `LỊCH QUAY` hoặc `TASK DỰNG`; số dấu cách quanh dấu `|` không quan trọng.
- App đọc 24 tab hiển thị gần nhất và bỏ qua tab ẩn.

**Tuần trong một tab:** mỗi tab có nhiều tuần xếp từ trên xuống. Mỗi tuần gồm:
1. **Dòng tiêu đề tuần** dạng `30/11 - 06/12`, ở một trong 3 cột đầu.
2. **Dòng ngày** `30/11/2026` …. Mỗi ngày là một ô **gộp** phủ các cột của ngày đó.
3. Dòng thứ (`THỨ 2` … `CHỦ NHẬT`).
4. **Dòng tiêu đề cột:** `KÊNH`, (`BUỔI` cho lịch quay), rồi tên các cột của mỗi ngày:
   - Lịch quay: **Giờ dự kiến · Địa điểm · Loại · Người quay**.
   - Lịch dựng: **Tên Task · Loại · Người Phụ Trách**.
5. **Các kênh:** mỗi kênh là một khối dòng, ô kênh gộp theo chiều dọc. Ô kênh ghi tên kênh, `PT: <người phụ trách>` và, nếu có, `Lịch đăng bài: …`.

**Cách đọc ô:**
- **Vị trí cột:** lấy từ vùng ô gộp (đọc qua Sheets API) và chữ ở dòng tiêu đề cột. Chèn, bớt hay đổi thứ tự cột vẫn đọc đúng, miễn giữ tên cột.
- **Lịch quay:**
  - Cột `BUỔI` ghi `Sáng` / `Chiều`. Các dòng bên dưới thuộc cùng buổi cho tới khi gặp buổi mới.
  - Một suất quay chỉ được tính khi có **giờ, địa điểm hoặc người quay**.
- **Lịch dựng:**
  - Một task chỉ được tính khi có **tên task hoặc người phụ trách**.
  - Nhiều dòng trong ô Tên Task (Alt+Enter) là nhiều task; nếu ô người có cùng số dòng thì ghép từng cặp.
- **Ô chỉ có "Loại"** (dòng mẫu) bị bỏ qua.
- **Nhiều người trong một ô:** ngăn bằng dấu phẩy, `;`, `/`, `&`, `+` hoặc chữ "và".
- **Màu và link:** màu nền ô địa điểm (lịch quay) hoặc ô tên task (lịch dựng) hiện thành vạch màu bên trái mục đó. Link trong ô hiện thành nút "Mở link".

## Ai thấy gì

- **Mọi nhân viên đang hoạt động** xem được cả hai phần. Có nút **★ Lịch quay của tôi / Task của tôi**, và bộ lọc theo người quay hoặc người phụ trách.
- **Thẻ trang chủ:** hiện suất quay và task dựng hôm nay có tên mình. Leader và Ban giám đốc thấy thêm tổng số suất quay, tổng số task dựng hôm nay và các kênh chưa có task dựng.
- **Ghép tên:** không phân biệt dấu và hoa thường. Tên từ hai chữ trở lên khớp được với phần cuối họ tên trên app ("Minh Thi" khớp "Nguyễn Minh Thi"); tên một chữ phải trùng hẳn.

## Kỹ thuật

- **Đọc và phân tích:** `web/server/viral/edit-schedule.mjs`.
  - Đọc bằng Google Sheets API với quyền `spreadsheets.readonly`, chỉ gửi yêu cầu GET.
  - Một lần đọc lấy mọi tab cùng vùng ô gộp (`merges`). Dữ liệu được giữ trong bộ nhớ server 60 giây.
- **RPC:**
  - `editSchedule({kind:'shoot'|'edit', week, refresh})` cho trang.
  - `editScheduleToday()` cho thẻ trang chủ.
  - Kiểm tra đăng nhập trước khi đọc Sheet, dùng phạm vi đọc `personnel`, không ghi dữ liệu app.
- **Giao diện:** `web/public/viral/edit-schedule.js`.
  - Màn hình rộng hiện bảng tuần.
  - Dưới 760px hiện từng ngày một.
- **Test:**
  - `web/server/viral/test/edit-schedule.test.mjs`, dựng đúng khung hai tab thật.
  - Một ca trong `egress-rpc.test.mjs`.
