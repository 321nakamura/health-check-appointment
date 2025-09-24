/* Reservation Form Logic — v2.1e: fixed date, improved slot load diagnostics */
const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

const STATE_KEY = "booking_state_v2_1e";
const ADMIN_PARAM = new URL(location.href).searchParams.get("admin") === "1";

let state = { data: {}, version: 214 };

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 214) state = parsed;
  } catch(e) { console.warn(e); }
}
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch(e) { console.warn(e); }
}

async function loadSlots() {
  let res;
  try {
    res = await fetch("slots.json", {cache: "no-cache"});
  } catch(err) {
    console.error("fetch slots.json failed:", err);
    showSlotError("時間枠データ(slots.json)の取得に失敗しました。ファイルの置き場所と名前をご確認ください。");
    return;
  }
  if (!res.ok) {
    console.error("failed to load slots.json", res.status);
    showSlotError(`時間枠データ(slots.json)を読み込めませんでした（HTTP ${res.status}）。`);
    return;
  }
  let arr;
  try {
    arr = await res.json();
  } catch(err) {
    console.error("parse slots.json failed:", err);
    showSlotError("時間枠データ(slots.json)の形式に誤りがあります（JSONパースエラー）。");
    return;
  }
  const filtered = arr.filter(entry => entry.date === "2025-10-24");
  if (!filtered.length) {
    console.warn("no entries for 2025-10-24 in slots.json");
    showSlotError("指定日(2025-10-24)の時間枠が見つかりません。slots.json をご確認ください。");
    return;
  }
  filtered.forEach(entry => {
    const date = entry.date;
    const slots = entry.slots.map(s => ({ start: s.start, end: s.end, capacity: Number(s.capacity||0) }));
    if (!state.data[date]) state.data[date] = { slots, bookings: [] };
    else { state.data[date].slots = slots; state.data[date].bookings = state.data[date].bookings || []; }
  });
  hideSlotError();
  saveState();
}

function showSlotError(msg) {
  const el = qs("#slotError");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}
function hideSlotError() {
  const el = qs("#slotError");
  if (!el) return;
  el.textContent = "";
  el.style.display = "none";
}

function getRemain(date, slot) {
  const rec = state.data[date]; if (!rec) return 0;
  const cap = rec.slots.find(s => s.start===slot.start && s.end===slot.end)?.capacity ?? 0;
  const used = rec.bookings.filter(b => b.date===date && b.start===slot.start && b.end===slot.end).length;
  return Math.max(0, cap - used);
}

function renderDates() {
  renderSlots(); // fixed date
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

function val(sel) { return (qs(sel)?.value || "").trim(); }

function updateSubmitEnabled() {
  const employeeId = val("#employeeId");
  const department = val("#department");
  const name = val("#name");
  const ok = !!(selectedSlot && employeeId && department && name);
  qs("#submitBtn").disabled = !ok;
}

function showMsg(text, kind="success") {
  const el = qs("#formMsg"); el.textContent = text;
  el.className = "msg " + (kind==="error" ? "error" : "success");
}

function onFormChange() { updateSubmitEnabled(); }

function alreadyBooked(rec, slot, employeeId) {
  return rec.bookings.some(b => b.start===slot.start && b.end===slot.end && b.employeeId===employeeId);
}

function submitBooking(e) {
  e.preventDefault();
  if (!selectedSlot) { showMsg("時間枠を選択してください。", "error"); return; }
  const rec = state.data[selectedSlot.date]; if (!rec) return;

  const employeeId = val("#employeeId");
  const department = val("#department");
  const name = val("#name");
  const note = val("#note");

  if (!employeeId) { showMsg("社員番号は必須です。", "error"); return; }
  if (!department) { showMsg("部署を選択してください。", "error"); return; }
  if (!name) { showMsg("お名前は必須です。", "error"); return; }

  if (getRemain(selectedSlot.date, selectedSlot) <= 0) {
    showMsg("選択した時間枠は満席です。別の枠をお選びください。", "error"); renderSlots(); return;
  }

  if (alreadyBooked(rec, selectedSlot, employeeId)) {
    showMsg("同一の社員番号で同じ時間枠の予約が既にあります。", "error"); return;
  }

  rec.bookings.push({
    date: selectedSlot.date, start: selectedSlot.start, end: selectedSlot.end,
    employeeId, department, name, note, ts: new Date().toISOString()
  });
  saveState(); renderSlots();
  showMsg("予約を受け付けました。ありがとうございます。");
  qs("#bookingForm").reset(); selectedSlot = null; updateSubmitEnabled();
}

function cancelSelection() {
  selectedSlot = null; qsa('input[name="slot"]').forEach(r => r.checked = false);
  updateSubmitEnabled(); showMsg("");
}

function init() {
  loadState();
  loadSlots().then(() => { renderDates(); });
  qs("#bookingForm").addEventListener("submit", submitBooking);
  ["employeeId","department","name","note"].forEach(id => {
    const el = qs("#"+id); if (el) { el.addEventListener("input", onFormChange); el.addEventListener("change", onFormChange); }
  });
  const cancelBtn = qs("#cancelBtn"); if (cancelBtn) cancelBtn.addEventListener("click", cancelSelection);
}
document.addEventListener("DOMContentLoaded", init);
