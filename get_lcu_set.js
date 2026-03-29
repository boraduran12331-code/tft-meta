const https = require('https');
const fs = require('fs');
const cp = require('child_process');
const pid = cp.execSync('pgrep -x LeagueClient').toString().trim();
const lsof = cp.execSync(`lsof -p ${pid} | grep lockfile`).toString();
const lockfile = lsof.match(/(\/[^\s]+lockfile)/)[1];
const [,, port, password] = fs.readFileSync(lockfile, 'utf8').split(':');

const req = https.request({
  hostname: '127.0.0.1',
  port: port,
  path: '/lol-game-data/assets/v1/tftchampions-teamplanner.json',
  method: 'GET',
  headers: { 'Authorization': 'Basic ' + Buffer.from('riot:' + password).toString('base64') },
  rejectUnauthorized: false
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const keys = Object.keys(JSON.parse(data));
      console.log('LCU Sets:', keys);
    } catch(e) { console.log('File not parsed'); }
  });
});
req.end();
