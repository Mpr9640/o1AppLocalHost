# Autofill Application - Architecture Documentation

## 📋 Table of Contents
- [Overview](#overview)
- [Project Structure](#project-structure)
- [Core Architecture](#core-architecture)
- [Module Details](#module-details)
- [Data Flow](#data-flow)
- [Key Concepts](#key-concepts)

---

## Overview

This is an intelligent form autofill application that automatically populates job application forms across multiple ATS (Applicant Tracking System) platforms. The system uses pattern recognition, DOM manipulation, and AI models to match user data with form fields.

### Key Features
- Multi-platform support (Ashby, Greenhouse, Lever, Workday, SmartRecruiters, etc.)
- Resume file upload automation
- Intelligent field detection and matching
- Date formatting and validation
- Complex dropdown/select element handling
- AI-powered question answering

---

## Project Structure

```
Scripts/
├── autofill.js                          # Main entry point
└── autofill/                            # Core modules folder
    ├── utils.js                         # Global utilities
    ├── resume/                          # Resume upload handling
    │   ├── helpers.js                   # Resume detection utilities
    │   └── mainResume.js                # Resume upload orchestration
    ├── populate/                        # Form population logic
    │   ├── helpers.js                   # Population utilities
    │   ├── date/                        # Date field handling
    │   │   └── date.js
    │   ├── select/                      # Dropdown/select handling
    │   │   ├── helpers.js
    │   │   ├── mainSelect.js
    │   │   ├── smartRecruitersSelectHelpers.js
    │   │   ├── metaSelectHelpers.js
    │   │   ├── workdaySelectHelpers.js
    │   │   └── successEuSelectHelpers.js
    │   ├── fillInput.js                 # Text input population
    │   ├── populateFields.js            # Main population orchestrator
    │   └── greenHouseDynamicInput.js    # Greenhouse-specific logic
    ├── inputandlabelextraction/         # Field detection
    │   ├── input/                       # Input element detection
    │   │   ├── helpers.js
    │   │   └── mainInput.js
    │   ├── label/                       # Label extraction
    │   │   ├── helpers.js
    │   │   ├── mainLabel.js
    │   │   └── ashbyHelpers.js
    │   └── helpers.js                   # Caching utilities
    ├── groupingpayloadsanswers/         # Data processing
    │   ├── grouping.js                  # Field grouping logic
    │   ├── attachingModelAnswers.js     # AI answer mapping
    │   ├── payloadBuilding.js           # Payload construction
    │   ├── helpers.js                   # Field mappings
    │   └── addButton.js                 # Dynamic section handling
    ├── callingModel.js                  # AI model integration
    └── unUsed.js                        # Legacy/deprecated code
```

---

## Core Architecture

### 1. **Entry Point** (`autofill.js`)
The main file that initializes the autofill system.

**Key Function:**
- `autofillInit()` - Bootstraps the entire autofill process

---

### 2. **Utilities Layer** (`utils.js`)

Provides foundational utilities used across all modules.

**Key Functions:**
- **Normalization Functions:**
  - `normalize()` - General text normalization
  - `normalizeName()` - Name field normalization
  - `normalizeToBooleanLike()` - Convert to boolean values
  - `normalizeFieldName()` - Field name standardization
  
- **Visibility Detection:**
  - `isVisible()` - Check element visibility
  - `isElementVisible()` - Enhanced visibility check
  - `isEffectivelyVisible()` - Deep visibility validation
  - `waitForDomStable()` - Wait for DOM to stabilize
  
- **Platform Detection:**
  - `isAshbyHost()`, `isGreenhouseHost()`, `isLeverHost()`
  - `isWorkableJobsHost()`, `isMetaHost()`, `isSmartRecruitersHost()`
  - Platform-specific detection for 15+ ATS systems
  
- **Constants:**
  - `BOOL_TRUE`, `BOOL_FALSE` - Boolean representations
  - `delay()` - Async delay utility

---

## Module Details

### 3. Resume Upload Module (`resume/`)

Handles automatic resume file uploads to job application forms.

#### **3.1 helpers.js**

**Regular Expressions:**
- `CONTAINER_NOISE_RE` - Filter noise in container elements
- `FILE_POS_KW_RE` - Positive keywords for file fields
- `FILE_NEG_KW_RE` - Negative keywords to avoid
- `FILE_SIZE_HINT_RE` - File size hint detection

**Host Sets:**
- `SET1_HOSTS`, `SET2_HOSTS` - Grouped platforms by upload behavior
- `IS_SET1`, `IS_SET2` - Host set checkers

**Key Functions:**
- `isFileField()` - Identify file input fields
- `stripFileCtas()` - Remove call-to-action noise
- `findFileFieldName()` - Extract field name
- `setPendingResumeUpload()` - Queue resume for upload
- `fetchResumeFromBackground()` - Retrieve resume data
- `withUserGesture()` - Execute with user interaction context
- `isResumeHumanName()` - Validate resume field names
- `waitForResumeParseToFinish()` - Wait for ATS parsing
- `isDropzoneResumeWidget()` - Detect drag-drop zones
- `waitForLeverResumeParsed()` - Lever-specific wait logic

**Session Storage:**
- `sessSet()`, `sessGet()`, `sessRemove()`, `sessClear()` - Session management
- `pageKey()` - Generate page-specific keys
- `PENDING_KEY` - Constant for pending uploads

**Constants:**
- `RESUME_POS`, `RESUME_NEG` - Resume field identifiers

#### **3.2 mainResume.js**

**Core Functions:**
- `simulateFileSelectionFromBackground()` - Simulate file selection
- `tryAttachToDropzones()` - Handle drag-drop uploads
- `handleFileInput()` - Process file input elements
- `newResumeFirstFromFinalGrouped()` - Resume upload orchestration

---

### 4. Population Module (`populate/`)

Handles filling form fields with user data.

#### **4.1 helpers.js**

**Constants:**
- `US_ALIASES` - U.S. location variations
- `LOCATION_CITY_STATE_RE` - City/state regex

**Key Functions:**
- `fixGreenhouseCityState()` - Greenhouse location formatting
- `degreeAlias()` - Education degree mapping
- `simulatePointerClick()` - Mouse click simulation
- `setValueWithNativeSetter()` - Native value setting
- `simulateMouse()` - Mouse event simulation
- `fireInputEvents()` - Trigger input events
- `clickLikeUser()` - Human-like click
- `checkElement()` - Element validation
- `isCountryItem()`, `isStateItem()` - Location field detection
- `reorderCountryBeforeState()` - Field ordering logic

#### **4.2 Date Handling** (`date/date.js`)

**Key Functions:**
- `parseISOish()` - Parse ISO-like dates
- `p2()` - Two-digit padding
- `detectSingleDateGranularity()` - Detect date precision
- `formatForGranularity()` - Format based on precision
- `refineDateHumanNameAndGroup()` - Extract date field info
- `adaptMonthYearToPlaceholder()` - Match placeholder format
- `resolveDateSource()` - Find date data source
- `fillDate()` - Fill date fields
- `collectLocalSplitDatePeers()` - Group split date fields
- `isWorkdaySplitDatePart()` - Workday date detection
- `datePartBias()` - Date part preference

**Constants:**
- `MONTH_NAMES` - Month name mapping
- `monthCandidates()` - Month option matching
- `processedDateBatches` - Track processed dates
- `batchKeyForDate()` - Date batch identifier

#### **4.3 Select/Dropdown Handling** (`select/`)

##### **4.3.1 helpers.js**

**Key Functions:**
- `splitMultiValues()` - Parse multi-value fields
- `isComplexDropdown()` - Detect complex selects
- `bestOptionMatch()` - Find best matching option
- `optionText()` - Extract option text
- `findOptionIndex()` - Locate option index
- `pickByTokenScore()` - Token-based matching
- `pickByFuzzy()` - Fuzzy string matching
- `pickBestDropdownOption()` - Best option selector
- `waitForElement()` - Wait for element appearance
- `isClickableVisible()` - Clickable visibility check
- `fuzzyScore()` - Calculate fuzzy match score
- `scrollOptionIntoListView()` - Scroll option into view
- `clickOptionLike()` - Click option element
- `waitForNearestListbox()` - Wait for listbox
- `findComboInputForListbox()` - Find combo input
- `typeIntoComboInput()` - Type into combo
- `collectVisibleOptionNodes()` - Gather visible options

**Geometry Functions:**
- `getCenter()` - Element center coordinates
- `distance()` - Distance between points
- `getScrollableParent()` - Find scrollable container

##### **4.3.2 SmartRecruiters Select** (`smartRecruitersSelectHelpers.js`)

Platform-specific handlers for SmartRecruiters dropdowns.

**Key Functions:**
- `clickOptionBestEffort()` - Robust option clicking
- `deepQuerySelector()` - Shadow DOM traversal
- `deepWaitForElement()` - Wait across shadow boundaries
- `findSplListboxForInputDeep()` - Deep listbox search
- `deepCollectAll()` - Collect elements deeply
- `waitForOptionsInListRoot()` - Wait for options
- `deepTextContent()` - Extract deep text
- `resolveClickableOptionHost()` - Find clickable host
- `srSplTypeAndSelect()` - Type and select flow
- `selectSplOptionByMouse()` - Mouse-based selection
- `selectSplOptionByKeyboard()` - Keyboard-based selection
- `dispatchKey()` - Keyboard event dispatch
- `getActiveDescendantEl()` - Get active option
- `optionMatches()` - Option matching logic

##### **4.3.3 Main Select** (`mainSelect.js`)

**Key Functions:**
- `fillSelectElement()` - Fill standard selects
- `scanAndSelectOption()` - Select option orchestrator

##### **4.3.4 Meta Select** (`metaSelectHelpers.js`)

Meta (Facebook) platform-specific select handling.

**Key Functions:**
- `isTextInput()` - Text input validation
- `scoreSearchInput()` - Score input relevance
- `snapshotVisibleTextInputs()` - Capture text inputs
- `findSearchInputAfterClick()` - Find search field
- `buildOptionCandidates()` - Build option list
- `metaChoiceOptionLabel()` - Extract option label

##### **4.3.5 Workday Select** (`workdaySelectHelpers.js`)

Workday platform-specific select handling (complex dropdowns).

**Key Functions:**
- `isWorkdayCombo()` - Detect Workday combo
- `isWorkdayMultiSelect()` - Multi-select detection
- `waitUntil()` - Generic wait utility
- `findComboInputFromAnchor()` - Find combo input
- `getActiveListboxNear()` - Get active listbox
- `getWorkdayMultiSelectRootFromInput()` - Multi-select root
- `getSelectedTokenTextsFromInput()` - Selected values
- `closeWorkdayDropdown()` - Close dropdown
- `isToggleButton()` - Toggle button detection
- `findNearestDropdownButton()` - Find dropdown trigger
- `isWorkdayHeaderLike()` - Header detection
- `collectWorkdayOptionWrappers()` - Collect options
- `clickWithCoords()` - Click with coordinates
- `waitForStableRect()` - Wait for stable position
- `pickWorkdayClickable()` - Find clickable element
- `isWorkdaySelected()` - Check selection state
- `workdayClickOption()` - Click option
- `scanAndSelectWorkdayMulti()` - Multi-select handler
- `verifyWorkdaySelection()` - Verify selection
- `collectFilteredOptionNodes()` - Filtered options
- `collectOptionNodes()` - All option nodes
- `fillWorkdayByButton()` - Fill via button
- `fillWorkdayMultiSelectByButton()` - Multi-select fill

##### **4.3.6 SuccessFactors EU Select** (`successEuSelectHelpers.js`)

SuccessFactors Europe platform handlers.

**Key Functions:**
- `typeIntoComboInputForSuccessEu()` - Type into combo
- `waitForFilteredOptions()` - Wait for filtering
- `dispatchKeyForSuccessEu()` - Keyboard events
- `sendKey()` - Send key press

#### **4.4 Fill Input** (`fillInput.js`)

**Key Function:**
- `fillInput()` - Fill text input fields

#### **4.5 Populate Fields Orchestrator** (`populateFields.js`)

**Key Function:**
- `newPopulateFields()` - Main population orchestrator

#### **4.6 Greenhouse Dynamic Input** (`greenHouseDynamicInput.js`)

Handles Greenhouse platform dynamic field dependencies.

**Key Functions:**
- `isDependencyTrigger()` - Detect trigger fields
- `microDeltaAutofill()` - Incremental autofill

---

### 5. Input and Label Extraction Module (`inputandlabelextraction/`)

Detects and extracts form fields and their labels.

#### **5.1 Input Detection** (`input/`)

##### **5.1.1 helpers.js**

**Key Functions:**
- `isCookieOrConsentControl()` - Filter consent elements
- `isInNonFormChrome()` - Detect non-form UI
- `isJunkInput()` - Filter irrelevant inputs
- `isFileTriggerButton()` - File trigger detection
- `isToolbarish()` - Toolbar detection
- `triggerExpandAllSections()` - Expand collapsible sections
- `filterConsecutiveDuplicates()` - Remove duplicates

##### **5.1.2 mainInput.js**

**Key Functions:**
- `allShadowHosts()` - Find all shadow hosts
- `collectAllRoots()` - Collect DOM roots
- `collectInputsIn()` - Collect inputs in scope
- `inputSelection()` - Main input selector

#### **5.2 Label Extraction** (`label/`)

##### **5.2.1 helpers.js**

**Key Functions:**
- `nearestTextAround()` - Find nearby text
- `getExplicitLabels()` - Get explicit labels
- `textNodeCenterRect()` - Text node positioning
- `findAssociatedLabel()` - Associate label with input
- `looksMachineName()` - Detect machine-generated names
- `leverQuestionCache()` - Lever question cache
- `leverQuestionTextFor()` - Lever question text
- `njoynOptionTextAfterInput()` - NJoyn option text
- `smartRecruitersFileLabelFor()` - SmartRecruiters file label

##### **5.2.2 mainLabel.js**

**Key Function:**
- `inputFieldSelection()` - Main label selector

##### **5.2.3 Ashby Helpers** (`ashbyHelpers.js`)

Ashby platform-specific label extraction.

**Key Functions:**
- `isAshbyButtonEntry()` - Detect Ashby buttons
- `ashbyQuestionTextFor()` - Extract Ashby questions
- `ashbyFindYesNoButtonsNear()` - Find yes/no buttons

#### **5.3 Extraction Helpers** (`helpers.js`)

**Caching:**
- `fieldNameCache` - Field name cache
- `groupCache` - Grouping cache

---

### 6. Grouping, Payloads, and Answers Module (`groupingpayloadsanswers/`)

Processes detected fields and maps them to user data.

#### **6.1 Grouping** (`grouping.js`)

**Key Function:**
- `groupConsecutiveByGroupId()` - Group related fields

#### **6.2 Attaching Model Answers** (`attachingModelAnswers.js`)

Maps AI model responses to form fields.

**Key Functions:**
- `hasUsableModelOutput()` - Validate model output
- `parseModelAnswer()` - Parse AI response
- `toStringArray()` - Convert to string array
- `buildAnswerMapByInputNumber()` - Build answer map
- `mapQuestionsToAnswers()` - Map questions to answers

#### **6.3 Payload Building** (`payloadBuilding.js`)

Constructs payloads for AI model and data mapping.

**Key Functions:**
- `collectUnanswered()` - Find unanswered fields
- `buildModelPayloadFromGrouped()` - Build AI payload
- `buildPayloadForMappingAndActiveLearning()` - Learning payload

#### **6.4 Helpers** (`helpers.js`)

**Field Mappings:**
- `fieldMappings` - General field mappings
- `eduMappings` - Education field mappings
- `expMappings` - Experience field mappings
- `addressMappings` - Address field mappings
- `resMappings` - Resume field mappings

**Negative Patterns:**
- `NEG_NAME`, `NEG_EMAIL`, `NEG_PHONE`, `NEG_DOB` - Exclusion patterns
- `POS_COUNTRY_CODE` - Country code patterns
- `hasNegatives()` - Check for negative patterns

#### **6.5 Add Button Handling** (`addButton.js`)

Handles dynamic "Add More" sections (e.g., education, experience).

**Constants:**
- `TITLE_BUCKETS` - Section title categories
- `SECTION_TO_DATAKEY` - Section to data mapping
- `HEADING_SEL`, `TITLE_HINT_SEL`, `CONTAINER_UP_SEL` - Selectors
- `BLOCK_ROOT_SEL` - Block root selector

**Key Functions:**
- `textOf()` - Extract text content
- `firstMatch()` - Find first match
- `textFromAria()` - Extract ARIA text
- `resolveSectionTitleForAdd()` - Resolve section title
- `findAddButtonsWithTitles()` - Find add buttons
- `titleToSectionKey()` - Map title to key
- `safeClick()` - Safe click handler
- `waitAfterExpand()` - Wait after expansion
- `resolveNewContainer()` - Resolve new container
- `widenToInputCluster()` - Widen to input cluster
- `countExisting()` - Count existing entries
- `processAddSectionsFromData()` - Process add sections
- `sectionToPrefix()` - Section prefix mapping
- `toRelativeKey()` - Relative key generation
- `classifyBlockKind()` - Classify block type
- `findBlockRootForInput()` - Find block root
- `resolveBlockTitle()` - Resolve block title
- `attachSectionKindAndIndex()` - Attach metadata

---

### 7. AI Model Integration (`callingModel.js`)

Interfaces with AI models for intelligent question answering.

**Key Functions:**
- `sendMessageAsync()` - Send async message to model
- `callGemmaApi()` - Call Gemma AI API

---

### 8. Legacy Code (`unUsed.js`)

Deprecated or unused functions.

**Functions:**
- `stableKeyFor()` - Generate stable keys
- `getIcimsFormRoot()` - iCIMS form root (deprecated)

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    1. INITIALIZATION                            │
│                      autofill.js                                │
│                    autofillInit()                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 2. INPUT DETECTION                              │
│          inputandlabelextraction/input/                         │
│              - collectAllRoots()                                │
│              - collectInputsIn()                                │
│              - inputSelection()                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 3. LABEL EXTRACTION                             │
│          inputandlabelextraction/label/                         │
│              - findAssociatedLabel()                            │
│              - inputFieldSelection()                            │
│              - Platform-specific helpers                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 4. FIELD GROUPING                               │
│          groupingpayloadsanswers/grouping.js                    │
│              - groupConsecutiveByGroupId()                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ├──────────────────┐
                             │                  │
                             ▼                  ▼
┌──────────────────────────────────┐  ┌────────────────────────────┐
│  5a. RESUME UPLOAD               │  │  5b. FIELD POPULATION      │
│  resume/mainResume.js            │  │  populate/populateFields.js│
│  - handleFileInput()             │  │  - newPopulateFields()     │
│  - simulateFileSelection()       │  │                            │
└──────────────────────────────────┘  └─────────┬──────────────────┘
                                                 │
                                                 ├────────────┐
                                                 ▼            ▼
┌──────────────────────────────────────────────────┐  ┌──────────────────┐
│  6. DATA MATCHING & AI                           │  │  7. FIELD FILL   │
│  groupingpayloadsanswers/                        │  │  - fillInput()   │
│  - buildModelPayloadFromGrouped()                │  │  - fillDate()    │
│  - mapQuestionsToAnswers()                       │  │  - fillSelect()  │
│  - callingModel.js: callGemmaApi()               │  │                  │
└──────────────────────────────────────────────────┘  └──────────────────┘
```

---

## Key Concepts

### 1. **Field Detection Strategy**

The system uses a multi-layered approach to detect form fields:

1. **DOM Traversal**: Recursively traverse the DOM including Shadow DOM
2. **Filtering**: Remove cookie consent, toolbars, and junk inputs
3. **Label Association**: Match inputs with labels using multiple strategies:
   - Explicit `<label for="">` associations
   - Proximity-based text detection
   - ARIA attributes
   - Platform-specific patterns

### 2. **Platform-Specific Handlers**

Each major ATS platform has unique quirks:

- **Workday**: Complex custom dropdowns with search
- **Greenhouse**: Dynamic dependent fields
- **Ashby**: Button-based yes/no questions
- **SmartRecruiters**: Shadow DOM components
- **Lever**: Resume parsing detection
- **Meta**: Custom select widgets

### 3. **Resume Upload Flow**

1. Detect file input fields using keywords and patterns
2. Check for drag-drop zones
3. Retrieve resume from background storage
4. Simulate user file selection
5. Wait for platform-specific parsing completion
6. Verify successful upload

### 4. **Date Handling**

The system intelligently handles various date formats:

1. **Granularity Detection**: Determine if field needs year, month, or day
2. **Format Adaptation**: Match placeholder formats (MM/DD/YYYY, etc.)
3. **Split Date Fields**: Detect and group related date inputs
4. **Platform Quirks**: Handle Workday's custom date pickers

### 5. **Select/Dropdown Strategy**

Multi-tier approach for dropdowns:

1. **Standard HTML Select**: Use native browser APIs
2. **Custom Dropdowns**: Simulate clicks and keyboard navigation
3. **Search-based**: Type to filter options
4. **Fuzzy Matching**: Use token scoring and fuzzy string matching
5. **Scroll Management**: Ensure options are visible before clicking

### 6. **Grouping and Batching**

Fields are grouped by:

- **Proximity**: Consecutive similar fields
- **Section Type**: Education, experience, address blocks
- **Add Buttons**: Dynamic sections that can be expanded
- **Dependencies**: Fields that trigger other fields

### 7. **AI Integration**

For complex open-ended questions:

1. Collect unanswered questions
2. Build payload with field context
3. Send to AI model (Gemma API)
4. Parse and validate responses
5. Map answers back to input fields

### 8. **Error Handling and Resilience**

- Wait for DOM stability before proceeding
- Retry mechanisms for transient failures
- Fallback strategies for platform detection
- Graceful degradation when features unavailable

---

## Usage Flow

### Typical Autofill Session

1. **User navigates** to a job application page
2. **Extension detects** the page is an ATS platform
3. **autofillInit()** is triggered
4. **System scans** the DOM for all input fields
5. **Labels are extracted** and fields are categorized
6. **Fields are grouped** into logical sections
7. **Resume is uploaded** if file field detected
8. **Text fields** are populated with user data
9. **Dropdowns** are selected using matching logic
10. **Dates** are formatted and filled
11. **AI model** answers complex questions
12. **Dynamic sections** (education, experience) are expanded and filled
13. **Verification** ensures all data was correctly filled

---

## Platform Support

### Supported ATS Platforms

1. **Ashby** - Custom button-based forms
2. **Success Factors** - Standard and EU variants
3. **Greenhouse** - Dynamic dependency handling
4. **Power** - Standard forms
5. **Apex Apply** - Standard forms
6. **iCIMS** - Complex multi-step forms
7. **Meta** - Custom select widgets
8. **JobCase** - Standard forms
9. **Workable** - Standard and jobs subdomain
10. **Lever** - Resume parsing detection
11. **Paylocity** - Standard forms
12. **Checkwriters Recruit** - Hidden input uploads
13. **Fidelity** - Standard forms
14. **NJoyn** - Custom option text handling
15. **ClearCompany** - Standard forms
16. **SmartRecruiters** - Shadow DOM components and careers subdomain

---

## Performance Optimizations

### Caching
- **Field Name Cache**: Avoid re-computing field names
- **Group Cache**: Cache grouping results
- **Lever Question Cache**: Cache Lever-specific questions

### Lazy Loading
- Platform-specific modules loaded only when needed
- AI model called only for unanswered questions

### Batch Processing
- Date fields processed in batches
- Related fields grouped and filled together
- DOM queries minimized through caching

---

## Future Enhancements

### Potential Improvements
- More platform support
- Enhanced AI question answering
- Better error recovery
- Performance monitoring
- User feedback integration
- Active learning from corrections

---

## Debugging Tips

### Common Issues

1. **Field Not Detected**
   - Check if input is visible (`isEffectivelyVisible()`)
   - Verify label association logic
   - Check for Shadow DOM boundaries

2. **Wrong Value Selected**
   - Review fuzzy matching scores
   - Check normalization logic
   - Verify option text extraction

3. **Resume Upload Fails**
   - Check file field detection patterns
   - Verify user gesture context
   - Check platform-specific wait conditions

4. **Date Format Incorrect**
   - Verify granularity detection
   - Check placeholder parsing
   - Review format adaptation logic

---

## Contributing Guidelines

### Code Organization
- Keep platform-specific logic in dedicated helper files
- Use descriptive function names
- Add comments for complex logic
- Follow existing patterns for consistency

### Testing
- Test across multiple platforms
- Verify with different data sets
- Check edge cases (empty fields, special characters)
- Test dynamic sections thoroughly

---

**Version**: 1.0  
**Last Updated**: February 2026  
**Maintained By**: Development Team

---

## Quick Reference

| Task | Module | Key Function |
|------|--------|--------------|
| Detect inputs | `inputandlabelextraction/input/` | `inputSelection()` |
| Extract labels | `inputandlabelextraction/label/` | `inputFieldSelection()` |
| Upload resume | `resume/` | `newResumeFirstFromFinalGrouped()` |
| Fill text field | `populate/` | `fillInput()` |
| Fill date | `populate/date/` | `fillDate()` |
| Fill dropdown | `populate/select/` | `scanAndSelectOption()` |
| Group fields | `groupingpayloadsanswers/` | `groupConsecutiveByGroupId()` |
| Call AI | `callingModel.js` | `callGemmaApi()` |
| Handle add buttons | `groupingpayloadsanswers/` | `processAddSectionsFromData()` |
