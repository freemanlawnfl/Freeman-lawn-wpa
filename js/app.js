
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
  return map[name];
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
 * PIN
 ******************************/
$('#pinInput').addEventListener('input', e=>{
  const v=e.target.value.replace(/\D/g,''); e.target.value=v;
  if(v.length===4){
    const saved=localStorage.getItem('loginPin');
    if(!saved){ toast('No PIN set. Tap "Set PIN".'); e.target.value=''; return; }

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
document.getElementById('setPinBtn').addEventListener('click', ()=>{
  const p=prompt('Enter new 4-digit PIN:');
  if(p && /^\d{4}$/.test(p)){
    hashString(p).then(hashed => {
      localStorage.setItem('loginPin', hashed);
      toast('PIN set.','done');
      document.getElementById('pinInput').focus();
    });
  } else toast('PIN must be 4 digits.');
});
function changePin(){
  const p=prompt('Enter new 4-digit PIN:');
  if(p && /^\d{4}$/.test(p)){
    hashString(p).then(hashed => {
      localStorage.setItem('loginPin', hashed);
      toast('PIN changed','done');
    });
  }
  else toast('PIN must be 4 digits.');
}
function removePin(){
  localStorage.removeItem('loginPin'); toast('PIN removed','done');
}


/******************************
 * Clients
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
    return (a[sortBy]||'').toString().localeCompare((b[sortBy]||'').toString());
  });
}
async function loadClients(){
  let clients=getJSON('clients', []).map(ensureClientShape);
  clients=sortClients(clients);
  const list=document.getElementById('clientList'); list.innerHTML='';
  for(const c of clients){
    const div=document.createElement('div');
    div.className='day-card';
    div.innerHTML=`
      <h3>${c.name}</h3>
      <p>📍 <a href="https://maps.google.com/?q=\( {encodeURIComponent(c.address||'')}" target="_blank"> \){c.address||''}</a></p>
      <p>📞 <a href="tel:\( {c.phone||''}">Call</a> | <a href="sms: \){c.phone||''}">Text</a></p>
      <p>✉️ <a href="mailto:\( {c.email||''}"> \){c.email||''}</a></p>
      <p>🌱 Pickup: ${c.pickup||'-'} | 🗓 Service: \( {c.serviceDay||'-'} ( \){c.frequency||'-'})</p>
      <p>Status: ${c.status==='Paid' ? '<span class="status-paid">Paid</span>'
                : c.status==='Overdue' ? '<span class="status-overdue">Overdue</span>'
                : '<span class="status-active">Pending</span>'}</p>
      <p>Billing: ${c.billingName||'-'}, ${c.billingAddress||'-'}</p>
      <p>Start: ${c.start||'-'}</p>
      ${c.paused?`<p class="status-paused">⏸ Service Paused</p>`:`<p class="status-active">✅ Active</p>`}
      <p>📝 ${c.notes||''}</p>
    `;

    if(c.photo){
      const imgTag = document.createElement('img');
      imgTag.style.cssText = "max-width:80px; border-radius:50%; margin-bottom:8px;";
      if(/^idb:/.test(c.photo)){
        const id = c.photo.replace(/^idb:/,'');
        createObjectURLFromID(id).then(url=>{ if(url) imgTag.src = url; });
      } else {
        imgTag.src = c.photo;
      }
      div.prepend(imgTag);
    }

    if(c.gallery){
      const ids = c.gallery.split(',').map(s=>s.trim()).filter(Boolean);
      if(ids.length){
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;';
        for(const tag of ids){
          const im = document.createElement('img');
          im.style.cssText = 'width:52px;height:52px;object-fit:cover;border-radius:6px;';
          if(/^idb:/.test(tag)){
            const id = tag.replace(/^idb:/,'');
            createObjectURLFromID(id).then(url=>{ if(url) im.src = url; });
          } else {
            im.src = tag;
          }
          row.appendChild(im);
        }
        div.appendChild(row);
      }
    }

    const btnRow=document.createElement('div');
    btnRow.style.cssText='display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;';
    const editBtn=document.createElement('button');
    editBtn.textContent="✏️ Edit";
    editBtn.className='btn btn-primary';
    editBtn.addEventListener('click',()=>editClient(c.id));
    const delBtn=document.createElement('button');
    delBtn.textContent="❌ Delete";
    delBtn.className='btn btn-danger';
    delBtn.addEventListener('click',()=>deleteClient(c.id));
    btnRow.appendChild(editBtn); btnRow.appendChild(delBtn);
    div.appendChild(btnRow);

    list.appendChild(div);
  }
}
function deleteClient(id){
  let clients=getJSON('clients', []);
  clients=clients.filter(c=>c.id!==id);
  saveClients(clients); loadClients(); renderSchedule(); renderInvoices();
}
async function editClient(id){
  const clients=getJSON('clients', []);
  const c=clients.find(x=>x.id===id); if(!c) return;
  document.getElementById('clientId').value=c.id;
  document.getElementById('clientPhoto').value=c.photo||'';
  document.getElementById('clientName').value=c.name||'';
  document.getElementById('clientAddress').value=c.address||'';
  document.getElementById('clientPhone').value=c.phone||'';
  document.getElementById('clientEmail').value=c.email||'';
  document.getElementById('clientPickup').value=c.pickup||'';
  document.getElementById('clientServiceDay').value=c.serviceDay||'';
  document.getElementById('clientFrequency').value=c.frequency||'Weekly';
  document.getElementById('clientRate').value=c.rate||'';
  document.getElementById('clientStatus').value=c.status||'Pending';
  document.getElementById('clientBillingName').value=c.billingName||'';
  document.getElementById('clientBillingAddress').value=c.billingAddress||'';
  document.getElementById('clientStart').value=c.start||'';
  document.getElementById('clientPaused').checked=!!c.paused;
  document.getElementById('clientGallery').value=c.gallery||'';
  document.getElementById('clientNotes').value=c.notes||'';

  const prev = document.getElementById('clientPhotoPreview');
  prev.style.display = 'none';
  if(c.photo){
    if(/^idb:/.test(c.photo)){
      const url = await createObjectURLFromID(c.photo.replace(/^idb:/,''));
      if(url){ prev.src = url; prev.style.display = 'block'; }
    } else {
      prev.src = c.photo; prev.style.display = 'block';
    }
    const btn = document.getElementById('btnRemoveProfile');
    if(btn) btn.style.display = 'inline-block';
  }
  const wrap = document.getElementById('clientGalleryPreview');
  wrap.innerHTML = '';
  const tags = (c.gallery||'').split(',').map(s=>s.trim()).filter(Boolean);
  for(const tag of tags){
    const cell = document.createElement('div');
    cell.style.cssText = 'position:relative;display:inline-block;';
    const im = document.createElement('img');
    im.style.cssText = 'width:68px;height:68px;object-fit:cover;border-radius:8px;';
    const delBtn = document.createElement('button');
    delBtn.textContent = '❌';
    delBtn.className = 'btn btn-danger';
    delBtn.style.cssText = 'position:absolute;top:-6px;right:-6px;font-size:.7rem;padding:2px 6px;border-radius:999px;';
    delBtn.addEventListener('click', ()=> removeGalleryImage(tag, cell));
    if(/^idb:/.test(tag)){
      const url = await createObjectURLFromID(tag.replace(/^idb:/,''));
      if(url) im.src = url;
    } else {
      im.src = tag;
    }
    cell.appendChild(im);
    cell.appendChild(delBtn);
    wrap.appendChild(cell);
  }

  document.getElementById('clientFormWrap').style.display='block';
}
document.getElementById('clientForm').addEventListener('submit', e=>{
  e.preventDefault();
  let clients=getJSON('clients', []);
  const id=document.getElementById('clientId').value;
  const prev=clients.find(c=>c.id===id)||{};
  const client={
    id: id || crypto.randomUUID(),
    photo:document.getElementById('clientPhoto').value.trim(),
    name:document.getElementById('clientName').value.trim(),
    address:document.getElementById('clientAddress').value.trim(),
    phone:document.getElementById('clientPhone').value.trim(),
    email:document.getElementById('clientEmail').value.trim(),
    pickup:document.getElementById('clientPickup').value,
    serviceDay:document.getElementById('clientServiceDay').value,
    frequency:document.getElementById('clientFrequency').value,
    rate:Number(document.getElementById('clientRate').value),
    status:document.getElementById('clientStatus').value,
    billingName:document.getElementById('clientBillingName').value.trim(),
    billingAddress:document.getElementById('clientBillingAddress').value.trim(),
    start:document.getElementById('clientStart').value,
    paused:document.getElementById('clientPaused').checked,
    gallery:document.getElementById('clientGallery').value.trim(),
    notes:document.getElementById('clientNotes').value.trim(),
    lastCut: prev.lastCut || null,
    rescheduledFor: prev.rescheduledFor || null
  };
  if(id){ clients=clients.map(c => c.id===id?client:c); } else { clients.push(client); }
  saveClients(clients);
  e.target.reset(); document.getElementById('clientId').value='';
  document.getElementById('clientPhotoPreview').style.display='none';
  document.getElementById('clientGalleryPreview').innerHTML='';
  document.getElementById('clientFormWrap').style.display='none';
  loadClients(); renderSchedule(); renderInvoices();
});
document.getElementById('clientSearch').addEventListener('input', e=>{
  const term=e.target.value.toLowerCase();
  document.querySelectorAll('#clientList .day-card').forEach(card=>{
    card.style.display=card.innerText.toLowerCase().includes(term)?'block':'none';
  });
});
document.getElementById('clientSort').addEventListener('change', loadClients);

// File handlers
document.getElementById('btnTakeProfile')?.addEventListener('click', () =>
  document.getElementById('clientPhotoFile_camera').click()
);
document.getElementById('btnUploadProfile')?.addEventListener('click', () =>
  document.getElementById('clientPhotoFile_upload').click()
);
document.getElementById('btnTakeGallery')?.addEventListener('click', () =>
  document.getElementById('clientGalleryFiles_camera').click()
);
document.getElementById('btnUploadGallery')?.addEventListener('click', () =>
  document.getElementById('clientGalleryFiles_upload').click()
);
document.getElementById('btnRemoveProfile')?.addEventListener('click', removeProfilePhoto);

async function handleProfileFile(file){
  if(!file) return;
  const compressed = await compressToWebp(file, 800, 0.72);
  const id = newImageID('profile');
  await idbPutImage(id, compressed);
  document.getElementById('clientPhoto').value = `idb:${id}`;
  const prev = document.getElementById('clientPhotoPreview');
  prev.src = URL.createObjectURL(compressed);
  prev.style.display = 'block';
  const btn = document.getElementById('btnRemoveProfile');
  if(btn) btn.style.display = 'inline-block';
  toast('Profile photo saved locally','done');
}
async function handleGalleryFiles(files){
  const arr = Array.from(files || []);
  if(!arr.length) return;
  const ids = [];
  for(const f of arr){
    const compressed = await compressToWebp(f, 1024, 0.72);
    const id = newImageID('gallery');
    await idbPutImage(id, compressed);
    ids.push(`idb:${id}`);
  }
  const field = document.getElementById('clientGallery');
  const existing = (field.value || '').split(',').map(s=>s.trim()).filter(Boolean);
  field.value = [...existing, ...ids].join(', ');
  const wrap = document.getElementById('clientGalleryPreview');
  for(const tag of ids){
    const url = await createObjectURLFromID(tag.replace(/^idb:/,''));
    const cell = document.createElement('div');
    cell.style.cssText = 'position:relative;display:inline-block;';
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'width:68px;height:68px;object-fit:cover;border-radius:8px;';
    const delBtn = document.createElement('button');
    delBtn.textContent = '❌';
    delBtn.className = 'btn btn-danger';
    delBtn.style.cssText = 'position:absolute;top:-6px;right:-6px;font-size:.7rem;padding:2px 6px;border-radius:999px;';
    delBtn.addEventListener('click', ()=> removeGalleryImage(tag, cell));
    cell.appendChild(img);
    cell.appendChild(delBtn);
    wrap.appendChild(cell);
  }
  toast(`Added \( {ids.length} image \){ids.length===1?'':'s'} locally`,'done');
}
function removeGalleryImage(tag, wrapperEl){
  const field = document.getElementById('clientGallery');
  const ids = (field.value || '').split(',').map(s=>s.trim()).filter(Boolean);
  const updated = ids.filter(x => x !== tag);
  field.value = updated.join(', ');
  if(/^idb:/.test(tag)){
    const id = tag.replace(/^idb:/,'');
    idbDeleteImage(id).catch(()=>{});
  }
  if(wrapperEl){ wrapperEl.remove(); }
  toast('Photo removed','done');
}
async function removeProfilePhoto(){
  const field = document.getElementById('clientPhoto');
  const val = field.value.trim();
  if(/^idb:/.test(val)){
    const id = val.replace(/^idb:/,'');
    try { await idbDeleteImage(id); } catch(e){}
  }
  field.value = '';
  const prev = document.getElementById('clientPhotoPreview');
  prev.src = '';
  prev.style.display = 'none';
  const btn = document.getElementById('btnRemoveProfile');
  if(btn) btn.style.display = 'none';
  toast('Profile photo removed','done');
}
document.getElementById('clientPhotoFile_camera')?.addEventListener('change', e =>
  handleProfileFile(e.target.files?.[0])
);
document.getElementById('clientPhotoFile_upload')?.addEventListener('change', e =>
  handleProfileFile(e.target.files?.[0])
);
document.getElementById('clientGalleryFiles_camera')?.addEventListener('change', e =>
  handleGalleryFiles(e.target.files)
);
document.getElementById('clientGalleryFiles_upload')?.addEventListener('change', e =>
  handleGalleryFiles(e.target.files)
);

/******************************
 * Reorder per day
 ******************************/
function startReorder(day){ reorderDay=day; renderSchedule(); }
function finishReorder(){ reorderDay=null; renderSchedule(); }
function moveClient(day,id,dir){
  const key="order_"+day;
  let order=getJSON(key, []);
  if(!order.length){
    const clients=getJSON('clients', []).filter(c=>c.serviceDay===day && !c.paused);
    order=clients.map(c=>c.id);
  }
  const idx=order.indexOf(id);
  if(idx===-1) return;
  const swap=dir==="up"?idx-1:idx+1;
  if(swap<0||swap>=order.length) return;
  [order[idx],order[swap]]=[order[swap],order[idx]];
  setJSON(key,order);
  renderSchedule();
}

/******************************
 * ROUTE HELPERS
 ******************************/
function clientsInDisplayOrderForDay(day){
  const clients=getJSON('clients', []);
  const realTodayName=new Date().toLocaleDateString('en-US',{weekday:'long'});
  const cardISO = dateISOForNext(day);

  let native = clients.filter(c=>c.serviceDay===day && !c.paused);

  if(day===realTodayName){
    const tISO=todayISO();
    native = native.filter(c => (c.lastCut || '') !== tISO && !c.rescheduledFor);
  }

  const reschedForThisCard = clients.filter(c=>!c.paused && c.rescheduledFor===cardISO);

  const seen = new Set(native.map(c=>c.id));
  let combined = native.concat(reschedForThisCard.filter(c=>!seen.has(c.id)));

  const key="order_"+day;
  let order=getJSON(key, []);
  const nativeIds=native.map(c=>c.id);
  order = order.filter(id=>nativeIds.includes(id));
  nativeIds.forEach(id=>{ if(!order.includes(id)) order.push(id); });
  setJSON(key,order);

  const rank = id => nativeIds.includes(id) ? (order.indexOf(id) + 1) : 0;
  combined.sort((a,b)=> rank(a.id) - rank(b.id));
  return combined;
}

async function getUserOrigin() {
  if (!("geolocation" in navigator)) return "Current Location";
  return await new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve(`\( {pos.coords.latitude}, \){pos.coords.longitude}`),
      () => resolve("Current Location"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

async function openRouteMap(day){
  const combined = clientsInDisplayOrderForDay(day);
  const addrs = combined.map(c => (c.address||'').trim()).filter(Boolean);

  if(addrs.length < 1){
    toast('No client addresses for this day');
    return;
  }

  const MAX_STOPS = 25;
  const trimmed = addrs.slice(0, MAX_STOPS - 1);

  const origin = await getUserOrigin();
  const destination = trimmed[trimmed.length - 1] || trimmed[0];
  const waypoints = trimmed.slice(0, -1).join('|');

  const url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '') +
    `&travelmode=driving`;

  window.open(url, '_blank');
}

/******************************
 * Schedule rendering
 ******************************/
function renderSchedule(){
  const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const clients=getJSON('clients', []);

  const container=document.getElementById('scheduleDays'); container.innerHTML='';
  const realTodayName=new Date().toLocaleDateString('en-US',{weekday:'long'});
  const startIndex=days.indexOf(realTodayName);
  const orderedDays=days.slice(startIndex).concat(days.slice(0,startIndex));
  const tISO=todayISO();

  orderedDays.forEach(day=>{
    const dayCard=document.createElement('div');
    dayCard.className='day-card';
    if(day===realTodayName) dayCard.classList.add('today');

    const h2=document.createElement('h2');
    h2.textContent=day+" ";

    const toggleBtn=document.createElement('button');
    toggleBtn.textContent=(reorderDay===day)?"✅ Done":"🔀 Reorder";
    toggleBtn.className='btn btn-secondary';
    toggleBtn.addEventListener('click',()=>{ reorderDay===day?finishReorder():startReorder(day); });
    h2.appendChild(toggleBtn);

    const mapBtn=document.createElement('button');
    mapBtn.textContent='🗺️ Map';
    mapBtn.className='btn btn-primary';
    mapBtn.style.marginLeft='8px';
    mapBtn.addEventListener('click',()=>openRouteMap(day));
    h2.appendChild(mapBtn);

    dayCard.appendChild(h2);

    const cardISO = dateISOForNext(day);

    let native = clients.filter(c=>c.serviceDay===day && !c.paused);

    if(day===realTodayName){
      native = native.filter(c => (c.lastCut || '') !== tISO && !c.rescheduledFor);
    }

    const reschedForThisCard = clients.filter(c=>!c.paused && c.rescheduledFor===cardISO);

    const seen = new Set(native.map(c=>c.id));
    let combined = native.concat(reschedForThisCard.filter(c=>!seen.has(c.id)));

    const key="order_"+day;
    let order=getJSON(key, []);
    const nativeIds=native.map(c=>c.id);
    order = order.filter(id=>nativeIds.includes(id));
    nativeIds.forEach(id=>{ if(!order.includes(id)) order.push(id); });
    setJSON(key,order);

    const rank = id => nativeIds.includes(id) ? (order.indexOf(id) + 1) : 0;
    combined.sort((a,b)=> rank(a.id) - rank(b.id));

    if(combined.length){
      combined.forEach(c=>{
        const isReschedForThisCard = c.rescheduledFor===cardISO;
        const item=document.createElement('div');
        item.className='sched-client'; item.dataset.id=c.id;

        const top=document.createElement('div'); top.className='sched-header';
        const name=document.createElement('span'); name.className='sched-name';
        name.innerHTML = c.name + (isReschedForThisCard ? ' <span class="badge-resched">Rescheduled</span>' : '');
        top.appendChild(name);

        if(reorderDay===day && c.serviceDay===day){
          const arrows=document.createElement('span'); arrows.className='sched-arrows';
          const up=document.createElement('button'); up.textContent='⬆️'; up.addEventListener('click',()=>moveClient(day,c.id,'up'));
          const down=document.createElement('button'); down.textContent='⬇️'; down.addEventListener('click',()=>moveClient(day,c.id,'down'));
          arrows.appendChild(up); arrows.appendChild(down);
          top.appendChild(arrows);
        }
        item.appendChild(top);

        const pAddr=document.createElement('p');
        pAddr.innerHTML=`📍 <a href="https://maps.google.com/?q=\( {encodeURIComponent(c.address||'')}" target="_blank"> \){c.address||''}</a>`;
        item.appendChild(pAddr);

        const pPhone=document.createElement('p');
        pPhone.innerHTML=`📞 <a href="tel:\( {c.phone||''}">Call</a> | <a href="sms: \){c.phone||''}">Text</a>`;
        item.appendChild(pPhone);

        const pStatus=document.createElement('p'); pStatus.textContent=`Status: ${c.status||'-'}`; item.appendChild(pStatus);
        const pNotes=document.createElement('p'); pNotes.textContent=`📝 ${c.notes||''}`; item.appendChild(pNotes);

        const actions=document.createElement('div'); actions.className='sched-actions';

        const doneBtn=document.createElement('button');
        doneBtn.className='btn btn-primary';
        doneBtn.textContent='✅ Done';
        doneBtn.addEventListener('click',()=>{
          let all=getJSON('clients', []);
          const t=todayISO();
          all=all.map(x=>x.id===c.id?{...x,lastCut:t,rescheduledFor:(x.rescheduledFor===t?null:x.rescheduledFor)}:x);
          saveClients(all); renderSchedule();
          toast(`✅ Marked ${c.name} done`,"done");
        });
        actions.appendChild(doneBtn);

        if(day === realTodayName){
          const skipBtn=document.createElement('button');
          skipBtn.className='btn btn-secondary';
          skipBtn.textContent='⏭ Skip';
          skipBtn.addEventListener('click',()=>{
            if(confirm(`Skip ${c.name} to next workday? (Sun is skipped)`)){
              const next = nextWorkdayISO();
              let all=getJSON('clients', []);
              all=all.map(x=>x.id===c.id?{...x,rescheduledFor:next}:x);
              saveClients(all); renderSchedule();
              toast(`⏭ Skipped ${c.name} to ${next}`,"skip");
            }
          });
          actions.appendChild(skipBtn);
        }

        item.appendChild(actions);
        dayCard.appendChild(item);
      });
    } else {
      const empty=document.createElement('p'); empty.textContent='No jobs assigned';
      dayCard.appendChild(empty);
    }
    container.appendChild(dayCard);
  });
}

/******************************
 * Midnight auto-update + invoice autogen + overdue check
 ******************************/
function autoUpdateLastCut(){
  const tISO=todayISO();
  const todayName=new Date().toLocaleDateString('en-US',{weekday:'long'});
  let clients=getJSON('clients', []);

  clients = clients.map(c=>{
    if(c.paused) return c;
    if(c.rescheduledFor===tISO){
      return {...c,lastCut:tISO,rescheduledFor:null};
    }
    if(c.serviceDay===todayName && !c.rescheduledFor){
      return {...c,lastCut:tISO};
    }
    return c;
  });

  clients = clients.map(c=>{
    if(c.rescheduledFor && c.rescheduledFor <= tISO){ return {...c,rescheduledFor:null}; }
    return c;
  });

  saveClients(clients);
  renderSchedule();
  autoGenerateInvoicesIfNeeded();
  autoMarkOverdueIfNeeded();
}
function scheduleMidnightUpdate(){
  const now=new Date();
  const midnight=new Date(now);
  midnight.setHours(24,0,5,0);
  const ms=midnight.getTime()-now.getTime();
  setTimeout(()=>{ autoUpdateLastCut(); scheduleMidnightUpdate(); }, ms);
}
scheduleMidnightUpdate();

/******************************
 * Automation Settings
 ******************************/
function getAutomationSettings(){
  const def = { autoInvoiceEnabled:true, autogenDay:1, autoOverdueEnabled:true, overdueAfterDays:15 };
  const s = getJSON('automationSettings', def);
  return {
    autoInvoiceEnabled: !!s.autoInvoiceEnabled,
    autogenDay: Math.min(28, Math.max(1, Number(s.autogenDay || 1))),
    autoOverdueEnabled: !!s.autoOverdueEnabled,
    overdueAfterDays: Math.min(60, Math.max(1, Number(s.overdueAfterDays || 15)))
  };
}
function saveAutomationSettings(s){
  setJSON('automationSettings', {
    autoInvoiceEnabled: !!s.autoInvoiceEnabled,
    autogenDay: Math.min(28, Math.max(1, Number(s.autogenDay || 1))),
    autoOverdueEnabled: !!s.autoOverdueEnabled,
    overdueAfterDays: Math.min(60, Math.max(1, Number(s.overdueAfterDays || 15)))
  });
}
function renderAutomationSettings(){
  const sel = document.getElementById('autogenDay');
  if(sel && !sel.dataset.filled){
    for(let d=1; d<=28; d++){
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      sel.appendChild(opt);
    }
    sel.dataset.filled = '1';
  }

  const s = getAutomationSettings();
  const toggle = document.getElementById('autoInvoiceToggle');
  const daySel = document.getElementById('autogenDay');
  const overdueT = document.getElementById('autoOverdueToggle');
  const overdueN = document.getElementById('overdueDays');

  toggle.checked = s.autoInvoiceEnabled;
  daySel.value = String(s.autogenDay);
  overdueT.checked = s.autoOverdueEnabled;
  overdueN.value = String(s.overdueAfterDays);

  const summary = document.getElementById('autoSummary');
  if(summary){
    summary.textContent =
      `Autogen: ${s.autoInvoiceEnabled ? `ON (day ${s.autogenDay})` : 'OFF'} • `
      + `Auto-Overdue: \( {s.autoOverdueEnabled ? `ON ( \){s.overdueAfterDays} day${s.overdueAfterDays===1?'':'s'} after creation)` : 'OFF'}.`;
  }

  toggle.onchange = () => { saveAutomationSettings({ ...s, autoInvoiceEnabled: toggle.checked }); renderAutomationSettings(); toast('Automation saved','done'); };
  daySel.onchange = () => { saveAutomationSettings({ ...getAutomationSettings(), autogenDay: Number(daySel.value) }); renderAutomationSettings(); toast('Autogen day saved','done'); };
  overdueT.onchange = () => { saveAutomationSettings({ ...getAutomationSettings(), autoOverdueEnabled: overdueT.checked }); renderAutomationSettings(); toast('Overdue setting saved','done'); };
  overdueN.onchange = () => { saveAutomationSettings({ ...getAutomationSettings(), overdueAfterDays: Number(overdueN.value) }); renderAutomationSettings(); toast('Overdue days saved','done'); };
}
function runMonthlyAutogenNow(){
  const now = new Date();
  const currentMonth = monthKeyFromDate(now);
  ensureInvoiceForMonth(currentMonth);
  localStorage.setItem('lastInvoiceAutogenMonth', currentMonth);
  renderInvoices();
}
function runOverdueCheckNow(){
  autoMarkOverdueIfNeeded(true);
  renderInvoices();
}

/******************************
 * Invoices
 ******************************/
function getInvoices(){ return getJSON('invoices', []); }
function saveInvoices(inv){ setJSON('invoices', inv); }
function monthKeyFromInput(){
  const el = document.getElementById('invMonth');
  if(el && el.value) return el.value;
  return monthKeyFromDate(new Date());
}
function addDaysISO(iso, days){
  const d = new Date(iso);
  d.setDate(d.getDate()+Number(days||0));
  d.setHours(0,0,0,0);
  return d.toISOString();
}
function ensureInvoiceForMonth(monthKey){
  const clients = getJSON('clients', []).map(ensureClientShape)
    .filter(c => !c.paused && Number(c.rate)>0);

  const { overdueAfterDays } = getAutomationSettings();
  let invoices = getInvoices();
  let created = 0;

  clients.forEach(c=>{
    const exists = invoices.find(i => i.month===monthKey && i.clientId===c.id);
    if(exists) return;
    const createdAt = new Date().toISOString();
    invoices.push({
      id: crypto.randomUUID(),
      month: monthKey,
      clientId: c.id,
      clientName: c.name,
      rate: Number(c.rate),
      status: 'Pending',
      paid: false,
      createdAt,
      paidAt: null,
      dueAt: addDaysISO(createdAt, overdueAfterDays)
    });
    created++;
  });

  if(created>0){
    saveInvoices(invoices);
    toast(`Generated ${created} invoices`,'done');
  }
}
function autoGenerateInvoicesIfNeeded(){
  const settings = getAutomationSettings();
  if(!settings.autoInvoiceEnabled) return;

  const now = new Date();
  const currentMonth = monthKeyFromDate(now);
  const today = now.getDate();
  const autoday = Number(settings.autogenDay || 1);

  if(today < autoday) return;

  const markerKey = 'lastInvoiceAutogenMonth';
  const last = localStorage.getItem(markerKey);

  if(last !== currentMonth){
    ensureInvoiceForMonth(currentMonth);
    localStorage.setItem(markerKey, currentMonth);
    renderInvoices();
  }
}
function autoMarkOverdueIfNeeded(forceToast=false){
  const { autoOverdueEnabled, overdueAfterDays } = getAutomationSettings();
  if(!autoOverdueEnabled) return;

  let invoices = getInvoices();
  const now = new Date();

  let changed = 0;
  invoices = invoices.map(i=>{
    if(i.paid || i.status==='Paid') return i;

    const dueAtISO = i.dueAt || addDaysISO(i.createdAt || new Date().toISOString(), overdueAfterDays);
    const dueAt = new Date(dueAtISO);

    if(i.status!=='Overdue' && now >= dueAt){
      changed++;
      return { ...i, status:'Overdue', dueAt: dueAtISO };
    }
    if(!i.dueAt){ return { ...i, dueAt: dueAtISO }; }
    return i;
  });

  if(changed>0){
    saveInvoices(invoices);
    if(forceToast) toast(`Marked \( {changed} invoice \){changed===1?'':'s'} Overdue`,'done');
  } else {
    saveInvoices(invoices);
    if(forceToast) toast('No invoices became overdue');
  }
}
function generateInvoicesForSelected(){
  const key = monthKeyFromInput();
  ensureInvoiceForMonth(key);
  renderInvoices();
}
function markPaid(id){
  let invoices = getInvoices();
  invoices = invoices.map(i => i.id===id ? {...i, paid:true, status:'Paid', paidAt:new Date().toISOString()} : i);
  saveInvoices(invoices);
  toast('Marked paid','done');
  renderInvoices();
}
function markOverdue(id){
  let invoices = getInvoices();
  invoices = invoices.map(i => i.id===id ? {...i, status:'Overdue'} : i);
  saveInvoices(invoices);
  toast('Set overdue');
  renderInvoices();
}
function deleteInvoice(id){
  let invoices = getInvoices().filter(i => i.id !== id);
  saveInvoices(invoices);
  toast('Deleted');
  renderInvoices();
}
function clearUnpaidForMonth(){
  const key = monthKeyFromInput();
  let invoices = getInvoices().filter(i => !(i.month===key && !i.paid));
  saveInvoices(invoices);
  toast('Cleared unpaid this month');
  renderInvoices();
}

/******************************
 * Business Profile
 ******************************/
function defaultBusinessProfile(){
  return {
    name: "Freeman Lawn Services LLC",
    owner: "Neal David Carr",
    address: "1233 NW 37th Ave\nCape Coral, FL 33993",
    email: "FreemanLawnFL@gmail.com",
    phone: "239.265.5864",
    venmo: "@FreemanLawnFL",
    cashapp: "$FreemanLawnFL",
    zelle_name: "Neal David Carr",
    zelle_phone: "239.265.5864",
    zelle_email: "FreemanLawnFL@gmail.com"
  };
}
function getBusinessProfile(){ return getJSON('businessProfile', defaultBusinessProfile()); }
function saveBusinessProfile(){
  const p = {
    name: document.getElementById('bp_name').value.trim(),
    owner: document.getElementById('bp_owner').value.trim(),
    address: document.getElementById('bp_address').value.trim(),
    email: document.getElementById('bp_email').value.trim(),
    phone: document.getElementById('bp_phone').value.trim(),
    venmo: document.getElementById('bp_venmo').value.trim(),
    cashapp: document.getElementById('bp_cashapp').value.trim(),
    zelle_name: document.getElementById('bp_zelle_name').value.trim(),
    zelle_phone: document.getElementById('bp_zelle_phone').value.trim(),
    zelle_email: document.getElementById('bp_zelle_email').value.trim()
  };
  setJSON('businessProfile', p);
  toast('Business profile saved','done');
}
function renderBusinessProfile(){
  const p = getBusinessProfile();
  const set = (id, val)=>{ const el=document.getElementById(id); if(el && !el.value) el.value = val || ""; };
  set('bp_name', p.name);
  set('bp_owner', p.owner);
  set('bp_address', p.address);
  set('bp_email', p.email);
  set('bp_phone', p.phone);
  set('bp_venmo', p.venmo);
  set('bp_cashapp', p.cashapp);
  set('bp_zelle_name', p.zelle_name);
  set('bp_zelle_phone', p.zelle_phone);
  set('bp_zelle_email', p.zelle_email);
}

/******************************
 * Sharing helpers & Bulk
 ******************************/
function currentMonthKey()
