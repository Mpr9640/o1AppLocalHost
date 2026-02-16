import { IS_TOP_WINDOW, ROLE_UI } from "./position.js";
import { AUTOFIL_ICON_URL, HOME_ICON_URL, createMenuItem, createRoad } from "./menu/menuCreating.js";
import { syncAppliedBadgePosition, updateAppliedUI } from "./menu/applied.js";
import { clamp } from "../core/utils.js";
import { pauseDetections } from "../../contentscript.js";


// ------- MAIN ICON + MENU -------
//Reuests to make the icon displays on top instead of iframes.
// Prevent spamming background on noisy scans
let __ja_lastUIReqAt = 0;
function __ja_rateLimit(ms = 600) {
  const now = Date.now();
  if (now - __ja_lastUIReqAt < ms) return false;
  __ja_lastUIReqAt = now;
  return true;
}
function requestShowIcon(det = null) {
  if (IS_TOP_WINDOW) {
    console.log('In request show icon going to call show icon main ');
    showIcon(); // render locally (top only)
    return;
  }

  // In iframe → forward request to top frame via background
  if (!__ja_rateLimit(700)) return;

  try {
    chrome.runtime.sendMessage({
      action: 'JA_SHOW_ICON_TOP',
      det: det ? {
        score: det.score ?? det.points ?? null,
        allowUI: !!det.allowUI,
        why: det.why || det.reason || null,
      } : null
    });
  } catch {}
}


