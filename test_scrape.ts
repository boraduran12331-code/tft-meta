import * as https from 'https'

export function testMetaTFTScrape() {
  https.get('https://www.metatft.com/comps', (res) => {
    let data = ''
    res.on('data', chunk => data += chunk)
    res.on('end', () => {
      const match = data.match(/<script id="__NEXT_DATA__" type="application\/json">({.*?})<\/script>/)
      if (match) {
        try {
          const json = JSON.parse(match[1])
          const comps = json.props.pageProps.comps || json.props.pageProps.initialState?.comps?.comps || json.props.pageProps.data
          console.log('Successfully scraped data! Keys in pageProps:', Object.keys(json.props.pageProps))
        } catch (e) {
          console.error('Parse error', e)
        }
      } else {
        console.log('No NEXT_DATA block found!')
      }
    })
  })
}

testMetaTFTScrape()
