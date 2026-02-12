// ------- UI HELPERS -------
// ------- ICON URLS -------
const AUTOFIL_ICON_URL = chrome.runtime.getURL('images/autofillicon.jpg'); // update if needed
const HOME_ICON_URL    = chrome.runtime.getURL('images/homeicon.png');     // update if needed
function createMenuItem(id, iconUrl, label, className) {
  const item = document.createElement('div');
  item.id = id;
  item.className = 'jobAidMenuItem ' + className;
  item.title = label;
  Object.assign(item.style, {
    width: '32px', height: '32px', borderRadius: '50%', background: '#111827',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', position: 'absolute', transition: 'transform 0.3s ease, background-color 0.1s',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    zIndex: '2147483647'
  });
  const img = document.createElement('img');
  img.src = iconUrl;
  img.style.width = '20px';
  img.style.height = '20px';
  img.style.objectFit = 'contain';
  img.style.filter = 'none';                 // keep original colors (fix visibility)
  img.alt = label || '';
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.loading = 'eager';
  img.onerror = () => {
    console.warn('[JobAid] Icon failed to load:', iconUrl);
    item.textContent = label?.[0] || '•';
    item.style.color = '#fff';
    item.style.font = '12px system-ui';
  };

  item.appendChild(img);
  return item;
}

function createRoad(isLeft) {
  const road = document.createElement('div');
  road.className = 'jobAidMenuRoad';
  Object.assign(road.style, {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    height: '3px',
    background: '#3b82f6',
    transition: 'width 0.3s ease, opacity 0.3s ease',
    opacity: '0',
    width: '0px'
  });
  const iconWidth = 48;
  road.style[isLeft ? 'left' : 'right'] = `${iconWidth}px`;
  return road;
}

// Exports
export { AUTOFIL_ICON_URL, HOME_ICON_URL, createMenuItem, createRoad };
