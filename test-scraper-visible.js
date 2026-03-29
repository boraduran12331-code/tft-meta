const { app, BrowserWindow } = require('electron');
const fs = require('fs');
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: true, x: -9999, y: -9999, width: 800, height: 600, webPreferences: { contextIsolation: true } });
  win.webContents.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  win.loadURL('https://www.metatft.com/pbe-comps');
  
  // Wait up to 10 seconds to allow Cloudflare JS challenge to pass
  setTimeout(async () => {
    try {
      const data = await win.webContents.executeJavaScript('JSON.stringify(window.__NEXT_DATA__)');
      fs.writeFileSync('scraped_pbe.json', data || '{}');
      console.log('Done scraping!');
      app.quit();
    } catch (e) { console.error('Error', e); app.quit(); }
  }, 10000);
});
