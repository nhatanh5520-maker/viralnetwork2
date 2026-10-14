# Chuẩn bị chuyển Mini App sang web — chưa chuyển dữ liệu hiện tại

Bạn đã yêu cầu nhân viên tiếp tục làm việc trên Mini App cũ và chỉ chuyển sau khi gửi bản Excel mới. Bộ này chỉ là công cụ/source; không tự cập nhật Vercel, không kết nối tới dữ liệu thật và không nhập bản Excel cũ.

## Những gì có thể chuẩn bị trước

1. Cập nhật source web trong repo GitHub của bạn: chép đè thư mục `web`, thêm các file SQL mới trong `supabase` và tài liệu này. Commit → Push; Vercel Root Directory vẫn là `web`.
2. Supabase SQL Editor: chạy `supabase/viral-migration.sql` và `supabase/viral-hr-accounts.sql`. Hai file chỉ thêm các bảng nhập thử/sao lưu và hàm riêng; không thay dữ liệu chính hay cấp tài khoản tự động. Không chạy lại khởi tạo main, không xóa Auth hay dữ liệu test.
3. Giữ `VIRAL_MAINTENANCE=false` trên Vercel trong giai đoạn chuẩn bị.
4. Cấp email admin theo `HUONG_DAN_ADMIN.md`, đặt vị trí chấm công và nối sheet kế toán như hướng dẫn đã có.
5. Bật thêm **Google Drive API** trong cùng Google Cloud project đã bật Sheets API. Dùng cùng service account, quyền đọc server-side.
6. Chia sẻ thư mục bill `https://drive.google.com/drive/folders/1DG74F5IGAGlmzMsEEMhsnZwLsmjUlaEY` cho email `GOOGLE_SERVICE_ACCOUNT_EMAIL` với quyền **Viewer**. Không cần công khai thư mục.
7. Đặt `MIGRATION_BILL_FOLDER_ID=1DG74F5IGAGlmzMsEEMhsnZwLsmjUlaEY` trên Vercel. Giữ secret `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, bot `TELEGRAM_BOT_TOKEN`, domain HTTPS `VIRAL_WEB_URL` như hướng dẫn.
8. Kiểm tra dung lượng Supabase Storage đủ chứa bill cũ và bill mới. Ảnh tối đa 10 MB, dạng JPEG/PNG/WebP/GIF/HEIC/HEIF. Tệp ngoài thư mục đã chọn hoặc ảnh lỗi checksum sẽ bị chặn.

Chỉ chạy thêm SQL là chưa chuyển dữ liệu. Nút kích hoạt còn yêu cầu bản nhập thử, đủ ảnh, ghép tài khoản, chế độ bảo trì và câu xác nhận riêng.

## Khi chốt thời điểm chuyển

1. Thông báo nhân viên tạm dừng ghi trên Mini App cũ. Đợi các thao tác đang chạy kết thúc. Không để hai hệ thống cùng nhận cập nhật sau thời điểm chốt.
2. Xuất bản Excel mới nhất của file dữ liệu chính. Nếu có file hồ sơ riêng chứa BankProfiles/PersonnelAudit, xuất và gửi cùng. Giữ bản gốc/Drive để tra cứu và khôi phục.
3. Gửi Excel cuối cho tôi. Tôi sẽ kiểm tra lại và chuẩn bị `viral-old-data.json` từ đúng bản đó; chưa dùng bản JSON kiểm thử cũ. JSON chứa dữ liệu cá nhân/nhân sự, không đưa lên GitHub, không đặt trong public.
4. Nếu tự chuyển đổi trên máy có Python/openpyxl, công cụ đọc dữ liệu (không chỉnh sửa Excel) là:

   `python scripts/viral-workbook-to-json.py "Viral Network.xlsx" "viral-old-data.json" --bill-folder-id 1DG74F5IGAGlmzMsEEMhsnZwLsmjUlaEY`

   Với hồ sơ riêng: thêm `--private-xlsx "Ho so nhan su.xlsx"`.

5. `/admin` → **Chuyển dữ liệu cũ** → nạp JSON. Bản nhập thử nằm ở bảng riêng, không ghi đè `viral_state.main`.
6. Đối chiếu số dòng các bảng, nhân viên/ID, lịch sử, ngày giờ, công việc và chi phí. Xem danh sách lỗi/liên kết thiếu, không mặc định bỏ qua. Giữ nguyên các hàng không rõ nguồn; chỉ sửa lỗi phút làm việc nếu có giờ vào/ra hợp lệ, kèm bản trước/sau. Công cụ không thể phục hồi bài viết/Idea/hồ sơ vốn không có trong tệp xuất.
7. **Chuyển ảnh / tiếp tục**: lấy từng ảnh từ Drive, kiểm tra kích thước/checksum; lưu private bucket `viral-files`, tải lại để kiểm tra SHA-256. Giữ nguyên Drive file ID để ghép đúng bill; đổi URL sang API web có phân quyền. Không xóa bản gốc. Có thể đóng trang và tiếp tục sau, không chuyển lại ảnh đã xác minh.
8. **Ghép tài khoản**: chọn nhân viên cũ tương ứng từng email web. Bắt buộc ghép email admin hiện tại với nhân viên Director cũ. Tài khoản không chọn vẫn tồn tại trong Auth, nhưng tạm ngưng quyền vào app sau chuyển. Không ghép nhầm ID người khác.
9. Bật `VIRAL_MAINTENANCE=true` trên Vercel → Redeploy. Tạm dừng truy cập ghi và cron web; đợi ít nhất một phút cho các yêu cầu trước đó kết thúc. Giữ Mini App cũ ngừng nhập từ thời điểm chốt.
10. Xác nhận đúng bản Excel cuối và các vấn đề đã đối chiếu → nhập `CHUYEN DU LIEU MOI` → **Tạo sao lưu và chuyển dữ liệu chính**.
11. Server tạo bản sao dữ liệu test, ánh xạ tài khoản và hàng đợi; thay dữ liệu chính/ánh xạ trong một giao dịch PostgreSQL. Version checks ngăn ghi đè khi dữ liệu vừa thay đổi. Password/email trong Supabase Auth không đổi.
12. Kiểm tra sau chuyển; tắt bảo trì → Redeploy để thử app. Chỉ khi test đạt mới hướng dẫn nhân viên dùng web. Không bật lại ghi Mini App cũ, vì đây là chuyển một lần, không phải đồng bộ hai chiều liên tục.

## Kiểm thử sau chuyển

- Mỗi vai trò đăng nhập thấy đúng thông tin/công việc đã phân công.
- ID Idea/task/nhân viên giữ nguyên; số lượng bảng và lịch sử so được với bản cuối.
- Bill mở được đầy đủ, bao gồm nhiều ảnh trên cùng phiếu. Employee chỉ xem bill của mình; kế toán/Director theo quyền hiện có.
- Check-in/out GPS, lịch quay, bàn giao Raw/Voice, gửi hoàn thành Final hoạt động theo quy trình cũ.
- Thu/Chi đọc sheet kế toán riêng, không tự cộng lại bill để tránh trùng.
- Notifications cũ pending/failed/sending được giữ `migration_hold`, không gửi lại hàng loạt. Thông báo mới dùng Telegram ID cũ.

## Khôi phục khi cần

`/admin` → Chuyển dữ liệu cũ → Khôi phục bản sao lưu. Dừng ghi/cron, bật bảo trì, chọn bản, nhập `KHOI PHUC BAN SAO`.
Dữ liệu hiện tại cũng được sao lưu trước khi khôi phục. Khôi phục dữ liệu main, ánh xạ thành viên và hàng đợi. Auth/email/password không bị xóa. Ảnh đã chép vẫn giữ trong Storage; không tự xóa ảnh khi quay lại.

Đây là quay về một thời điểm, không tự gộp các công việc được nhập sau đó. Nếu đã có dữ liệu thật mới ở web, cần đối chiếu/gộp trước khi cho nhân viên tiếp tục làm việc. Những thao tác Telegram đã gửi không thể thu hồi chỉ bằng khôi phục database.

## HR tạo tài khoản ngay trong app

- Giám đốc chọn tài khoản HR qua chức năng chọn HR hiện có. Quyền cấp tài khoản dựa trên `hr_telegram_id` được chỉ định, không dựa vào người tự ghi chức danh HR.
- HR → **Tiện ích → Tạo tài khoản nhân viên**.
- Nhập email, Telegram ID, tên, bộ phận, chức danh, mã nhân viên nếu có. Không nhập mật khẩu người khác.
- Nhân viên cần mở bot và bấm Start trước để bot nhận biết Telegram ID. Không dùng nhóm/group ID ở đây.
- Với Telegram ID đã có trong dữ liệu cũ: giữ nguyên ID nhân viên, tên/thông tin cũ, lịch sử và quyền; chỉ cấp tài khoản web tương ứng.
- Với nhân viên mới: tạo hồ sơ Employee + Auth + ánh xạ. HR không được cấp Director/Leader bằng cách tự sửa payload. Tài khoản quản lý cũ cần Director cấp.
- Nhân viên nhận email đăng nhập và link dùng một lần đặt mật khẩu **qua Telegram**, không gửi thư mời email. Mật khẩu do nhân viên tự đặt, tối thiểu 12 ký tự; HR không thấy mật khẩu.
- Nếu link hết hạn: HR chọn **Gửi lại link đặt mật khẩu**, nhập đúng email và Telegram ID. Link cũ bị thay thế, không cần tạo lại nhân viên.
- Tin chào mừng được thử gửi ngay; nếu chưa gửi được sẽ nằm trong outbox. Cần bot token và bộ gửi mỗi phút hoạt động để retry. Các thông báo nghiệp vụ tiếp tục đi qua Telegram theo người/nhóm đã cấu hình.
- Trước khi chuyển thật, không cấp tài khoản nhân viên thật bằng dữ liệu test; chỉ kiểm thử với tài khoản thử. Sau chuyển có thể cấp tài khoản cho roster cũ từ HR.

### Cấu hình gửi Telegram

Đặt `TELEGRAM_BOT_TOKEN`, `VIRAL_WEB_URL` (domain production HTTPS), `CRON_SECRET` trên Vercel. Bộ gửi cần gọi `/api/viral/cron` với header `Authorization: Bearer <CRON_SECRET>` mỗi phút; có thể dùng script `scripts/viral-notifications.mjs` trên máy chủ chạy liên tục như README. Không đưa token/secret vào GitHub.

Sau chuyển, tránh để cả scheduler Apps Script cũ và scheduler web cùng gửi thông báo. Dừng scheduler cũ khi chính thức dùng web; đừng tắt lúc nhân viên vẫn đang làm việc trên Mini App.

## Giới hạn đã biết

Chưa chạy kết nối Drive/Supabase/Telegram thật của bạn trong phiên này. Mỗi bước live phải được kiểm tra sau khi cấp quyền/cấu hình. Chuẩn bị/bản nhập thử không phải bằng chứng chuyển dữ liệu thật đã thành công. Bản Excel cuối sẽ được kiểm tra lại độc lập với tệp cũ.
