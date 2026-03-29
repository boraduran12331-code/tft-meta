const fs = require('fs');
try {
  const file = fs.readFileSync('scraped.json', 'utf8');
  if(!file || file.length < 10) { console.log('scraped.json is empty'); process.exit(0); }
  const d = JSON.parse(file);
  const comps = d.props.pageProps.initialState.comps || d.props.pageProps.comps || [];
  console.log('Total comps:', comps.length);
  if (comps.length > 0) {
    console.log('First comp name:', comps[0].name);
    console.log('First comp units:', comps[0].units ? comps[0].units.map(u => u.name).join(', ') : 'no units mapped');
  } else {
    console.log("No comps found in typical paths.");
    console.log("Keys in pageProps:", Object.keys(d.props.pageProps));
  }
} catch(err) {
  console.error(err.message);
}
