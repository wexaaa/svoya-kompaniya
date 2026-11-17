import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraLink,validateAvatar} from '../lib/profile.mjs';

test('VDO accepts only a single viewer and preserves password, including fragment links',()=>{
  const link=new URL(cameraLink('https://vdo.ninja/?view=Camera_123&password=secret&pushX=bad#password=fragment'));
  assert.equal(link.searchParams.get('view'),'Camera_123');
  assert.equal(link.searchParams.get('password'),'fragment');
  assert.equal(link.searchParams.get('pushX'),null);
  assert.equal(link.searchParams.get('noaudio'),'1');
  for(const input of ['http://vdo.ninja/?view=a','https://vdo.ninja.evil.test/?view=a','https://vdo.ninja/other?view=a','javascript:alert(1)','https://vdo.ninja/?push=a','https://vdo.ninja/?view=a#push=b','https://vdo.ninja/?view=a,b','https://vdo.ninja/?view=a&view=b','https://vdo.ninja/?view=a&password=']) assert.throws(()=>cameraLink(input),input);
  assert.equal(cameraLink(''),'');
});

test('avatar upload rejects other formats, oversized dimensions and truncated PNGs',()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=','base64');
  validateAvatar(png);
  assert.throws(()=>validateAvatar(Buffer.from('<svg onload="alert(1)"></svg>')));
  assert.throws(()=>validateAvatar(png.subarray(0,png.length-1)));
  const huge=Buffer.from(png);huge.writeUInt32BE(50000,16);assert.throws(()=>validateAvatar(huge));
  assert.throws(()=>validateAvatar(Buffer.alloc(1024*1024+1)));
});
