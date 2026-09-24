/*************************************************************
 * LINKEDAI STORE SERVER (Google Apps Script)
 * Paste this whole file into: your Google Sheet > Extensions > Apps Script
 * Then: Deploy > New deployment > Web app
 *       Execute as: Me    Who has access: Anyone
 *************************************************************/

// 1) CHANGE THIS to your own long secret (12+ characters). You type it on yoursite/?admin
const ADMIN_KEY = "change-this-secret";

const SHEET_NAME = "stores";
const PHOTO_FOLDER = "Linkedai photos";
const RECEIPT_FOLDER = "Linkedai receipts";
const MAX_DATA = 45000;          // characters of store details per shop
const MAX_PHOTO = 1500000;       // characters of one photo (about 1 MB)
const MAX_TRIES = 8;             // wrong PINs before a 15 minute lock
const LOCK_MS = 15 * 60 * 1000;
const RESERVED = ["build", "edit", "admin", "api", "www", "help", "linkedai", "store", "stores"];
const ID_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

// Columns in the "stores" sheet
const C = { id: 0, status: 1, salt: 2, hash: 3, fails: 4, lockUntil: 5, created: 6, updated: 7, name: 8, data: 9, wa: 10, paidAt: 11, receipt: 12, checked: 13 };
// status: "pending" (not paid yet), "live", "offline" (taken offline by you: can't publish itself again)

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(["id", "status", "salt", "hash", "fails", "lockUntil", "created", "updated", "name", "data", "wa", "paidAt", "receipt", "checked"]);
  }
  return sh;
}

function find_(id) {
  const sh = sheet_();
  const vals = sh.getDataRange().getValues();
  for (let r = 1; r < vals.length; r++) {
    if (String(vals[r][C.id]) === id) return { sh: sh, row: r + 1, v: vals[r] };
  }
  return { sh: sh, row: 0, v: null };
}

// Save a photo to a Drive folder. Store photos are public; receipts stay private to you.
function savePhoto_(id, b64, type, folderName, isPublic) {
  b64 = String(b64 || ""); type = String(type || "image/jpeg");
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return { error: "Use a JPG, PNG or WebP photo." };
  if (!b64 || b64.length > MAX_PHOTO) return { error: "That photo is too large." };
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), type, id + "-" + Date.now() + "." + type.split("/")[1]);
  const file = folder.createFile(blob);
  if (isPublic) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200", view: "https://drive.google.com/file/d/" + file.getId() + "/view" };
}

// WhatsApp numbers: digits only, 012... becomes 6012...
function normWa_(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.charAt(0) === "0") d = "6" + d;
  return d;
}
function findWa_(wa) {
  const sh = sheet_();
  const vals = sh.getDataRange().getValues();
  for (let r = 1; r < vals.length; r++) {
    if (wa && normWa_(vals[r][C.wa]) === wa) return { sh: sh, row: r + 1, v: vals[r] };
  }
  return { sh: sh, row: 0, v: null };
}

function hex_(bytes) {
  return bytes.map(function (b) { return ((b < 0 ? b + 256 : b).toString(16)).padStart(2, "0"); }).join("");
}
function hashPin_(pin, salt) {
  let h = salt + ":" + pin;
  for (let i = 0; i < 300; i++) h = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + ":" + salt));
  return h;
}
function newSalt_() { return Utilities.getUuid().replace(/-/g, ""); }

// Stop the sheet treating text like "=..." as a formula
function safe_(v) { return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v; }
function setCell_(f, col, value) { f.sh.getRange(f.row, col + 1).setValue(safe_(value)); f.v[col] = value; }

function verify_(f, pin) {
  if (!f.v) return "Wrong WhatsApp number or PIN.";
  const now = Date.now();
  if (Number(f.v[C.lockUntil]) > now) return "Too many wrong PINs. Try again in 15 minutes.";
  if (!/^\d{6}$/.test(String(pin || "")) || hashPin_(String(pin), String(f.v[C.salt])) !== String(f.v[C.hash])) {
    let fails = Number(f.v[C.fails]) + 1;
    if (fails >= MAX_TRIES) { setCell_(f, C.lockUntil, now + LOCK_MS); fails = 0; }
    setCell_(f, C.fails, fails);
    return "Wrong WhatsApp number or PIN.";
  }
  if (Number(f.v[C.fails]) || Number(f.v[C.lockUntil])) { setCell_(f, C.fails, 0); setCell_(f, C.lockUntil, 0); }
  return "";
}

function cleanData_(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "Store details are missing." };
  const text = JSON.stringify(data);
  if (text.length > MAX_DATA) return { error: "Your store is too big to save. Remove some items or shorten descriptions." };
  return { text: text, name: String(data.name || "").slice(0, 80) };
}

