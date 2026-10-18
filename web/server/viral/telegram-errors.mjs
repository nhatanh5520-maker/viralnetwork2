// Only fixed descriptions are exposed. Never return request URLs or tokens.
export function telegramFailure(result,status){
 const code=Number(result?.error_code||status),description=String(result?.description||'').toLowerCase();
 if(code===401)return 'Token bot Telegram không hợp lệ.';
 if(result?.parameters?.migrate_to_chat_id)return 'Nhóm đã chuyển thành supergroup; cần cập nhật ID nhóm.';
 if(code===429)return 'Telegram đang giới hạn gửi tin; chờ lượt tiếp theo.';
 if(code===403)return 'Bot bị chặn hoặc không có quyền gửi tới người/nhóm nhận.';
 if(description.includes('chat not found'))return 'Không tìm thấy người/nhóm nhận; kiểm tra Telegram ID, Start bot và thành viên nhóm.';
 if(description.includes('not enough rights')||description.includes('have no rights'))return 'Bot chưa được phép gửi tin trong nhóm.';
 return 'Telegram từ chối thông báo (mã '+(Number.isFinite(code)?code:'không rõ')+').';
}
