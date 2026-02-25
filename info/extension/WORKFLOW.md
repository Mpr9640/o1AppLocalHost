# JobAid Extension — Complete Workflow
## jobCtxByTab · journeysByTab · Submission → Backend

---

## State Stores (all in-memory, background service worker)

| Store | Defined in | Key | Value shape | Purpose |
|---|---|---|---|---|
| `jobCtxByTab` | `journeybyTab.js` | `tabId` | `{ canonical, first_canonical, meta, confidence, updated_at }` | Live job context for popup + skill-match |
| `journeysByTab` | `journeybyTab.js` | `tabId` | `{ activeAjid, items: Map<ajid, Journey> }` | Full journey bag per tab |
| `journeysByAjid` | `journeybyTab.js` | `ajid` | `Journey` | Cross-tab journey lookup by ID |
| `activeAjidByJobKey` | `journeybyTab.js` | `"title\|\|company\|\|location"` | `ajid` | Dedup: same job in a new tab reuses the same journey |
| `tabByStartUrl` | `journeybyTab.js` | `start_url` | `tabId` | Reverse-lookup: find tab that owns a journey by its start URL |
| `canonicalStore` | `canon.js` | — | `Snapshot[]` (ring buffer, cap 7) | Buffered job metadata for manual/chooser apply flows |
| `appliedInstantMap` | `chrome.storage.local` | canonical URL | ISO timestamp | Fast "already applied" check by URL |
| `appliedTclMap` | `chrome.storage.local` | `"title\|company\|location"` | ISO timestamp | Fast "already applied" check by job identity |

---

## Phase 1 — Page Load & Context Detection

```
[Job page loads / DOM mutates / SPA navigation]
         │
         ▼
  contentscript.js: runDetection() [debounced 350ms]
         │
         ▼
  detectJobPage()  →  job page identified
         │
         ▼
  pushJobContext(meta, confidence)
         │
         ▼  chrome.runtime.sendMessage
  bg: "updateJobContext"
         │
         ▼
  updateCtx(tabId, canonical, meta, confidence)
  └─ jobCtxByTab.set(tabId, {
       canonical, first_canonical, meta, confidence, updated_at
     })
```

### Message: `updateJobContext`
```js
// Sent by: jobContext.js → pushJobContext()
{
  action: "updateJobContext",
  canonical: "https://jobs.example.com/job/123",
  meta: { title, company, location, logoUrl },
  confidence: 0.8   // 0–1 canonical score (apply 0.4 + TCL 0.3 + JD 0.3)
}
// Response: { ok: true }
// Backend call: NONE
```

---

## Phase 2 — Apply Click & Journey Start

```
[User clicks "Apply / Easy Apply / Apply Now"]
         │
         ▼
  initApplyClickMonitor handler  (jobContext.js)
         │
         ├─ noteFirstJobUrl(url)  ──────────────────────► bg: "noteFirstJobUrl"
         │                                                  locks first_canonical
         │
         └─ sendJourneyStart()  ────────────────────────► bg: "journeyStart" (no snapshot)
                  │
                  if resp.needSnapshot:
                    buildSnapshotFallback()
                    sendJourneyStart(snapshot) ──────────► bg: "journeyStart" (with snapshot)
```

### Message: `noteFirstJobUrl`
```js
// Sent by: initApplyClickMonitor (first, before journeyStart)
{ action: "noteFirstJobUrl", url: "https://jobs.example.com/job/123" }
// Effect: locks jobCtxByTab[tabId].first_canonical (never overwritten after this)
// Backend call: NONE
```

### Message: `journeyStart`
```js
// Attempt 1 — no snapshot (bg uses jobCtxByTab)
{ action: "journeyStart" }

// Attempt 2 — fallback snapshot (if bg has no ctx for this tab)
{
  action: "journeyStart",
  snapshot: {
    title: "Software Engineer",
    company: "Acme Corp",
    location: "Remote",
    logoUrl: "https://cdn.example.com/logo.png",
    url: "https://jobs.example.com/job/123",
    score: 0.7   // canonicalScore({ hasApply:true, hasTCL:true, hasJD:false })
  }
}
```