/* ---------- Reading (customers) ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    const id = String(p.id || "").toLowerCase();
    if (p.action === "shop") {
      const f = find_(id);
      if (!f.v) return out_({ error: "notfound" });
      if (String(f.v[C.status]) !== "live") return out_({ error: "notlive" });
      return out_({ data: JSON.parse(String(f.v[C.data]) || "{}") });
    }
    if (p.action === "check") {
      if (!ID_RE.test(id) || RESERVED.indexOf(id) >= 0) return out_({ available: false, reason: "Use 3 to 40 letters, numbers or dashes." });
      return out_({ available: !find_(id).v, reason: find_(id).v ? "That name is taken." : "" });
    }
    return out_({ ok: true, app: "linkedai" });
  } catch (err) {
    return out_({ error: "server" });
  }
}

/* ---------- Writing (sellers and you) ---------- */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ error: "Bad request." }); }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return out_(handle_(body || {}));
  } catch (err) {
    return out_({ error: "Server busy or error. Try again in a moment." });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function handle_(b) {
  const action = String(b.action || "");

  // ----- You (admin) -----
  if (action === "admin") {
    if (ADMIN_KEY === "change-this-secret" || ADMIN_KEY.length < 12) return { error: "Change ADMIN_KEY in the script to your own secret (12+ characters), then deploy a new version." };
    if (String(b.key || "") !== ADMIN_KEY) return { error: "Wrong admin key." };
    const sh = sheet_();
    if (b.op === "list") {
      const vals = sh.getDataRange().getValues();
      const list = [];
      for (let r = 1; r < vals.length; r++) {
        list.push({ id: vals[r][C.id], name: vals[r][C.name], wa: normWa_(vals[r][C.wa]), status: vals[r][C.status], created: Number(vals[r][C.created]), updated: Number(vals[r][C.updated]),
          paidAt: Number(vals[r][C.paidAt]) || 0, receipt: String(vals[r][C.receipt] || ""), checked: String(vals[r][C.checked]) === "yes" });
      }
      list.sort(function (a, c) { return c.created - a.created; });
      return { stores: list };
    }
    const f = find_(String(b.id || ""));
    if (!f.v) return { error: "Store not found." };
    if (b.op === "approve") { setCell_(f, C.status, "live"); setCell_(f, C.checked, "yes"); return { ok: true }; }
    if (b.op === "verify") { setCell_(f, C.checked, "yes"); return { ok: true }; }
    if (b.op === "unpublish") { setCell_(f, C.status, "offline"); return { ok: true }; }
    if (b.op === "resetpin") {
      const pin = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
      const salt = newSalt_();
      setCell_(f, C.salt, salt); setCell_(f, C.hash, hashPin_(pin, salt)); setCell_(f, C.fails, 0); setCell_(f, C.lockUntil, 0);
      return { ok: true, newPin: pin };
    }
    return { error: "Unknown action." };
  }

  // ----- Sellers -----
  if (action === "login" && b.wa) {
    const fw = findWa_(normWa_(b.wa));
    const badWa = verify_(fw, b.pin);
    if (badWa) return { error: badWa };
    return { id: String(fw.v[C.id]), data: JSON.parse(String(fw.v[C.data]) || "{}"), status: String(fw.v[C.status]) };
  }
  const id = String(b.id || "").toLowerCase();
  if (!ID_RE.test(id) || RESERVED.indexOf(id) >= 0) return { error: "Use 3 to 40 letters, numbers or dashes for your link name." };
  const f = find_(id);

  if (action === "create") {
    if (!/^\d{6}$/.test(String(b.pin || ""))) return { error: "Your PIN must be exactly 6 digits." };
    if (f.v) return { error: "That link name is taken. Try another." };
    const d = cleanData_(b.data);
    if (d.error) return d;
    const wa = normWa_(b.data.wa);
    if (wa.length < 9) return { error: "Add your WhatsApp number. You'll use it to log in." };
    if (findWa_(wa).v) return { error: "This WhatsApp number already has a store. Log in with it instead." };
    const now = Date.now(), salt = newSalt_();
    f.sh.appendRow([id, "pending", salt, hashPin_(String(b.pin), salt), 0, 0, now, now, safe_(d.name), d.text, "'" + wa]);
    return { ok: true, status: "pending" };
  }

  const bad = verify_(f, b.pin);
  if (bad) return { error: bad };

  if (action === "login") return { id: id, data: JSON.parse(String(f.v[C.data]) || "{}"), status: String(f.v[C.status]) };

  if (action === "save") {
    const d = cleanData_(b.data);
    if (d.error) return d;
    const wa = normWa_(b.data.wa);
    if (wa.length < 9) return { error: "Add your WhatsApp number. You'll use it to log in." };
    const other = findWa_(wa);
    if (other.v && other.row !== f.row) return { error: "That WhatsApp number is already used by another store." };
    setCell_(f, C.data, d.text); setCell_(f, C.name, d.name); setCell_(f, C.updated, Date.now()); setCell_(f, C.wa, "'" + wa);
    return { ok: true, status: String(f.v[C.status]) };
  }

  if (action === "upload") return savePhoto_(id, b.photo, b.type, PHOTO_FOLDER, true);

  if (action === "selfpublish") {
    const status = String(f.v[C.status]);
    if (status === "live") return { ok: true, status: "live" };
    if (status === "offline") return { error: "Your store was taken offline. Please message us on WhatsApp." };
    const saved = savePhoto_(id, b.photo, b.type, RECEIPT_FOLDER, false);
    if (saved.error) return { error: saved.error === "That photo is too large." ? "That receipt photo is too large." : saved.error };
    setCell_(f, C.receipt, saved.view); setCell_(f, C.paidAt, Date.now()); setCell_(f, C.checked, "no"); setCell_(f, C.status, "live");
    return { ok: true, status: "live" };
  }

  return { error: "Unknown action." };
}
