/* DataLab — Feedback service: community ideas (likes) and bug reports (message + screenshot).
   Everything goes through the Edge Function "feedback"; the limits (3 ideas / 10 bugs a day, image
   ≤ 1 MB, staff-only status changes) are enforced there and in the database. */
(function () {
  'use strict';
  const DL = window.DL;
  const call = (body) => DL.Cloud.call('feedback', body);
  const MAX_BYTES = 900 * 1024;   // under the server's 1 MB, with room to spare
  const MAX_SIDE = 1600;

  // Any image source (File, Blob, canvas) → JPEG re-encoded in the browser: smaller, and the photo's
  // EXIF (location, device) never leaves the player's machine. Resolves { mime, data (base64), url }.
  async function encode(src) {
    let img = src;
    if (src instanceof Blob) {
      if (!/^image\//.test(src.type)) throw new Error('not_image');
      img = await new Promise((resolve, reject) => {
        const el = new Image(), u = URL.createObjectURL(src);
        el.onload = () => { URL.revokeObjectURL(u); resolve(el); };
        el.onerror = () => { URL.revokeObjectURL(u); reject(new Error('not_image')); };
        el.src = u;
      });
    }
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error('not_image');
    let scale = Math.min(1, MAX_SIDE / Math.max(w0, h0)), q = 0.85, blob = null;
    for (let tries = 0; tries < 8; tries++) {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w0 * scale)); cv.height = Math.max(1, Math.round(h0 * scale));
      const g = cv.getContext('2d');
      g.fillStyle = '#05070d'; g.fillRect(0, 0, cv.width, cv.height);   // JPEG has no alpha
      g.drawImage(img, 0, 0, cv.width, cv.height);
      blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', q));
      if (!blob) throw new Error('encode');
      if (blob.size <= MAX_BYTES) break;
      if (q > 0.55) q -= 0.15; else scale *= 0.75;
    }
    if (blob.size > MAX_BYTES) throw new Error('too_large');
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('encode'));
      fr.readAsDataURL(blob);
    });
    return { mime: 'image/jpeg', data: String(dataUrl).split(',')[1], url: dataUrl, bytes: blob.size };
  }

  DL.FeedbackService = {
    ideas: (tab, sort) => call({ action: 'ideas', tab, sort }),
    createIdea: (title, body) => call({ action: 'idea_create', title, body }),
    like: (id, on) => call({ action: 'idea_like', id, on: !!on }),
    removeIdea: (id) => call({ action: 'idea_delete', id }),
    setIdeaStatus: (id, status, note) => call({ action: 'idea_status', id, status, note: note || '' }),
    // image: the result of encode() or null; context: { where, version, screen, preset, phase, mode, room }
    reportBug: (message, image, context) => call({ action: 'bug_report', message, context, image: image ? { mime: image.mime, data: image.data } : null }),
    bugs: (scope, status) => call({ action: 'bugs', scope, status: status || null }),
    bugShot: (id) => call({ action: 'bug_shot', id }),
    setBugStatus: (id, status, note) => call({ action: 'bug_status', id, status, note: note || '' }),
    encode,
  };
})();