**Background logic:**
```
1. Prefer snapFromCtx (from jobCtxByTab) over request.snapshot
2. If no usable URL/meta → { ok: false, needSnapshot: true }

3. Build jobKey = norm(title) + "||" + norm(company) + "||" + norm(location)

4. Try to ADOPT an existing journey:
   A. openerTabId  → openerBag.activeAjid
   B. jobKey       → activeAjidByJobKey.get(jobKey)

   If adoptAjid found AND journeysByAjid.get(adoptAjid) exists:
     ├─ attach new tab's bag to same journey (no new ajid)
     ├─ journey.seen.add(thisUrl)
     └─ return { ok: true, ajid, source: "adoptedFromOpener"|"dedupByJobKey" }

5. If no adoption → CREATE new journey:
   ajid    = newAjid()   // random + Date.now()
   journey = upsertJourney(tabId, ajid, { snapshot, start_url, jobKey, active:true })
             └─ bag.items.set(ajid, next)
             └─ journeysByAjid.set(ajid, next)   ← cross-tab index
             └─ journeysByTab.set(tabId, bag)

   tabByStartUrl.set(start_url, tabId)
   activeAjidByJobKey.set(jobKey, ajid)
   pushCanonicalSnapshot(snap, ajid)  → adds to canonicalStore ring buffer

   return { ok: true, ajid, source: "jobCtxByTab"|"request.snapshot" }
```
**Backend call: NONE**

---

### Message: `journeyBindCanonical`
```js
// Sent by: ATS watcher as user navigates apply steps
{
  action: "journeyBindCanonical",
  canonical: "https://ats.example.com/apply/step2",
  score: 0.6
}
// Effect: adds URL to journey.seen; sets apply_url once if score ≥ 0.6
// Backend call: NONE
```

---

## Phase 3 — Submission Detection & Save

Two entry points both converge on `submissionDetected`:

### Entry A — ATS Watcher Auto-Detection (reporter.js)

```
ATS watcher signals form submit / confirmation page
         │
         ▼
  reportSuccess()                              [reporter.js]
         │
         ├─ enrichWithStickyContext()          → builds { canon, title, company, location, logo }
         │
         ├─ sendBg("getActiveCanonicalSnapshot")          ← present tab (attempt 1)
         │    └─ gets journeySnap, startUrl, applyUrl
         │
         ├─ if no journeySnap:
         │    sendBg("getActiveCanonicalSnapshot",         ← referrer fallback (attempt 2)
         │             referenceUrl: document.referrer)
         │
         ├─ oncePerJob(finalCanon)             → idempotence guard; skip if already sent
         │
         ├─ checkAppliedForUrl(...)            → skip if already in local/backend cache
         │
         ├─ build basePayload (preview_card, title, company, loc, logo, start_url, apply_url)
         │
         ├─ sendBg("submissionDetected", ...)  ──────────────────────► SAVE (primary path)
         │    referrer: startUrl || document.referrer
         │
         ├─ if subres.ok && !waitForUser:
         │    └─ showSubmissionCard(basePayload.preview_card)   ← success card, done
         │
         └─ if NOT ok OR waitForUser:
              getCanonicalItemsForChooser()    → sendBg("getCanonicalList") → mapped items[]
              │
              ├─ items.length === 0:
              │    showSubmissionCard(preview_card)  ← show card, no auto-save
              │
              └─ items.length > 0:
                   showCanonicalChooserCard(items, onPick, opts)  ← floating in-page chooser
                        │
                        └─ user picks a card → onPick(it):
                             saveFromChooserPick(it, fallbackMeta, {startUrl, applyUrl})
                               ├─ sendBg("manualPickCanonical", url)   ──────► SAVE
                               │    if ok → return true
                               └─ if fails:
                                    sendBg("appliedJob", payload)      ──────► SAVE
                                    if fails: sendBg("markApplied")    ──────► SAVE
                             if save ok:
                               sendBg("canonicalListDelete", url)
                               showSubmissionCard(success preview_card)
                             if save fails:
                               chooser shows "Failed to save. Try again."
```

