# Silverblaze Launchpad — Implementation Kickoff Portal (bare-bones edition)

A simple, temporary intake tool: run it for the few days/weeks you're collecting information, then shut it down. No OAuth app to register, no database to provision.

- **One shared Smartsheet API token** (from your own Smartsheet account), pasted into `.env`. No Smartsheet login flow, no per-person accounts.
- **Multiple named manager logins**, hardcoded in `server/users.js` — no database, no external identity provider. Add/remove teammates by editing that one file.
- **Create New Project** and **Retrieve Existing Project** are two separate, explicit actions. Retrieve only ever looks up an existing project — if there's no exact match it errors clearly (with a "did you mean X" suggestion if a similarly-spelled project exists). Create only ever makes a new Smartsheet Workspace — it refuses if the exact name already exists, and asks for confirmation if a similarly-spelled project already exists, so a typo can't silently spawn a duplicate project.
- **Each project = its own Smartsheet Workspace**, with one Sheet per intake section (Business Info, CIS Integration, Payment Vendor, Branding, SMTP Config, Ansible Inventory, Smart Meter), using real named columns instead of a JSON blob.
- **Business Info** and **CIS Integration** each have a simple Point of Contact card (name + email) in addition to their existing fields.
- **Payment Vendor** has a vendor-type dropdown (Invoice Cloud / Paymentus / Other) with fields specific to whichever is picked. A primary point of contact (name + email only), one-time payment URL, and general comments always show regardless of vendor; the 5-row test accounts table only shows for Invoice Cloud.
- **Branding** only asks for Primary/Secondary brand color hex codes as real fields — the logo, favicon, and eBill sample are collected by asking the submitter to email them directly (no file upload, no field).
- **Final Review** can generate, save to Smartsheet, and download a `.properties` config file. The property names it writes come from `server/configKeyMap.js` — the one file you edit to match your real utility-portal codebase, without touching any of the portal's own code.
- **Share links need no login at all.** Each is a signed, expiring link that unlocks exactly one section of one project; anyone with the link can fill it in and submit straight to that section's sheet — rendered with the exact same cards/tables/widgets as the manager dashboard, not a generic label+input list (see Section 5 below).
- **Required fields are actually enforced.** Any field marked with a red `*` blocks Save/Submit (on both the manager dashboard and a customer share link) until it's filled in — it's no longer just a visual hint.
- Passwords/API keys typed into the form are **never written to Smartsheet** — only a "`<Field> Provided`" checkbox.
- State (which project maps to which Workspace/Sheets) lives in one small JSON file on disk (`server/data/projects.json`) — no database.
- **Project management add-ons** — Project Tracking (project plan/SOW links, phase, status, and a Business Unit vs. Direct Customer profile), a PM-entered Weekly Forecast timeline, an internal Team Updates/Blockers feed, and a fully manual, drag-to-reorder Build Checklist all live alongside the original intake sections (see Section 6 below).
- **Role-based visibility** — a `manager` sees every project in All Projects; everyone else only sees projects they created or have been explicitly assigned to (see Section 8 below).

## 1. Run it locally in mock mode (no Smartsheet token needed yet)

The env template ships as `env.example.txt` rather than `.env.example` — some
antivirus/Defender heuristics flag any file literally named `.env` or
`.env.example` as suspicious (malware campaigns have abused that exact
filename), even though this one is just placeholder text with no secrets in
it. Rename it to `.env` as part of setup, same as you'd do with any
`.env.example` template.

**macOS / Linux / Git Bash:**
```bash
cd portal-server
npm install
cp env.example.txt .env
npm run dev
```

**Windows Command Prompt (cmd.exe):**
```bat
cd portal-server
npm install
copy env.example.txt .env
npm run dev
```

**Windows PowerShell:**
```powershell
cd portal-server
npm install
Copy-Item env.example.txt .env
npm run dev
```

Open http://localhost:3000, sign in with `admin` / `change-me` (the default entry in `server/users.js` — edit that file to add real teammates or change the password; usernames are case-sensitive), and click through Create New Project, saving sections, share links, config export, and the customer form — all against an in-memory fake Smartsheet, no real token required yet.

## 2. Get a real Smartsheet API token (takes 2 minutes)

1. Log into Smartsheet, click your avatar → **Personal Settings**.
2. **API Access** → **Generate new access token**. Name it something like "Silverblaze Launchpad intake."
3. Copy the token into `.env`:
   ```
   SMARTSHEET_API_TOKEN=your-token-here
   SMARTSHEET_MOCK=false
   ```
4. Open `server/users.js` and set up real logins for whoever needs access — replace the default `admin` / `change-me` entry and add one object per teammate:
   ```js
   module.exports = [
     { username: 'jsmith', password: 'a-real-password', displayName: 'Jane Smith' },
     { username: 'mkumar', password: 'another-real-password', displayName: 'Mohan Kumar' },
   ];
   ```
   Whoever logs in is recorded as the "Submitted By" on anything they save.

That's it — no app registration, no redirect URLs, no approval flow. Restart the server (`npm run dev` or `npm start`) and you're writing to your real Smartsheet account.

Note: this token has your full Smartsheet permissions and does not expire on its own — treat `.env` like a password file, don't commit it, and revoke the token in Smartsheet's Personal Settings once you're done with this intake.

## 3. Sharing this with vendors/teams who aren't on your machine

Since customers need to open share links from outside your network, running only on `localhost` isn't enough — pick whichever of these fits how long you need this running:

