const code1 = "37003534f36c35037236235a012000";
const buf = Buffer.from(code1, 'hex');

console.log('Bytes:', [...buf].map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('String:', buf.toString('utf8'));
console.log('Base64:', buf.toString('base64'));

// Try reading as 16-bit little-endian
const u16 = [];
for(let i=0; i<buf.length; i+=2) {
  if (i+1 < buf.length) u16.push(buf.readUInt16LE(i));
}
console.log('u16 LE:', u16);

// Try decoding as numbers/binary layout
let bits = '';
for(let i=0; i<buf.length; i++) {
  bits += buf[i].toString(2).padStart(8, '0');
}
console.log('Bits:', bits);