### Entry B — Manual "Mark Applied" (popup.js)

```
User clicks "Mark Applied" in popup
         │
         ▼
  markAppliedBtn click handler
         │
         ├─ sendBg("submissionDetected", ...)  ──────────────────────► SAVE (primary path)
         │    │
         │    ├─ subres.ok && subres.waitForUser:
         │    │    └─ update appliedEl text + keep button busy (return; wait for user)
         │    │
         │    └─ subres.ok && !waitForUser:
         │         └─ showNotice("Added") + close popup (return)
         │
         └─ if submissionDetected fails → get canonical list
              │
              ├─ items.length > 1  → openCanonicalChooser(items)
              │    └─ user picks a card → pick():
              │         ├─ sendBg("manualPickCanonical", url)   ──────► SAVE
              │         │    if fails:
              │         │      sendBg("appliedJob", payload)    ──────► SAVE
              │         │      if fails: sendBg("markApplied")  ──────► SAVE
              │         └─ sendBg("canonicalListDelete", url)
              │
              ├─ items.length === 1
              │    ├─ sendBg("appliedJob", payload)             ──────► SAVE
              │    │    if fails: sendBg("markApplied", payload) ─────► SAVE
              │    └─ sendBg("canonicalListDelete", url)
              │
              └─ items.length === 0  → canonicalizeUrl → saveApplied() fallback
```

---

### Message: `submissionDetected`

```js
// Sent by: reporter.js (from ATS content script) or popup.js (manual)
{
  action: "submissionDetected",
  pageCanonical: "https://jobs.example.com/job/123",  // startUrl || meta.url
  referrer: "https://jobs.example.com/job/123",        // startUrl || document.referrer
  start_url: "https://jobs.example.com/job/123",
  apply_url:  "https://ats.example.com/apply/done"
}
```

**Background logic:**
```
1. Find journey bag:
   - sender.tab.id  →  getBag(tabId)  (content script has tab; popup does not)
   - If bag empty: tabByStartUrl.get(referrer) → getBag(refTabId)
   - If still no bag → { ok: false, error: "no-journey" }

2. Find best journey in bag:
   a. j.seen.has(preferCanon) && status !== "submitted"
   b. bag.activeAjid
   c. most recently touched non-submitted

3. Resolve finalSnapshot:
   - Priority 1: canonicalStore.find(x => x.url === preferCanon)  ← high-quality cached meta
   - Priority 2: best.snapshot                                     ← journey's own snapshot
   - If neither:  send "showCanonicalChooser" to tab
                  → { ok: true, waitForUser: true }   ← popup keeps button busy

4. Mark journey submitted:
   best.status = "submitted"; best.submitted_at = now

5. Mark & remove from canonicalStore all related URLs:
   [primary, refCanon, pageCanon, journey.start_url, journey.apply_url]

6. POST /api/jobs  (see payload below)
```

**Payload → `POST /api/jobs`:**
```json
{
  "title":           "Software Engineer",
  "company":         "Acme Corp",
  "location":        "Remote",
  "url":             "https://jobs.example.com/job/123",
  "status":          "applied",
  "source":          "extension",
  "company_logo_url":"https://cdn.example.com/logo.png",
  "applied_at":      "2026-02-21T10:00:00.000Z"
}
```

