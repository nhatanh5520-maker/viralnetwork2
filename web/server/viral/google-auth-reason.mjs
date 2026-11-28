// Turns a google-auth-library failure into a short, secret-free Vietnamese reason, and logs it.
// The service-account key never appears here: only Google's error code/description is used.
export function googleAuthReason(error){
 const data=error?.response?.data||{},raw=[data.error,data.error_description,error?.code,error?.message].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 let hint;
 if(/invalid_grant/i.test(raw)&&/signature|jwt/i.test(raw))hint='khóa riêng (GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) không khớp với email, hoặc khóa đã bị xóa trên Google Cloud';
 else if(/account not found|invalid_client|unauthorized_client|disabled/i.test(raw))hint='email tài khoản dịch vụ (GOOGLE_SERVICE_ACCOUNT_EMAIL) không tồn tại hoặc đã bị vô hiệu hóa';
 else if(/decoder|pem|private key|asn1|no start line|bad base64|unsupported/i.test(raw))hint='khóa riêng sai định dạng (cần đủ dòng BEGIN/END PRIVATE KEY và ký tự \\n)';
 else if(/invalid_grant/i.test(raw)&&/time|iat|exp/i.test(raw))hint='lệch giờ máy chủ khi ký khóa; thử lại sau ít phút';
 else if(/enotfound|etimedout|econnreset|eai_again|fetch failed|timeout|socket/i.test(raw))hint='không kết nối được máy chủ Google; thử lại sau';
 else hint='Google từ chối đăng nhập';
 const detail=raw.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g,'[key]').slice(0,160);
 return {hint,detail};
}
export function googleAuthError(error,feature){
 const {hint,detail}=googleAuthReason(error);
 console.error('google_auth_failed',{feature,hint,detail});
 return Error('Không xác thực được Google Sheets: '+hint+'. Chi tiết: '+(detail||'không rõ')+'.');
}
