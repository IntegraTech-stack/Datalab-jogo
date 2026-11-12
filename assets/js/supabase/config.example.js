/* DataLab — example of assets/js/supabase/config.js (public values only).
   Publishable/anon key: OK in the browser (RLS protects the data).
   service_role / secret key: NEVER here — it lives only in Supabase's Edge Function secrets. */
window.DATALAB_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabasePublishableKey: 'sb_publishable_YOUR_PUBLISHABLE_KEY',
  autosaveSeconds: 30,
  // Spotify (compact in-game player): the app's PUBLIC Client ID from developer.spotify.com/dashboard.
  // OAuth with PKCE: there is NO client secret in this project; never paste one here. Empty = no player.
  spotifyClientId: 'YOUR_SPOTIFY_CLIENT_ID',
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
    version: '',
    windows: '',   // e.g. 'https://github.com/<you>/<repo>/releases/download/v0.9.0/DataLab-Setup.exe'
    mac: '',       // e.g. 'https://github.com/<you>/<repo>/releases/download/v0.9.0/DataLab.dmg'
  },
  // AI for the crew (agents/ folder): the Agent Gateway's PUBLIC address. Not a secret — the gateway checks the
  // player's Supabase session itself and keeps every provider key. Empty = no "IA" button (on localhost the game
  // tries http://127.0.0.1:8787). A production address must also go into connect-src in jogo.html's CSP.
  // agentGatewayUrl: 'https://agents.seu-dominio.com',
  // crewAI: true liga a IA da equipe no jogo (desligada por padrão: sem botões, nada roda).
  // crewAI: false,
};
