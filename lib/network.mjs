import os from 'node:os';

export function networkAddresses(port=3100,interfaces=os.networkInterfaces()) {
  const entries=Object.entries(interfaces).flatMap(([name,addresses])=>(addresses||[]).filter(a=>!a.internal&&(a.family==='IPv4'||a.family===4)).map(a=>({name,address:a.address})));
  const radmin=entries.find(a=>/radmin/i.test(a.name));
  const lan=entries.filter(a=>!/radmin|vpn|tun|tap|tailscale|zerotier/i.test(a.name));
  lan.sort((a,b)=>Number(b.address.startsWith('192.168.'))-Number(a.address.startsWith('192.168.')));
  return {radminAddress:radmin?.address||'',radminUrl:radmin?`http://${radmin.address}:${port}`:'',lanUrls:lan.map(a=>`http://${a.address}:${port}`)};
}

export function shareSettings({port=3100,mode='local',publicUrl='',interfaces}={}) {
  const addresses=networkAddresses(port,interfaces);
  if(mode==='radmin')return {...addresses,shareMode:'radmin',publicUrl:'',shareUrl:addresses.radminUrl};
  return {...addresses,shareMode:publicUrl?'internet':'local',publicUrl,shareUrl:publicUrl||addresses.lanUrls[0]||''};
}
