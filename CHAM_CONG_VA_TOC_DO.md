# Sửa lỗi chấm công vào ca / ra ca

## Triển khai

1. Supabase → SQL Editor: chạy `supabase/viral-fast-commit.sql` (chạy lại an toàn, không đổi dữ liệu).
2. Deploy web.

Thứ tự không bắt buộc: chưa chạy SQL thì web vẫn lưu kiểu cũ (log có cảnh báo `viral_commit_patch missing`).

## Nguyên nhân

Mỗi lượt Vào ca / Ra ca đọc toàn bộ dữ liệu rồi ghi đè toàn bộ với điều kiện version không đổi. Ai lưu
bất cứ thứ gì trong lúc đó (người khác chấm công, Sản xuất, bộ lịch mỗi phút) là lượt chấm công bị từ chối;
đầu ca nhiều người bấm cùng lúc nên lỗi liên tục. GPS lấy tọa độ đầu tiên của điện thoại, thường sai số >100m.

## Đã sửa

- Lưu chỉ phần thay đổi (`viral_commit_patch`). Chấm công lưu đúng 1 dòng: thêm dòng khi vào ca, sửa đúng dòng
  của mình khi ra ca. Nhiều người chấm cùng lúc được gộp; database chặn 2 dòng cho cùng người cùng ngày.
- Hai thao tác chỉ xung đột khi một bên ghi bảng mà bên kia đã đọc. Ghi toàn bộ (admin, lưu trữ chấm công)
  vẫn dùng `viral_commit`, được ghi log `*` nên mọi thao tác đang chạy đọc lại dữ liệu mới.
- Chấm công tự thử lại tối đa 6 lần có nghỉ ngẫu nhiên; trình duyệt tự gửi lại 1 lần khi lỗi mạng/bận
  (không gửi lại khi máy chủ báo chưa xác nhận được kết quả lưu).
- GPS theo dõi tối đa 20 giây, lấy tọa độ chính xác nhất, dừng sớm khi sai số ≤ 35m, hiện sai số.
- Trang chủ / Chấm công không tự tải lại khi người khác chấm công (chỉ hiển thị chấm công của chính mình);
  các máy làm mới lệch nhau ngẫu nhiên 0,8–2,5 giây.
- business.gs biên dịch một lần mỗi tiến trình; đọc bảng bỏ chi phí theo từng ô; `rows_` nhanh hơn (test so sánh
  kết quả giống hệt bản gốc). Font woff2 + cache.

Kiểm thử trên PostgreSQL thật: 30 người vào ca song song từ cùng một bản dữ liệu cũ → 30/30 lưu được,
lượt trùng của cùng một người bị chặn.
