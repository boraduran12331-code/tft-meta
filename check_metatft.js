const https = require('https');
https.get('https://backend.metatft.com/comps', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const comps = JSON.parse(data);
      console.log('Got comps');
      // Look for a TeamCode property in the first comp
      console.log('Comp 0:', comps[0].Title, comps[0].TeamCode);
      // Let's just output any string containing TFTSet
      const match = data.match(/([a-zA-Z0-9]+TFTSet\d+)/g);
      if (match) {
        console.log('Found codes:', match.slice(0, 10));
      } else {
        console.log('No codes found. Let us inspect keys of a comp:', Object.keys(comps[0]));
      }
    } catch(e) { console.error('Error JSON:', e.message); }
  });
});
