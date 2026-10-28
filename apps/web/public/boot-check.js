// Startup watchdog (plain script, runs even if the app's module fails to load).
// Collects early errors and, if the app hasn't started after a while, replaces
// the "Loading Poser…" text with what went wrong so it can be reported.
(function () {
  var errors = [];
  window.__poserBootErrors = errors;
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) {
      errors.push("Couldn't load " + (t.src || t.href));
      return;
    }
    errors.push((e.message || 'Error') + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : ''));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    errors.push('Unhandled: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });
  setTimeout(function () {
    var root = document.getElementById('root');
    if (!root || !root.querySelector('[data-boot-loading]')) return;
    var box = document.createElement('div');
    box.style.cssText = 'font:15px/1.5 system-ui,sans-serif;color:#eee;max-width:560px;margin:15vh auto 0;padding:0 16px';
    var h = document.createElement('h1');
    h.textContent = "Poser didn't start";
    h.style.cssText = 'font-size:22px;font-weight:500';
    var p = document.createElement('p');
    p.textContent = 'Try a hard reload (Ctrl+Shift+R, or clear this site’s data on a phone). If it still fails, send this to Claude:';
    var pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;background:#2b2930;padding:12px;border-radius:8px;font-size:12px;user-select:all';
    pre.textContent = (errors.length ? errors.join('\n') : 'No errors were reported; the app script may not have loaded.') +
      '\n\nBrowser: ' + navigator.userAgent;
    box.append(h, p, pre);
    root.replaceChildren(box);
  }, 12000);
})();
