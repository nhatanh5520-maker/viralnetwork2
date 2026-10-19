export class ViralAuthFailure extends Error {
 constructor(message,status){super(message);this.status=status;}
}
export function authFailure(error,context='login'){
 const code=String(error?.code||''),status=Number(error?.status||0);
 if(status===429||code==='over_request_rate_limit'||code==='over_email_send_rate_limit')return new ViralAuthFailure('Có quá nhiều lần xác thực. Vui lòng đợi một lúc rồi thử lại.',429);
 if(status>=500||status===0&&!code)return new ViralAuthFailure('Chưa kết nối được dịch vụ đăng nhập. Vui lòng thử lại sau ít giây.',503);
 if(code==='email_not_confirmed')return new ViralAuthFailure('Email chưa được xác nhận. Liên hệ HR để kiểm tra tài khoản.',403);
 if(code==='user_banned')return new ViralAuthFailure('Tài khoản đang bị khóa. Liên hệ HR để kiểm tra.',403);
 if(context==='password'&&code==='same_password')return new ViralAuthFailure('Mật khẩu mới phải khác mật khẩu hiện tại.',400);
 if(context==='password')return new ViralAuthFailure('Chưa đổi được mật khẩu. Kiểm tra chính sách mật khẩu hoặc liên hệ quản trị.',400);
 return new ViralAuthFailure('Email hoặc mật khẩu không đúng.',401);
}