function showIcon() {
  if (!ROLE_UI) return;
  if (document.getElementById('jobAidIcon')) return;
  const iconUrl = chrome.runtime.getURL('images/icon.jpeg');
  const icon = document.createElement('img');
  icon.src = iconUrl; icon.id = 'jobAidIcon';
  Object.assign(icon.style, {
    position:'fixed', left:'40px', top:'40px', width:'48px', height:'48px',
    zIndex: '2147483647', cursor:'pointer', userSelect:'none', pointerEvents:'auto',
    borderRadius: '50%',
  });

  const menuContainer = document.createElement('div');
  menuContainer.id = 'jobAidMenuContainer';
  Object.assign(menuContainer.style, {
    position: 'fixed',
    left: '20px', top: '20px',
    width: '48px', height: '48px',
    pointerEvents: 'none', opacity: '0',
    transition: 'opacity 0.2s ease',
    zIndex: '2147483647',
  });

  const padding = 6;
  const iconSize = 32;
  const roadLength = 16;
  const moveDistance = padding + roadLength;
  const iconCenterOffset = iconSize / 2;

  // Left: Autofill
  const autofillIcon = createMenuItem('jobAidAutofillIcon', AUTOFIL_ICON_URL, 'Autofill', 'autofill-menu-icon');
  autofillIcon.style.left = `calc(50% - ${moveDistance + iconCenterOffset}px)`;
  autofillIcon.style.top  = `calc(50% - ${iconCenterOffset}px)`;
  const autofillRoad = createRoad(true);
  autofillRoad.style.left = `${48 + padding}px`;
  autofillRoad.style.width = `${roadLength}px`;

  // Right: Home
  const homeIcon = createMenuItem('jobAidHomeIcon', HOME_ICON_URL, 'Home Page', 'home-menu-icon');
  homeIcon.style.right = `calc(50% - ${moveDistance + iconCenterOffset}px)`;
  homeIcon.style.top   = `calc(50% - ${iconCenterOffset}px)`;
  const homeRoad = createRoad(false);
  homeRoad.style.right = `${48 + padding}px`;
  homeRoad.style.width = `${roadLength}px`;

  menuContainer.appendChild(autofillRoad);
  menuContainer.appendChild(homeRoad);
  menuContainer.appendChild(autofillIcon);
  menuContainer.appendChild(homeIcon);

  // Menu hover logic
  let menuVisible = false;
  const hideMenu = () => {
    if (!menuVisible) return;
    menuVisible = false;
    menuContainer.style.opacity = '0';
    menuContainer.style.pointerEvents = 'none';
    autofillIcon.style.transform = 'translateX(0)';
    homeIcon.style.transform = 'translateX(0)';
    autofillRoad.style.width = '0px'; autofillRoad.style.opacity = '0';
    homeRoad.style.width = '0px';     homeRoad.style.opacity   = '0';
  };
  const showMenu = () => {
    if (menuVisible) return;
    menuVisible = true;
    menuContainer.style.opacity = '1';
    menuContainer.style.pointerEvents = 'auto';
    autofillIcon.style.transform = `translateX(-${roadLength}px)`;
    homeIcon.style.transform     = `translateX(${roadLength}px)`;
    autofillRoad.style.width = `${roadLength}px`; autofillRoad.style.opacity = '1';
    homeRoad.style.width   = `${roadLength}px`;   homeRoad.style.opacity   = '1';
  };
  icon.addEventListener('pointerenter', showMenu);
  icon.addEventListener('pointerleave', hideMenu);
  menuContainer.addEventListener('pointerenter', showMenu);
  menuContainer.addEventListener('pointerleave', hideMenu);

  // Drag logic
  let isDragging=false, moved=false, offsetX=0, offsetY=0;
  const updateMenuPosition = (x, y) => {
    menuContainer.style.left = x + 'px';
    menuContainer.style.top  = y + 'px';
    syncAppliedBadgePosition(icon);
  };
  icon.addEventListener('pointerdown', e => {
    isDragging = true; moved = false;
    offsetX = e.clientX - icon.offsetLeft; offsetY = e.clientY - icon.offsetTop;
    icon.setPointerCapture(e.pointerId);
    icon.style.cursor = 'grabbing'; e.preventDefault();
    hideMenu();
  });
  icon.addEventListener('pointermove', e => {
    if (!isDragging) return; moved = true;
    let x = e.clientX - offsetX; let y = e.clientY - offsetY;
    const maxX = window.innerWidth - icon.offsetWidth; const maxY = window.innerHeight - icon.offsetHeight;
    x = clamp(x, 0, maxX); y = clamp(y, 0, maxY);
    icon.style.left = x + 'px'; icon.style.top = y + 'px';
    updateMenuPosition(x, y);
    syncAppliedBadgePosition(icon);
  });
  icon.addEventListener('pointerup', e => {
    if (!isDragging) return; isDragging = false;
    icon.releasePointerCapture(e.pointerId); icon.style.cursor = 'pointer';
    syncAppliedBadgePosition(icon);
  });

  // Main icon click → open popup
  icon.addEventListener('click', e => {
    if (moved) { e.stopImmediatePropagation(); return; }
    chrome.runtime.sendMessage({ action: 'openPopup' });
    hideMenu();
  });

  // ---- Option B: handle clicks locally (no background listeners needed) ----
  homeIcon.addEventListener('click', e => {
    e.stopImmediatePropagation();
    hideMenu();
    // open app home in a new tab
    window.open('http://localhost:3000/home', '_blank');
  });

  autofillIcon.addEventListener('click', async e => {
    e.stopImmediatePropagation();
    hideMenu();
    try {
      const bundleURL = chrome.runtime.getURL('autofill.bundle.js');
      const mod = await import(/* webpackIgnore: true */ bundleURL);
      if (mod?.autofillInit) {
        const { autofillData = null } = await chrome.storage.local.get('autofillData');
        window.__JA_busyAutofill = true;
        //AUTOFILL_ACTIVE = true;
        pauseDetections(250); // quiet period while we interact
        //module.autofillInit(token, data);
        mod.autofillInit("", autofillData);
        //AUTOFILL_ACTIVE = false;
        window.__JA_busyAutofill = false;
        pauseDetections(250);  // small tail to let DOM settle 
      } else {
        console.error('autofillInit export not found in', bundleURL);
      }
    } catch (err) {
      console.error('Autofill failed:', err);
    }
  });

  // Append + initial positioning
  document.body.appendChild(menuContainer);
  document.body.appendChild(icon);
  updateMenuPosition(icon.offsetLeft, icon.offsetTop);

  // Save global ref so other code paths can refresh the badge
  window.__JobAidIconEl = icon;

  // Initial applied-state fetch + badge render
  updateAppliedUI(icon,);

  // Keep badge following the icon if you drag/scroll/resize
  window.addEventListener('scroll', () => syncAppliedBadgePosition(icon), { passive: true });
  window.addEventListener('resize', () => syncAppliedBadgePosition(icon), { passive: true });

  try { window.__JobAidIconShown = true; } catch {}
  try { if (typeof window.initATSWatchers === 'function') window.initATSWatchers(); } catch {}
  console.log('JOb aid icon show was done.')
}

// Exports
export { __ja_lastUIReqAt, __ja_rateLimit, requestShowIcon, showIcon };
