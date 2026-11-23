# Lịch dựng

Mục **Tiện ích → Lịch dựng** và thẻ **"Lịch dựng hôm nay"** ở Trang chủ hiển thị Google Sheet **ORDER TASK DỰNG** theo từng ngày, từng kênh và từng task.

**App chỉ đọc Sheet.** Muốn thêm hay sửa task thì vẫn sửa trên Sheet; app không có nút thêm hay sửa và không bao giờ ghi vào Sheet.

## Cài đặt (một lần)

1. Mở Sheet ORDER TASK DỰNG, bấm **Chia sẻ**, thêm email trong biến `GOOGLE_SERVICE_ACCOUNT_EMAIL` trên Vercel với quyền **Người xem**. Đây là cùng email đã dùng cho Sheet CRM.
2. Không cần chạy SQL và không cần thêm biến môi trường. Nếu sau này đổi sang Sheet khác, đặt biến `EDIT_SCHEDULE_SHEET_ID` trên Vercel.

## Khung Sheet app đọc được

- **Mỗi tuần một tab.** App đọc tối đa 60 tab gần nhất và bỏ qua tab ẩn.
- **Hàng ngày:** có ít nhất 3 ô ngày dạng `23/11` hoặc `23/11/2026`. Mỗi ngày là một khối cột, thường gộp 2 ô. Nếu ô ngày không ghi năm, app chọn năm gần hôm nay nhất; tuần vắt qua Tết dương lịch được tự chuyển sang năm sau.
- **Hàng tiêu đề** (ngay dưới hàng ngày, hoặc dưới hàng "THỨ 2…"):
  - `KÊNH/VJ` ở cột đầu.
  - `TÊN TASK` và `NGƯỜI THỰC HIỆN` trong mỗi khối ngày.
- **Mỗi dòng bên dưới là một kênh.** Thứ tự và tên kênh có thể đổi tùy ý. Dòng "Tổng" và "Ghi chú" được bỏ qua.
- **Nhiều task trong một ô:** mỗi dòng (Alt+Enter) là một task.
  - Nếu ô "Người thực hiện" có cùng số dòng thì ghép từng cặp; nếu không thì mọi task trong ô dùng chung danh sách người.
- **Nhiều người trong một ô:** ngăn bằng dấu phẩy, `;`, `/`, `&`, `+` hoặc chữ "và".
- **Màu và link:** màu nền ô task hiện thành vạch màu bên trái task; link trong ô hiện thành nút "Mở link".
- **Ô gộp:** kênh gộp nhiều dòng được tính là một kênh; task gộp nhiều dòng chỉ hiện một lần.

## Ai thấy gì

- **Mọi nhân viên đang hoạt động** xem được toàn bộ lịch, có nút **★ Task của tôi** và bộ lọc theo người thực hiện.
- **Thẻ trang chủ** hiện task hôm nay có tên mình. Leader và Ban giám đốc thấy thêm tổng số task hôm nay và các kênh chưa có task.
- **"Task của tôi"** nhận ra mình qua tên ghi trên Sheet. Cách so tên:
  - Không phân biệt dấu và hoa thường: `MINH THI` = `Minh Thi`.
  - Tên từ hai chữ trở lên được khớp với phần cuối họ tên trên app: `Minh Thi` khớp `Nguyễn Minh Thi`.
  - Tên một chữ phải trùng hẳn với tên trên app.

## Kỹ thuật

- **Đọc và phân tích:** `web/server/viral/edit-schedule.mjs`.
  - Đọc bằng Google Sheets API với quyền `spreadsheets.readonly`, chỉ gửi yêu cầu GET.
  - Một lần đọc lấy tất cả các tab. Dữ liệu được giữ trong bộ nhớ server 60 giây.
- **RPC:** `editSchedule` và `editScheduleToday`, xử lý trong `web/src/lib/viral.ts`.
  - Kiểm tra đăng nhập trước khi đọc Sheet.
  - Phạm vi đọc dữ liệu app là `personnel`, chỉ gồm Employees và Settings.
  - Không ghi gì vào dữ liệu app.
- **Giao diện:** `web/public/viral/edit-schedule.js`.
  - Màn hình rộng hiện bảng giống Sheet.
  - Dưới 760px hiện từng ngày một.
- **Test:**
  - `web/server/viral/test/edit-schedule.test.mjs`.
  - Thêm một ca trong `egress-rpc.test.mjs`.
