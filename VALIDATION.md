# Kiểm chứng bản chuyển đổi

- Next.js production build: thành công.
- TypeScript: không lỗi trong kiểm tra build.
- 12 kiểm thử adapter nghiệp vụ: khởi tạo schema tương thích; snapshot; tạo Idea/công việc liên kết/chống trùng request; giám đốc chỉ xem; bảng tin/bình luận/thích; nhân viên inactive; chặn RPC nội bộ; chữ ký Telegram; check-in/out không ghi lại; luồng VJ → bàn giao → tiến độ Editor → Final ready; bill → duyệt → thanh toán → metadata ảnh.
- 2 kiểm thử DOM: năm tab điều hướng hiện tại tại viewport 430px và 1440px không báo lỗi JavaScript. API được giả lập bằng adapter nghiệp vụ; đây không phải kiểm chứng ảnh chụp/pixel hoặc test trên iPhone thật.
- Mã nghiệp vụ business.gs giữ nguyên nội dung Code.gs của V20.30.22.

Chưa kiểm chứng:

- Chạy SQL/cookie đăng nhập/CAS đồng thời trên Supabase thật.
- Upload/download Supabase Storage thật; Telegram gửi ảnh/thông báo thật.
- Hiệu năng và giới hạn dung lượng khi nhập toàn bộ dữ liệu công ty.
- Giao diện bằng ảnh chụp trình duyệt, Telegram PC/iOS/Android thực tế.
- Chuyển ảnh Drive và dữ liệu production đang dùng. Source hiện tại không chứa dữ liệu công ty.

Vì vậy đây là bộ source chuyển đổi để triển khai thử, chưa phải xác nhận sẵn sàng thay hệ thống đang hoạt động.

## Admin / GPS / Google Sheets update — 2026-10-14

- Tests include explicit admin email allowlist + Director + active membership;
  GPS configuration/radius enforcement; audited business idea edit; assignments,
  soft-delete and restore; preservation of employee RPC Director read-only policy.
- Google Sheets fixture covers numeric amounts, serial dates, rich text bill links,
  HYPERLINK formulas, and employee denied financial report. Accountant sheet is
  request-local and not written into Supabase.
- React DOM test uses mocked API for server data, production edit dialog, GPS,
  finance and audit navigation. It is functional DOM verification, not pixel QA.
- Production Next build includes /admin and /api/viral/admin, TypeScript checked.
- No live Supabase admin transaction, real browser geolocation or Google account/
  accountant Sheet integration has been executed. Deployment and private Google
  credentials are still required per HUONG_DAN_ADMIN.md.
- Audit holds before/after changed rows inside versioned JSONB state. This remains
  the existing whole-state architecture, so state size and audit growth still need
  monitoring; admin is not a normalized database migration or immutable audit store.

## Migration + HR update

- Migration keeps separate staging and original workbook representation, IDs,
  dynamic history tables, legacy alerts held from replay and latest GPS/finance
  config. Duplicate primary keys block preparation; row issues are surfaced.
- Drive fixture tests folder restriction, byte size and checksum validation.
  Private Storage read-back SHA-256 verification is in the migration endpoint.
- PGlite PostgreSQL verification covered repeat-safe DDL, mapping uniqueness,
  transaction backup/activation, version conflicts, rollback with safety snapshot,
  denied authenticated role, HR account atomic commit and resend cancellation.
- HR unit tests cover configured-HR/Director permission, employee-only creation,
  unchanged prior personnel identity, and no HR-issued Director account.
- Password page DOM verification ensures the token hash is removed from URL
  and no OTP is consumed just by loading the page (or preview fetching).
- Existing workbook was used ONLY as local fixture: all 24 active employee
  snapshots execute; 61 referenced bill files identified. Not activated or copied.
- No live Google Drive, Supabase Auth, Storage or Telegram account invitation
  has been performed. Real account/create/OTP/retry and cutover must be tested
  in deployment after the owner supplies a final Excel and configures credentials.

Final verification: 30 Node/DOM tests passed, TypeScript/Next production build passed. New SQL functions verified in local PostgreSQL (PGlite); no live production mutation.
