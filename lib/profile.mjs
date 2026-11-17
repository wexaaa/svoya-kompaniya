// Only viewer links are distributed to the other participants.
export function cameraLink(value) {
  if (value === '' || value == null) return '';
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Ссылка VDO.Ninja слишком длинная.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Вставьте ссылку просмотра VDO.Ninja с ?view=…'); }
  if (url.origin !== 'https://vdo.ninja' || url.pathname !== '/' || url.username || url.password)
    throw new Error('Поддерживаются ссылки https://vdo.ninja/?view=…');
  const params = new URLSearchParams(url.search);
  for (const [key, val] of new URLSearchParams(url.hash.slice(1))) params.set(key, val);
  if (params.has('push') || params.has('director')) throw new Error('Нужна ссылка просмотра (?view=…), а не ссылка отправки камеры.');
  const id = params.get('view');
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('В ссылке должен быть один идентификатор потока: ?view=…');
  if (url.searchParams.getAll('view').length > 1) throw new Error('Укажите только один видеопоток.');
  const out = new URL('https://vdo.ninja/');
  out.searchParams.set('view', id);
  for (const key of ['password', 'salt', 'room']) {
    const val = params.get(key) ?? (key === 'password' ? params.get('p') : null);
    if (val !== null) {
      if (!val || val.length > 128 || /[\x00-\x1f\x7f]/.test(val)) throw new Error('Некорректный пароль или параметр ссылки VDO.Ninja.');
      out.searchParams.set(key, val);
    }
  }
  // Camera cards have no audio, controls or device access prompts.
  for (const [key, val] of Object.entries({autostart:'1', cleanoutput:'1', noaudio:'1', videobitrate:'400'})) out.searchParams.set(key, val);
  return out.href;
}

export function validateAvatar(buffer) {
  const fail = () => { throw new Error('Не удалось прочитать фото. Выберите другое изображение.'); };
  if (buffer.length > 1024 * 1024) throw new Error('Готовая аватарка должна быть не больше 1 МБ.');
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail();
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii',12,16) !== 'IHDR') fail();
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height || width > 1024 || height > 1024) fail();
  let offset = 8, image = false, end = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii',offset+4,offset+8);
    if (length > buffer.length - offset - 12) fail();
    if (type === 'IDAT') image = true;
    offset += length + 12;
    if (type === 'IEND') { if (length !== 0) fail(); end = true; break; }
  }
  if (!image || !end || offset !== buffer.length) fail();
}
