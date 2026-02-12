/**
 * Takes the flat fields array from inputSelection() and groups only
 * consecutive radio/checkbox fields that share the same groupId.
 *
 * Output groups are shaped for your model:
 *  - kind: "group"
 *  - question: groupId
 *  - options: [{ label, elementType, element }]
 */

// Step-4: Grouping 

function groupConsecutiveByGroupId(fields) {
  const grouped = [];
  let i = 0;

  // single global counter
  let inputCounter = 0;

  const isChoice = (f) =>
    f && (f.elementType === 'radio' || f.elementType === 'checkbox') && !!f.groupId;

  const nextId = () => ++inputCounter;

  while (i < fields.length) {
    const f = fields[i];

    // -----------------------------
    // Non-choice field
    // -----------------------------
    const pickField = (f) => ({
      element: f.element,
      elementType: f.elementType,
      groupId: f.groupId,
      humanName: f.humanName,
    });

    if (!isChoice(f)) {
      grouped.push({
        kind: "nonGroup",
        field: {
          ...pickField(f),
          input_number: nextId(),
        },
      });
      i++;
      continue;
    }

    // -----------------------------
    // Choice group (radio / checkbox)
    // -----------------------------
    const gid = f.groupId;
    const options = [];
    let j = i;

    while (j < fields.length && isChoice(fields[j]) && fields[j].groupId === gid) {
      const opt = fields[j];
      options.push({
        label: (opt.humanName || '').trim(),
        elementType: opt.elementType, // radio | checkbox
        element: opt.element,
      });
      j++;
    }

    // If only one option, treat as nonGroup
    if (options.length <= 1) {
      grouped.push({
        kind: "nonGroup",
        field: {
          ...pickField(f),
          input_number: nextId(),
        },
      });
    } else {
      grouped.push({
        kind: "group",
        question: gid,
        elementType: options[0].elementType,
        options,
        input_number: nextId(), // ✅ only here
      });
    }

    i = j;
  }

  return grouped;
}

export {groupConsecutiveByGroupId}