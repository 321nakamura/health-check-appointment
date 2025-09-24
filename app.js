/* Reservation Form Logic — v4.1 patch: normalize digits & trim spaces */
const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

const STATE_KEY = "booking_state_v4_1";
const ADMIN_PARAM = new URL(location.href).searchParams.get("admin") === "1";

let state = { data: {}, version: 41 };

// 全角数字→半角数字、全角スペース→半角、空白除去のユーティリティ
function normalizeDigits(str) {
  if (!str) return "";
  // 全角→半角
  const z2h = str.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // 全角スペース→半角、前後空白削除
  return z2h.replace(/\u3000/g, " ").trim();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 41) state = parsed;
  } catch(e) { console.warn(e); }
}
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch(e) { console.warn(e); }
}

async function loadSlots() {
  const res = await fetch("slots.json", {cache: "no-cache"});
  const arr = await res.json();
  arr.forEach(entry => {
    const date = entry.date;
    const slots = entry.slots.map(s => ({ start: s.start, end: s.end, capacity: Number(s.capacity||0) }));
    if (!state.data[date]) state.data[date] = { slots, bookings: [] };
    else { state.data[date].slots = slots; state.data[date].bookings = state.data[date].bookings || []; }
  });
  saveState();
}

function getRemain(date, slot) {
  const rec = state.data[date]; if (!rec) return 0;
  const cap = rec.slots.find(s => s.start===slot.start && s.end===slot.end)?.capacity ?? 0;
  const used = rec.bookings.filter(b => b.date===date && b.start===slot.start && b.end===slot.end).length;
  return Math.max(0, cap - used);
}

function renderDates() {
  const sel = qs("#dateSelect"); sel.innerHTML = "";
  const dates = Object.keys(state.data).sort();
  dates.forEach(d => { const op = document.createElement("option"); op.value=d; op.textContent=d; sel.appendChild(op); });
  sel.addEventListener("change", renderSlots);
  if (dates.length) { sel.value = dates[0]; renderSlots(); }
}

let selectedSlot = null;
function renderSlots() {
  const date = qs("#dateSelect").value;
  const host = qs("#slotList"); host.innerHTML = "";
  selectedSlot = null; updateSubmitEnabled();
  const rec = state.data[date]; if (!rec) return;
  rec.slots.forEach(slot => {
    const remain = getRemain(date, slot);
    const label = document.createElement("label"); label.className="slot";
    const id = `slot_${date}_${slot.start}_${slot.end}`.replace(/[^\w]+/g,"_");
    const radio = document.createElement("input"); radio.type="radio"; radio.name="slot"; radio.id=id;
    radio.disabled = remain<=0;
    radio.addEventListener("change", ()=>{ selectedSlot={date,...slot}; updateSubmitEnabled(); });
    const times = document.createElement("div"); times.className="times"; times.textContent=`${slot.start} ～ ${slot.end}`;
    const cap = document.createElement("div"); cap.className="cap"; cap.textContent=`定員 ${slot.capacity} 名`;
    const rem = document.createElement("div"); rem.className="remain " + (remain===0?"zero": remain<=2?"low":"ok"); rem.textContent=`残り ${remain} 名`;
    label.appendChild(radio); label.appendChild(times); label.appendChild(cap); label.appendChild(rem);
    host.appendChild(label);
  });
}

function currentEmployeeId() {
  const raw = qs("#employeeId")?.value || "";
  return normalizeDigits(raw).replace(/\s+/g, ""); // 空白除去
}

function updateSubmitEnabled() {
  const id = currentEmployeeId();
  const dep = (qs("#department")?.value || "").trim();
  const name = (qs("#name")?.value || "").trim();
  const idDigitsOnly = /^\d+$/.test(id);
  const depSelected = !!dep && dep !== "";
  const ok = !!(selectedSlot && idDigitsOnly && depSelected && name);
  qs("#submitBtn").disabled = !ok;
}

