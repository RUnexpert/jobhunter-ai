import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const secret = () => randomBytes(32).toString('hex');
const password = secret();
const env = (await readFile(new URL('../.env.example', import.meta.url), 'utf8'))
  .replaceAll('CHANGE_ME', password)
  .replace('REPLACE_WITH_64_HEX_CHARACTERS', secret())
  .replace('REPLACE_WITH_A_RANDOM_INVITE_CODE', secret());
try {
  await writeFile(new URL('../.env', import.meta.url), env, { flag: 'wx', mode: 0o600 });
  console.log(
    '.env создан. Укажите ключи интеграций и используйте REGISTRATION_CODE из файла при регистрации.',
  );
} catch (e) {
  if (e.code === 'EEXIST') console.log('.env уже существует, изменения не внесены.');
  else throw e;
}