**Expected backend response (`200 OK`):**
```json
{
  "id":              42,
  "title":           "Software Engineer",
  "company":         "Acme Corp",
  "location":        "Remote",
  "url":             "https://jobs.example.com/job/123",
  "status":          "applied",
  "source":          "extension",
  "company_logo_url":"https://cdn.example.com/logo.png",
  "applied_at":      "2026-02-21T10:00:00.000Z"
}
```
> `res.data.applied_at` is used to stamp both the local cache and popup display text.
> Return the canonical `applied_at` from your DB so timestamps are consistent.

**After success, background also:**
- `rememberAppliedInstant(url, savedAt)` → `appliedInstantMap[canonical] = iso` in `chrome.storage.local`
- `rememberAppliedTcl(body, savedAt)` → `appliedTclMap["title|company|location"] = iso`
- Same for `start_url` and `apply_url`

**Background → caller responses:**
```js
{ ok: true, data: res.data, ajid: "abc123", canonical: "https://..." }  // saved
{ ok: true, waitForUser: true }                                          // no snapshot, user must choose
{ ok: false, error: "no-journey" }                                       // no bag found
{ ok: false, error: "save failed" }                                      // backend error
```

---

### Message: `appliedJob` / `markApplied`

Same handler in background — used as fallback or for manual single-item flow.

```js
// Sent by: reporter.js (fallback), popup.js (single item / zero items)
{
  action: "appliedJob",   // or "markApplied" — identical handler
  title:      "Software Engineer",
  company:    "Acme Corp",
  location:   "Remote",
  url:        "https://jobs.example.com/job/123",
  logo_url:   "https://cdn.example.com/logo.png",
  job_id:     null,
  ats_vendor: "extension",        // or hostname, "linkedin", etc.
  applied_at: "2026-02-21T10:00:00.000Z",
  start_url:  "https://jobs.example.com/job/123",
  apply_url:  "https://ats.example.com/apply/done",
  preview_card: {
    title:    "Software Engineer",
    subtitle: "Acme Corp • Remote",
    logo_url: "https://cdn.example.com/logo.png",
    link_url: "https://jobs.example.com/job/123"
  }
}
```

**Background calls `persistApplied(payload, sender)`** → `appliedInstance.js`:
- URL canonicalized via `preferCtxCanonical(sender, url)` → checks `jobCtxByTab[tabId].first_canonical`
- `POST /api/jobs` (same body shape as `submissionDetected`)
- Stores in `appliedInstantMap` + `appliedTclMap`
- Removes from `canonicalStore`
- Sends `appliedJobSaved` to content tab + fires Chrome notification

**Responses:**
```js
{ ok: true, data: res.data, applied_at: "...", canonical: "https://..." }
{ ok: false, error: "save failed", applied_at: "..." }
```

---

### Message: `manualPickCanonical`

```js
// Sent by: popup.js openCanonicalChooser → pick()
//          reporter.js saveFromChooserPick() (user picks from in-page chooser card)
{ action: "manualPickCanonical", url: "https://jobs.example.com/job/123" }
```

**Background:**
- Finds snapshot in `canonicalStore` by URL
- Calls `persistApplied({ title, company, location, url, logo_url, source:"extension" }, sender)`
- Same `POST /api/jobs`

**Responses:**
```js
{ ok: true, data: res.data }
{ ok: false, error: "..." }
```

---

## UI Cards — submissionCard.js

### `showSubmissionCard(card)`

