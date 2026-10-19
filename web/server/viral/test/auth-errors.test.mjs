import test from 'node:test';import assert from 'node:assert/strict';import {authFailure} from '../auth-errors.mjs';
test('authentication outages and rate limits are not reported as wrong passwords',()=>{
 assert.equal(authFailure({code:'invalid_credentials',status:400}).status,401);
 for(const input of [{status:429},{code:'over_request_rate_limit',status:429},{status:503},{name:'AuthRetryableFetchError',status:0}]){const result=authFailure(input);assert.doesNotMatch(result.message,/mật khẩu không đúng/);assert.ok([429,503].includes(result.status));}
 assert.equal(authFailure({code:'user_banned',status:400}).status,403);assert.match(authFailure({code:'same_password',status:422},'password').message,/khác/);
 assert.doesNotMatch(authFailure({status:500,message:'private URL token'}).message,/private|token/);
});
