# Cập nhật web: vị trí chấm công, /admin, Google Sheets kế toán

Bản cập nhật ngày 14/10/2026. Source đã kiểm tra local, chưa tự cập nhật Vercel/GitHub của bạn và chưa đọc sheet kế toán thật.

## 1. Cập nhật source trên GitHub

1. Tải và giải nén `ERP-Khung-Clone.zip` mới.
2. Trong GitHub Desktop, chọn repo `viralnetwork2` → Repository → Show in Explorer.
3. Chép đè **toàn bộ thư mục web** từ source mới vào thư mục repo, giữ tên `web` và cấu trúc thư mục con. Chép thêm `HUONG_DAN_ADMIN.md`, `README.md`, `VALIDATION.md` nếu muốn giữ tài liệu.
4. Commit → Push origin. Vercel tự build bản mới; Root Directory giữ **web**.
5. Không chạy lại khởi tạo dữ liệu, không xóa dữ liệu Supabase. Bản này dùng bảng và hàm `viral_commit` hiện có, không cần SQL migration mới.

## 2. Cấp email quản trị

Vercel → dự án `viralnetwork2` → Settings → Environment Variables:

- Name: `VIRAL_ADMIN_EMAILS`
- Value: email tài khoản của bạn đã tạo trong Supabase Auth, ví dụ `yourname@example.com`. Nếu nhiều admin: `admin1@example.com,admin2@example.com`.
- Environment: Production (Preview nếu cần test).
- Save → Deployments → bản mới nhất → Redeploy.

Tài khoản này phải được liên kết nhân viên và có role **director** (Ban giám đốc), đang hoạt động. Email không nằm trong danh sách sẽ không mở được admin dù biết URL. Chỉ ghi email, không ghi mật khẩu ở biến này.

Mở `https://domain-cua-ban/admin` hoặc `https://ten-du-an.vercel.app/admin`. Đăng nhập bằng email + mật khẩu tài khoản hiện có; nếu đã đăng nhập web thì dùng phiên đó.

Quyền sửa admin tách riêng. Giám đốc ở app nhân viên vẫn chỉ xem Sản xuất/Công việc theo quy trình cũ.

## 3. Đặt vị trí chấm công

1. `/admin` → **Vị trí chấm công**.
2. Nhập tên văn phòng.
3. Khi đang đứng tại văn phòng, bấm **Lấy vị trí hiện tại** rồi cho phép trình duyệt truy cập vị trí.
4. Bấm **Kiểm tra Google Maps** để xem tọa độ. Nếu máy tính định vị sai, dùng tọa độ đúng từ Google Maps: bấm chuột phải vào vị trí → lấy hai số `vĩ độ, kinh độ`.
5. Bán kính ví dụ 100m. Hệ thống cho đặt 10–1.000m.
6. Ca mặc định 08:00–17:00, nghỉ trưa 12:00–13:30.
7. Nhập lý do → **Lưu vị trí chấm công**.
8. Nhân viên làm mới web, cho phép GPS và thử vào ca tại văn phòng. GPS cần độ chính xác ≤100m và vị trí nằm trong bán kính. Mỗi ngày vẫn một lần vào và một lần ra; thử nghiệm chấm công là ghi dữ liệu thật.

Cấu hình hiện hỗ trợ **một văn phòng**. Chấm công đi quay giữ luồng theo lịch quay và người xác nhận hiện có. Tên văn phòng đã lưu sẽ xuất hiện trong thông tin điểm chấm công mới.

## 4. Kiểm soát dữ liệu sản xuất

`/admin` → **Sản xuất**:

- Tất cả dữ liệu ProductionItems trong Supabase, không chỉ 20 task mới nhất; phân trang 20 dòng.
- Tìm kiếm theo Idea, dự án, tên nhân viên. Lọc dự án, bước sản xuất, khoảng ngày.
- Khoảng ngày tính theo giờ đi quay tại Việt Nam; nếu chưa có giờ quay thì dùng ngày tạo.
- **Cột hiển thị**: chọn các cột gốc. Nhân sự được hiển thị tên, mã được giữ bên trong hệ thống.
- **Sửa Idea**: sửa tên/nội dung Idea còn ở bước brief, dùng quy trình gửi duyệt lại và đồng bộ task gốc.
- **Phân công**: VJ nhiều người, Editor nhiều người, Cam-op, người duyệt Idea, giờ đi quay, chi phí dự kiến. Các kiểm tra chức danh, trùng lịch và trạng thái vẫn có hiệu lực.
- **Thùng rác**: chỉ Idea chưa duyệt; có khôi phục và lịch sử task liên kết.
- Mã ID, trạng thái, deadline Editor, link tài sản không sửa trực tiếp từng ô. Tiến độ, bàn giao và gửi hoàn thành vẫn thực hiện trong app nhân viên. Bản hiện tại không có bước duyệt Final/Thumbnail mới.
- **Xuất CSV**: xuất các dòng đang lọc và cột đang chọn.
- **Sao lưu JSON**: tải các bảng sản xuất, task, dự án, cấu hình chấm công và lịch sử admin. Không phải bản sao toàn bộ Supabase/Auth/ảnh bill. Chưa có nút nhập phục hồi JSON tự động.
- **Lịch sử thay đổi**: ai, khi nào, lý do và bảng đã thay đổi; dữ liệu trước/sau được lưu cùng thao tác. Chỉ ghi thay đổi từ admin, không thay thế lịch sử nghiệp vụ của nhân viên.
- Nếu người khác vừa thay đổi database, admin báo cần làm mới, không ghi đè dữ liệu của người đó.