Renders a fixed-position floating card centred in the page. Auto-fades after 4 s. Idempotent (won't stack).

```js
showSubmissionCard({
  title:    "Software Engineer",
  subtitle: "Acme Corp • Remote",
  logo_url: "https://cdn.example.com/logo.png"
});
```

**Called by:** `reporter.js` on `subres.ok && !waitForUser`, or after a successful chooser pick.
All user-supplied strings are sanitised through `escapeHtml` / `escapeAttr` (XSS safe).

---

### `showCanonicalChooserCard(items, onPick, opts)` *(new)*

Renders a floating in-page chooser when auto-save could not confirm the job. Idempotent.

```js
showCanonicalChooserCard(
  items,          // Array<{ url, title, company, location, logo_url }> — up to 7
  async (it) => { /* called when user clicks a row */ },
  {
    title:    "Pick the job you just applied",
    subtitle: "We couldn't confirm automatically. Select one to save it as applied."
  }
);
```

**Behaviour:**
- Shows up to 7 job rows with logo, title, company/location, "Open job" link
- Clicking a row (not the link) calls `onPick(item)` asynchronously
- During save: list dims (`opacity 0.7`, `pointer-events none`) + shows "Saving…" status text
- On success: status cleared, card closes
- On failure: list re-enabled, shows "Failed to save. Try again."
- Close button removes the card immediately
- All strings sanitised via `escapeHtml` / `escapeAttr`

**Called by:** `reporter.js reportSuccess()` when `submissionDetected` fails or returns `waitForUser:true`.

---

## Phase 4 — Applied Status Check

### Message: `checkAppliedForUrl`

```js
// Sent by: popup.js on open, reporter.js before reporting
{
  action: "checkAppliedForUrl",
  url:      "https://jobs.example.com/job/123",
  title:    "Software Engineer",   // optional, used for TCL match
  company:  "Acme Corp",
  location: "Remote"
}
```

**Background checks (in order — fastest first):**
1. `appliedTclMap["title|company|location"]` → local instant hit
2. `appliedInstantMap[canonical]` → local instant hit
3. `GET /api/jobs` → backend list, match by URL or TCL

**Required backend response for `GET /api/jobs`:**
```json
[
  {
    "id":         42,
    "title":      "Software Engineer",
    "company":    "Acme Corp",
    "location":   "Remote",
    "url":        "https://jobs.example.com/job/123",
    "status":     "applied",
    "applied_at": "2026-02-21T10:00:00.000Z"
  }
]
```

**Responses:**
```js
{ ok: true, applied_at: "...", canonical: "...", match: "tcl_map"|"url_instant"|"url_backend"|"tcl_backend" }
{ ok: false }   // not found anywhere
```

---

## Phase 5 — Popup Display

### Message: `getJobContext`
```js
{ action: "getJobContext", tabId: 123 }

// Response
{
  ok: true,
  ctx: {
    canonical:       "https://jobs.example.com/job/123",
    first_canonical: "https://jobs.example.com/job/123",
    meta: { title, company, location, logoUrl },
    confidence:  0.9,
    updated_at:  1708512000000
  }
}
// Backend call: NONE
```

### Message: `getActiveCanonicalSnapshot`
```js
// Present tab
{ action: "getActiveCanonicalSnapshot", tabId: 123 }

// Referrer fallback (tabId unknown from popup)
{ action: "getActiveCanonicalSnapshot", referenceUrl: "https://jobs.example.com/job/123" }

// Response
{
  ok: true,
  snapshot:  { title, company, location, logoUrl, url, score },
  isActive:  true,
  start_url: "https://jobs.example.com/job/123",
  apply_url: "https://ats.example.com/apply/done"
}
// Backend call: NONE
```

**Popup meta selection priority (popup.js):**
```
1. confidence ≥ 0.6 (isTrueCanonicalPage) → use jobCtxByTab meta (ctxMeta)
2. presentJourneySnap exists             → merge presentJourneySnap into meta
3. referrerJourneySnap exists            → merge referrerJourneySnap into meta
4. none of the above                     → hide job card
```

---

## All Backend Calls — Summary

| Caller | Message / path | Method | Endpoint | When |
|---|---|---|---|---|
| `background.js` / `submissionDetected` | auto-save | `POST` | `/api/jobs` | ATS watcher detects confirmation page |
| `background.js` / `appliedJob`, `markApplied` | manual-save | `POST` | `/api/jobs` | Popup "Mark Applied" or reporter in-page chooser pick fallback |
| `background.js` / `manualPickCanonical` | manual-pick | `POST` | `/api/jobs` | User picks from canonical chooser |
| `background.js` / `checkAppliedForUrl` | status-check | `GET` | `/api/jobs` | Popup open, reporter idempotence guard |

All calls use `apiClient` (axios) with `{ withCredentials: true }`.

---

## Key Data Structures

### Journey object (`journeysByTab` / `journeysByAjid`)
```js
{
  ajid:           "abc123def456",        // random + timestamp ID
  status:         "pending" | "submitted",
  started_at:     1708512000000,
  last_event_at:  1708512000000,
  submitted_at:   "2026-02-21T10:00:00.000Z",  // set on submit
  snapshot: {
    title, company, location, logoUrl,
    url:   "https://jobs.example.com/job/123",
    score: 0.7
  },
  start_url: "https://jobs.example.com/job/123",  // frozen at journeyStart
  apply_url:  "https://ats.example.com/apply",    // set once when score ≥ 0.6
  jobKey:    "software engineer||acme corp||remote",
  seen:       Set<string>   // all normalized URLs visited in this journey
}
```

### canonicalStore entry
```js
{
  url:          "https://jobs.example.com/job/123",
  title:        "software engineer",
  company:      "acme corp",
  location:     "remote",
  logo_url:     "https://...",
  started_at:   1708512000000,
  ajid:         "abc123def456",
  submitted_at: null   // set by markCanonicalSubmitted()
}
```

### Canonical score (0–1)
```
hasApply button detected  → +0.4
hasTitleCompanyLocation   → +0.3
hasJobDescription ≥ 120ch → +0.3
────────────────────────────────
Threshold for "true canonical page" in popup: ≥ 0.6
Threshold for setting apply_url:              ≥ 0.6
```

---

## End-to-End Data Flow

```
[Job page loads]
  contentscript.js: detectJobPage()
    └─► bg: updateJobContext         → jobCtxByTab[tabId] = { canonical, meta, confidence }

[User clicks Apply]
  contentscript.js: initApplyClickMonitor
    ├─► bg: noteFirstJobUrl          → locks first_canonical
    └─► bg: journeyStart             → journeysByTab[tabId], journeysByAjid[ajid]
                                        canonicalStore[0] = snapshot

[User navigates apply steps on ATS]
  atswatcher: journeyBindCanonical   → journey.seen.add(url), apply_url set once

[Confirmation page / form submit]

  [AUTO] reporter.js: reportSuccess()
    ├─ getActiveCanonicalSnapshot (present tab → referrer fallback)
    │     → journeySnap, startUrl, applyUrl
    ├─► bg: submissionDetected (referrer: startUrl || document.referrer)
    │     └─► POST /api/jobs → 200 { id, applied_at, ... }
    │         rememberAppliedInstant + rememberAppliedTcl
    │
    ├─ if subres.ok && !waitForUser:
    │     showSubmissionCard()             ← "Submitted ✓" floating card in page
    │
    └─ if not ok OR waitForUser:
          getCanonicalItemsForChooser()   → getCanonicalList from bg
          ├─ no items: showSubmissionCard() (no save)
          └─ has items: showCanonicalChooserCard()  ← floating in-page chooser
                user picks → saveFromChooserPick()
                  → manualPickCanonical → appliedJob → markApplied
                  → canonicalListDelete
                  → showSubmissionCard() on success

  [MANUAL] popup.js: Mark Applied click
    ├─► bg: submissionDetected → POST /api/jobs
    │    waitForUser: appliedEl updated, button stays busy
    │
    └─ fallback: getCanonicalList
         items > 1: openCanonicalChooser (in-popup) → manualPickCanonical / appliedJob / markApplied
         items = 1: appliedJob → markApplied
         items = 0: canonicalizeUrl → saveApplied fallback
```
