// Updating the operator's Auth credentials can invalidate their old session.
// Reauthenticate in the same Route Handler so its response writes fresh cookies.
export async function refreshStaffOperatorSession(client, credential, expectedAuthId) {
  const {data,error}=await client.auth.signInWithPassword({email:credential.email,password:credential.password});
  if(error||data?.user?.id!==expectedAuthId){
    await client.auth.signOut();
    throw Error('Đã cập nhật tài khoản của bạn nhưng chưa tạo lại được phiên đăng nhập. Đăng nhập /admin bằng email và mật khẩu trong dòng Giám đốc đã chọn ở Excel, rồi nhập lại cùng file.');
  }
}
