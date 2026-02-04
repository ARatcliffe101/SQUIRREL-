let API_BASE = localStorage.getItem('pv_api_base') || window.location.origin;
let accessToken = localStorage.getItem('pv_access') || null;
let refreshToken = localStorage.getItem('pv_refresh') || null;
let me = null;

const $ = (id) => document.getElementById(id);

function setStatus(text) { $('statusBadge').textContent = text; }
function setError(id, msg) { $(id).textContent = msg || ''; }
function getBase() { const custom = $('apiBase').value.trim(); return custom || API_BASE; }
function saveBase() { saveBase(); localStorage.setItem('pv_api_base', API_BASE); }


async function api(path, opts = {}) {
  const base = getBase();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(base + path, { ...opts, headers });

  if (res.status === 401 && refreshToken) {
    const rr = await fetch(base + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    if (rr.ok) {
      const data = await rr.json();
      accessToken = data.accessToken;
      localStorage.setItem('pv_access', accessToken);
      return api(path, opts);
    }
    logout();
  }

  if (!res.ok) {
    let j = null;
    try { j = await res.json(); } catch {}
    throw new Error(j?.error || `HTTP ${res.status}`);
  }

  const txt = await res.text();
  return txt ? JSON.parse(txt) : {};
}

async function login() {
  setError('loginError', '');
  try {
    saveBase();
    const email = $('email').value.trim();
    const password = $('password').value;
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    localStorage.setItem('pv_access', accessToken);
    localStorage.setItem('pv_refresh', refreshToken);
    await loadMe();
    await refreshAll();
  } catch (e) {
    setError('loginError', e.message);
  }
}

function logout() {
  accessToken = null;
  refreshToken = null;
  me = null;
  localStorage.removeItem('pv_access');
  localStorage.removeItem('pv_refresh');
  setStatus('Not logged in');
  $('usersList').innerHTML = '';
  $('catsList').innerHTML = '';
}

async function loadMe() {
  me = await api('/me').then(r => r.user);
  setStatus(`Logged in: ${me.email} (${me.role})`);
}

function userRow(u) {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `
    <div>
      <b>${u.email}</b>
      <div class="muted">role: ${u.role} • disabled: ${u.isDisabled}</div>
    </div>
    <div class="actions">
      <button class="secondary small" data-action="toggle">${u.isDisabled ? 'Enable' : 'Disable'}</button>
      <button class="danger small" data-action="delete">Delete</button>
    </div>
  `;
  div.querySelector('[data-action="toggle"]').onclick = async () => {
    setError('usersError', '');
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isDisabled: !u.isDisabled }) });
      await refreshUsers();
    } catch (e) { setError('usersError', e.message); }
  };
  div.querySelector('[data-action="delete"]').onclick = async () => {
    setError('usersError', '');
    if (!confirm(`Delete user ${u.email}? This will delete their entries.`)) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      await refreshUsers();
    } catch (e) { setError('usersError', e.message); }
  };
  return div;
}

