import { useState, useEffect, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip } from "recharts";

// ─── INJECT GLOBAL STYLES ───────────────────────────────────────────────────
const styleTag = document.createElement("style");
styleTag.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Roboto', Arial, sans-serif; font-weight: 300; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #f1f1f1; }
  ::-webkit-scrollbar-thumb { background: #D9D8D6; border-radius: 3px; }
  input[type="time"]::-webkit-calendar-picker-indicator,
  input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
  .event-block:hover { filter: brightness(0.93); }
  .grid-btn:hover { background: rgba(30,56,96,0.06) !important; }
  .nav-btn:hover { background: #f0f0f0 !important; }
  .ghost-btn:hover { background: rgba(30,56,96,0.06) !important; }
  .gold-btn:hover { background: #e8962f !important; }
  .cat-row:hover { background: #f8f9fc !important; }
`;
if (!document.head.querySelector("[data-axos-style]")) {
  styleTag.setAttribute("data-axos-style", "1");
  document.head.appendChild(styleTag);
}

// ─── BRAND TOKENS ────────────────────────────────────────────────────────────
const B = {
  navy:        "#1E3860",
  gold:        "#FAA74A",
  white:       "#FFFFFF",
  lightGrey:   "#D9D8D6",
  lightBlue:   "#DEF4FF",
  skyBlue:     "#87B9D7",
  slate:       "#333D46",
  burntOrange: "#D95F27",
  teal:        "#158994",
};

const PICKER_COLORS = [
  "#87B9D7","#158994","#1E3860","#FAA74A","#D95F27",
  "#97013A","#D9D8D6","#333D46","#6B9E78","#8B5CF6","#EC4899","#F59E0B",
];

const DEFAULT_CATEGORIES = [
  { id: "meetings",    name: "Meetings",    color: "#87B9D7" },
  { id: "research",    name: "Research",    color: "#158994" },
  { id: "development", name: "Development", color: "#1E3860" },
  { id: "admin",       name: "Admin",       color: "#FAA74A" },
  { id: "learning",    name: "Learning",    color: "#D95F27" },
  { id: "other",       name: "Other",       color: "#D9D8D6" },
];

const GRID_START  = 8 * 60;   // 8 AM in minutes
const GRID_HEIGHT = 840;       // 8AM–10PM = 14h = 840 min = 840px

// ─── DRAG CONSTANTS ──────────────────────────────────────────────────────────
const GRID_START_MINS = 8 * 60;
const GRID_END_MINS   = 22 * 60;
const SNAP = 15;

function snapMinutes(mins) {
  return Math.round(mins / SNAP) * SNAP;
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────
const LA_TZ = 'America/Los_Angeles';
const LA_DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: LA_TZ });
const LA_TIME_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: LA_TZ, hour: '2-digit', minute: '2-digit', hour12: false });

function getMondayOfWeek(date) {
  // Normalise to LA date so getDay() reflects the correct weekday in Pacific time
  const laStr = LA_DATE_FMT.format(date);
  const d = new Date(laStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function formatDate(date) { return LA_DATE_FMT.format(date); }
function parseTime(str) { const [h, m] = str.split(":").map(Number); return h * 60 + m; }
function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function formatTimeDisplay(str) {
  const mins = parseTime(str);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function minutesToDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
function getTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1E3860" : "#FFFFFF";
}

// ─── MINI CALENDAR ───────────────────────────────────────────────────────────
function MiniCalendar({ miniMonth, setMiniMonth, weekDates, setCurrentWeekStart }) {
  const year  = miniMonth.getFullYear();
  const month = miniMonth.getMonth();
  const monthLabel = miniMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // First Monday on or before the 1st of the month
  const firstOfMonth  = new Date(year, month, 1);
  const startCell     = getMondayOfWeek(firstOfMonth);

  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startCell);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const todayStr  = formatDate(new Date());
  const viewedSet = new Set(weekDates);

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          className="nav-btn"
          onClick={() => setMiniMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4, color: B.navy, fontSize: 14 }}
        >‹</button>
        <span style={{ fontSize: 12, fontWeight: 500, color: B.navy }}>{monthLabel}</span>
        <button
          className="nav-btn"
          onClick={() => setMiniMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4, color: B.navy, fontSize: 14 }}
        >›</button>
      </div>
      {/* Day headers M T W T F S S */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
        {["M","T","W","T","F","S","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, color: "#BBBBC0", fontWeight: 500, paddingBottom: 2 }}>{d}</div>
        ))}
      </div>
      {/* Day grid — show only rows that contain at least one current-month day */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1 }}>
        {days.map((d, i) => {
          const ds        = formatDate(d);
          const inMonth   = d.getMonth() === month;
          const isToday   = ds === todayStr;
          const inWeek    = viewedSet.has(ds);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;

          return (
            <button
              key={i}
              onClick={() => {
                setCurrentWeekStart(getMondayOfWeek(d));
                setMiniMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              }}
              style={{
                width: 28, height: 28,
                borderRadius: isToday ? "50%" : 3,
                border: "none",
                background: isToday
                  ? B.gold
                  : inWeek && !isWeekend
                    ? B.lightBlue
                    : "transparent",
                color: isToday
                  ? "#fff"
                  : inMonth
                    ? B.navy
                    : "#BBBBC0",
                fontWeight: isToday ? 700 : 400,
                fontSize: 11,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit",
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── PIE CHARTS PANEL ────────────────────────────────────────────────────────
const PIE_PERIODS = [
  { label: "TODAY",      key: "today"     },
  { label: "THIS WEEK",  key: "week"      },
  { label: "THIS MONTH", key: "month"     },
  { label: "ALL TIME",   key: "all"       },
];

function buildPieData(events, categories, period, todayStr, weekDates) {
  let filtered;
  if      (period === "today") filtered = events.filter(e => e.date === todayStr);
  else if (period === "week")  filtered = events.filter(e => weekDates.includes(e.date));
  else if (period === "month") filtered = events.filter(e => e.date.startsWith(todayStr.slice(0, 7)));
  else                         filtered = events;

  const map = {};
  filtered.forEach(e => { map[e.category] = (map[e.category] || 0) + e.durationMinutes; });
  return categories
    .map(c => ({ name: c.name, value: map[c.id] || 0, color: c.color }))
    .filter(d => d.value > 0);
}

function SmallPie({ label, data }) {
  const empty = data.length === 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: B.navy, letterSpacing: "0.8px", marginBottom: 2, textTransform: "uppercase" }}>{label}</div>
      {empty ? (
        <div style={{ position: "relative", width: 84, height: 84 }}>
          <svg width="84" height="84" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r="28" fill="none" stroke="#E8E8E8" strokeWidth="12" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#BBBBC0", fontWeight: 500 }}>No data</div>
        </div>
      ) : (
        <PieChart width={84} height={84}>
          <Pie data={data} cx={42} cy={42} innerRadius={18} outerRadius={36} dataKey="value" stroke="none">
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip
            formatter={(val, name) => [minutesToDuration(val), name]}
            contentStyle={{ fontSize: 11, fontFamily: "Roboto, Arial", border: `1px solid ${B.lightGrey}`, borderRadius: 4 }}
          />
        </PieChart>
      )}
    </div>
  );
}

// ─── EVENT MODAL ─────────────────────────────────────────────────────────────
function EventModal({ modal, categories, onSave, onDelete, onClose }) {
  const [draft, setDraft]       = useState(modal.draft);
  const [confirmDel, setConfirm] = useState(false);
  const isEdit = modal.mode === "edit";

  const set = (field, val) => setDraft(d => ({ ...d, [field]: val }));

  const startMins = parseTime(draft.startTime);
  const endMins   = parseTime(draft.endTime);
  const valid     = endMins > startMins;
  const duration  = valid ? endMins - startMins : 0;

  const handleSave = () => {
    if (!draft.title.trim() || !valid) return;
    const saved = { ...draft, durationMinutes: duration, updatedAt: new Date().toISOString() };
    onSave(saved, isEdit);
  };

  const inputStyle = {
    width: "100%", border: `1px solid ${B.lightGrey}`, borderRadius: 4,
    padding: "8px 12px", fontSize: 14, fontFamily: "inherit", outline: "none",
    color: B.slate, background: "#fff",
  };
  const labelStyle = { fontSize: 12, fontWeight: 500, color: B.navy, marginBottom: 4, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 28, width: 460, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 500, color: B.navy }}>{isEdit ? "Edit Event" : "New Event"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999", lineHeight: 1 }}>×</button>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Title *</label>
          <input
            style={inputStyle}
            value={draft.title}
            onChange={e => set("title", e.target.value)}
            placeholder="What were you working on?"
            onFocus={e => (e.target.style.borderColor = B.navy)}
            onBlur={e => (e.target.style.borderColor = B.lightGrey)}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            style={{ ...inputStyle, resize: "vertical", minHeight: 68 }}
            value={draft.description}
            onChange={e => set("description", e.target.value)}
            placeholder="Add details..."
            rows={3}
            onFocus={e => (e.target.style.borderColor = B.navy)}
            onBlur={e => (e.target.style.borderColor = B.lightGrey)}
          />
        </div>

        {/* Category */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Category</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: categories.find(c => c.id === draft.category)?.color || B.lightGrey, flexShrink: 0 }} />
            <select
              style={{ ...inputStyle, flex: 1 }}
              value={draft.category}
              onChange={e => set("category", e.target.value)}
              onFocus={e => (e.target.style.borderColor = B.navy)}
              onBlur={e => (e.target.style.borderColor = B.lightGrey)}
            >
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Date</label>
          <input
            type="date"
            style={inputStyle}
            value={draft.date}
            onChange={e => set("date", e.target.value)}
            onFocus={e => (e.target.style.borderColor = B.navy)}
            onBlur={e => (e.target.style.borderColor = B.lightGrey)}
          />
        </div>

        {/* Time row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
          <div>
            <label style={labelStyle}>Start Time</label>
            <input
              type="time"
              step="900"
              style={inputStyle}
              value={draft.startTime}
              onChange={e => set("startTime", e.target.value)}
              onFocus={e => (e.target.style.borderColor = B.navy)}
              onBlur={e => (e.target.style.borderColor = B.lightGrey)}
            />
          </div>
          <div>
            <label style={labelStyle}>End Time</label>
            <input
              type="time"
              step="900"
              style={inputStyle}
              value={draft.endTime}
              onChange={e => set("endTime", e.target.value)}
              onFocus={e => (e.target.style.borderColor = B.navy)}
              onBlur={e => (e.target.style.borderColor = B.lightGrey)}
            />
          </div>
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 20, fontSize: 12, color: valid ? "#777" : "#E53E3E", minHeight: 18 }}>
          {valid
            ? `Duration: ${minutesToDuration(duration)}`
            : "⚠ End time must be after start time"}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: isEdit ? "space-between" : "flex-end", alignItems: "center", gap: 8 }}>
          {isEdit && (
            confirmDel ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#E53E3E" }}>Sure?</span>
                <button onClick={() => setConfirm(false)} style={{ fontSize: 13, padding: "5px 10px", borderRadius: 4, border: `1px solid ${B.lightGrey}`, background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={() => onDelete(draft.id)} style={{ fontSize: 13, padding: "5px 10px", borderRadius: 4, border: "none", background: "#E53E3E", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Yes, delete</button>
              </div>
            ) : (
              <button onClick={() => setConfirm(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#E53E3E", fontSize: 14, fontFamily: "inherit" }}>Delete</button>
            )
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="ghost-btn"
              onClick={onClose}
              style={{ padding: "7px 18px", borderRadius: 4, border: `1px solid ${B.lightGrey}`, background: "#fff", cursor: "pointer", fontSize: 14, fontFamily: "inherit", color: B.slate }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={!draft.title.trim() || !valid}
              style={{ padding: "7px 18px", borderRadius: 4, border: "none", background: (!draft.title.trim() || !valid) ? "#aaa" : B.navy, color: "#fff", cursor: (!draft.title.trim() || !valid) ? "not-allowed" : "pointer", fontSize: 14, fontFamily: "inherit", fontWeight: 500 }}
            >Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CATEGORY MANAGEMENT MODAL ────────────────────────────────────────────────
function CatModal({ categories, setCategories, events, onClose }) {
  const [editingId, setEditingId]   = useState(null);
  const [editName, setEditName]     = useState("");
  const [editColor, setEditColor]   = useState("");
  const [adding, setAdding]         = useState(false);
  const [newName, setNewName]       = useState("");
  const [newColor, setNewColor]     = useState(PICKER_COLORS[0]);

  const usedIds = new Set(events.map(e => e.category));

  const startEdit = (cat) => { setEditingId(cat.id); setEditName(cat.name); setEditColor(cat.color); };
  const saveEdit  = (id) => {
    if (!editName.trim()) return;
    setCategories(cs => cs.map(c => c.id === id ? { ...c, name: editName.trim(), color: editColor } : c));
    setEditingId(null);
  };
  const deleteCAT = (id) => { setCategories(cs => cs.filter(c => c.id !== id)); };
  const moveUp    = (id) => setCategories(cs => {
    const i = cs.findIndex(c => c.id === id);
    if (i <= 0) return cs;
    const next = [...cs];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    return next;
  });
  const moveDown  = (id) => setCategories(cs => {
    const i = cs.findIndex(c => c.id === id);
    if (i < 0 || i >= cs.length - 1) return cs;
    const next = [...cs];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    return next;
  });
  const addCat    = () => {
    if (!newName.trim()) return;
    setCategories(cs => [...cs, { id: generateId(), name: newName.trim(), color: newColor }]);
    setNewName(""); setNewColor(PICKER_COLORS[0]); setAdding(false);
  };

  const inputStyle = { border: `1px solid ${B.lightGrey}`, borderRadius: 4, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", color: B.slate };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 28, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 500, color: B.navy }}>Manage Categories</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999", lineHeight: 1 }}>×</button>
        </div>

        {categories.map((cat, catIdx) => (
          <div key={cat.id} className="cat-row" style={{ padding: "8px 4px", borderRadius: 4, marginBottom: 4 }}>
            {editingId === cat.id ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: editColor, flexShrink: 0 }} />
                  <input style={{ ...inputStyle, flex: 1 }} value={editName} onChange={e => setEditName(e.target.value)}
                    onFocus={e => (e.target.style.borderColor = B.navy)} onBlur={e => (e.target.style.borderColor = B.lightGrey)}/>
                  <button onClick={() => saveEdit(cat.id)} style={{ padding: "5px 12px", borderRadius: 4, border: "none", background: B.navy, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 500 }}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: "5px 10px", borderRadius: 4, border: `1px solid ${B.lightGrey}`, background: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 22 }}>
                  {PICKER_COLORS.map(c => (
                    <div key={c} onClick={() => setEditColor(c)} style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: editColor === c ? `2px solid ${B.navy}` : "2px solid transparent", outline: editColor === c ? `1px solid ${B.navy}` : "none", boxSizing: "border-box" }} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* Reorder arrows */}
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <button
                    onClick={() => moveUp(cat.id)}
                    disabled={catIdx === 0}
                    style={{ background: "none", border: "none", cursor: catIdx === 0 ? "default" : "pointer", fontSize: 10, color: catIdx === 0 ? "#ccc" : B.navy, padding: "0 2px", lineHeight: 1 }}
                    title="Move up"
                  >▲</button>
                  <button
                    onClick={() => moveDown(cat.id)}
                    disabled={catIdx === categories.length - 1}
                    style={{ background: "none", border: "none", cursor: catIdx === categories.length - 1 ? "default" : "pointer", fontSize: 10, color: catIdx === categories.length - 1 ? "#ccc" : B.navy, padding: "0 2px", lineHeight: 1 }}
                    title="Move down"
                  >▼</button>
                </div>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, color: B.slate }}>{cat.name}</span>
                <button onClick={() => startEdit(cat)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: B.navy, padding: "2px 4px" }} title="Edit">✏</button>
                <button
                  onClick={() => !usedIds.has(cat.id) && deleteCAT(cat.id)}
                  style={{ background: "none", border: "none", cursor: usedIds.has(cat.id) ? "not-allowed" : "pointer", fontSize: 15, color: usedIds.has(cat.id) ? "#ccc" : "#E53E3E", padding: "2px 4px" }}
                  title={usedIds.has(cat.id) ? "Remove events first" : "Delete"}
                >×</button>
              </div>
            )}
          </div>
        ))}

        {/* Add new */}
        {adding ? (
          <div style={{ marginTop: 12, padding: "12px", borderRadius: 6, border: `1px solid ${B.lightGrey}`, background: "#fafbfc" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: newColor, flexShrink: 0 }} />
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Category name"
                onFocus={e => (e.target.style.borderColor = B.navy)}
                onBlur={e => (e.target.style.borderColor = B.lightGrey)}
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, paddingLeft: 22 }}>
              {PICKER_COLORS.map(c => (
                <div key={c} onClick={() => setNewColor(c)} style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: newColor === c ? `2px solid ${B.navy}` : "2px solid transparent", outline: newColor === c ? `1px solid ${B.navy}` : "none" }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setAdding(false); setNewName(""); }} style={{ padding: "5px 12px", borderRadius: 4, border: `1px solid ${B.lightGrey}`, background: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
              <button onClick={addCat} style={{ padding: "5px 12px", borderRadius: 4, border: "none", background: B.navy, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 500 }}>Add</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{ marginTop: 12, width: "100%", padding: "8px", borderRadius: 4, border: `1px dashed ${B.lightGrey}`, background: "#fff", cursor: "pointer", fontSize: 13, color: B.navy, fontFamily: "inherit", fontWeight: 500 }}
          >+ Add Category</button>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [events,           setEvents]           = useState([]);
  const [categories,       setCategories]       = useState(DEFAULT_CATEGORIES);
  const [loaded,           setLoaded]           = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const [miniMonth,        setMiniMonth]        = useState(() => new Date(formatDate(new Date()) + 'T00:00:00'));
  const [modal,            setModal]            = useState(null);
  const [catModal,         setCatModal]         = useState(false);
  const [now,              setNow]              = useState(new Date());
  const [dragState,        setDragState]        = useState(null);

  const gridRef     = useRef(null);
  const colRefs     = useRef([null, null, null, null, null]);
  const mouseDownRef = useRef({});

  // ── Persistence with localStorage ───────────────────────────────────────
  useEffect(() => {
    try {
      const savedEvents = localStorage.getItem("axos-tracker-events");
      const savedCats   = localStorage.getItem("axos-tracker-categories");
      setEvents(savedEvents ? JSON.parse(savedEvents) : []);
      setCategories(savedCats ? JSON.parse(savedCats) : DEFAULT_CATEGORIES);
    } catch {
      setEvents([]);
      setCategories(DEFAULT_CATEGORIES);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("axos-tracker-events", JSON.stringify(events));
  }, [events, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("axos-tracker-categories", JSON.stringify(categories));
  }, [categories, loaded]);

  // ── Auto-scroll to 8 AM ──────────────────────────────────────────────────
  useEffect(() => {
    if (loaded && gridRef.current) gridRef.current.scrollTop = 60;
  }, [loaded]);

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const weekDates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return formatDate(d);
  });

  const todayStr = formatDate(new Date());

  const prevWeek  = () => setCurrentWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek  = () => setCurrentWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  const goToToday = () => {
    const todayDate = new Date(formatDate(new Date()) + 'T00:00:00');
    setCurrentWeekStart(getMondayOfWeek(todayDate));
    setMiniMonth(todayDate);
  };

  const rangeLabel = (() => {
    const start = new Date(currentWeekStart);
    const end   = new Date(currentWeekStart);
    end.setDate(end.getDate() + 4);
    const opts = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  })();

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const sorted  = [...events].sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime));
    const payload = { version: "1.0", exportedAt: new Date().toISOString(), categories, events: sorted };
    const blob    = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    a.href = url; a.download = `axos-tracker-${new Date().toISOString().split("T")[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Modal handlers ───────────────────────────────────────────────────────
  const handleSaveEvent = (saved, isEdit) => {
    if (isEdit) setEvents(es => es.map(e => e.id === saved.id ? saved : e));
    else        setEvents(es => [...es, saved]);
    setModal(null);
  };
  const handleDeleteEvent = (id) => { setEvents(es => es.filter(e => e.id !== id)); setModal(null); };

  // ── Coordinate helpers ───────────────────────────────────────────────────
  function getMinutesFromMouseY(clientY) {
    if (!gridRef.current) return GRID_START_MINS;
    const rect = gridRef.current.getBoundingClientRect();
    const scrollTop = gridRef.current.scrollTop;
    const y = clientY - rect.top + scrollTop;
    const raw = GRID_START_MINS + Math.max(0, Math.min(GRID_END_MINS - GRID_START_MINS, y));
    return snapMinutes(raw);
  }

  function getColIndexFromMouseX(clientX) {
    for (let i = 0; i < colRefs.current.length; i++) {
      const el = colRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return i;
    }
    return -1;
  }

  // ── Document-level drag handlers ─────────────────────────────────────────
  useEffect(() => {
    if (!dragState) return;

    const onMouseMove = (e) => {
      const mins   = getMinutesFromMouseY(e.clientY);
      const colIdx = getColIndexFromMouseX(e.clientX);

      setDragState(prev => {
        if (!prev) return null;
        if (prev.type === 'create') {
          return { ...prev, currentMinutes: mins };
        }
        if (prev.type === 'move') {
          const newStart     = snapMinutes(mins - prev.offsetMinutes);
          const clampedStart = Math.max(GRID_START_MINS, Math.min(GRID_END_MINS - prev.originalEvent.durationMinutes, newStart));
          const date         = colIdx >= 0 ? weekDates[colIdx] : prev.targetDate;
          const ci           = colIdx >= 0 ? colIdx : prev.targetColIndex;
          return { ...prev, targetDate: date, targetColIndex: ci, targetStartMinutes: clampedStart };
        }
        if (prev.type === 'resize-top') {
          const maxStart = prev.originalEndMinutes - SNAP;
          return { ...prev, targetStartMinutes: Math.min(maxStart, Math.max(GRID_START_MINS, mins)) };
        }
        if (prev.type === 'resize-bottom') {
          const minEnd = prev.originalStartMinutes + SNAP;
          return { ...prev, targetEndMinutes: Math.max(minEnd, Math.min(GRID_END_MINS, mins)) };
        }
        return prev;
      });
    };

    const onMouseUp = () => {
      if (!dragState) return;

      if (dragState.type === 'create') {
        const start = Math.min(dragState.anchorMinutes, dragState.currentMinutes);
        const end   = Math.max(dragState.anchorMinutes, dragState.currentMinutes);
        if (end - start >= SNAP) {
          setModal({
            mode: 'create',
            draft: {
              id: generateId(),
              title: '',
              description: '',
              category: categories[0]?.id || 'other',
              date: dragState.date,
              startTime: formatTime(start),
              endTime: formatTime(end),
              durationMinutes: end - start,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          });
        }
      }

      if (dragState.type === 'move') {
        const duration = dragState.originalEvent.durationMinutes;
        const newStart = dragState.targetStartMinutes;
        setEvents(prev => prev.map(ev => ev.id === dragState.eventId ? {
          ...ev,
          date: dragState.targetDate,
          startTime: formatTime(newStart),
          endTime: formatTime(newStart + duration),
          updatedAt: new Date().toISOString(),
        } : ev));
      }

      if (dragState.type === 'resize-top') {
        const newStart = dragState.targetStartMinutes;
        setEvents(prev => prev.map(ev => ev.id === dragState.eventId ? {
          ...ev,
          startTime: formatTime(newStart),
          durationMinutes: parseTime(ev.endTime) - newStart,
          updatedAt: new Date().toISOString(),
        } : ev));
      }

      if (dragState.type === 'resize-bottom') {
        const newEnd = dragState.targetEndMinutes;
        setEvents(prev => prev.map(ev => ev.id === dragState.eventId ? {
          ...ev,
          endTime: formatTime(newEnd),
          durationMinutes: newEnd - parseTime(ev.startTime),
          updatedAt: new Date().toISOString(),
        } : ev));
      }

      setDragState(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState, weekDates, categories]);

  // ── Current time position (Pacific time) ────────────────────────────────
  const currentMins = (() => {
    const [h, m] = LA_TIME_FMT.format(now).split(':').map(Number);
    return h * 60 + m;
  })();
  const timeIndicatorTop = currentMins - GRID_START;
  const showIndicator    = timeIndicatorTop >= 0 && timeIndicatorTop <= GRID_HEIGHT;

  // ── Hour / half-hour labels ───────────────────────────────────────────────
  const hourLabels = [];
  for (let h = 8; h <= 22; h++) {
    const label = h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`;
    hourLabels.push({ top: (h - 8) * 60, label });
  }

  // ── Pie data ─────────────────────────────────────────────────────────────
  const pieDatasets = PIE_PERIODS.map(p => ({
    ...p,
    data: buildPieData(events, categories, p.key, todayStr, weekDates),
  }));

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (!loaded) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Roboto, Arial, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${B.lightGrey}`, borderTopColor: B.navy, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 13, color: "#999" }}>Loading…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", height: "100vh",
      fontFamily: "Roboto, Arial, sans-serif",
      overflow: "hidden",
      userSelect: dragState ? 'none' : 'auto',
      cursor: dragState?.type === 'move' ? 'grabbing' : 'default',
    }}>

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <div style={{ width: 280, flexShrink: 0, height: "100vh", overflowY: "auto", background: B.white, borderRight: `1px solid ${B.lightGrey}`, display: "flex", flexDirection: "column" }}>

        {/* Logo */}
        <div style={{ padding: "18px 20px 16px", display: "flex", alignItems: "center", gap: 2 }}>
          <span style={{ color: B.gold, fontWeight: 700, fontSize: 20, letterSpacing: 2 }}>›</span>
          <span style={{ color: B.navy, fontWeight: 700, fontSize: 20, letterSpacing: 2, marginLeft: 3 }}>axos</span>
          <span style={{ marginLeft: 10, fontSize: 11, color: "#999", fontWeight: 400, letterSpacing: 0.5 }}>time tracker</span>
        </div>

        <div style={{ height: 1, background: B.lightGrey, margin: "0 0 4px" }} />

        {/* Mini Calendar */}
        <MiniCalendar
          miniMonth={miniMonth}
          setMiniMonth={setMiniMonth}
          weekDates={weekDates}
          setCurrentWeekStart={setCurrentWeekStart}
        />

        <div style={{ height: 1, background: B.lightGrey, margin: "8px 0" }} />

        {/* Time Breakdown */}
        <div style={{ padding: "8px 20px 4px", fontSize: 11, fontWeight: 500, color: B.navy, letterSpacing: 1.5, textTransform: "uppercase" }}>
          <span style={{ color: B.gold, marginRight: 4 }}>›</span> Time Breakdown
        </div>

        {/* 2×2 pie grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 12px" }}>
          {pieDatasets.map(p => <SmallPie key={p.key} label={p.label} data={p.data} />)}
        </div>

        {/* Legend */}
        <div style={{ padding: "4px 16px 12px", display: "flex", flexWrap: "wrap", gap: "4px 0" }}>
          {categories.map(cat => (
            <span key={cat.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8, fontSize: 11, color: B.slate }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color, flexShrink: 0, display: "inline-block" }} />
              {cat.name}
            </span>
          ))}
        </div>

        <div style={{ height: 1, background: B.lightGrey, marginTop: "auto" }} />

        {/* Gear button */}
        <div style={{ padding: "12px 16px" }}>
          <button
            className="ghost-btn"
            onClick={() => setCatModal(true)}
            style={{ width: "100%", padding: "8px 0", borderRadius: 4, border: `1px solid ${B.navy}`, background: "transparent", color: B.navy, cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 500 }}
          >⚙ Manage Categories</button>
        </div>
      </div>

      {/* ── MAIN AREA ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header bar */}
        <div style={{ height: 56, flexShrink: 0, background: B.white, borderBottom: `1px solid ${B.lightGrey}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="nav-btn" onClick={prevWeek} style={{ background: "none", border: `1px solid ${B.lightGrey}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 15, color: B.navy, fontFamily: "inherit" }}>‹</button>
            <span style={{ fontSize: 14, fontWeight: 500, color: B.navy, minWidth: 180, textAlign: "center" }}>{rangeLabel}</span>
            <button className="nav-btn" onClick={nextWeek} style={{ background: "none", border: `1px solid ${B.lightGrey}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 15, color: B.navy, fontFamily: "inherit" }}>›</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="gold-btn" onClick={goToToday} style={{ background: B.gold, color: "#fff", border: "none", borderRadius: 4, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}>Today</button>
            <button className="ghost-btn" onClick={handleExport} style={{ background: "transparent", color: B.navy, border: `1px solid ${B.navy}`, borderRadius: 4, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Export JSON</button>
          </div>
        </div>

        {/* Column headers */}
        <div style={{ height: 40, flexShrink: 0, background: B.white, borderBottom: `1px solid ${B.lightGrey}`, display: "flex" }}>
          {/* Gutter */}
          <div style={{ width: 48, flexShrink: 0 }} />
          {weekDates.map((ds, i) => {
            const d       = new Date(ds + "T00:00:00");
            const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
            const dayNum  = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
            const isToday = ds === todayStr;
            return (
              <div key={ds} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: isToday ? B.navy : "transparent", color: isToday ? "#fff" : B.navy, fontSize: 13, fontWeight: isToday ? 500 : 400 }}>
                {isToday && <span style={{ width: 6, height: 6, borderRadius: "50%", background: B.gold, flexShrink: 0 }} />}
                <span>{dayName}</span>
                <span style={{ opacity: 0.75, fontSize: 12 }}>{dayNum}</span>
              </div>
            );
          })}
        </div>

        {/* Scrollable grid */}
        <div ref={gridRef} style={{ flex: 1, overflowY: "auto", position: "relative" }}>
          <div style={{ display: "flex", height: GRID_HEIGHT }}>
            {/* Time labels */}
            <div style={{ width: 48, flexShrink: 0, position: "relative", userSelect: "none" }}>
              {hourLabels.map(({ top, label }) => (
                <div key={label} style={{ position: "absolute", top, right: 8, fontSize: 11, color: "#999", textAlign: "right", lineHeight: 1, transform: "translateY(-50%)", whiteSpace: "nowrap" }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDates.map((ds, colIndex) => {
              const isToday   = ds === todayStr;
              const colEvents = events.filter(e => e.date === ds);

              return (
                <div
                  key={ds}
                  ref={el => colRefs.current[colIndex] = el}
                  style={{ flex: 1, position: "relative", background: isToday ? "#F8FAFF" : "transparent", borderLeft: `1px solid ${B.lightGrey}`, minWidth: 0 }}
                  onMouseDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    e.preventDefault();
                    const mins = getMinutesFromMouseY(e.clientY);
                    setDragState({ type: 'create', date: ds, colIndex, anchorMinutes: mins, currentMinutes: mins });
                  }}
                >
                  {/* Hour gridlines */}
                  {hourLabels.map(({ top, label }) => (
                    <div key={label} style={{ position: "absolute", top, left: 0, right: 0, borderTop: `1px solid ${B.lightGrey}`, pointerEvents: "none" }} />
                  ))}
                  {/* Half-hour dashed lines */}
                  {hourLabels.slice(0, -1).map(({ top, label }) => (
                    <div key={`h-${label}`} style={{ position: "absolute", top: top + 30, left: 0, right: 0, borderTop: "1px dashed #EAEAEA", pointerEvents: "none" }} />
                  ))}

                  {/* Current time indicator */}
                  {isToday && showIndicator && (
                    <div style={{ position: "absolute", top: timeIndicatorTop, left: 0, right: 0, zIndex: 10, pointerEvents: "none" }}>
                      <div style={{ position: "absolute", left: -5, top: -5, width: 10, height: 10, borderRadius: "50%", background: "#E53E3E" }} />
                      <div style={{ height: 2, background: "#E53E3E", marginLeft: 0 }} />
                    </div>
                  )}

                  {/* Drag-to-create ghost */}
                  {dragState?.type === 'create' && dragState.date === ds && (() => {
                    const start      = Math.min(dragState.anchorMinutes, dragState.currentMinutes);
                    const end        = Math.max(dragState.anchorMinutes, dragState.currentMinutes);
                    const ghostTop   = (start - GRID_START_MINS) + 'px';
                    const ghostHeight = Math.max(SNAP, end - start) + 'px';
                    return (
                      <div style={{
                        position: 'absolute', top: ghostTop, height: ghostHeight,
                        left: '3px', right: '3px',
                        background: 'rgba(30,56,96,0.18)',
                        border: '2px dashed #1E3860',
                        borderRadius: 4,
                        pointerEvents: 'none',
                        zIndex: 3,
                      }}>
                        <div style={{ fontSize: 11, padding: '2px 5px', color: '#1E3860', fontWeight: 500 }}>
                          {formatTimeDisplay(formatTime(start))} – {formatTimeDisplay(formatTime(Math.max(end, start + SNAP)))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Move ghost */}
                  {dragState?.type === 'move' && dragState.targetDate === ds && (() => {
                    const ghost    = dragState.originalEvent;
                    const ghostCat = categories.find(c => c.id === ghost.category);
                    const ghostTop = (dragState.targetStartMinutes - GRID_START_MINS) + 'px';
                    const ghostHeight = ghost.durationMinutes + 'px';
                    return (
                      <div style={{
                        position: 'absolute', top: ghostTop, height: ghostHeight,
                        left: '3px', right: '3px',
                        backgroundColor: ghostCat?.color || '#87B9D7',
                        opacity: 0.75, borderRadius: 4,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                        pointerEvents: 'none',
                        border: `2px solid ${ghostCat?.color || '#87B9D7'}`,
                        color: getTextColor(ghostCat?.color || '#87B9D7'),
                        fontSize: 12, fontWeight: 500, padding: '3px 6px',
                        zIndex: 3,
                      }}>
                        {ghost.title}
                      </div>
                    );
                  })()}

                  {/* Events */}
                  {colEvents.map(ev => {
                    const cat = categories.find(c => c.id === ev.category) || { color: B.lightGrey };

                    const displayStart = (dragState?.type === 'resize-top' && dragState.eventId === ev.id)
                      ? dragState.targetStartMinutes
                      : parseTime(ev.startTime);
                    const displayEnd = (dragState?.type === 'resize-bottom' && dragState.eventId === ev.id)
                      ? dragState.targetEndMinutes
                      : parseTime(ev.endTime);

                    const topPx     = displayStart - GRID_START_MINS;
                    const heightNum = Math.max(SNAP, displayEnd - displayStart);
                    const textCol   = getTextColor(cat.color);
                    const isMoving  = dragState?.type === 'move' && dragState.eventId === ev.id;

                    if (topPx < 0 || topPx > GRID_HEIGHT) return null;

                    return (
                      <div
                        key={ev.id}
                        className="event-block"
                        data-event-id={ev.id}
                        style={{
                          position: "absolute",
                          top: topPx,
                          height: heightNum,
                          left: 3, right: 3,
                          backgroundColor: cat.color,
                          borderRadius: 4,
                          overflow: "hidden",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                          border: "1px solid rgba(0,0,0,0.1)",
                          opacity: isMoving ? 0.4 : 1,
                          cursor: isMoving ? 'grabbing' : 'default',
                          zIndex: 2,
                        }}
                      >
                        {/* Top resize handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation(); e.preventDefault();
                            setDragState({ type: 'resize-top', eventId: ev.id, originalEndMinutes: parseTime(ev.endTime), targetStartMinutes: parseTime(ev.startTime) });
                          }}
                          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, cursor: 'n-resize', zIndex: 2 }}
                        />

                        {/* Body — drag to move, click to edit */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation(); e.preventDefault();
                            const clickMins  = getMinutesFromMouseY(e.clientY);
                            const offsetMins = Math.max(0, snapMinutes(clickMins - parseTime(ev.startTime)));
                            mouseDownRef.current[ev.id] = { x: e.clientX, y: e.clientY };
                            setDragState({
                              type: 'move',
                              eventId: ev.id,
                              originalEvent: ev,
                              offsetMinutes: offsetMins,
                              targetDate: ev.date,
                              targetColIndex: weekDates.indexOf(ev.date),
                              targetStartMinutes: parseTime(ev.startTime),
                            });
                          }}
                          onClick={(e) => {
                            const orig = mouseDownRef.current[ev.id];
                            if (orig && Math.abs(e.clientX - orig.x) < 5 && Math.abs(e.clientY - orig.y) < 5) {
                              setModal({ mode: 'edit', draft: { ...ev } });
                            }
                          }}
                          style={{
                            position: 'absolute', top: 8, bottom: 8, left: 0, right: 0,
                            cursor: 'grab', zIndex: 1,
                            padding: '0 6px',
                            color: textCol,
                          }}
                        >
                          {heightNum >= 30 ? (
                            <>
                              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12, fontWeight: 500 }}>{ev.title}</div>
                              <div style={{ fontSize: 11, opacity: 0.85 }}>{formatTimeDisplay(formatTime(displayStart))} – {formatTimeDisplay(formatTime(displayEnd))}</div>
                            </>
                          ) : (
                            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12, fontWeight: 500 }}>{ev.title}</div>
                          )}
                        </div>

                        {/* Bottom resize handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation(); e.preventDefault();
                            setDragState({ type: 'resize-bottom', eventId: ev.id, originalStartMinutes: parseTime(ev.startTime), targetEndMinutes: parseTime(ev.endTime) });
                          }}
                          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, cursor: 's-resize', zIndex: 2 }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}
      {modal && (
        <EventModal
          modal={modal}
          categories={categories}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={() => setModal(null)}
        />
      )}
      {catModal && (
        <CatModal
          categories={categories}
          setCategories={setCategories}
          events={events}
          onClose={() => setCatModal(false)}
        />
      )}
    </div>
  );
}