function showMsg(text, kind="success") {
  const el = qs("#formMsg"); el.textContent = text;
  el.className = "msg " + (kind==="error" ? "error" : "success");
}

function onFormChange(e) {
  // 入力中も社員番号を正規化して見た目に反映
  if (e && e.target && e.target.id === "employeeId") {
    const caret = e.target.selectionStart;
    e.target.value = currentEmployeeId();
    // キャレット位置は単純化のため末尾へ
    e.target.selectionStart = e.target.selectionEnd = e.target.value.length;
  }
  updateSubmitEnabled();
}

function alreadyBooked(rec, slot, employeeId) {
  return rec.bookings.some(b => b.start===slot.start && b.end===slot.end && b.employeeId===employeeId);
}

function submitBooking(e) {
  e.preventDefault();
  if (!selectedSlot) { showMsg("時間枠を選択してください。", "error"); return; }
  const rec = state.data[selectedSlot.date]; if (!rec) return;

  const employeeId = currentEmployeeId();
  if (!/^\d+$/.test(employeeId)) { showMsg("社員番号は数字のみで入力してください。", "error"); return; }

  if (getRemain(selectedSlot.date, selectedSlot) <= 0) {
    showMsg("選択した時間枠は満席です。別の枠をお選びください。", "error"); renderSlots(); return;
  }

  const depSelect = qs("#department");
  const departmentCode = depSelect.value;
  const departmentName = depSelect.options[depSelect.selectedIndex]?.text || "";
  const name = qs("#name").value.trim();
  const note = qs("#note").value.trim();

  if (alreadyBooked(rec, selectedSlot, employeeId)) {
    showMsg("同一の社員番号で同じ時間枠の予約が既にあります。", "error"); return;
  }

  rec.bookings.push({
    date: selectedSlot.date, start: selectedSlot.start, end: selectedSlot.end,
    employeeId, departmentCode, departmentName, name, note, ts: new Date().toISOString()
  });
  saveState(); renderSlots();
  showMsg("予約を受け付けました。ありがとうございます。");
  qs("#bookingForm").reset(); selectedSlot = null; updateSubmitEnabled();
}

function cancelSelection() {
  selectedSlot = null; qsa('input[name="slot"]').forEach(r => r.checked = false);
  updateSubmitEnabled(); showMsg("");
}

// Admin
function isAdmin() { return ADMIN_PARAM; }
function setupAdmin() {
  const panel = qs("#adminPanel");
  if (!isAdmin()) { panel.hidden = true; return; }
  panel.hidden = false;
  qs("#exportCsvBtn").addEventListener("click", exportCsv);
  qs("#resetDataBtn").addEventListener("click", resetAll);
}
function exportCsv() {
  const rows = [["date","start","end","employee_id","department_code","department_name","name","note","timestamp"]];
  Object.entries(state.data).forEach(([date, rec]) => {
    rec.bookings.forEach(b => rows.push([
      b.date,b.start,b.end,b.employeeId,b.departmentCode,b.departmentName,b.name,(b.note||" ").replace(/\\n/g," "),b.ts
    ]));
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\\n");
  const blob = new Blob([csv], {type: "text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `bookings_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function resetAll() {
  if (!confirm("全予約データを削除します。よろしいですか？")) return;
  Object.keys(state.data).forEach(d => state.data[d].bookings = [];
  );
  saveState(); renderSlots(); showMsg("全予約データを初期化しました。");
}

function init() {
  loadState();
  loadSlots().then(() => { renderDates(); setupAdmin(); });
  qs("#bookingForm").addEventListener("submit", submitBooking);
  ["employeeId","department","name","note"].forEach(id => {
    const el = qs("#"+id); if (el) { el.addEventListener("input", onFormChange); el.addEventListener("change", onFormChange); }
  });
  qs("#cancelBtn").addEventListener("click", cancelSelection);
}
document.addEventListener("DOMContentLoaded", init);