function catRow(c, defaults) {
  const div = document.createElement('div');
  div.className = 'item';
  const sections = (c.sections || []).slice().sort((a,b)=> (a.sortOrder-b.sortOrder) || a.name.localeCompare(b.name));
  const isDefaultCat = defaults?.defaultCategoryId === c.id;

  div.innerHTML = `
    <div style="width: 100%;">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
        <div style="display:flex; gap:8px; align-items:center;">
          <b>${c.name}</b>
          ${isDefaultCat ? `<span class="pill">default</span>` : ``}
        </div>
        <span class="pill">${sections.length} sections</span>
      </div>

      <div class="actions" style="margin-top:10px;">
        <input data-field="catName" value="${c.name}" />
        <button class="secondary small" data-action="renameCat">Rename</button>
        <button class="secondary small" data-action="setDefaultCat">Set default</button>
        <button class="danger small" data-action="deleteCat">Delete</button>
      </div>

      <div class="muted" style="margin-top:10px; margin-bottom:6px;">Sections (tabs)</div>
      <div data-field="sections" class="list"></div>

      <div class="actions" style="margin-top:10px;">
        <input data-field="sectionName" placeholder="New section name" />
        <input data-field="sortOrder" placeholder="sortOrder" style="max-width:120px;" />
        <button class="secondary small" data-action="addSection">Add</button>
      </div>
      <div class="error" data-field="err"></div>
    </div>
  `;

  const errEl = div.querySelector('[data-field="err"]');
  const catName = div.querySelector('[data-field="catName"]');
  const sectionName = div.querySelector('[data-field="sectionName"]');
  const sortOrder = div.querySelector('[data-field="sortOrder"]');
  const sectionsEl = div.querySelector('[data-field="sections"]');

  function renderSections() {
    sectionsEl.innerHTML = '';
    sections.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'item';
      const isDefaultSec = defaults?.defaultSectionId === s.id;
      row.innerHTML = `
        <div style="width:100%;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <div style="display:flex; gap:8px; align-items:center;">
              <b>${s.name}</b>
              ${isDefaultSec ? `<span class="pill">default</span>` : ``}
              <span class="pill">order ${s.sortOrder}</span>
            </div>
            <div class="actions">
              <button class="secondary small" data-action="up">↑</button>
              <button class="secondary small" data-action="down">↓</button>
              <button class="secondary small" data-action="setDefaultSec">Default</button>
              <button class="danger small" data-action="deleteSec">Delete</button>
            </div>
          </div>

          <div class="actions" style="margin-top:8px;">
            <input data-field="secName" value="${s.name}" />
            <input data-field="secOrder" value="${s.sortOrder}" style="max-width:120px;" />
            <button class="secondary small" data-action="saveSec">Save</button>
          </div>
          <div class="error" data-field="secErr"></div>
        </div>
      `;
      const secErr = row.querySelector('[data-field="secErr"]');
      const secName = row.querySelector('[data-field="secName"]');
      const secOrder = row.querySelector('[data-field="secOrder"]');

      row.querySelector('[data-action="saveSec"]').onclick = async () => {
        secErr.textContent = '';
        try {
          await api(`/admin/sections/${s.id}`, { method: 'PATCH', body: JSON.stringify({ name: secName.value.trim(), sortOrder: Number(secOrder.value) }) });
          await refreshCategories();
        } catch (e) { secErr.textContent = e.message; }
      };

      row.querySelector('[data-action="deleteSec"]').onclick = async () => {
        secErr.textContent = '';
        if (!confirm(`Delete section "${s.name}"? Entries in it will have section cleared.`)) return;
        try {
          await api(`/admin/sections/${s.id}`, { method: 'DELETE' });
          if (defaults?.defaultSectionId === s.id) {
            await api(`/admin/settings`, { method: 'PATCH', body: JSON.stringify({ defaultSectionId: null }) });
          }
          await refreshCategories();
        } catch (e) { secErr.textContent = e.message; }
      };

      row.querySelector('[data-action="up"]').onclick = async () => {
        secErr.textContent = '';
        if (idx === 0) return;
        try {
          const prev = sections[idx-1];
          await api(`/admin/sections/${s.id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: prev.sortOrder }) });
          await api(`/admin/sections/${prev.id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: s.sortOrder }) });
          await refreshCategories();
        } catch (e) { secErr.textContent = e.message; }
      };

      row.querySelector('[data-action="down"]').onclick = async () => {
        secErr.textContent = '';
        if (idx === sections.length-1) return;
        try {
          const next = sections[idx+1];
          await api(`/admin/sections/${s.id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: next.sortOrder }) });
          await api(`/admin/sections/${next.id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: s.sortOrder }) });
          await refreshCategories();
        } catch (e) { secErr.textContent = e.message; }
      };

      row.querySelector('[data-action="setDefaultSec"]').onclick = async () => {
        secErr.textContent = '';
        try {
          await api(`/admin/settings`, { method: 'PATCH', body: JSON.stringify({ defaultCategoryId: c.id, defaultSectionId: s.id }) });
          await refreshCategories();
        } catch (e) { secErr.textContent = e.message; }
      };

      sectionsEl.appendChild(row);
    });
  }

  renderSections();

  div.querySelector('[data-action="renameCat"]').onclick = async () => {
    errEl.textContent = '';
    try {
      const name = catName.value.trim();
      await api(`/admin/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      await refreshCategories();
    } catch (e) { errEl.textContent = e.message; }
  };

  div.querySelector('[data-action="setDefaultCat"]').onclick = async () => {
    errEl.textContent = '';
    try {
      await api(`/admin/settings`, { method: 'PATCH', body: JSON.stringify({ defaultCategoryId: c.id, defaultSectionId: null }) });
      await refreshCategories();
    } catch (e) { errEl.textContent = e.message; }
  };

  div.querySelector('[data-action="addSection"]').onclick = async () => {
    errEl.textContent = '';
    try {
      const name = sectionName.value.trim();
      const so = Number(sortOrder.value || 0);
      await api(`/admin/categories/${c.id}/sections`, { method: 'POST', body: JSON.stringify({ name, sortOrder: so }) });
      await refreshCategories();
      sectionName.value = '';
      sortOrder.value = '';
    } catch (e) { errEl.textContent = e.message; }
  };

  div.querySelector('[data-action="deleteCat"]').onclick = async () => {
    errEl.textContent = '';
    if (!confirm(`Delete category "${c.name}"? Sections will be removed.`)) return;
    try {
      await api(`/admin/categories/${c.id}`, { method: 'DELETE' });
      if (defaults?.defaultCategoryId === c.id) {
        await api(`/admin/settings`, { method: 'PATCH', body: JSON.stringify({ defaultCategoryId: null, defaultSectionId: null }) });
      }
      await refreshCategories();
    } catch (e) { errEl.textContent = e.message; }
  };

  return div;
}

async function refreshUsers() {
  setError('usersError', '');
  try {
    const data = await api('/admin/users');
    const list = $('usersList');
    list.innerHTML = '';
    data.users.forEach(u => list.appendChild(userRow(u)));
  } catch (e) { setError('usersError', e.message); }
}

async function refreshCategories() {
  setError('catsError', '');
  try {
    const settings = await api('/admin/settings');
    const data = await api('/admin/categories');
    const list = $('catsList');
    list.innerHTML = '';
    data.categories.forEach(c => list.appendChild(catRow(c, settings.settings)));
  } catch (e) { setError('catsError', e.message); }
}

async function refreshAll() { await refreshUsers(); await refreshCategories(); }

async function createUser() {
  setError('usersError', '');
  try {
    const email = $('newUserEmail').value.trim();
    const password = $('newUserPassword').value;
    const role = $('newUserRole').value;
    await api('/admin/users', { method: 'POST', body: JSON.stringify({ email, password, role }) });
    $('newUserEmail').value = '';
    $('newUserPassword').value = '';
    await refreshUsers();
  } catch (e) { setError('usersError', e.message); }
}

async function createCategory() {
  setError('catsError', '');
  try {
    const name = $('newCategoryName').value.trim();
    await api('/admin/categories', { method: 'POST', body: JSON.stringify({ name }) });
    $('newCategoryName').value = '';
    await refreshCategories();
  } catch (e) { setError('catsError', e.message); }
}

$('loginBtn').onclick = login;
$('logoutBtn').onclick = logout;
async function testConnection() {
  try {
    saveBase();
    const base = getBase();
    const h = await fetch(base + '/health');
    if (!h.ok) throw new Error('Health check failed');
    const c = await fetch(base + '/config');
    const cfg = c.ok ? await c.json() : null;
    const msg = cfg ? (`Connected • v${cfg.appVersion} • ${cfg.environment} • ${cfg.dbType}${cfg.dbPath ? ' • ' + cfg.dbPath : ''}`) : 'Connected';
    setStatus(msg);
  } catch (e) {
    setStatus('Not connected');
    setError('loginError', e.message);
  }
}

$('refreshBtn').onclick = refreshAll;
$('testBtn').onclick = testConnection;
$('saveBaseBtn').onclick = () => { saveBase(); testConnection(); };
$('createUserBtn').onclick = createUser;
$('createCategoryBtn').onclick = createCategory;
$('purgeBtn').onclick = async () => {
  setError('catsError','');
  try { await api('/admin/retention/purge', { method: 'POST', body: JSON.stringify({}) }); alert('Retention purge complete.'); }
  catch(e){ setError('catsError', e.message); }
};

(async function init() {
  $('apiBase').value = API_BASE;
  $('email').value = 'admin@example.com';
  $('password').value = 'admin1234';

  if (accessToken) {
    try { await loadMe(); await refreshAll(); }
    catch { logout(); }
  }
})();