## 5. Kết nối Google Sheets kế toán (riêng tư)

Không cần công khai sheet. Dùng tài khoản dịch vụ Google có **quyền xem**.

A. Tạo tài khoản đọc sheet:

1. Mở https://console.cloud.google.com/ → tạo hoặc chọn project.
2. **APIs & Services → Library** → tìm **Google Sheets API** → Enable.
3. **IAM & Admin → Service Accounts → Create service account**. Đặt tên `viral-finance-reader`. Không cần cấp vai trò Google Cloud cho project và không cần domain-wide delegation.
4. Mở service account vừa tạo → **Keys → Add key → Create new key → JSON**. Tệp JSON sẽ tải về.
5. Mở Google Sheets của kế toán → **Share/Chia sẻ** → dán `client_email` trong JSON → chọn **Viewer/Người xem** → Share. Có thể bỏ chọn gửi thông báo.

B. Đặt hai biến trên Vercel:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: giá trị `client_email` trong JSON.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: giá trị `private_key`, gồm BEGIN/END PRIVATE KEY. Có thể giữ `\n` hoặc xuống dòng thật. Chỉ sao chép giá trị, không thêm dấu nháy bao ngoài. Đánh dấu Sensitive/Secret nếu giao diện có.

Không thêm NEXT_PUBLIC vào tên, không commit JSON/private key lên GitHub, không gửi private key trong chat.

Save cả hai → Redeploy.

C. Nối sheet trong admin:

1. `/admin` → **Thu / Chi kế toán**.
2. Dán URL hoặc ID sheet.
3. Nhập tên tab chính xác như dưới cùng Google Sheets (không phải tên cả tệp).
4. Nhập lý do → **Lưu kết nối**.
5. Chọn tháng → **Đọc Google Sheets**.
6. Xem tổng thu, chi, chênh lệch; từng dự án/chung công ty; giao dịch và link chứng từ; các dòng sai dữ liệu được báo để kế toán sửa.
7. Sau khi kết nối, tài khoản Ban giám đốc ở web nhân viên → Tiện ích → Thu/Chi cũng đọc **cùng sheet này**, vẫn có bộ lọc và phân trang như Mini App.

Kế toán tiếp tục nhập sheet. Web đọc dữ liệu mới mỗi lần mở/làm mới báo cáo; không polling liên tục, không ghi vào sheet, không sao chép sổ kế toán vào Supabase. Ảnh/video sản xuất vẫn nằm ở Drive. Bill nhân viên gửi web vẫn ở Supabase, không tự cộng vào số liệu sheet để tránh trùng.

### Cấu trúc sheet được hỗ trợ

Giữ cấu trúc sổ kế toán hiện tại của Mini App:

- Tiêu đề hàng 7–8; dữ liệu từ hàng 9.
- A: MÃ GIAO DỊCH
- B: NGÀY (ô ngày thực sự, hoặc yyyy-MM-dd / dd/MM/yyyy)
- C: LOẠI (THU hoặc CHI)
- D: NHÓM
- E: DỰ ÁN / BỘ PHẬN (VD DA001 - Lượn Đà Nẵng hoặc Chung công ty)
- F: NỘI DUNG
- G: SỐ TIỀN (ô số, không phải chuỗi "200.000đ")
- H: NGƯỜI THỰC HIỆN GIAO DỊCH
- I: PHƯƠNG THỨC
- J: CHỨNG TỪ
- K: link hóa đơn/chứng từ bổ sung.

Mã giao dịch phải duy nhất. Dòng lỗi sẽ không được cộng vào tổng và được báo riêng; dòng chỉ có mã chuẩn bị sẵn không tính là giao dịch. URL trực tiếp, công thức HYPERLINK và liên kết rich text được giữ. Ảnh IMAGE() nhúng không tự trích xuất file; dùng link HTTPS chứng từ.

Giới hạn hiện tại 50.000 giao dịch mỗi lần đọc. Nếu vượt, hệ thống báo lỗi thay vì hiển thị tổng thiếu.

Nếu sheet thực tế khác cấu trúc này, gửi URL + tên tab và ảnh tiêu đề (không cần gửi thông tin bí mật) để điều chỉnh phần ánh xạ trước khi sử dụng báo cáo.

## 6. Kiểm thử sau cập nhật

- Email không được cấp admin → bị từ chối.
- Admin đặt tọa độ → nhân viên thử GPS tại văn phòng → giờ vào được lưu.
- Tạo Idea thử bằng Leader/VJ → sửa phân công admin → công việc của nhân viên được đồng bộ.
- Thử thùng rác/khôi phục Idea chưa duyệt.
- Kế toán sửa một dòng thử trên sheet → làm mới báo cáo → số liệu cập nhật; kiểm tra tháng và dự án.
- Employee/Leader không xem được báo cáo Thu/Chi; Ban giám đốc xem được.

Các kiểm tra local dùng dữ liệu mẫu, không chứng minh kết nối service account tới sheet của bạn đã thành công. Cần thực hiện bước 5 và kiểm tra trên deployment thật.
