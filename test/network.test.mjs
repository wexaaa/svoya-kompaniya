import {test} from 'node:test';
import assert from 'node:assert/strict';
import {networkAddresses,shareSettings} from '../lib/network.mjs';
const interfaces={Ethernet:[{family:'IPv4',internal:false,address:'192.168.50.20'}],'Radmin VPN':[{family:'IPv4',internal:false,address:'26.10.20.30'}],v2RayTun:[{family:'IPv4',internal:false,address:'172.16.0.1'}],Loopback:[{family:'IPv4',internal:true,address:'127.0.0.1'}]};
test('Radmin sharing ignores old Cloudflare URL and excludes other VPN adapters',()=>{
  const v=shareSettings({mode:'radmin',publicUrl:'https://old.trycloudflare.com',port:3100,interfaces});
  assert.equal(v.shareUrl,'http://26.10.20.30:3100');assert.equal(v.publicUrl,'');assert.equal(v.shareMode,'radmin');assert.deepEqual(v.lanUrls,['http://192.168.50.20:3100']);
});
test('missing Radmin adapter does not invent an address from another 26.x interface',()=>{
  const v=networkAddresses(3211,{Other:[{family:'IPv4',internal:false,address:'26.10.10.10'}]});assert.equal(v.radminUrl,'');
});
test('local and optional internet sharing preserve their own addresses',()=>{
  assert.equal(shareSettings({interfaces}).shareUrl,'http://192.168.50.20:3100');
  assert.equal(shareSettings({interfaces,publicUrl:'https://example.org'}).shareUrl,'https://example.org');
  assert.equal(networkAddresses(3211,interfaces).radminUrl,'http://26.10.20.30:3211');
});
