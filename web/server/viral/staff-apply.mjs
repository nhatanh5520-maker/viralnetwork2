import {applyAuthoritativeRoster} from './staff-roster.mjs';

export function staffApplyError(error) {
  const code=String(error?.code||'UNKNOWN').replace(/[^A-Za-z0-9_-]/g,'').slice(0,24)||'UNKNOWN';
  const reasons={PGRST202:'API chưa nhận hàm viral_staff_sync hoặc tên tham số không khớp.',PGRST203:'Có nhiều hàm viral_staff_sync trùng tên tham số.',42501:'Tài khoản máy chủ thiếu quyền thực thi hàm đồng bộ.',42702:'Hàm SQL có tên cột hoặc tham số không rõ ràng.',23505:'Liên kết tài khoản hoặc mã nhân viên bị trùng.',23502:'Thiếu giá trị bắt buộc trong bảng database.',42883:'Database không tìm thấy hàm phù hợp.',57014:'Yêu cầu database bị quá thời gian.'};
  const business={'Main changed':'Dữ liệu liên tục thay đổi. Đợi các thao tác khác hoàn tất rồi bấm lại.','Staff import changed':'Lượt nhập đã thay đổi hoặc đã áp dụng. Tải lại trang để kiểm tra.','Not all staff accounts provisioned':'Lượt nhập chưa có đủ tài khoản.','Invalid staff mappings':'Liên kết tài khoản trong lượt nhập không hợp lệ.'};
  return Error('Chưa áp dụng bảng nhân sự ['+code+']. '+(reasons[code]||business[error?.message]||'Cần kiểm tra lỗi API/database theo mã này.'));
}

// Retry only an explicit version rejection, which occurs before any DB writes.
// A network failure may have committed: never retry it automatically.
export async function applyStaffRoster({initial,stage,people,mappings,reload}) {
  let state=initial;
  for(let attempt=0;attempt<3;attempt++){
    const {data,error}=await state.svc.rpc('viral_staff_sync',{
      stage_id:stage.id,stage_version:stage.version,main_version:state.version,
      new_data:applyAuthoritativeRoster(state.data,people),mappings
    });
    if(!error){if(!data)throw staffApplyError({code:'EMPTY_RESULT'});return data;}
    if(error.code!=='P0001'||error.message!=='Main changed'||attempt===2)throw staffApplyError(error);
    state=await reload();
  }
}
