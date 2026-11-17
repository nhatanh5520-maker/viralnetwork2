# Số liệu kênh

Mục **Tiện ích → Số liệu kênh**. Mỗi tuần, VJ phụ trách nhập số liệu 7 ngày (thứ Hai đến Chủ nhật) của từng kênh. Mỗi tháng nhập thêm số chính thức của cả tháng. Leader và Ban giám đốc xem tổng hợp, so sánh với kỳ trước, xem kênh còn thiếu và xuất Excel.

## Triển khai

1. **Deploy web**: merge Pull Request vào `main`, đợi Vercel báo *Ready*.
2. **Chạy SQL**: mở Supabase → SQL Editor, dán **nội dung** file `supabase/viral-channel-metrics.sql` (không dán tên file), bấm *Run*. Kết quả đúng là *Success. No rows returned*.
   - File chỉ tạo lại hai hàm của trigger realtime, không thay đổi dữ liệu. Chạy lại nhiều lần vẫn an toàn.
   - Chưa chạy SQL thì tính năng vẫn dùng được. Chỉ là màn hình không tự cập nhật khi người khác lưu; bấm *Làm mới* là thấy.
3. **Gán kênh**: Leader hoặc Ban giám đốc vào *Số liệu kênh → Quản lý kênh → Thêm kênh*. Với mỗi kênh, chọn dự án, nền tảng (TikTok, Facebook, YouTube, Instagram, Khác), tên hoặc link kênh, và VJ phụ trách. VJ nhận tin Telegram báo được giao kênh.
4. Nhân viên tải lại app (Ctrl+Shift+R, hoặc đóng rồi mở lại Mini App) để nhận giao diện mới.

Không cần cấu hình thêm biến môi trường nào. Các bảng `ProjectChannels`, `ChannelMetrics`, `ChannelMetricsAudit` được tạo tự động ở lần thêm kênh hoặc nhập số đầu tiên.

## Quy tắc

| Việc | Ai | Khi nào |
|---|---|---|
| Thêm, sửa, ngưng kênh, đổi VJ | Leader, Ban giám đốc | Bất kỳ lúc nào; mọi thay đổi được ghi lịch sử |
| Nhập số tuần | VJ phụ trách kênh | 18:00 Chủ nhật → 23:59 thứ Hai |
| Nhập số tháng chính thức | VJ phụ trách kênh | Ngày cuối tháng → hết ngày 2 tháng sau |
| Sửa sau hạn | Leader, Ban giám đốc | Bất kỳ lúc nào sau khi kỳ đã mở; ghi lịch sử kèm số cũ và số mới |

- **Chỉ số:** view, tim, bình luận là bắt buộc. Chia sẻ, follower tăng, ảnh chụp màn hình và ghi chú không bắt buộc. Số phải là số nguyên không âm; được gõ dấu chấm phân cách hàng nghìn (`12.345`).
- **Một bản ghi mỗi kỳ:** mỗi kênh mỗi kỳ chỉ có một bản ghi. Gửi lại sẽ cập nhật bản ghi đó, không tạo dòng mới.
- **Số tháng ước tính:** khi chưa có số chính thức, app hiển thị số **ước tính**: mỗi tuần đóng góp (số ngày của tuần nằm trong tháng ÷ 7) × số của tuần. Ví dụ tuần 28/9–4/10 có 700 view: tháng 9 được 300, tháng 10 được 400.
- **Tăng/giảm:** = (kỳ này − kỳ trước) ÷ kỳ trước. Để trống khi kỳ trước bằng 0 hoặc chưa có số.
- **Ảnh chụp màn hình:** chỉ VJ phụ trách, người đã nhập, Leader và Ban giám đốc xem được.

## Nhắc việc (Telegram, trong khung 08:00–20:00)

| Lúc | Người nhận |
|---|---|
| Chủ nhật 19:00 | VJ còn kênh chưa nhập tuần này |
| Thứ Hai 12:00 | VJ vẫn còn kênh chưa nhập |
| Thứ Ba 09:00 | Leader: danh sách kênh còn thiếu và VJ phụ trách (nếu không có Leader thì gửi Ban giám đốc) |
| Ngày cuối tháng và ngày 2, từ 09:00 | VJ còn kênh chưa nhập số tháng chính thức |

Mỗi tin chỉ gửi một lần cho mỗi người ở mỗi mốc, và không chứa số liệu.

## Cách kiểm tra sau khi triển khai

1. Leader thêm một kênh thử và gán cho một VJ. VJ đó nhận tin Telegram "BẠN ĐƯỢC GIAO KÊNH".
2. Từ 18:00 Chủ nhật, VJ mở *Tiện ích → Số liệu kênh*. Thẻ kênh hiện "Chưa nhập"; nhập số rồi gửi, thẻ chuyển sang "Đã nhập". Gửi lại với số khác: vẫn chỉ có một bản ghi.
3. Sau 23:59 thứ Hai, VJ không còn nút nhập. Leader vào *Tổng hợp* để nhập hoặc sửa thay, và có nút *Xuất Excel*.
4. Kiểm tra dữ liệu trong SQL Editor (chỉ đọc):
   ```sql
   select key, jsonb_array_length(value)-1 as so_dong
   from public.viral_state, jsonb_each(data->'books'->'main')
   where id='main' and key in ('ProjectChannels','ChannelMetrics','ChannelMetricsAudit');
   ```

## Kỹ thuật

- **Nghiệp vụ:** `web/server/viral/channel-metrics.gs`, nạp trong `runtime.mjs`. Không sửa `business.gs`. Các RPC được đăng ký trong `methods.json`:
  - `channelMetricsScreen`, `channelMetricsReport`
  - `saveProjectChannel`, `submitChannelMetrics`
  - `channelMetricScreenshot`, `exportChannelMetrics`
- **Đọc an toàn:** các đường đọc không bao giờ tạo bảng hay sửa dữ liệu, và có test kiểm tra điều này. Chúng dùng phạm vi đọc `channels`, nên chỉ tải các bảng cần thiết.
- **Xuất Excel:** file được dựng ở server bằng `exceljs` (`web/server/viral/channel-metrics-excel.mjs`), sau khi đã kiểm tra quyền.
- **Giao diện:** `web/public/viral/channel-metrics.js`. Trên điện thoại, bảng tổng hợp chuyển thành thẻ theo từng kênh.
- **Realtime:** nhóm `metrics` trong `change-tracker.js`, và `ProjectChannels` cùng `Channel*` trong trigger (`supabase/viral-channel-metrics.sql`).
- **Test:** `web/server/viral/test/channel-metrics.test.mjs`. Chạy:
  ```bash
  cd web && npm ci && npm run test:viral && npm run typecheck && npm run build
  ```
