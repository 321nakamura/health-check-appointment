/* Reservation Form Logic (static) */
const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

const STATE_KEY = "booking_state_v1";
const ADMIN_PARAM = new URL(location.href).searchParams.get("admin") === "1";

let state = {
  // Map: date -> { slots: [{start,end,capacity}], bookings: [] }
  data: {},
  version: 1
};

// Load from localStorage
function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1) state = parsed;
  } catch(e) {
    console.warn("Failed to load state:", e);
  }
}
function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch(e) {
    console.warn("Failed to save state:", e);
  }
}

async function loadSlots() {
  const res = await fetch("slots.json", {cache: "no-cache"});
  const arr = await res.json();
  // Normalize into state.data
  arr.forEach(entry => {
    const date = entry.date;
    const slots = entry.slots.map(s => ({
      start: s.start, end: s.end, capacity: Number(s.capacity || 0)
    }));
    if (!state.data[date]) {
      state.data[date] = { slots, bookings: [] };
    } else {
      // merge or override slots but keep bookings
      state.data[date].slots = slots;
      state.data[date].bookings = state.data[date].bookings || [];
    }
  });
  saveState();
}

// Helpers
function getRemain(date, slot) {
  const rec = state.data[date];
  if (!rec) return 0;
  const cap = rec.slots.find(s => s.start===slot.start && s.end===slot.end)?.capacity ?? 0;
  const used = rec.bookings.filter(b => b.date===date && b.start===slot.start && b.end===slot.end).length;
  return Math.max(0, cap - used);
}

function fmtHM(hm) { return hm; } // "HH:MM"
function fmtDateLabel(d) { return d; } // "YYYY/MM/DD"

function renderDates() {
  const sel = qs("#dateSelect");
  sel.innerHTML = "";
  const dates = Object.keys(state.data).sort();
  dates.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = fmtDateLabel(d);
    sel.appendChild(opt);
  });
  sel.addEventListener("change", renderSlots);
  if (dates.length) {
    sel.value = dates[0];
    renderSlots();
  }
}

let selectedSlot = null;
function renderSlots() {
  const date = qs("#dateSelect").value;
  const host = qs("#slotList");
  host.innerHTML = "";
  selectedSlot = null;
  updateSubmitEnabled();

  const rec = state.data[date];
  if (!rec) return;
  rec.slots.forEach(slot => {
    const remain = getRemain(date, slot);
    const div = document.createElement("label");
    div.className = "slot";
    const id = `slot_${date}_${slot.start}_${slot.end}`.replace(/[^\w]+/g,"_");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "slot";
    radio.id = id;
    radio.disabled = remain <= 0;
    radio.addEventListener("change", () => {
      selectedSlot = {date, ...slot};
      updateSubmitEnabled();
    });

    const times = document.createElement("div");
    times.className = "times";
    times.textContent = `${fmtHM(slot.start)} ～ ${fmtHM(slot.end)}`;

    const cap = document.createElement("div");
    cap.className = "cap";
    cap.textContent = `定員 ${slot.capacity} 名`;

    const rem = document.createElement("div");
    rem.className = "remain " + (remain===0 ? "zero" : remain<=2 ? "low" : "ok");
    rem.textContent = `残り ${remain} 名`;

    div.appendChild(radio);
    div.appendChild(times);
    div.appendChild(cap);
    div.appendChild(rem);
    host.appendChild(div);
  });
}

function updateSubmitEnabled() {
  const name = qs("#name").value.trim();
  const phone = qs("#phone").value.trim();
  const email = qs("#email").value.trim();
  const consent = qs("#consent").checked;
  const ok = !!(selectedSlot && name && phone && email && consent);
  qs("#submitBtn").disabled = !ok;
}

function showMsg(text, kind="success") {
  const el = qs("#formMsg");
  el.textContent = text;
  el.className = "msg " + (kind==="error" ? "error" : "success");
}

function onFormChange() { updateSubmitEnabled(); }

function alreadyBooked(rec, slot, phone, email) {
  return rec.bookings.some(b => b.start===slot.start && b.end===slot.end && (b.phone===phone || b.email===email));
}

function submitBooking(e) {
  e.preventDefault();
  if (!selectedSlot) { showMsg("時間枠を選択してください。", "error"); return; }
  const rec = state.data[selectedSlot.date];
  if (!rec) return;

  // capacity check
  if (getRemain(selectedSlot.date, selectedSlot) <= 0) {
    showMsg("選択した時間枠は満席です。別の枠をお選びください。", "error");
    renderSlots();
    return;
  }

  const name = qs("#name").value.trim();
  const phone = qs("#phone").value.trim();
  const email = qs("#email").value.trim();
  const note = qs("#note").value.trim();

  if (alreadyBooked(rec, selectedSlot, phone, email)) {
    showMsg("同一の連絡先で同じ時間枠の予約が既にあります。", "error");
    return;
  }

  rec.bookings.push({
    date: selectedSlot.date,
    start: selectedSlot.start,
    end: selectedSlot.end,
    name, phone, email, note,
    ts: new Date().toISOString()
  });
  saveState();
  renderSlots();
  showMsg("予約を受け付けました。ありがとうございます。");
  qs("#bookingForm").reset();
  selectedSlot = null;
  updateSubmitEnabled();
}

function cancelSelection() {
  selectedSlot = null;
  qsa('input[name="slot"]').forEach(r => r.checked = false);
  updateSubmitEnabled();
  showMsg("");
}

// Admin
function isAdmin() {
  return ADMIN_PARAM;
}
function setupAdmin() {
  const panel = qs("#adminPanel");
  if (!isAdmin()) { panel.hidden = true; return; }
  panel.hidden = false;
  qs("#exportCsvBtn").addEventListener("click", exportCsv);
  qs("#resetDataBtn").addEventListener("click", resetAll);
}
function exportCsv() {
  const rows = [["date","start","end","name","phone","email","note","timestamp"]];
  Object.entries(state.data).forEach(([date, rec]) => {
    rec.bookings.forEach(b => {
      rows.push([b.date,b.start,b.end,b.name,b.phone,b.email,b.note?.replace(/\n/g," "),b.ts]);
    });
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type: "text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bookings_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function resetAll() {
  if (!confirm("全予約データを削除します。よろしいですか？")) return;
  Object.keys(state.data).forEach(d => state.data[d].bookings = []);
  saveState();
  renderSlots();
  showMsg("全予約データを初期化しました。");
}

// Wire up
function init() {
  loadState();
  loadSlots().then(() => {
    renderDates();
    setupAdmin();
  });

  qs("#bookingForm").addEventListener("submit", submitBooking);
  ["name","phone","email","consent","note"].forEach(id => {
    qs("#"+id).addEventListener("input", onFormChange);
    qs("#"+id).addEventListener("change", onFormChange);
  });
  qs("#cancelBtn").addEventListener("click", cancelSelection);
}

document.addEventListener("DOMContentLoaded", init);
