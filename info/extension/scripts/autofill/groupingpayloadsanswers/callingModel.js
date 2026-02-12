///New for ML models
// One record per logical field/question
// --- helper for messages from content script ---
function sendMessageAsync(msg) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          // e.g., background not ready / extension reloaded
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Step-6: Calling Gemma
async function callGemmaApi(batch) {
  if (!batch.length) return [];
  const resp = await sendMessageAsync({
    type: 'GEMMA_SUGGEST',
    batch,
  });

  if (!resp || !resp.ok) {
    console.warn('GEMMA_SUGGEST error:', resp?.error);
    return [];
  }

  // Expect: { items: [{ input_el, section, index, label, value }, ...] }
  //return resp.items || [];
  return resp
}

export {sendMessageAsync,callGemmaApi};