- **A few days, one-off:** use [ngrok](https://ngrok.com) — `ngrok http 3000` gives you a temporary public HTTPS URL in seconds, no deployment needed. Update `APP_BASE_URL` in `.env` to that ngrok URL so share links point at the right place, then restart.
- **A couple weeks, want a stable link:** deploy to a free-tier host like [Render](https://render.com) or [Railway](https://railway.app) — connect this folder as a git repo, set the same `.env` values as App Settings/environment variables there, and you get a permanent HTTPS URL for as long as you keep the service. Delete the service when you're done.

Either way, set `NODE_ENV=production` once it's not just on your own machine, so session cookies get marked `secure`.

## 4. How data flows

1. Manager signs in with one of the logins in `server/users.js` → session cookie set, with that user's display name attached.
2. Manager types a project/client name and clicks either:
   - **Create New Project** → `POST /api/projects/create` → refuses if that exact name already exists (use Retrieve instead); if a similarly-spelled project already exists, asks for confirmation before proceeding (typo guard); otherwise creates a Smartsheet Workspace named after the project, and inside it, 7 Sheets — one per intake section — each with columns named after that section's real fields (see `server/sectionSchemas.js`).
   - **Retrieve Existing Project** → `POST /api/projects/retrieve` → looks up the project by exact name only; if not found, returns a clear error with a "did you mean X" suggestion when a similarly-spelled project exists. Never creates anything.
3. Manager fills a section and clicks **Save to Smartsheet** → one row written/updated in that section's sheet, keyed by "Client Name". For Payment Vendor, only the fields relevant to the chosen vendor type (Invoice Cloud / Paymentus / Other) are shown, but all vendor-type columns exist on the sheet — the ones not applicable are just left blank.
4. Manager clicks **Share links** → server issues one signed token per section (`server/linkTokens.js`) → links point at `/customer.html?token=...`.
5. Anyone with the link opens it, no login required → server verifies the token, resolves it to the project + section, and reads/writes that section's sheet using the one shared API token. The customer form shows the same vendor-type dropdown and Branding email instructions as the manager dashboard.
6. On the **Final Review** tab, the manager can generate a `.properties` config file pulling live data from every section's sheet. Property names come from `server/configKeyMap.js`, not from the section schema — edit that one file so the keys match your real utility-portal codebase. The manager can download it, copy it, or save it into a dedicated "Final Configuration" sheet in the project's Workspace (columns: Client Name, Config File, Generated By, Generated At).

## 5. The customer share-link page

`public/customer.html` + `public/customer.js` render each section with the exact same cards, tables, and widgets as the manager dashboard (hours table, checkbox groups, color pickers, vendor-specific blocks, required-field asterisks) — it's a single, no-login form for whichever one section the link is for, not a mini dashboard. `SECTION_BUILDERS` in `customer.js` mirrors the corresponding markup in `public/index.html` section-by-section; if you change a field in one place (e.g. add a field to Business Info in `server/sectionSchemas.js` and `public/index.html`), add the matching input to `SECTION_BUILDERS.business_info` too so the two stay in sync.

Since there's one shared Smartsheet API token, this is meant for a small trusted team running a short intake, not a multi-tenant product — if that ever changes, OAuth-per-manager and a real database are the first two things to add back.

## 6. Project management add-ons

Four more tabs sit under "Project management" in the sidebar, alongside the 7 intake sections. Unlike the intake sections, these don't count toward the completion percentage — they're ongoing, not "fill once and done."

- **Project tracking** — one row per project (same upsert-by-client-name pattern as the intake sections): a project plan URL and SOW document link (not uploads — matches Branding's "point to it, don't upload it" pattern), key dates, current phase (Discovery/Build/UAT/Launch/Support), overall status (On Track/At Risk/Delayed), assigned PM, and total forecasted hours. A **Customer profile** card also captures Business Unit vs. Direct Customer, Installation Type (Brand New/Upgrade), Portal History (SB Portal/Legacy Portal/No Portal), and Bill Presentment — plus, depending on that Business Unit/Direct Customer choice, either User Migration Required (Business Unit) or Integration Type + Data Migration Required (Direct Customer). Stored in its own "Project Tracking" Smartsheet sheet, kept deliberately separate from `server/sectionSchemas.js` so it can never leak into the generated `.properties` config.
- **Weekly forecast** — a PM-entered table, one row per week: week start/end, phase/milestone, forecasted hours, and actual hours (filled in once the week wraps up). Every "Add week" appends a new row to a "Weekly Forecast" sheet; editing Actual Hours updates that same row in place rather than creating a duplicate.
- **Team updates** — an internal feed for posting updates and flagging blockers, tagged by section and stamped with whoever's logged in. This is manager/team-only — it is never exposed on a customer share link, so vendors can't see or post to it. Unresolved blockers show a count badge in the sidebar; resolving one records who resolved it and when.
- **Build checklist** — fully manual. There's no predefined list of steps; the manager/team adds each one themselves. Every item has a step title + description, a color-coded status (Not Started/gray, In Progress/amber, Done/green, Blocked/red), and a free-text comment. Drag the grip handle on the left to reorder steps — the new order is saved immediately (`POST /:projectName/checklist/reorder`, backed by an `Order` column in `server/checklistSchema.js`). The title/description are editable inline, and the trash icon deletes a step outright. Nothing is auto-generated from intake data.

## 7. Portfolio dashboard and health scoring

Two more additions round the portal out into something closer to a lightweight PSA tool, both built on data that's already being collected — nothing new to fill in, no new Smartsheet sheets beyond what's needed.

- **All Projects (Portfolio)** — the view you land on right after signing in. `GET /api/projects/portfolio` (`server/routes/tracking.js`) loops every project in `server/data/projects.json` and rolls up its phase, status, intake completion %, open blocker count, and a computed health signal, without you ever having to open each project individually. Click **Open** on any card to jump straight into that project. If one project's data can't be loaded (e.g. a Smartsheet sheet was renamed or deleted outside the portal), that project shows a degraded "could not load" card instead of breaking the whole list for everyone else.
- **Health scoring (Green/Yellow/Red)** — computed by `server/projectHealth.js` from three signals, in priority order: a manual "At Risk"/"Delayed" call on the Project Tracking tab always wins; two or more unresolved Team Updates blockers forces Red; and a burn-rate projection (average actual hours/week from Weekly Forecast, divided into what's left of Total Forecasted Hours) flags Yellow or Red if the pace is tracking more than 7 or 21 days behind the Target Go-Live date. The portfolio card shows the specific reason(s) behind the color, not just the color itself. Edit `server/projectHealth.js` if you want different thresholds or rules.

**Route-ordering note for anyone touching `server/app.js`:** `trackingRoutes` (which owns `/api/projects/portfolio`) is mounted *before* `projectRoutes` (which owns the generic `/api/projects/:projectName`) — otherwise Express would match `/api/projects/portfolio` against `:projectName` first and treat "portfolio" as a project name lookup. Keep that order if you ever add more single-segment routes to either file.

## 8. Role-based visibility

Every login in `server/users.js` now has a `role`, either `manager` or `team`. This only controls which projects someone can see and act on — it doesn't add a separate login flow or change anything about how sections are filled in or shared.

- **Manager** — sees every project in All Projects (the portfolio view), can open any project directly, and is the only role that can assign teammates to a project.
- **Team** — only sees a project if they created it (whoever ran Create New Project on it) or a manager has explicitly assigned them to it. Anyone else's project simply doesn't show up in their All Projects list, and trying to retrieve it by name returns a clear 403 ("You don't have access to \"X\". Ask a manager to assign you to it.") rather than a silent empty result.

This is enforced on the server, not just hidden in the UI — `server/permissions.js` (`canAccessProject` / `visibleProjects`) is checked on every project-scoped route (retrieve, section save, tracking/forecast/updates/checklist, share links, config generate/save), so a team member can't get at a project they don't have access to just by guessing/typing its name into a URL.

**Assigning teammates:** on the Project Tracking tab, a manager sees a "Team access" card listing every user from `server/users.js` with a checkbox; checking a name and clicking **Save assignment** calls `POST /api/projects/:projectName/assign`, which is rejected with a 403 for anyone who isn't a manager. Team members don't see this card at all — assignment is a manager-only action.

Where this data lives: `createdBy` is set automatically (from whoever's logged in) the moment a project is created; `assignedUsers` is an array set only via the `/assign` endpoint. Both live directly in `server/data/projects.json`, the same local pointer file that already tracks each project's Workspace/Sheet IDs — this is access-control metadata, not intake content, so it's deliberately kept out of Smartsheet.

## 9. Config flags, hosting type, Project Info for PM, and dynamic custom fields

**Config flags.** Three optional sections/cards can be hidden without deleting any code, route, or data — set these in `.env` (defaults shown, matching `env.example.txt`):

```
SHOW_PROJECT_MANAGEMENT=false   # Project tracking / Weekly forecast / Team updates / Build checklist
SHOW_CONFIG_EXPORT=false        # the "Config export" card on Final Review (Section completion still shows)
SHOW_OVERVIEW_SECTION=false     # the "All projects" portfolio view
```

Flip any of these to `true` and restart the server — `server/config.js`'s `features` object is sent once on `/auth/me` and the frontend (`applyFeatureFlags()` in `public/app.js`) hides/shows anything tagged `data-feature="<name>"` in `public/index.html`. Nothing underneath is removed: routes, save/load logic, and Smartsheet sheets all keep working even while hidden, so turning a flag back on needs zero further changes. When Overview is off, signing in lands on Business Info instead of the portfolio.

**Hosting type.** The first time a project is opened (created or retrieved) with no hosting type set yet, a modal asks **"Where is the environment hosted?"** — *Silverblaze Azure Hosted* or *Client/BU Hosted Server*. The choice is saved on the project record (`GET`/`POST /api/projects/:projectName/hosting`) and centralized in `HOSTING_TYPES` (`server/sectionSchemas.js`) — no other file hardcodes hosting logic. It drives:
- **Ansible Inventory** — required and fully usable under Client/BU Hosted (unchanged); grayed out, disabled, and marked "Not applicable" under Silverblaze Azure Hosted, on both the manager dashboard and any customer share link for that section. Its required fields are automatically skipped by validation while disabled.
- **CIS Integration / Payment Vendor** — a "Vendor IP whitelisting" card (Silverblaze IPs the vendor must whitelist, and vendor IPs Silverblaze must whitelist) appears only under Silverblaze Azure Hosted; hidden entirely under Client/BU Hosted, which is otherwise untouched.

A project's hosting type can be reopened any time from the link next to the (now read-only) "Environment hosting type" field on the new Project Info for PM section.

**New fields.** CIS Integration got a single **"Other Service Type Account"** field (existing Electricity/Water/Gas test-account rows are unchanged). Ansible Inventory's "Preferred temporary storage drive" is now labeled **"Temporary storage drive"**, gained a **Silverblaze IP(s) needing whitelisting** field and an **Additional Comments** field at the very end, plus an inline note by Installation Drives asking the hosting team (in writing) which drive letter to use, whether it's persistent, and whether the VM has a temporary/ephemeral disk — informational only, not a data field.

**Project Info for PM** (`sec-14` / `pm_info` in `server/sectionSchemas.js`) is a full 8th intake section — Business Unit vs. Direct Customer (with conditional sub-fields exactly like Project Tracking's existing customer-profile pattern), SOW link, effort estimate, key dates, install type, portal history, bill presentment, and a risk log. It saves/loads through the same generic `/api/projects/:projectName/sections/pm_info` endpoint every other section uses, but it is **not** part of `SKEYS` in `public/app.js` — deliberately, so it can't disturb the positional-index math (`goTo()`, completion %) the original 7 sections depend on; a separate `REVIEW_SECTIONS` list feeds it into the Final Review completion grid instead. As of Section 11 below, it **is** included in customer **Share links** (`shareableSectionMetaList` in `server/routes/projects.js`) — a PS team member can hand this one link to a PM the same way any other intake section gets shared.

**Dynamic custom fields ("Manage fields" tab).** *(Note: as of Section 17, this is a Designer-only tab with a draft/publish step — the mechanics below still apply, but "manager" should be read as "Designer" and every write lands in a draft copy first. See Section 17 for the current behavior.)* A Designer can add a text/dropdown/date field to any section — intake or Project Info for PM — with no code deployment. See Section 11 for the slot-based, inline rendering architecture; the underlying storage/Smartsheet-safety guarantees below are unchanged from when this was first built:
- `server/customFields.js` stores field definitions keyed by a permanent internal id (`cf_<slug>_<hex>`), never by the display label.
- Its Smartsheet column is always titled `Custom: <id>`. Renaming or retyping a field only edits the JSON record — the column title never changes, so **no data is ever lost on rename**. Deleting only sets `active: false` — the app never issues a delete-column call, so the Smartsheet column and its data are **never removed**, just hidden from new forms.
- `smartsheetClient.addColumnIfMissing()` is idempotent (checks for the exact column title first), so repeated loads never create duplicate columns.
- `server/routes/customFields.js` exposes a public `GET /api/custom-fields/section/:sectionKey` (used by both the manager dashboard and customer share links to render the right extra inputs, and which only ever reads the **published** copy of the fields) and Designer-only CRUD at `/api/custom-fields`, which operates on a separate **draft** copy — see Section 17.

## 11. Additional changes: inline field slots, PM Info sharing, and SMTP Point of Contact

This round of changes builds directly on Section 9 without touching the architecture described above — same Smartsheet-per-section model, same stable-id custom-field storage, same hosting-type gate.

**Silverblaze IP whitelisting, extended to 4 sections.** "Silverblaze IPs That Need to Be Whitelisted" now appears — gated by the exact same hosting-type toggle as before — on **CIS Integration**, **Payment Vendor**, **Smart Meter**, and **SMTP Config**. Under Silverblaze Azure Hosted it's shown (and can hold multiple, comma-separated IPs); under Client/BU Hosted it's completely absent from the DOM — not just hidden — so it can never block validation or get saved. `public/app.js`'s `applyHostingGating()` toggles all four cards (`cis-veip-card`, `pay-veip-card`, `sm-veip-card`, `smtp-veip-card`) from one array; `public/customer.js`'s share-link builders for all four sections use the same `data.hostingType === 'SILVERBLAZE_AZURE'` conditional the manager dashboard uses.

**Installation Drives confirmation copy.** The note above Ansible Inventory's drive fields now reads: the drive values entered **are themselves** the hosting team's written confirmation of drive preferences — no separate upload or sign-off step. Preferred Installation Drive and Temporary Storage Drive are both required fields now (`required: true` in `server/sectionSchemas.js`), on both the manager dashboard and any customer share link for that section; they're skipped by validation only when the whole section is disabled under Silverblaze Azure Hosted, same as every other Ansible field.

**Project Info for PM joins Share Links and Section Completion.** `shareableSectionMetaList` in `server/routes/projects.js` is no longer filtered to exclude `pm_info` — a PS team member can generate and hand a PM Info link to the PM exactly like any other section. `refreshReview()` in `public/app.js` (via a `REVIEW_SECTIONS` list) shows Project Info for PM's completion status on Final Review alongside the other 7 sections, without touching `SKEYS` (see Section 9) or the positional `goTo()` math the original 7 sections rely on.

**SMTP Config gets a Point of Contact.** A Name + Email card sits at the top of SMTP Config, saved as `smtp_poc_name`/`smtp_poc_email` — same pattern, same position, same "Point of Contact" label as every other section's POC card.

**Hosting Provider removed from Project Info for PM's Scope & Effort card.** It's gone from `server/sectionSchemas.js`'s `pm_info.fields`, `public/index.html`, and `public/customer.js` — the field never existed as a separate concept elsewhere, so nothing else needed to change.

**Point of Contact, standardized.** Every section that has one — Business Info, CIS Integration, Payment Vendor, SMTP Config — now uses the exact label "Point of Contact" (not "Primary...", not "...Person", not lowercase "of contact") and puts that card first, above the section's other fields. A "Same as Business Info" button (`copyPocFrom()` in `public/app.js`) lets a manager copy Business Info's saved POC into any of the other three sections' POC fields with one click, rather than re-typing it — a convenience copy, not a shared/linked value, since each section still has its own independent POC columns on its own Smartsheet sheet.

**Manager field placement is now truly inline — no more bottom-of-page "Custom fields" card.** This is the biggest structural change this round:
- `server/fieldSlots.js` defines, per section, the fixed list of existing cards a manager can drop a new field into (e.g. CIS Integration's slots are `poc`, `services`, `test_accounts`, `account_codes`). Every one of those cards is tagged in the HTML with `data-slot="<sectionKey>:<slotKey>"` — in **both** `public/index.html` (manager dashboard) and `public/customer.js` (share-link page), so a field placed by a manager shows up inline in the identical spot on both.
- A custom field record now also carries `slot` and `order` (in addition to the existing stable `id`, `label`, `type`, `options`, `required`). `renderCustomFields()` (`app.js`) and `injectCustomFields()` (`customer.js`) each look up the matching `[data-slot="..."] .fg` element and append the field's input directly into it — never into a separate section.
- **Drag-and-drop reordering:** the "Manage fields" admin tab lets a manager drag fields up/down within a section (reusing the same drag-and-drop pattern already built for the Build Checklist). Drop order is persisted via `POST /api/custom-fields/reorder` → `customFields.reorderSection()`, which writes each field's new `order` into the same `server/data/customFields.json` record used for everything else — so it survives refresh, logout/login, and a full server restart exactly like every other field property. Order is purely a rendering concern; it never touches the field's Smartsheet column (`Custom: <id>`, keyed by id, not position), so reordering can never rename, duplicate, or lose a column.
- Required custom fields get the same `<span class="req">*</span>` marker every static field uses, so the existing generic `findMissingRequired()` scan (unchanged) picks them up automatically on both the manager dashboard and a customer share link — optional custom fields never block save/submit.

## 12. Testing performed

All 7 scenarios from the original enhancement spec were run end-to-end against the mock Smartsheet backend, as described in the prior README revision. For this round of additional changes, verification covered:
- An automated jsdom harness (`public/customer.js` loaded into a real DOM, fed mocked `/api/customer/:token` payloads) confirming: Project Info for PM renders with its hosting type pre-selected and a manager-added required custom field correctly injected into its target slot (and correctly flagged by `findMissingRequired`); SMTP Config's Silverblaze IP field is completely absent under Client/BU Hosted and present under Silverblaze Azure Hosted; Smart Meter's Silverblaze IP field shows under Azure Hosted; Ansible Inventory's Installation Drives note and required markers match the new copy; and a manager-added dropdown custom field injects correctly into Payment Vendor's "one-time payment" slot with Payment Vendor's POC card correctly titled "Point of Contact" (not "Primary...").
- A live server run (`SMARTSHEET_MOCK=true`) exercising the real HTTP API end-to-end: creating a project, setting hosting type to Silverblaze Azure Hosted, adding a manager custom field to Project Info for PM, generating share links (confirming `pm_info` is now included), and fetching that link's data (confirming `hostingType` and the correctly-slotted custom field come back).
- Confirming a manager's drag-and-drop reorder of custom fields survives a brand-new HTTP session (simulated logout/login) and a full server process restart (simulated by killing and relaunching `node server/index.js`, which reads `server/data/customFields.json` fresh from disk) — order was identical in all three states.
- A repo-wide grep audit confirming: `pm_hosting_provider` has zero remaining occurrences anywhere; "Point of Contact" is the only label variant in use (no "Primary Point of Contact," "Contact Person," "Primary Contact," or lowercase "Point of contact" in any rendered UI string); the pre-existing Ansible Inventory `ans_sb_whitelist_ips` field (unrelated to this round's new IP fields) is untouched in all three files that reference it; and no `custom-fields-block`/`customfields-N`/standalone "Additional fields" card remains anywhere.

All checks passed.

**Known limitations / assumptions:**
- The hosting-type question is asked once per project (not globally "after login," since a manager works across many projects with potentially different hosting) — re-answerable via the link on Project Info for PM if it needs to change.
- Custom field types are limited to text/dropdown/date per the spec's stated minimum; the architecture (`FIELD_TYPES` in `server/customFields.js`, `SECTION_SLOTS` in `server/fieldSlots.js`) is built to extend if more types or slots are needed later.
- There's no "reactivate a deleted field" button in the UI yet — the data model supports it (`active: false` is just a flag), but only create/rename/reorder/deactivate are exposed today.
- A manager field can only be placed into one of a section's predefined slots (the existing cards) — it can't be dropped between two fields on two different existing cards, or create a brand-new card of its own; this was a deliberate trade-off to satisfy "no separate Custom Fields section" without redesigning every section's layout.
- As with the rest of this app, everything above was built and tested against `SMARTSHEET_MOCK=true`; behavior against a real Smartsheet account should match (same API calls, same column/row semantics) but hasn't been separately verified against live Smartsheet.

## 13. Notifications and the portfolio health digest

Three things push updates out automatically instead of requiring someone to keep checking the dashboard — all built on `server/notifications.js`, which posts a plain `{ text }` body to one webhook URL you configure:

- **Section submitted.** The moment anyone submits a section through a share link, a message goes out naming the section and project (`server/routes/customer.js`).
- **Blocker flagged.** The moment a Team Update is posted with type `Blocker`, a message goes out immediately — no one has to notice it in the Team Updates feed (`server/routes/tracking.js`).
- **Portfolio health digest.** Once a day (optional, off by default), a summary of every project's completion %, open blockers, and Green/Yellow/Red health goes out — the exact same computation the Portfolio dashboard already uses, just pushed on a schedule instead of opened (`server/digest.js`).

**Setup (2 minutes, either Slack or Teams):**

- **Slack:** in Slack, go to your workspace's App Directory → search "Incoming Webhooks" → add it to the channel you want these posted to → copy the Webhook URL it gives you.
- **Microsoft Teams:** open the channel → **⋯** → **Connectors** (or **Workflows** on newer Teams) → **Incoming Webhook** → name it, copy the URL it gives you.

Paste that URL into `.env`:

```
NOTIFY_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
```

Submission and blocker notifications start working immediately — no restart-required gotchas beyond the normal "restart after editing `.env`." To also turn on the daily digest:

```
DIGEST_ENABLED=true
DIGEST_HOUR=8   # 24-hour local server time; 8 = 8am
```

**Leave `NOTIFY_WEBHOOK_URL` blank and nothing breaks** — every notification just logs to the server console instead (`[notify] (set NOTIFY_WEBHOOK_URL in .env to actually deliver this) ...`), so this is entirely opt-in and safe to ignore if you don't need it yet.

No new dependency was added for any of this — webhook delivery reuses `node-fetch` (already a dependency), and the digest's "once a day" timing is a plain `setInterval` check, consistent with this app's existing preference for minimal dependencies. If you outgrow "roughly once a day" and want exact cron-style scheduling, swap the loop in `server/digest.js`'s `startDigestScheduler()` for `node-cron` — `buildDigestText()` itself doesn't need to change.

**What this deliberately doesn't do yet:** there's no per-project mute and no separate webhook per project. The "nudge a vendor whose link has been sitting untouched" gap called out here previously is now built — see section 14 below.

## 14. Email delivery and automated reminder nudges

Three additions on top of the section above, all opt-in and all built to fail safe (never break a real request if unconfigured):

**Emailing a share link directly.** The Share Links tool's table now has an "Email link" column — enter the vendor/client's address next to a section and click send. This calls `POST /api/projects/:projectName/share-links/:sectionKey/send-email`, which generates the link, emails it via `server/email.js` (SMTP, using [nodemailer](https://nodemailer.com/)), and remembers who it was sent to. Configure it in `.env`:

```
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@yourcompany.com
SMTP_PASS=your-smtp-password-or-app-password
SMTP_FROM=no-reply@yourcompany.com
SMTP_FROM_NAME=Client Onboarding Portal
```

**Leave `SMTP_HOST` blank and nothing breaks** — the link is still generated and returned in the response so you can copy/paste it manually; the UI tells you SMTP isn't configured instead of pretending an email went out.

**Automated reminder nudges.** Once a share link has been emailed (not the plain "Generate / refresh links" copy-paste flow — only the emailed ones have a known recipient), `server/reminders.js` can automatically re-send that same email on a schedule if the section is still unsubmitted, and post a note to your notifications webhook. Off by default:

```
REMINDERS_ENABLED=true
REMINDER_INTERVAL_DAYS=3   # wait this long since the link was issued/last reminded
REMINDER_HOUR=9            # 24-hour local server time
```

Requires SMTP to be configured too, since a reminder is just another email through the same `sendShareLinkEmail()` helper. The scheduler uses the same dependency-light `setInterval` + once-per-day guard pattern as the digest scheduler in section 13 — no new scheduling library.

**How the automation fits together, end to end:**

1. A manager types a recipient's email next to a section in Share Links and clicks send. The server signs a link token, emails it, and records `{ token, url, recipientEmail, issuedAt, lastRemindedAt: null }` on the project (`projectStore.saveProject`).
2. Once a minute, if `REMINDERS_ENABLED=true`, `server/reminders.js` wakes up and checks whether the current server hour matches `REMINDER_HOUR`, and whether it's already run today — if not, it runs one sweep.
3. The sweep walks every project's recorded share-link entries. For each one it asks Smartsheet "has this section's row been submitted yet?" (the same check the customer link page itself uses). If yes, it's skipped — nothing to remind. If no, and it's been at least `REMINDER_INTERVAL_DAYS` since it was issued (or last reminded), it re-sends the exact same email and posts a note to the notifications webhook, then updates `lastRemindedAt`.
4. This repeats daily until the recipient submits, at which point step 3 starts skipping it permanently.

Nothing here is a UI feature — it's a background process; the only visible parts are the "Email link" button/column in Share Links and, if configured, the messages that show up in your inbox or Slack/Teams channel.

## 15. Switchboard rebrand and UI/UX rebuild

The app was renamed from "SilverBlaze" to **Switchboard** and given a full visual rebuild on top of the same backend/business logic — no workflow, permission, or Smartsheet behavior changed as part of this pass. Highlights:

- **Design system.** `public/styles.css` now defines the whole look from one `:root` token block — brand colors (`--brand` #323CDC, `--lime` #C9F914, plus neutral ink/surface/border scales), radii, and shadows — and every page (manager dashboard, login, customer share-link page) is built from the same reusable classes (`.card`, `.btn`/`.btn-primary`/`.btn-sec`, `.f`/`.flbl` fields, `.modal-overlay`/`.modal-box`, `.sbadge`, `.pp-*` list rows, `.sl-*` share-link rows). No page has its own one-off button or field styling.
- **Branding.** The Switchboard mark (a blue rounded-square with a lime underline bar) is drawn in CSS via `.sb-mark`/`.login-mark`/`.cx-mark`, so the login page, sidebar, and customer page all render an identical logo without shipping an image. A matching favicon (`public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`) is wired into both `index.html` and `customer.html`.
- **Retrieve Existing Project is now a picker, not a text field.** `openRetrieveModal()` in `public/app.js` calls the existing `GET /api/projects` endpoint and lists whatever it returns in a searchable modal (`.pp-list`). That endpoint already filtered results server-side by role (`server/permissions.js` — managers see everything, team members only see projects they created or were assigned to) before this change; the modal only ever renders what the API sends back, so the access rule didn't need to move or change, just get a better front end.
- **Password fields are masked by default, everywhere.** `public/pw-toggle.js` is a small shared script (loaded by both `index.html` and `customer.html`) that finds every `type="password"` input on the page — including ones rendered later, like a freshly-loaded section — and wraps it with a click-to-reveal eye icon. It only ever flips the input's `type` attribute; it doesn't read, store, or transmit the value.
- **Share Links redesigned.** Each section is now its own card with the link shown in full (not truncated), Copy/Open actions, and the email address input + Send button on a single row (`.sl-row`) that stacks vertically on narrow screens instead of the button dropping awkwardly below the field.
- **Generic modal helper.** `openModal(id)`/`closeModal(id)` in `app.js`, plus a shared Escape-key handler, back the hosting-type gate and the new Retrieve Existing Project modal so any future modal reuses the same open/close/backdrop convention instead of a new one-off.

Verification for this pass: booted the server in mock mode, logged in, created a project through the UI, walked through the hosting gate, retrieve-project modal, a CIS password toggle, and the full Share Links flow (generate → copy/open/send → the resulting customer link rendering correctly), and confirmed via screenshots that branding, spacing, and component styling are consistent across the manager dashboard and the customer page.

## 16. Brand accuracy pass — logo, color palette, and compact Share Links

A follow-up pass fixed four issues reported after Section 15's rebuild, with no change to any workflow or permission behind them:

- **Logo mark.** The lime bar now sits as its own strip directly below the blue mark (`::after` in `.sb-mark`/`.login-mark`/`.cx-mark`), matching the approved wordmark, instead of overlapping inside it. The product name is set in Poppins Bold (Google Fonts, with an explicit `'Inter', -apple-system, ...` fallback stack — never an undefined CSS variable inside a `font-family` list, since one invalid entry silently drops the whole declaration).
- **Color palette.** `--brandl` (a very pale tint of the brand blue that reads as lavender/purple at low saturation, even though the hex is technically blue) and three unused off-brand variables (`--coral`, `--teal`, `--slate`) were removed from `public/styles.css`. Every consumer was individually re-pointed at a neutral gray or a solid/saturated brand color — the palette is now exactly the four approved colors (blue, lime, white/near-white surfaces, black/ink text) plus semantic green/amber/red for status only.
- **Share Links, compact layout.** Each section collapsed to one row: a label, Copy + Open buttons, an email field, and Send — no raw URL shown on screen (still available via the row's `title` tooltip and the Copy button's clipboard payload).
- **Neon lime accents, restored intentionally.** Hover/focus/active states across buttons, inputs, and list rows got a lime-tinted glow, per explicit request to make the accent color visible on interaction. (Section 17 below tones this down again in the main content area after further feedback — the sidebar keeps a lime accent, everything else went back to subtle.)

## 17. Designer role, draft/publish template editing, and final polish

This pass adds a fourth role and reworks how vendor-template ("Manage fields") changes go live, on top of everything above — no existing section, permission, or Smartsheet behavior was removed to make room for it.

**New role: Designer.** `server/users.js` now supports `role: 'designer'` alongside `manager`/`team` (see `server/routes/auth.js`, which maps the three valid roles straight through at login — an earlier version of this code collapsed anything that wasn't `'manager'` into `'team'`, which would have silently locked Designers out; that was caught and fixed before shipping). A Designer's only job is managing vendor template fields — they don't get the Manager's portfolio/assignment powers or the Team member's restricted project list; **Manage Fields is now Designer-only**, and a Manager no longer has any path to it, at either layer:
- **UI**: the nav item is hidden (`data-designer-only`) unless `/auth/me` reports `role: "designer"`.
- **API**: `server/routes/customFields.js` mounts `requireDesigner` (checks `req.session.role === 'designer'`, 403s otherwise) in front of every read/write route except the two public, published-only ones. A Manager hitting any Designer route directly — even by crafting a raw API call — gets a 403, not just a hidden button.

**Draft vs. published.** Every field a Designer adds, renames, retypes, or deletes writes to a separate draft copy, not the live one:
- `server/data/customFields.json` (published) is the only file any real form — manager dashboard or customer share link — or Smartsheet column provisioning ever reads.
- `server/data/customFieldsDraft.json` (draft) is the only file the Designer's Manage Fields screen reads and writes. It's seeded as an exact copy of published the first time it's touched, so a brand-new draft starts identical to what's live.
- `GET /api/custom-fields/status` reports whether the draft differs from published (`pending`) plus `lastPublishedAt`/`lastPublishedBy`, driving a badge at the top of Manage Fields ("Draft changes — not published" / "Up to date — nothing pending").
- `POST /api/custom-fields/publish` is the only code path that copies draft over published — the single moment a Designer's changes go live for every project's forms and Smartsheet columns. It's gated behind an in-app confirmation dialog and shows a success toast + refreshed badge afterward.

**Manage Fields screen.** Per vendor template section: an "Add a field" form, and each existing field rendered as a compact row with its label directly editable inline, a Required checkbox, a "Place into" slot dropdown, and a Delete button that names the exact field in its confirmation dialog (`data-field-label`, read via `this.dataset` rather than interpolated into the `onclick` string, so a label containing an apostrophe can't break the handler). Nothing here is styled to look permanently "in edit mode" — inputs are borderless until focused, and the only color used for state is the draft/published status badge.

**Unsaved-changes protection.** While a Designer has unpublished draft changes, `public/app.js` intercepts three exits and shows a plain-language confirmation before letting them through: switching to any other nav section (`goTo()`), signing out (`doLogout()`), and closing/reloading the tab (`beforeunload`). None of these can silently discard a draft — the draft is saved to disk immediately on every change either way, so the warning is about it not being *live* yet, not about losing it.

**Other polish in this pass:**
- Share Links is now a CSS Grid (`grid-template-columns`), not flexbox, so the Copy/Open buttons, email field, and Send button line up in identical columns on every row regardless of how long that section's label or link is.
- Hover/focus states in the main content area (buttons, inputs, list rows) were toned back down to subtle border/background changes — the lime glow from Section 16 is now reserved for the left sidebar's active/hovered nav item only, so the accent still reads as intentional rather than applied everywhere.
- The gap between "Switchboard" and "Implementation Kickoff" in the signed-in sidebar header was tightened to match the login page's spacing.

Verification for this pass: booted the server, and via direct API calls confirmed a Manager gets 403 on every Designer-only custom-fields endpoint (including a simulated crafted POST); confirmed a fresh Designer login persists as `role: "designer"` (not silently downgraded); and walked a field through its full lifecycle — created as Designer (invisible on the public section endpoint, `pending: true`), published, then confirmed it appeared on the public endpoint with `pending` back to `false` and the correct `lastPublishedBy`. Followed by a Puppeteer screenshot pass confirming: the Manager's sidebar has no Manage Fields item and is blocked with a clear error even if forced into that view via the console; the Designer's Manage Fields screen shows the draft/published badge flipping correctly around a create-then-publish cycle with the expected confirmation dialogs; and the Share Links grid stays column-aligned across section labels ranging from "Business Info" to "Project Information for PM".

## 18. Inline Designer editing (retiring the separate Manage Fields page), Business Info + Branding merge, and POC standardization

This pass retires the standalone Manage Fields admin page from Section 17 and moves that same capability directly inline into each vendor's real intake form, merges Branding into Business Information, and standardizes Point of Contact across every vendor. No color theme, branding, or overall visual identity changed — this is layout/copy/workflow only, plus one small, deliberately minimal glass-style accent (see below). None of Section 17's draft/published storage model, Smartsheet column-safety guarantees, or role permissions were rebuilt — they were extended to be per-vendor instead of global.

**Login page.** Removed the "Username is case-sensitive" and "All information is stored in and fetched from Smartsheet" disclaimer text. Username matching is now case-insensitive (`.toLowerCase()` on both sides in `server/routes/auth.js`); password matching is unchanged and still exact/case-sensitive.

**Business Information & Branding merged into one section.** Branding (brand colors, "please email us these assets") is no longer its own Smartsheet sheet/section — its fields and cards now live at the bottom of the Business Information section, which is relabeled "Business Information & Branding" everywhere (sidebar nav, section header, share links, portfolio completion). This is a real backend merge, not just a visual one: `server/sectionSchemas.js`'s `SECTION_KEYS` dropped from 8 to 7 entries, `business_info`'s `fields` array picked up `brand_hex1`/`brand_hex2`/`brand_other`, and the old standalone `branding` section object was deleted. Every other file that only ever referenced sections by their string `sectionKey` (`server/routes/projects.js`'s share-link generator, `public/customer.js`, `server/routes/customer.js`) needed zero changes — they picked up the merge automatically. `server/projectHealth.js`'s hardcoded section list did need a fix: it still listed `branding` as its own always-present-but-never-found section, which would have permanently dragged down every project's completion % — that's been removed now that `business_info` covers it.

Because every intake section further down the sidebar is addressed by a numeric position (`sec-N` / `nav-N` / `st-N` IDs, toggled by `goTo(n)` in `public/app.js`), removing one section meant renumbering every section after it by one, and removing the old Manage Fields page (previously the last section) meant the numbering now stops at `sec-13` instead of `sec-15`. This was done mechanically end-to-end and verified with a duplicate-ID grep sweep across `index.html` (zero duplicates) and a full re-read of `goTo()`'s branch list.

**Point of Contact, standardized.** Every vendor's POC card (Business Info & Branding, CIS Integration, Payment Vendor, SMTP Configuration, and now Smart Meter, which didn't have one before) carries the same note: "This should be the primary point of contact whom the Silverblaze team can reach out to for additional information related to this project." The "Same as Business Info" shortcut button is gone from every section that had it — each vendor's POC is now filled in independently, matching how the rest of that vendor's section already works. Smart Meter's new POC fields (`sm_poc_name` / `sm_poc_email`) were added to `server/sectionSchemas.js` so they persist to Smartsheet like any other field, and to `server/fieldSlots.js` as the first slot in that section so a Designer can attach custom fields to it too.

**Two disclaimers removed with no replacement**, per the request: "Passwords/tokens are never written to Smartsheet — only whether one was provided" (was under CIS Integration's API endpoints table) and "Shown for every vendor selection below" (was under Payment Vendor's POC card). The underlying behavior these described — passwords never actually being written to Smartsheet, and POC being asked once per vendor — is unchanged; only the explanatory text is gone.

**Designer role — inline editing replaces the Manage Fields page.** This is the core change. Previously a Designer clicked into a separate "Manage Fields" tab to manage every vendor's custom fields in one place. Now:
- The Project bar (Retrieve/Create Project) and the entire Tools section no longer render for a Designer at all — not hidden-but-present, not disabled, just not there. A Designer's landing view after login is Business Information & Branding, section 1 of the 6 vendor templates.
- Each of the 6 vendor sections gets, directly in its own page header, a small draft-status badge and a single "Publish" button scoped to that one vendor (`cf-badge-<sectionKey>` / `cf-publish-<sectionKey>` / `cf-meta-<sectionKey>` in `index.html`, driven by `renderDesignerSection()` / `loadDesignerSectionStatus()` / `publishSectionFields()` in `app.js`) — publishing Payment Vendor's draft never touches CIS Integration's, or any other vendor's, in-progress draft or already-published fields. This required moving `server/customFields.js`'s pending-check and publish functions from operating on the whole draft file to slicing by `sectionKey` (`hasPendingChangesForSection`, `publishSection`), and `customFieldsMeta.json` changed shape from one flat `{lastPublishedAt, lastPublishedBy}` to one per section key.
- Inside each vendor's real cards, every Designer-added field now renders as a compact chip (label + type, "· Required" if applicable) with small Edit and Delete icon buttons right next to it — never as a fillable input, since there's no project loaded while signed in as a Designer. Every card that accepts custom fields also grows a small "+ Add field" button. Clicking Add or Edit opens one shared modal (`#field-modal` in `index.html`); Delete opens a separate, explicit confirmation modal (`#delete-field-modal`) that states plainly: *"This removes the field from the intake form (as a draft, until you Publish). The Smartsheet column and any data already collected are never deleted."* That's not just copy — it's backed by the same column-safety design from Section 17 (a delete only ever flips `active: false`; the Smartsheet column title is always `Custom: <stable-id>`, never the label, so nothing about editing or removing a field can orphan or delete existing Smartsheet data).
- New backend routes power this: `GET /api/custom-fields/section/:sectionKey/draft` (a Designer's own not-yet-published fields for one vendor), `GET /api/custom-fields/status/:sectionKey`, and `POST /api/custom-fields/publish/:sectionKey`. The old flat `GET/POST/PUT/DELETE /api/custom-fields` routes are unchanged and still do the actual create/update/deactivate work — only the status/publish surface became per-vendor.

**A small, deliberate glass/liquid touch — nothing else changed.** Per the explicit instruction not to redesign the app or add anything neon/heavy: `public/styles.css` gained a soft `backdrop-filter: blur()` on the existing modal overlay (affects every modal in the app, including ones from earlier rounds, so it reads as one consistent touch rather than a one-off), and on the new Designer field chips / "Add field" button specifically (a light frosted background instead of a flat one). No colors, fonts, spacing, or existing components changed to make room for this — it's two `backdrop-filter` rules and a translucent gradient, nothing more.

Verification for this pass: `node --check` on every touched `.js` file; a full grep sweep for stale references (duplicate `sec-`/`nav-`/`st-` IDs — zero found; leftover "Same as Business Info", the two removed disclaimers, the old case-sensitivity login text, and any remaining `branding` *section-key* usage — all zero, aside from harmless comments and an unrelated `configKeyMap.js` naming convention); booted the server in mock mode and drove the actual HTTP API end-to-end — case-insensitive login for both a manager and the designer account, a field created as a Designer on Business Info (`pending: true`, invisible on the public endpoint), a Manager blocked with 403 attempting the same write, `status` confirmed *not* pending on a different vendor (CIS Integration) proving per-vendor isolation, publish making the field visible on the public endpoint while CIS Integration's public list stayed empty, then a full delete → still-visible-until-published → publish → gone-from-the-public-endpoint cycle (with the field itself only ever flipped to `active:false`, never removed from the draft/published JSON, i.e. never actually destroyed) to confirm the "Smartsheet data is never deleted" guarantee holds at the data layer this app controls. Also confirmed the server serves the edited `index.html`/`app.js`/`customer.js`/`styles.css` without parse errors and with the expected structural markers (14 `.view` sections, the new field/delete modals present exactly once, zero leftover references to the old Manage Fields page).

## 19. Feature-flag visibility bug fix, Overview locked to Manager, a "welcome" project-selection prompt, and Edit/Delete for every hardcoded field

**Bug fix: `SHOW_PROJECT_MANAGEMENT`/`SHOW_OVERVIEW_SECTION` being `false` no longer gets silently overridden.** Both nav sections were still appearing even with their `.env` flag off. Root cause: `public/app.js`'s boot sequence applied `data-feature` visibility and `data-designer-hide` visibility as two separate, sequential passes over the DOM. Every Project Management/Overview nav item carries *both* attributes (config-gated, and also hidden specifically for the Designer role) — the `data-feature` pass correctly set `display:none` when the flag was off, but the later `data-designer-hide` pass then unconditionally set `display:''` for every non-Designer, silently re-showing the very element the first pass had just hidden. Fixed by replacing both passes (plus the separate `data-manager-only`/`data-designer-only` passes) with one `applyVisibilityRules()` function that computes a single combined AND of every rule that applies to a given element before touching its `style.display` once — so no attribute's effect can be clobbered by another attribute's own pass, regardless of which order they're queried in.

**Overview is now Manager-only, enforced at both layers.** Previously any signed-in role could reach the Overview/All Projects portfolio once the flag was on, with only its data rolled up differently per role. Now: the "Overview" nav label and "All projects" button both carry a new `data-manager-only` attribute (caught by the same `applyVisibilityRules()` above), and — since a hidden nav item is not the same as an inaccessible route — `GET /api/projects/portfolio` in `server/routes/tracking.js` now 403s outright for any non-manager session, the same enforcement pattern `requireDesigner` already uses for vendor-template routes. A team member landing after login always goes to the first vendor intake section now, never Overview, even if the flag is on.

**A one-time "Create vs Retrieve" prompt on sign-in.** A Manager or Team member with no project loaded yet (true on every fresh sign-in, since nothing persists which project was open across page loads) used to land straight on a blank Business Info form with only a small "Create/Retrieve" bar above it — easy to miss, and easy to start typing into a form that isn't actually attached to anything yet. `index.html` gained a `#project-gate-modal` (same forced-choice, no-backdrop-dismiss pattern as the existing hosting-type gate): two clearly labeled options, Create New Project (focuses the existing project-name field) and Retrieve Existing Project (opens the existing project picker). Shown automatically right after boot for any Manager/Team member who isn't landing on Overview; Designers never see it, since they have no per-project work at all.

**Edit/Delete for every field, not just Designer-added ones.** This is the significant one. Until now, a Designer's Edit/Delete controls only applied to fields *they* had added — a vendor's original, hardcoded fields (Business name, Phone number, and so on) had no such controls at all. Renaming or hiding one of those required an actual code change. Now every one of them gets the same inline Edit (rename) and Delete (hide) icon pair, without a single line of `index.html` markup being hand-edited to add them:

- `public/app.js`'s new `ensureHardcodedFieldControls(sectionKey, overrides)` runs in Designer mode alongside the existing custom-field rendering. It walks every `.f` field block already on screen in the current section (skipping table-based fields like Navigation Links or API endpoint rows — same "not a good single-field target" reasoning `server/fieldSlots.js` already documents for those — and skipping Designer-added fields, which keep their own chip controls), and injects a small Edit/Delete/Restore icon group next to each one's label. Because this is pure DOM manipulation keyed off each input's existing `id`, it automatically covers all ~150 hardcoded fields across all 6 vendor sections with no per-field markup changes anywhere.
- A brand-new `server/fieldOverrides.js` module stores what a Designer changes: `{ label }` to rename, `{ hidden: true }` to hide. Same draft/published, per-section-publish shape as `server/customFields.js` — two JSON files, and a section's existing single Publish button now covers both Designer-added fields *and* renamed/hidden hardcoded ones in the same request (`server/routes/customFields.js`'s `/status/:sectionKey` and `/publish/:sectionKey` now consult and publish both modules). There is still exactly one Publish action per vendor.
- Exactly the same column-safety guarantee as custom fields: a hardcoded field's Smartsheet column is keyed off its stable field id (e.g. `biz_name`), never its label, so renaming it never orphans data. "Delete" only ever sets `hidden: true` — the field's real HTML input, its entry in `server/sectionSchemas.js`, and its Smartsheet column are all completely untouched; a Designer can Restore it at any time, even before publishing.
- Once published, the same overrides apply on every *real* form — `applyFieldOverrides()` in `public/app.js` for the manager dashboard, and an equivalent copy in `public/customer.js` for the public share-link page (the override data now rides along in the existing `GET /api/customer/:token` response as `fieldOverrides`). Hiding a field just sets its wrapper's `display:none`; the existing required-field check in both files already skips anything with no visible layout box, so a hidden required field is automatically excluded from validation with zero extra code.
- New routes, all under the existing `/api/custom-fields` router: `GET /overrides/section/:sectionKey` (public, published-only — read by both real forms), `GET /overrides/section/:sectionKey/draft` and `PUT /overrides/:sectionKey/:fieldId` (Designer-only, 403 for anyone else).

Verification for this pass: `node --check` on every touched file; grepped for leftover references to the old sequential visibility passes (none); booted the server and drove the full new surface end-to-end over HTTP — confirmed `/auth/me` still reports every feature flag `false` by default, `GET /api/projects/portfolio` returns 200 for a manager and 403 for a designer, a hardcoded field renamed and another hidden as a Designer (both `pending:true`, both absent from the public overrides endpoint pre-publish), a manager blocked with 403 attempting the same write, publish making both live on the public endpoint while a different vendor (CIS Integration) stayed at `{}` (per-vendor isolation holds for overrides exactly as it already did for custom fields), then confirmed restoring a hidden field and renaming one back to its original wording both correctly clear that field's override entirely rather than leaving a no-op entry behind.

## 20. Create-flow hosting picker, share-link title styling, vendor-side usage notes, a CIS layout fix, autofill cleanup, and a Share Links label/icon fix

**The "Create New Project" step of the sign-in gate now asks for the project name and hosting type in one place.** Previously, choosing "Create New Project" from `#project-gate-modal` jumped straight into the main form, and hosting type (SB Hosted / Client Hosted) was only asked afterward through the separate hosting-type gate. Now that same modal grows a second screen (`#pg-create-form`, swapped in by `gateCreateProject()`): a project name field and a `SB Hosted` / `Client Hosted` dropdown (`#pg-hosting-type`), with Back and Create Project buttons. `gateSubmitCreate()` in `public/app.js` reads both fields and calls the existing `createProject(confirmed, presetHostingType)` — extended with a `presetHostingType` param that, when set, posts to `POST /api/projects/:name/hosting` *before* `loadIntoForm()` runs, so the standalone hosting-type gate never flashes on screen for a project created this way (hosting is already on record by the time the form loads and checks for it).

**Vendor share-link page title: brand name small, project name is now the headline.** `customer.html`'s header used to read as one line, "Switchboard Implementation" then the project name, both the same size. It's now a small uppercase eyebrow (`.cx-eyebrow`, "Switchboard Implementation") sitting above a large, bold `<h2 id="cx-title">` that `customer.js` fills with just the project name — so the project name is unambiguously the main heading a vendor sees when they open their link.

**Usage-context notes added under the header of every vendor-side section in `customer.js`**, explaining what the section's data will actually be used for once submitted (e.g. Contact details: "used in the portal to configure the header, footer, and email-related settings"; CIS Integration: used to connect the portal for account lookups and billing; Payment Vendor: used to configure how customers pay; SMTP: used for outgoing email delivery; Ansible: used for server access/installation; Smart Meter: used to connect the data provider). Rendered with the same `.card-note` styling already used elsewhere on the form, so no new CSS was needed.

**CIS Integration (vendor side): "Other Service Type Account" was rendering outside the Test Accounts card.** Fixed by moving that field's markup inside the Test Accounts card's closing `</div>` in `customer.js` (the manager-side `index.html` already had it correctly placed — only the public form had the bug).

**Removed browser autofill/autocomplete on fields where Chrome/Edge was suggesting saved values that don't belong there** — Payment Vendor contact name/email, SMTP server host/port/username/from-address/from-name, and Ansible DB usernames all got `autocomplete="off"`; the existing password-style fields (SMTP password, Ansible DB passwords, Payment webservice key) already use the more effective `autocomplete="new-password"` from an earlier round.

**Share Links: "Project information for PM" tile now reads "Project info (PM)" and has an icon, matching every other tile.** Two independent bugs, both now fixed:
- The label was defined in two separate places in `server/sectionSchemas.js` — a flat `SECTION_LABELS` lookup (edited first, but turned out to be unused/vestigial — nothing in the codebase actually reads it) and the real source, `SECTIONS.pm_info.label`, which `server/routes/projects.js`'s `sectionMetaList` (and therefore every share-link response) reads directly. Fixed by updating `SECTIONS.pm_info.label` itself.
- The missing icon was a positional-array-index bug in `genLinks()` in `public/app.js`: the old code indexed a 6-entry `SICONS` array by position, but the `links` array has 7 entries once `pm_info` is included, so its icon lookup fell off the end and rendered nothing. Replaced with a `SECTION_ICON_BY_KEY` map keyed by `sectionKey` (`pm_info` → `fa-user-tie`, matching its sidebar nav icon) so every tile's icon is looked up by name, not position.

Verification for this pass: `node --check` on every touched file; booted the server, created a test project, set its hosting type via the API, and confirmed it persisted; called `POST /api/projects/:name/share-links` and confirmed `pm_info` now returns label `"Project info (PM)"` (previously `"Project Information for PM"`); re-confirmed the Overview 403-for-non-manager regression from Section 19 still holds; grepped `public/customer.js` to confirm the eyebrow/title split, all six card-notes, the corrected CIS field placement, and every `autocomplete="off"`/`"new-password"` attribute are present as written above.
