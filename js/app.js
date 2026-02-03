// js/app.js

// ── PWA Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered', reg))
      .catch(err => console.error('Service Worker failed', err));
  });
}

/******************************
 * App Version & Migration
 ******************************/
const APP_VERSION = '1.3.3';

function getJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function setJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function ensureClientShape(c){
  const id = c.id || crypto.randomUUID();
  const rateNum = Number(c.rate || 0);
  return {
    id,
    photo: c.photo || '',
    name: c.name || '',
    address: c.address || '',
    phone: c.phone || '',
    email: c.email || '',
    pickup: c.pickup || '',
    serviceDay: c.serviceDay || '',
    frequency: c.frequency || 'Weekly',
    rate: isNaN(rateNum) ? 0 : rateNum,
    status: c.status || 'Pending',
    billingName: c.billingName || '',
    billingAddress: c.billingAddress || '',
    start: c.start || '',
    paused: !!c.paused,
    gallery: c.gallery || '',
    notes: c.notes || '',
    lastCut: c.lastCut || null,
    rescheduledFor: c.rescheduledFor || null
  };
}
function migrateStorage(){
  const current = localStorage.getItem('appVersion') || '0.0.0';
  if(current === '0.0.0'){
    const clients = getJSON('clients', []).map(ensureClientShape);
    setJSON('clients', clients);
  }
  const defaults = { autoInvoiceEnabled: true, autogenDay: 1, autoOverdueEnabled: true, overdueAfterDays: 15 };
  const existing = getJSON('automationSettings', {});
  setJSON('automationSettings', { ...defaults, ...existing });
  localStorage.setItem('appVersion', APP_VERSION);
}
migrateStorage();

/******************************
 * IndexedDB image store + compression
 ******************************/
const IMG_DB_NAME = 'freeman-images';
const IMG_STORE = 'images';

function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(IMG_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(IMG_STORE)){
        db.createObjectStore(IMG_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPutImage(id, blob){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).put({ id, blob, ts: Date.now() });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGetImage(id){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbDeleteImage(id){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IMG_STORE, 'readwrite');
    const req = tx.objectStore(IMG_STORE).delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
async function createObjectURLFromID(id){
  const blob = await idbGetImage(id);
  return blob ? URL.createObjectURL(blob) : '';
}

function fileToImage(file){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(reader.error);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    reader.readAsDataURL(file);
  });
}
async function compressToWebp(file, maxW=1024, quality=0.72){
  const img = await fileToImage(file);
  let { width, height } = img;
  if(width > maxW){
    height = Math.round(height * (maxW / width));
    width = maxW;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return await new Promise(res => canvas.toBlob(b => res(b), 'image/webp', quality));
}
function newImageID(prefix='img'){ return `\( {prefix}_ \){crypto.randomUUID()}`; }

/******************************
 * Helpers
 ******************************/
const $ = s => document.querySelector(s);
let reorderDay = null;

function toast(msg,type="default"){
  const t=document.createElement('div');
  t.className='toast';
  if(type==="done") t.classList.add('done');
  if(type==="skip") t.classList.add('skip');
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),1800);
}
function todayISO(){
  const d=new Date(); d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}
function monthKeyFromDate(date=new Date()){
  return `\( {date.getFullYear()}- \){String(date.getMonth()+1).padStart(2,'0')}`;
}
function nextWorkdayISO(fromDate=new Date()){
  const d=new Date(fromDate);
  do { d.setDate(d.getDate()+1); } while(d.getDay()===0);
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}
function showPage(pageId){
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');
  $('#'+pageId).style.display='block';
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.remove('active'));
  if(pageId==='scheduleView'){ $('#navSchedule').classList.add('active'); renderSchedule(); }
  if(pageId==='clientsView'){ $('#navClients').classList.add('active'); loadClients(); }
  if(pageId==='invoicesView'){ $('#navInvoices').classList.add('active'); renderInvoices(); }
  if(pageId==='settingsView'){
    $('#navSettings').classList.add('active');
    renderSettingsMeta();
    renderAutomationSettings();
    renderBusinessProfile();
  }
}
function weekdayIndex(name){
  const map = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };
  return map ;
}
function dateISOForNext(name){
  const target = weekdayIndex(name);
  const d = new Date();
  d.setHours(0,0,0,0);
  while (d.getDay() !== target) {
    d.setDate(d.getDate()+1);
    if (d.getDay() === 0) d.setDate(d.getDate()+1);
  }
  return d.toISOString().slice(0,10);
}

