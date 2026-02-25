/**
 * scripts/atswatchers/reporting/submissionCard.js
 * Floating confirmation card shown after a successful application submit.
 */

/**
 * Show a floating confirmation card in the center of the viewport.
 * Auto-fades after 4 seconds. Idempotent — won't stack duplicates.
 *
 * @param {{ title?: string, subtitle?: string, logo_url?: string }} card
 */
export function showSubmissionCard(card) {
  const id = '__jobAidSubmissionCard__';
  if (document.getElementById(id)) return;

  const host = document.createElement('div');
  host.id = id;
  Object.assign(host.style, {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
    zIndex: 2147483647, background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,.25)', width: 'min(360px,92vw)',
    padding: '14px'
  });

  host.innerHTML = `
    <div style="display:grid;grid-template-columns:40px 1fr;gap:10px;align-items:start">
      <img src="${escapeAttr(card.logo_url || '')}" onerror="this.style.display='none'"
           style="width:40px;height:40px;border-radius:8px;background:#f3f4f6;"/>
      <div>
        <div style="font-weight:800;font:14px system-ui">${escapeHtml(card.title || '—')}</div>
        <div style="color:#6b7280;font:12px system-ui">${escapeHtml(card.subtitle || '')}</div>
        <div style="margin-top:8px;color:#16a34a;font-weight:700;font:12px system-ui">Submitted ✓</div>
      </div>
    </div>`;

  document.body.appendChild(host);
  setTimeout(() => {
    host.style.opacity = '0';
    host.style.transition = 'opacity .2s';
    setTimeout(() => host.remove(), 220);
  }, 4000);
}

/**
 * Show a centered chooser card to manually pick a canonical job.
 * Idempotent — won't stack duplicates.
 *
 * @param {Array<{url:string,title?:string,company?:string,location?:string,logo_url?:string|null}>} items
 * @param {(item:any)=>Promise<void>|void} onPick
 * @param {{ title?: string, subtitle?: string }} [opts]
 */
export function showCanonicalChooserCard(items, onPick, opts = {}) {
  const id = '__jobAidCanonicalChooser__';
  if (document.getElementById(id)) return;

  const safeItems = Array.isArray(items) ? items.slice(0, 7) : [];
  if (!safeItems.length) return;

  const host = document.createElement('div');
  host.id = id;
  Object.assign(host.style, {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
    zIndex: 2147483647, background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,.25)',
    width: 'min(420px,94vw)', padding: '14px'
  });

  const close = () => host.remove();

  host.innerHTML = `
    <div style="display:flex;align-items:start;justify-content:space-between;gap:10px;margin-bottom:10px">
      <div>
        <div style="font-weight:900;font:14px system-ui">${escapeHtml(opts.title || 'Pick the job you just applied')}</div>
        <div style="color:#6b7280;font:12px system-ui;margin-top:2px">
          ${escapeHtml(opts.subtitle || 'We couldn’t confirm automatically. Select one to save it as applied.')}
        </div>
      </div>
      <button id="__ja_cc_close__"
        style="border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:6px 10px;cursor:pointer;font:12px system-ui">
        Close
      </button>
    </div>
    <div id="__ja_cc_list__" style="display:grid;gap:8px"></div>
    <div id="__ja_cc_status__" style="margin-top:10px;color:#6b7280;font:12px system-ui"></div>
  `;

  document.body.appendChild(host);

  host.querySelector('#__ja_cc_close__')?.addEventListener('click', close);

  const list = host.querySelector('#__ja_cc_list__');
  const status = host.querySelector('#__ja_cc_status__');

  const setStatus = (t) => { if (status) status.textContent = t || ''; };
  const setBusy = (busy) => {
    if (!list) return;
    list.style.pointerEvents = busy ? 'none' : 'auto';
    list.style.opacity = busy ? '0.7' : '1';
  };

  safeItems.forEach((it) => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'grid',
      gridTemplateColumns: '36px 1fr',
      gap: '10px',
      padding: '10px',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      cursor: 'pointer'
    });

    row.innerHTML = `
      <img src="${escapeAttr(it.logo_url || '')}" onerror="this.style.display='none'"
           style="width:36px;height:36px;border-radius:10px;background:#f3f4f6;object-fit:cover"/>
      <div>
        <div style="font-weight:800;font:13px system-ui;color:#111827">${escapeHtml(it.title || '—')}</div>
        <div style="color:#6b7280;font:12px system-ui">
          ${escapeHtml([it.company, it.location].filter(Boolean).join(' • '))}
        </div>
        <div style="margin-top:6px">
          <a href="${escapeAttr(it.url || '#')}" target="_blank" rel="noopener"
             style="font:12px system-ui;color:#2563eb;text-decoration:none">
            Open job
          </a>
        </div>
      </div>
    `;

    row.addEventListener('click', async (e) => {
      // avoid pick when clicking the link
      if (e.target && e.target.closest && e.target.closest('a')) return;

      try {
        setBusy(true);
        setStatus('Saving…');
        await Promise.resolve(onPick?.(it));
        setStatus('');
        close();
      } catch (err) {
        console.error('Chooser pick failed:', err);
        setBusy(false);
        setStatus('Failed to save. Try again.');
      }
    });

    list?.appendChild(row);
  });
}

/* ---------- tiny escaping helpers ---------- */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function escapeAttr(s) {
  // good enough for url/src/href in this internal UI
  return escapeHtml(s).replace(/"/g, '&quot;');
}
