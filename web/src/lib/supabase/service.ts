import "server-only"; // Chốt chặn: build FAIL nếu lỡ import vào client component.
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client dùng SERVICE ROLE — BỎ QUA RLS.
 * CHỈ dùng trong job hệ thống phía server (vd endpoint nhận dữ liệu từ Gmail
 * Apps Script, không có phiên user). Tuyệt đối không import vào client.
 *
 * Trả về null nếu chưa cấu hình (để route xử lý lỗi rõ ràng thay vì crash).
 */
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSbClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