/******************************
 * Hash helper + PIN migration
 ******************************/
async function hashString(str){
  const buf = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2,"0")).join("");
}
async function migratePin(){
  const saved = localStorage.getItem('loginPin');
  if(saved && /^\d{4}$/.test(saved)){  
    const hashed = await hashString(saved);
    localStorage.setItem('loginPin', hashed);
    console.log("PIN migrated to hashed storage");
  }
}
migratePin();

/******************************
 * Custom PIN Modal (replaces prompt)
 ******************************/
function showPinModal(mode) {  // 'set' or 'change'
  const modal = document.getElementById('pinModal');
  const title = document.getElementById('pinModalTitle');
  const sub = document.getElementById('pinModalSub');
  const input = document.getElementById('modalPin');
  const confirmBtn = document.getElementById('confirmPinBtn');

  input.value = '';
  if (mode === 'set') {
    title.textContent = 'Set New PIN';
    sub.textContent = 'Enter a 4-digit PIN to secure your app';
  } else {
    title.textContent = 'Change PIN';
    sub.textContent = 'Enter your new 4-digit PIN';
  }

  modal.style.display = 'flex';
  input.focus();

  const confirmHandler = async () => {
    const p = input.value.trim();
    if (p && /^\d{4}$/.test(p)) {
      const hashed = await hashString(p);
      localStorage.setItem('loginPin', hashed);
      toast(mode === 'set' ? 'PIN set.' : 'PIN changed.', 'done');
      modal.style.display = 'none';
      if (mode === 'set') {
        document.getElementById('pinInput').focus();
      }
    } else {
      toast('PIN must be exactly 4 digits.', 'skip');
      input.value = '';
      input.focus();
    }
  };

  const cancelHandler = () => {
    modal.style.display = 'none';
    input.value = '';
  };

  confirmBtn.onclick = confirmHandler;
  document.getElementById('cancelPin').onclick = cancelHandler;

  input.onkeydown = (e) => {
    if (e.key === 'Enter') confirmHandler();
  };
}

/******************************
 * PIN Login + Set/Change
 ******************************/
$('#pinInput').addEventListener('input', e=>{
  const v=e.target.value.replace(/\D/g,''); e.target.value=v;
  if(v.length===4){
    const saved=localStorage.getItem('loginPin');
    if(!saved){ toast('No PIN set yet. Tap "Set PIN".'); e.target.value=''; return; }

    hashString(v).then(hashed => {
      if(hashed === saved){
        document.getElementById('loginWrap').style.display='none';
        document.getElementById('bottomNav').style.display='flex';
        showPage('scheduleView');
      } else {
        toast('Incorrect PIN');
        e.target.value='';
      }
    });
  }
});

document.getElementById('setPinBtn').addEventListener('click', () => {
  showPinModal('set');
});

function changePin(){
  showPinModal('change');
}

function removePin(){
  localStorage.removeItem('loginPin'); 
  toast('PIN removed','done');
}

/******************************
 * Clients (rest unchanged)
 ******************************/
function toggleClientForm(){
  const wrap=document.getElementById('clientFormWrap');
  wrap.style.display=(wrap.style.display==='none'?'block':'none');
}
function cancelEdit(){
  document.getElementById('clientForm').reset();
  document.getElementById('clientId').value='';
  document.getElementById('clientPhotoPreview').style.display='none';
  document.getElementById('clientGalleryPreview').innerHTML='';
  document.getElementById('clientFormWrap').style.display='none';
}
function saveClients(clients){ localStorage.setItem('clients', JSON.stringify(clients)); }
function sortClients(clients){
  const sortBy=document.getElementById('clientSort').value;
  return clients.sort((a,b)=>{
    if(sortBy==='rate') return (parseFloat(a.rate)||0)-(parseFloat(b.rate)||0);
    return (a ||'').toString().localeCompare((b ||'').toString());
  });
}
// ... (the rest of your clients, schedule, invoices, etc. code remains exactly the same — I trimmed it here for brevity)
