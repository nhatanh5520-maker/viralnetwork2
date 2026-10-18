import test from 'node:test';import assert from 'node:assert/strict';import {telegramFailure} from '../telegram-errors.mjs';
test('Telegram diagnostics distinguish blocked recipients, stale groups and invalid token without exposing raw descriptions',()=>{
 assert.match(telegramFailure({error_code:403,description:'secret token or URL'},403),/Bot bị chặn/);
 assert.match(telegramFailure({error_code:400,description:'Bad Request: chat not found'},400),/Không tìm thấy/);
 assert.match(telegramFailure({error_code:400,parameters:{migrate_to_chat_id:-100123}},400),/supergroup/);
 assert.match(telegramFailure({error_code:401},401),/Token bot/);
 assert.doesNotMatch(telegramFailure({error_code:400,description:'secret token or URL'},400),/secret|URL/);
});
