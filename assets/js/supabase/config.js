/* DataLab — public Supabase settings for the browser.
   ONLY the project URL and the PUBLISHABLE (anon) key go here: they are public by design and every
   table is protected by Row Level Security. NEVER put the service_role / secret key (sb_secret_…) in
   this file or anywhere the browser loads — cloud.js refuses to start if it sees one.
   Empty values = the game runs offline (local saves, local wallet), exactly as before.
   Fill it from Project Settings → API (or copy config.example.js). */
window.DATALAB_CONFIG = {
  supabaseUrl: 'https://lhqatamrukslqjqgmzqz.supabase.co',            // e.g. 'https://abcd1234.supabase.co'
  supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocWF0YW1ydWtzbHFqcWdtenF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMDkyNzIsImV4cCI6MjEwNjc4NTI3Mn0.lW4DF8sWNbqhodsM2YqLaL3h4azJzDEdNbunbx4PzMY', // 'sb_publishable_…' or the legacy anon key
  autosaveSeconds: 30,
  // Spotify (compact in-game player): the app's PUBLIC Client ID from developer.spotify.com/dashboard.
  // OAuth with PKCE: there is NO client secret in this project; never paste one here. Empty = no player.
  spotifyClientId: '886bbf5787614301b2efd5d0b5edb384',
  // optional: only if the Redirect URI registered on Spotify differs from <this site>/spotify-callback.html
  // spotifyRedirectUri: 'https://datalab-six.vercel.app/spotify-callback.html',
  // YouTube Music (compact in-game player): talks to the YTMDesktop v2 app on EACH player's own computer.
  // Nothing secret here: the token is created by YTMDesktop when the player approves the code in the app,
  // and it stays in that player's browser (localStorage). NEVER put a YTMDesktop token in this file.
  // false / missing = no "YouTube Music" button. Host: only 127.0.0.1 or localhost (CSP in jogo.html).
  ytmDesktopEnabled: true,
  // ytmDesktopHost: '127.0.0.1',
  // ytmDesktopPort: 9863,   // a different port must also go into connect-src in jogo.html's CSP
  // Desktop app (baixar.html, opened from Main Menu → Baixar para PC): PUBLIC https links to the installers.
  // Empty = the page shows "Em breve". version is only displayed (e.g. '0.9.0').
  desktopDownloads: {
    version: '0.9.0',
    windows: 'https://github.com/Castrof14/DataLab/releases/download/desktop-v0.9.0/DataLab-Setup.exe',   // e.g. 'https://github.com/<you>/<repo>/releases/download/v0.9.0/DataLab-Setup.exe'
    mac: 'https://datalab-six.vercel.app/downloads/DataLab-0.9.0-mac.dmg',   // Apple Silicon (arm64)
  },
};
