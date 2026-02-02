:root {
  --green:#2e7d32; --green-dark:#1f5a24; --fg:#111; --bg:#f8faf8; --card:#ffffff;
  --muted:#6b7280; --border:#e3e7e9; --card-bg:#ffffff; --bg-soft:#f5faf5;
  --danger:#c62828;
}
* { box-sizing: border-box; }
html, body { overscroll-behavior-y: contain; }
body { margin:0; font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:var(--bg); color:var(--fg); }

.card, .day-card {
  background:var(--card);
  border-radius:16px;
  padding:16px;
  box-shadow:0 4px 14px rgba(0,0,0,.06);
  margin-bottom:16px;
}
.card h1, .day-card h2, .day-card h3 { color:var(--green-dark); margin:0 0 8px; }

.wrap { min-height:100dvh; padding:24px 16px; display:grid; place-items:center; }
.card { width:100%; max-width:420px; text-align:center; padding:28px 22px; }
h1 { margin:6px 0 2px; font-size:1.6rem; color:var(--green); }
p.sub { margin:0 0 14px; color:#333; font-size:.95rem; }
.pin { width:100%; padding:16px; margin:8px 0 14px; font-size:28px; text-align:center; letter-spacing:10px; border:2px solid #cfd8dc; border-radius:12px; }

.btn { padding:10px 16px; font-size:1rem; font-weight:600; border-radius:12px; border:0; cursor:pointer; background:var(--green); color:#fff; }
.btn:hover { filter:brightness(.98); }
.btn[disabled] { opacity:.5; cursor:not-allowed; }
.btn.hidden { display:none; }

.btn-primary { background:var(--green); color:#fff; }
.btn-secondary { background:#455a64; color:#fff; }
.btn-danger { background:var(--danger); color:#fff; }

.toast {
  position:fixed; left:50%; bottom:20px; transform:translateX(-50%);
  background:var(--green); color:#fff; padding:10px 16px; border-radius:999px;
  box-shadow:0 6px 18px rgba(0,0,0,.2); font-weight:600; z-index:1000;
}
.toast.done { background:#2e7d32; }
.toast.skip { background:var(--danger); }

.page { display:none; padding:70px 16px 90px; max-width:800px; margin:0 auto; }
.today { border:2px solid var(--green); box-shadow:0 0 10px rgba(46,125,50,.5); }

.bottom-nav { position:fixed; bottom:0; left:0; right:0; display:flex; justify-content:space-around; background:var(--green); padding:10px; gap:8px; }
.bottom-nav button { flex:1; border:none; background:none; color:#fff; font-size:.9rem; font-weight:bold; cursor:pointer; padding:6px 8px; border-radius:8px; }
.bottom-nav button.active { background:var(--green-dark); }

.input {
  width:100%;
  background:#fcfffc;
  border:1px solid var(--border);
  border-radius:12px;
  padding:12px 12px;
  font-size:.95rem;
  transition:border-color .2s, box-shadow .2s;
  margin-bottom:8px;
}
.input:focus {
  outline:none;
  border-color: var(--green);
  box-shadow:0 0 0 3px rgba(46,125,50,.15);
}
textarea.input{ min-height:88px; }

#clientList .day-card { background:white; }
#clientList h3 { margin:0 0 6px; font-size:1.1rem; color:var(--green-dark); }
#clientList p { margin:4px 0; color:#555; font-size:.9rem; }
#clientList a { color:var(--green); text-decoration:none; }
#clientList button { padding:6px 12px; border:none; border-radius:8px; font-size:.85rem; cursor:pointer; margin-top:6px; }

.client-controls { display:flex; gap:8px; margin-bottom:12px; }
#clientSearch { flex:1; }
#clientSort { flex:0.5; }

.switch { position:relative; display:inline-block; width:46px; height:24px; margin:8px 0; }
.switch input { display:none; }
.slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:#c9d8ce; transition:.3s; border-radius:24px; }
.slider:before { position:absolute; content:""; height:18px; width:18px; left:3px; bottom:3px; background:white; transition:.3s; border-radius:50%; }
input:checked + .slider { background:linear-gradient(90deg, var(--green), #43a047); }
input:checked + .slider:before { transform:translateX(22px); }

.sched-client { background:#fdfdfd; border:1px solid #ddd; border-radius:12px; padding:10px; margin:6px 0; user-select:none; -webkit-user-select:none; }
.sched-header { display:flex; justify-content:space-between; align-items:center; }
.sched-name { font-weight:bold; }
.sched-arrows button { background:none; border:none; cursor:pointer; font-size:1rem; margin-left:4px; }
.sched-client p { margin:3px 0; font-size:.9rem; }
.sched-actions { margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; }
.sched-actions .btn { font-size:.85rem; padding:6px 10px; border-radius:8px; }

.badge-resched { display:inline-block; font-size:.72rem; padding:2px 6px; border-radius:999px; background:#ff9800; color:#111; margin-left:6px; vertical-align:middle; }

.status-active { color:#2e7d32; font-weight:700; }
.status-paused { color:var(--danger); font-weight:700; }
.status-overdue { color:var(--danger); }
.status-paid { color:#2e7d32; }

#settingsView { max-width:960px; }
#settingsView .hint{ color:var(--muted); font-size:.85rem; margin-top:6px; }
#settingsView .subtle{ margin:0 0 10px; color:var(--muted); font-size:.9rem; }
#settingsView .grid-2{ display:grid; gap:10px; grid-template-columns:1fr; }
@media (min-width: 720px){ #settingsView .grid-2{ grid-template-columns:1fr 1fr; } }
#settingsView .grid-3{ display:grid; gap:10px; grid-template-columns:1fr; }
@media (min-width: 840px){ #settingsView .grid-3{ grid-template-columns:1fr 1fr 1fr; } }
#settingsView .day-card{ border:1px solid var(--border); background:var(--card-bg); box-shadow:0 6px 18px rgba(16, 94, 35, .06); }
#settingsView .day-card.danger{ border-color:#f1c1c1; background:#fff5f5; }
#settingsView .day-card.danger h2{ color:var(--danger); }
