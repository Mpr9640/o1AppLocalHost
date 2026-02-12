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
      <img src="${card.logo_url || ''}" onerror="this.style.display='none'"
           style="width:40px;height:40px;border-radius:8px;background:#f3f4f6;"/>
      <div>
        <div style="font-weight:800;font:14px system-ui">${card.title || '—'}</div>
        <div style="color:#6b7280;font:12px system-ui">${card.subtitle || ''}</div>
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