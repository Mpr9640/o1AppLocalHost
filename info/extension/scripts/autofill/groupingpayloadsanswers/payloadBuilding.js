//step-8: Collecting unanswer inputs making ready to send to different model.

function collectUnanswered(enrichedGrouped) {
  const unanswered = [];

  for (const item of enrichedGrouped) {
    if (item.kind === 'nonGroup') {
      if (!item.field?.value) unanswered.push(item);
    } else if (item.kind === 'group') {
      if (!item.value || item.value.length === 0) unanswered.push(item);
    }
  }
  console.log('Unanswered:',unanswered)
  return unanswered;
}


//Step-9 building payload for FieldMappings, active learning. MOde items-Al, label-fieldmapping

function buildPayloadForMappingAndActiveLearning(unanswered, user_id, mode = "items") {
  const entries = [];

  for (const item of (unanswered || [])) {
    let question = "";
    let input_number = null;

    if (item?.kind === "nonGroup") {
      question = (item?.field?.humanName || "").trim();
      input_number = item?.field?.input_number ?? null;
    } else if (item?.kind === "group") {
      question = (item?.question || "").trim();
      // if group has input_number somewhere else, wire it here:
      input_number = item?.input_number ?? null;
    }

    if (question) {
      entries.push({ question, input_number });
    }
  }

  // de-dupe by normalized question (keep the first seen input_number)
  const seen = new Set();
  const deduped = [];
  for (const e of entries) {
    const k = (e.question || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }

  // If you truly want labels as strings, change to: return deduped.map(x => x.question);
  if (mode === "labels") {
    // ✅ include input_number for labels mode
    return deduped; // [{ question, input_number }, ...]
  }

  // mode === "items"
  // ✅ per your rule: DO NOT add input_number here
  return deduped.map(({ question }) => ({
    user_id: user_id ?? null,
    question,
  }));
}

// step-5 Building pyaload for gemma

// Build payload again in your model format
function buildModelPayloadFromGrouped(grouped) {
  return grouped.map(item => {
    if (item.kind === 'nonGroup') {
      const f = item.field;
      return {
        kind: "nonGroup",
        //el: f?.element ? f.element.outerHTML : "",
        input_number: f?.input_number||"",
        label: f?.humanName || "",
        type: f?.elementType || ""
      };
    }

    // group
    return {
      kind: "group",
      //el: item.options?.[0]?.element ? item.options[0].element.outerHTML : "",
      input_number: item.input_number|| "",
      label: item.question || "",
      type: item.elementType || "",
      options: (item.options || []).map(o => ({ value: o.label }))
    };
  });
}

export {collectUnanswered,buildModelPayloadFromGrouped,buildPayloadForMappingAndActiveLearning};