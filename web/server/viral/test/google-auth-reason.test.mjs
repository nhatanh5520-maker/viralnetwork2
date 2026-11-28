import test from 'node:test';import assert from 'node:assert/strict';
import {JWT} from 'google-auth-library';
import {googleAuthReason,googleAuthError} from '../google-auth-reason.mjs';

test('malformed private key: real google-auth-library error maps to a format hint',async()=>{
 const error=await new JWT({email:'a@b.iam.gserviceaccount.com',key:'not-a-key',scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']}).getAccessToken().then(()=>null,e=>e);
 assert.ok(error);assert.match(googleAuthReason(error).hint,/sai định dạng/);
});
test('Google token errors map to clear hints; key material never echoed',()=>{
 const resp=(error,error_description)=>({message:'fail',response:{data:{error,error_description}}});
 assert.match(googleAuthReason(resp('invalid_grant','Invalid JWT Signature.')).hint,/không khớp với email/);
 assert.match(googleAuthReason(resp('invalid_grant','Invalid grant: account not found')).hint,/không tồn tại/);
 assert.match(googleAuthReason({message:'getaddrinfo ENOTFOUND oauth2.googleapis.com'}).hint,/kết nối/);
 const leaked=googleAuthReason({message:'bad -----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY----- x'});
 assert.ok(!leaked.detail.includes('SECRET'));
 const original=console.error;console.error=()=>{};
 try{assert.match(googleAuthError(resp('invalid_grant','Invalid JWT Signature.'),'edit_schedule').message,/^Không xác thực được Google Sheets: khóa riêng .* Chi tiết: invalid_grant Invalid JWT Signature/);}finally{console.error=original;}
});
