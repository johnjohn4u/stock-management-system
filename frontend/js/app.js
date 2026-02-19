const toast = document.getElementById('toast');
function showToast(msg, ok = true) {
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = ok ? '#e7f7eb' : '#fde0e0';
  toast.style.color = ok ? '#1a7a4e' : '#c45555';
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 2400);
}

function validatePasswordStrength(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include at least one special character.';
  return null;
}

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

// state
let currentUser = null;
let itemsCache = [];
let activityCache = [];

async function init() {
  try {
    const me = await api('/api/auth/me');
    currentUser = me.user;
    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) {
      const name = currentUser.name || '';
      let first = name;
      if (name.includes(',')) {
        const parts = name.split(',');
        const after = (parts[1] || '').trim();
        first = after.split(' ')[0] || after || parts[0].trim();
      } else {
        first = name.split(' ')[0] || name;
      }
      welcomeName.textContent = first || currentUser.username;
    }
    const setUserId = document.getElementById('setUserId');
    if (setUserId) setUserId.value = currentUser.user_id;
    const setName = document.getElementById('setName');
    if (setName) setName.value = currentUser.name;
    const setUsername = document.getElementById('setUsername');
    if (setUsername) setUsername.value = currentUser.username;
    const setEmail = document.getElementById('setEmail');
    if (setEmail) setEmail.value = currentUser.email;
  } catch (err) {
    window.location.href = '/index.html';
    return;
  }

  wireNav();
  if (document.getElementById('homeStats')) loadHome();
  if (document.getElementById('itemsTable')) loadInventory();
  if (document.getElementById('activityTable')) loadActivity();
  if (document.getElementById('analyticsTop')) loadAnalytics();
}

function wireNav() {
  const logout = document.getElementById('logoutBtn');
  if (logout) logout.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/index.html';
  });
}

async function loadHome() {
  const summary = await api('/api/analytics/summary');
  const activity = await api('/api/activity?limit=20');
  activityCache = activity.activity.filter(a => !['LOGIN', 'LOGOUT', 'REGISTER'].includes(a.action_type));
  const cards = [
    { title: 'Total Items', value: summary.total_items, sub: 'Total pairs in system', icon: 'fa-box', cls: 'stat-orange' },
    { title: 'In Stock', value: summary.in_stock, sub: 'Ready to sell', icon: 'fa-chart-line', cls: 'stat-green' },
    { title: 'Waiting Stock', value: summary.waiting_stock, sub: 'Needs attention', icon: 'fa-triangle-exclamation', cls: 'stat-yellow' },
    { title: 'Activity', value: activityCache.length || 0, sub: 'Recent actions', icon: 'fa-wave-square', cls: 'stat-brown' }
  ];
  const homeStats = document.getElementById('homeStats');
  if (!homeStats) return;
  homeStats.innerHTML = cards.map(c => `
    <div class="card stat-card ${c.cls}">
      <div class="stat-title">${c.title}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-sub">${c.sub}</div>
      <div class="stat-icon"><i class="fa ${c.icon}"></i></div>
      <div class="stat-bar"><span style="width: 100%"></span></div>
    </div>
  `).join('');
  const recent = document.getElementById('recentActivity');
  if (!recent) return;
  recent.innerHTML = activityCache.slice(0, 5).map(a => `
    <div class="recent-item">
      <div class="recent-left">
        <span class="recent-dot"></span>
        <span>${a.item_display || formatActionLabel(a.action_type)}</span>
      </div>
      <div class="recent-meta">
        <span class="${recentPillClass(a.action_type)}">${formatActionLabel(a.action_type)}</span>
        <span>Qty: ${a.quantity || 1}</span>
        <span>${new Date(a.timestamp).toLocaleString()}</span>
      </div>
    </div>
  `).join('') || '<p>No recent activity</p>';

  renderHomeCharts(summary, activityCache);
}

function renderItemsTable(data) {
  const tbody = document.getElementById('itemsTable');
  if (!tbody) return;
  const editMode = document.getElementById('editToggle').dataset.mode === 'edit';
  tbody.innerHTML = data.map(item => `
    <tr>
      <td><div style="font-weight:700;">${item.item_name}</div><div style="color:#8a7c73; font-size:13px;">SKU: ${item.sku}</div></td>
      <td>${item.colorway}</td>
      <td style="font-weight:700;">${item.qty_available}</td>
      <td>${item.last_movement_type ? `${friendlyMove(item.last_movement_type)} • ${item.last_movement_at ? item.last_movement_at.substring(0,10) : ''}` : '—'}</td>
      <td><span class="status-pill ${item.status === 'IN_STOCK' ? 'status-instock' : 'status-wait'}">${item.status === 'IN_STOCK' ? 'In Stock' : 'Waiting Stock'}</span></td>
      <td>
        ${editMode ? `<button class="trash-btn" data-del="${item.item_id}" title="Delete"><i class="fa fa-trash"></i></button>` : ''}
        <button class="trash-btn" data-edit-item="${item.item_id}" title="Edit Item"><i class="fa fa-pen"></i></button>
        <button class="action-btn" data-details="${item.item_id}">Details</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-details]').forEach(btn => btn.addEventListener('click', () => openDetails(btn.dataset.details)));
  tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => deleteItem(btn.dataset.del)));
  tbody.querySelectorAll('[data-edit-item]').forEach(btn => btn.addEventListener('click', () => openEditItem(btn.dataset.editItem)));
}

function friendlyMove(code) {
  switch (code) {
    case 'STOCK_IN': return 'Stock In';
    case 'SOLD': return 'Sold';
    case 'STOCK_OUT': return 'Stock Out';
    case 'EDITED': return 'Edited';
    case 'CREATED': return 'Created';
    default: return code || '';
  }
}

async function loadInventory() {
  const resp = await api('/api/items');
  itemsCache = resp.items;
  renderItemsTable(itemsCache);
}

async function loadActivity() {
  const resp = await api('/api/activity');
  const tbody = document.getElementById('activityTable');
  if (!tbody) return;
  const filtered = resp.activity.filter(a => !['LOGIN', 'LOGOUT', 'REGISTER'].includes(a.action_type));
  tbody.innerHTML = filtered.map(a => `
    <tr>
      <td>${new Date(a.timestamp).toLocaleString()}</td>
      <td>${a.item_display || ''}</td>
      <td><span class="status-pill ${actionPillClass(a.action_type)}">${formatActionLabel(a.action_type)}</span></td>
      <td>${a.quantity || ''}</td>
      <td>${a.sold_price ? formatPeso(a.sold_price) : ''}</td>
    </tr>
  `).join('');
}

function actionPillClass(action) {
  if (action === 'ADD_ITEM') return 'status-add';
  if (action === 'STOCK_IN') return 'status-stockin';
  if (action === 'MARK_SOLD' || action === 'SOLD') return 'status-sold';
  if (action === 'EDIT_ITEM' || action === 'EDIT_PAIR') return 'status-edit';
  if (action === 'DELETE_ITEM' || action === 'DELETE_PAIR') return 'status-delete';
  return 'status-sold';
}

function formatPeso(val) {
  const num = Number(val || 0);
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

function formatActionLabel(action) {
  return (action || '')
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function recentPillClass(action) {
  if (action === 'MARK_SOLD' || action === 'SOLD') return 'pill-mark-sold';
  if (action === 'STOCK_IN') return 'pill-stockin';
  if (action === 'ADD_ITEM') return 'pill-add';
  if (action === 'EDIT_ITEM' || action === 'EDIT_PAIR') return 'pill-edit';
  if (action === 'DELETE_ITEM' || action === 'DELETE_PAIR') return 'pill-delete';
  return 'pill-sold';
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = itemsCache.filter(i =>
      [i.item_name, i.sku, i.colorway, i.brand_name].some(f => (f || '').toLowerCase().includes(term))
    );
    renderItemsTable(filtered);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const inv = document.getElementById('inventoryList');
    const log = document.getElementById('activityLog');
    if (!inv || !log) return;
    if (btn.dataset.tab === 'inventoryList') {
      inv.style.display = 'block';
      log.style.display = 'none';
    } else {
      inv.style.display = 'none';
      log.style.display = 'block';
    }
  });
});

const editToggle = document.getElementById('editToggle');
if (editToggle) {
  editToggle.addEventListener('click', (e) => {
    const current = e.target.dataset.mode === 'edit';
    e.target.dataset.mode = current ? 'view' : 'edit';
    e.target.textContent = current ? 'EDIT' : 'DONE';
    renderItemsTable(itemsCache);
  });
}

async function deleteItem(id) {
  if (!confirm('Are you sure you want to delete this item?')) return;
  await api(`/api/items/${id}`, { method: 'DELETE' });
  showToast('Item deleted');
  closeModal();
  await loadInventory();
  await loadActivity();
}

// Add item modal
const addItemBtn = document.getElementById('addItemBtn');
if (addItemBtn) {
  addItemBtn.addEventListener('click', () => {
    openModal(renderAddItemForm());
  });
}

const editItemBtn = document.getElementById('editItemBtn');
if (editItemBtn) {
  editItemBtn.addEventListener('click', () => {
    openModal(renderEditItemPicker());
    const picker = document.getElementById('pickEditItemId');
    const openBtn = document.getElementById('openEditItemBtn');
    if (openBtn) {
      openBtn.onclick = () => {
        const itemId = picker.value;
        if (!itemId) return showToast('Select an item to edit', false);
        openEditItem(itemId);
      };
    }
  });
}

function renderAddItemForm() {
  return `
    <div class="modal-header">
      <h2>Add New Item</h2>
      <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="form-grid">
      <div class="form-group"><label>Item Name *</label><input class="input" id="aiName" placeholder="e.g. Nike Dunk Low"></div>
      <div class="form-group"><label>SKU / Style Code *</label><input class="input" id="aiSku" placeholder="e.g. DD1391-100"></div>
      <div class="form-group"><label>Colorway *</label><input class="input" id="aiColor" placeholder="e.g. Orange Paisley"></div>
      <div class="form-group"><label>Brand</label>
        <select class="input" id="aiBrand">
          <option value="">-- Select Brand --</option>
          <option value="1">Nike</option>
          <option value="2">Adidas</option>
          <option value="3">Puma</option>
          <option value="4">New Balance</option>
          <option value="5">Others</option>
        </select>
      </div>
      <div class="form-group"><label>Target Quantity *</label><input class="input" id="aiTarget" type="number" value="10"></div>
    </div>
    <div class="form-group" style="margin-top:12px;">
      <label>Edit Existing Item</label>
      <div style="display:flex; gap:10px; align-items:center;">
        <select class="input" id="aiEditItemSelect" ${itemsCache.length ? '' : 'disabled'}>
          ${itemsCache.length ? itemsCache.map(item => `<option value="${item.item_id}">${item.item_name} | ${item.sku}</option>`).join('') : '<option value="">No items available</option>'}
        </select>
        <button class="outlined-btn" id="aiEditItemBtn" ${itemsCache.length ? '' : 'disabled'}>
          <i class="fa fa-pen"></i> Edit Item
        </button>
      </div>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
      <button class="secondary-btn" onclick="closeModal()">Cancel</button>
      <button class="solid-btn" id="saveItemBtn">Create Item</button>
    </div>
  `;
}

function renderEditItemPicker() {
  return `
    <div class="modal-header">
      <h2>Select Item to Edit</h2>
      <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="form-group">
      <label>Item *</label>
      <select class="input" id="pickEditItemId">
        <option value="">-- Select Item --</option>
        ${itemsCache.map(item => `<option value="${item.item_id}">${item.item_name} | ${item.sku}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
      <button class="secondary-btn" onclick="closeModal()">Cancel</button>
      <button class="solid-btn" id="openEditItemBtn">Edit</button>
    </div>
  `;
}

async function submitAddItem() {
  const item_name = document.getElementById('aiName').value.trim();
  const sku = document.getElementById('aiSku').value.trim();
  const colorway = document.getElementById('aiColor').value.trim();
  const brand_id = document.getElementById('aiBrand').value;
  const target_qty = Number(document.getElementById('aiTarget').value || 0);
  try {
    await api('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name, sku, colorway, brand_id, target_qty })
    });
    showToast('Item created');
    closeModal();
    await loadInventory();
    await loadActivity();
  } catch (err) {
    showToast(err.message, false);
  }
}

function openModal(content) {
  const modal = document.getElementById('genericModal');
  if (!modal) return;
  modal.innerHTML = content;
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.style.display = 'flex';
  const saveBtn = document.getElementById('saveItemBtn');
  if (saveBtn) saveBtn.onclick = submitAddItem;
  const editBtn = document.getElementById('aiEditItemBtn');
  if (editBtn) {
    editBtn.onclick = () => {
      const select = document.getElementById('aiEditItemSelect');
      const itemId = select ? select.value : '';
      if (!itemId) return showToast('Select an item to edit', false);
      openEditItem(itemId);
    };
  }
}
function closeModal() {
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.style.display = 'none';
  const modal = document.getElementById('genericModal');
  if (modal) modal.innerHTML = '';
}
window.closeModal = closeModal;

async function openDetails(itemId) {
  const item = itemsCache.find(i => i.item_id == itemId);
  const pairsResp = await api(`/api/pairs/item/${itemId}`);
  const pairs = pairsResp.pairs;
  const header = `
    <div class="modal-header">
      <h2>Item Details</h2>
      <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div style="display:flex; justify-content:space-between; gap:20px; flex-wrap:wrap;">
      <div>
        <div><strong>Item Name:</strong> ${item.item_name}</div>
        <div><strong>Colorway:</strong> ${item.colorway}</div>
        <div><strong>Condition:</strong> Brand New</div>
        <div><strong>Qty (Available):</strong> ${item.qty_available}</div>
      </div>
      <div>
        <div><strong>SKU / Style Code:</strong> ${item.sku}</div>
        <div><strong>Brand:</strong> ${item.brand_name}</div>
        <div><strong>Status:</strong> <span class="status-pill ${item.status==='IN_STOCK'?'status-instock':'status-wait'}">${item.status==='IN_STOCK'?'In Stock':'Waiting Stock'}</span></div>
        <div><strong>Total Sold:</strong> ${item.qty_sold}</div>
      </div>
    </div>
    <div style="display:flex; gap:10px; margin:12px 0;">
      <button class="solid-btn" id="stockInBtn">+ Stock In</button>
      <button class="outlined-btn" id="editItemFromDetailsBtn"><i class="fa fa-pen"></i> Edit Item</button>
      <button class="trash-btn" id="deleteItemFromDetailsBtn" title="Delete Item"><i class="fa fa-trash"></i></button>
    </div>
    <h4>Pairs under SKU: ${item.sku}</h4>
    <div class="table-wrap" style="max-height:320px; overflow:auto;">
      <table>
        <thead><tr><th>Pair ID</th><th>Size</th><th>Condition</th><th>Cost Price</th><th>Selling Price</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${pairs.map(p => `
            <tr>
              <td>${p.pair_code}</td>
              <td>${p.us_size}</td>
              <td>${p.pair_condition}</td>
              <td>${formatPeso(p.cost_price)}</td>
              <td>${formatPeso(p.selling_price)}</td>
              <td><span class="status-pill ${p.status==='AVAILABLE'?'status-available':'status-sold'}">${p.status==='AVAILABLE'?'Available':'Sold'}</span></td>
              <td>
                ${p.status==='AVAILABLE' ? `
                  <button class="trash-btn" data-edit-pair="${p.pair_id}" title="Edit"><i class="fa fa-pen"></i></button>
                  <button class="trash-btn" data-del-pair="${p.pair_id}" title="Delete"><i class="fa fa-trash"></i></button>
                  <button class="action-btn" data-sell="${p.pair_id}">Mark Sold</button>
                ` : `
                  <button class="trash-btn" data-del-pair="${p.pair_id}" title="Delete"><i class="fa fa-trash"></i></button>
                  <span class="sold-date">Sold on ${p.sold_at ? p.sold_at.substring(0,10) : ''}</span>
                `}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  openModal(header);
  document.getElementById('stockInBtn').onclick = () => renderStockInForm(itemId);
  document.getElementById('editItemFromDetailsBtn').onclick = () => openEditItem(itemId);
  document.getElementById('deleteItemFromDetailsBtn').onclick = () => deleteItem(itemId);
  document.querySelectorAll('[data-sell]').forEach(btn => {
    btn.onclick = () => markSold(btn.dataset.sell, itemId);
  });
  document.querySelectorAll('[data-edit-pair]').forEach(btn => {
    btn.onclick = () => openEditPair(btn.dataset.editPair, pairs.find(p => p.pair_id == btn.dataset.editPair));
  });
  document.querySelectorAll('[data-del-pair]').forEach(btn => {
    btn.onclick = () => deletePair(btn.dataset.delPair, itemId);
  });
}

async function renderStockInForm(itemId) {
  const pairsResp = await api(`/api/pairs/item/${itemId}`);
  const availablePairs = pairsResp.pairs.filter(p => p.status === 'AVAILABLE');
  const form = `
    <div class="modal-header">
      <h3>Stock In New Pair</h3>
      <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="form-grid">
      <div class="form-group"><label>US Size *</label><input class="input" id="siSize" placeholder="e.g. 7M, 5F"></div>
      <div class="form-group"><label>Condition *</label>
        <select class="input" id="siCondition">
          <option>New</option>
          <option>Like New</option>
          <option>Good</option>
          <option>Fair</option>
        </select>
      </div>
      <div class="form-group"><label>Cost Price (Php) *</label><input class="input" id="siCost" type="number"></div>
      <div class="form-group"><label>Selling Price (Php) *</label><input class="input" id="siSell" type="number"></div>
    </div>
    <div class="form-group" style="margin-top:12px;">
      <label>Edit Existing Pair</label>
      <div style="display:flex; gap:10px; align-items:center;">
        <select class="input" id="siEditPairSelect" ${availablePairs.length ? '' : 'disabled'}>
          ${availablePairs.length ? availablePairs.map(p => `
            <option value="${p.pair_id}">${p.pair_code} • ${p.us_size} • ${formatPeso(p.cost_price)} / ${formatPeso(p.selling_price)}</option>
          `).join('') : '<option value="">No available pairs</option>'}
        </select>
        <button class="outlined-btn" id="openStockInEditBtn" ${availablePairs.length ? '' : 'disabled'}>
          <i class="fa fa-pen"></i> Edit Pair
        </button>
      </div>
    </div>
    <div style="display:flex; gap:10px; margin-top:14px;">
      <button class="solid-btn" id="savePairBtn">Save Pair</button>
      <button class="secondary-btn" onclick="closeModal()">Cancel</button>
    </div>
  `;
  openModal(form);
  document.getElementById('openStockInEditBtn').onclick = async () => {
    const select = document.getElementById('siEditPairSelect');
    const pairId = select ? select.value : '';
    const pair = availablePairs.find(p => String(p.pair_id) === String(pairId));
    if (!pair) return showToast('Select a pair to edit', false);
    openEditPair(pair.pair_id, pair);
  };
  document.getElementById('savePairBtn').onclick = async () => {
    try {
      await api(`/api/pairs/item/${itemId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          us_size: document.getElementById('siSize').value,
          pair_condition: document.getElementById('siCondition').value,
          cost_price: Number(document.getElementById('siCost').value),
          selling_price: Number(document.getElementById('siSell').value)
        })
      });
      showToast('Pair added');
      closeModal();
      await loadInventory();
      await loadActivity();
    } catch (err) {
      showToast(err.message, false);
    }
  };
}

async function openEditPair(pairId, pair) {
  const form = `
    <div class="modal-header">
      <h3>Edit Pair Details</h3>
      <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="form-grid">
      <div class="form-group"><label>Pair ID</label><input class="input" value="${pair.pair_code}" disabled></div>
      <div class="form-group"><label>US Size *</label><input class="input" id="epSize" value="${pair.us_size}"></div>
      <div class="form-group"><label>Condition *</label>
        <select class="input" id="epCondition">
          <option ${pair.pair_condition==='New'?'selected':''}>New</option>
          <option ${pair.pair_condition==='Like New'?'selected':''}>Like New</option>
          <option ${pair.pair_condition==='Good'?'selected':''}>Good</option>
          <option ${pair.pair_condition==='Fair'?'selected':''}>Fair</option>
        </select>
      </div>
      <div class="form-group"><label>Cost Price (Php) *</label><input class="input" id="epCost" value="${pair.cost_price}"></div>
      <div class="form-group"><label>Selling Price (Php) *</label><input class="input" id="epSell" value="${pair.selling_price}"></div>
    </div>
    <div style="display:flex; gap:10px; margin-top:14px;">
      <button class="solid-btn" id="saveEditPairBtn">Save Changes</button>
      <button class="secondary-btn" onclick="closeModal()">Cancel</button>
    </div>
  `;
  openModal(form);
  document.getElementById('saveEditPairBtn').onclick = async () => {
    try {
      await api(`/api/pairs/${pairId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          us_size: document.getElementById('epSize').value,
          pair_condition: document.getElementById('epCondition').value,
          cost_price: Number(document.getElementById('epCost').value),
          selling_price: Number(document.getElementById('epSell').value)
        })
      });
      showToast('Pair updated');
      closeModal();
      await loadInventory();
      await loadActivity();
    } catch (err) {
      showToast(err.message, false);
    }
  };
}

async function deletePair(pairId, itemId) {
  if (!confirm('Are you sure you want to delete this pair?')) return;
  try {
    await api(`/api/pairs/${pairId}`, { method: 'DELETE' });
    showToast('Pair deleted');
    await loadInventory();
    await loadActivity();
    await openDetails(itemId);
  } catch (err) {
    showToast(err.message, false);
  }
}

function renderEditItemForm(item) {
  return `
    <div class="modal-header">
      <h2>Edit Item</h2>
      <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="form-grid">
      <div class="form-group"><label>Item Name *</label><input class="input" id="eiName" value="${item.item_name || ''}"></div>
      <div class="form-group"><label>SKU / Style Code</label><input class="input" value="${item.sku || ''}" disabled></div>
      <div class="form-group"><label>Colorway *</label><input class="input" id="eiColor" value="${item.colorway || ''}"></div>
      <div class="form-group"><label>Brand</label>
        <select class="input" id="eiBrand">
          <option value="1" ${String(item.brand_id) === '1' ? 'selected' : ''}>Nike</option>
          <option value="2" ${String(item.brand_id) === '2' ? 'selected' : ''}>Adidas</option>
          <option value="3" ${String(item.brand_id) === '3' ? 'selected' : ''}>Puma</option>
          <option value="4" ${String(item.brand_id) === '4' ? 'selected' : ''}>New Balance</option>
          <option value="5" ${String(item.brand_id) === '5' ? 'selected' : ''}>Others</option>
        </select>
      </div>
      <div class="form-group"><label>Target Quantity *</label><input class="input" id="eiTarget" type="number" value="${item.target_qty || 1}"></div>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
      <button class="secondary-btn" onclick="closeModal()">Cancel</button>
      <button class="solid-btn" id="saveEditItemBtn">Save Changes</button>
    </div>
  `;
}

async function openEditItem(itemId) {
  const item = itemsCache.find(i => i.item_id == itemId);
  if (!item) return;
  openModal(renderEditItemForm(item));
  document.getElementById('saveEditItemBtn').onclick = async () => {
    try {
      await api(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: document.getElementById('eiName').value.trim(),
          colorway: document.getElementById('eiColor').value.trim(),
          brand_id: Number(document.getElementById('eiBrand').value),
          target_qty: Number(document.getElementById('eiTarget').value || 0)
        })
      });
      showToast('Item updated');
      closeModal();
      await loadInventory();
      await loadActivity();
    } catch (err) {
      showToast(err.message, false);
    }
  };
}

async function markSold(pairId, itemId) {
  if (!confirm('Mark this pair as sold?')) return;
  try {
    await api(`/api/pairs/${pairId}/mark-sold`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    showToast('Pair marked as sold');
    closeModal();
    loadInventory();
    loadActivity();
  } catch (err) {
    showToast(err.message, false);
  }
}

const downloadCsv = document.getElementById('downloadCsv');
if (downloadCsv) {
  downloadCsv.addEventListener('click', () => {
    const rows = [['Item Name','SKU','Brand','Colorway','Qty','Status','Last Movement']];
    itemsCache.forEach(i => rows.push([
      i.item_name, i.sku, i.brand_name, i.colorway, i.qty_available,
      i.status, friendlyMove(i.last_movement_type)+' '+(i.last_movement_at || '')
    ]));
    const csv = rows.map(r => r.map(val => `"${val}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory.csv'; a.click();
    URL.revokeObjectURL(url);
  });
}

// Settings
const saveProfileBtn = document.getElementById('saveProfileBtn');
if (saveProfileBtn) {
  saveProfileBtn.addEventListener('click', async () => {
    try {
      const name = document.getElementById('setName').value.trim();
      const username = document.getElementById('setUsername').value.trim();
      const email = document.getElementById('setEmail').value.trim();
      await api('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, email })
      });
      showToast('Profile updated successfully');
    } catch (err) { showToast(err.message, false); }
  });
}
const savePassBtn = document.getElementById('savePassBtn');
if (savePassBtn) {
  savePassBtn.addEventListener('click', async () => {
    const currentPassword = document.getElementById('curPass').value;
    const newPassword = document.getElementById('newPass').value;
    const newPassword2 = document.getElementById('newPass2').value;
    if (newPassword !== newPassword2) return showToast('Passwords do not match', false);
    if (!newPassword) return showToast('Enter new password', false);
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) return showToast(passwordError, false);
    try {
      await api('/api/settings/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      showToast('Password changed successfully');
      document.getElementById('curPass').value = '';
      document.getElementById('newPass').value = '';
      document.getElementById('newPass2').value = '';
    } catch (err) { showToast(err.message, false); }
  });
}

function renderHomeCharts(summary, activity) {
  const salesTrend = document.getElementById('homeSalesTrend');
  if (salesTrend) {
    const data = activity.reduce((acc, a) => {
      const d = new Date(a.timestamp).toISOString().substring(0, 10);
      if (!acc[d]) acc[d] = { sold: 0 };
      if (a.action_type === 'MARK_SOLD' || a.action_type === 'SOLD') acc[d].sold += 1;
      return acc;
    }, {});
    const labels = Object.keys(data).slice(-7);
    const values = labels.map(l => data[l].sold);
    new Chart(salesTrend, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Sold', data: values, borderColor: '#c65b3d', backgroundColor: 'rgba(198,91,61,0.2)', tension: 0.35, pointRadius: 4 }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#efe5dd' }, ticks: { color: '#8a7c73' } },
          y: { grid: { color: '#efe5dd' }, ticks: { color: '#8a7c73' }, beginAtZero: true }
        }
      }
    });
  }

  const brandDist = document.getElementById('homeBrandDist');
  if (brandDist) {
    api('/api/analytics/charts').then(charts => {
      new Chart(brandDist, {
        type: 'bar',
        data: {
          labels: charts.brands.map(b => b.brand_name),
          datasets: [{ data: charts.brands.map(b => b.count), backgroundColor: '#c65b3d', borderRadius: 8 }]
        },
        options: {
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: '#efe5dd' }, ticks: { color: '#8a7c73' } },
            y: { grid: { display: false }, ticks: { color: '#8a7c73' } }
          }
        }
      });
    });
  }

  const stockStatus = document.getElementById('homeStockStatus');
  if (stockStatus) {
    new Chart(stockStatus, {
      type: 'pie',
      data: {
        labels: ['In Stock', 'Waiting Stock'],
        datasets: [{ data: [summary.in_stock, summary.waiting_stock], backgroundColor: ['#19a974', '#f2a85b'] }]
      },
      options: { plugins: { legend: { position: 'right' } } }
    });
  }

  const invAct = document.getElementById('homeInventoryActivity');
  if (invAct) {
    const sold = activity.filter(a => a.action_type === 'MARK_SOLD' || a.action_type === 'SOLD').length;
    const stocked = activity.filter(a => a.action_type === 'STOCK_IN').length;
    new Chart(invAct, {
      type: 'bar',
      data: {
        labels: ['Recent'],
        datasets: [
          { label: 'Sold', data: [sold], backgroundColor: '#6a3b2c', borderRadius: 6 },
          { label: 'Stocked', data: [stocked], backgroundColor: '#f2a85b', borderRadius: 6 }
        ]
      },
      options: {
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { grid: { color: '#efe5dd' }, ticks: { color: '#8a7c73' } },
          y: { grid: { color: '#efe5dd' }, ticks: { color: '#8a7c73' }, beginAtZero: true }
        }
      }
    });
  }
}

// Analytics
async function loadAnalytics() {
  const summary = await api('/api/analytics/summary');
  const top = document.getElementById('analyticsTop');
  if (!top) return;
  top.innerHTML = `
    <div class="card"><div class="card-title">Total Sales</div><div class="card-value">${formatPeso(summary.total_sales)}</div></div>
    <div class="card"><div class="card-title">Total Profit</div><div class="card-value">${formatPeso(summary.total_profit)}</div></div>
    <div class="card"><div class="card-title">Inventory Value</div><div class="card-value">${formatPeso(summary.inventory_value)}</div></div>
    <div class="card"><div class="card-title">Sell-through Rate</div><div class="card-value">${summary.sell_through_rate.toFixed(1)}%</div></div>
  `;
  const mid = document.getElementById('analyticsMid');
  if (!mid) return;
  mid.innerHTML = `
    <div class="card"><div class="card-title">Total Items</div><div class="card-value">${summary.total_items}</div></div>
    <div class="card"><div class="card-title">In Stock</div><div class="card-value">${summary.in_stock}</div></div>
    <div class="card"><div class="card-title">Waiting Stock</div><div class="card-value">${summary.waiting_stock}</div></div>
  `;

  const charts = await api('/api/analytics/charts');
  renderLineChart('chartMovement', charts.movement);
  renderBarChart('chartSizes', charts.sizes);
  renderPieChart('chartBrands', charts.brands);
  renderBarChartAges('chartAges', charts.ages);
}

function renderLineChart(canvasId, data) {
  const ctx = document.getElementById(canvasId);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => new Date(d.date).toLocaleDateString('en-US',{month:'short', day:'numeric'})),
      datasets: [
        { label:'Sold', data: data.map(d => d.sold), borderColor:'#cf6b47', backgroundColor:'rgba(207,107,71,0.2)', tension:0.3, pointRadius:3, borderDash:[4,4] },
        { label:'Stock In', data: data.map(d => d.stock_in), borderColor:'#19a974', backgroundColor:'rgba(25,169,116,0.2)', tension:0.3, pointRadius:3 }
      ]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:true, labels:{usePointStyle:true, pointStyle:'circle'}}},
      scales:{
        x:{ grid:{color:'#efe5dd'}, ticks:{color:'#8a7c73'} },
        y:{ grid:{color:'#efe5dd'}, ticks:{color:'#8a7c73'}, beginAtZero:true }
      }
    }
  });
}
function renderBarChart(canvasId, data) {
  const ctx = document.getElementById(canvasId);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.us_size || d.brand_name),
      datasets: [{ label:'Count', data: data.map(d => d.count), backgroundColor:'#e48952', borderRadius:8 }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false}},
      scales:{
        x:{ grid:{color:'#efe5dd'}, ticks:{color:'#8a7c73'} },
        y:{ grid:{color:'#efe5dd'}, ticks:{color:'#8a7c73'}, beginAtZero:true }
      }
    }
  });
}
function renderPieChart(canvasId, data) {
  const ctx = document.getElementById(canvasId);
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: data.map(d => d.brand_name),
      datasets: [{ data: data.map(d => d.count), backgroundColor:['#c55d3c','#2aa08b','#f0b04a','#8a3c26','#d18f6b'] }]
    },
    options:{ responsive:true, plugins:{legend:{position:'right'}} }
  });
}
function renderBarChartAges(canvasId, ages) {
  const ctx = document.getElementById(canvasId);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['0-30 days','31-60 days','61-90 days','90+ days'],
      datasets: [{ data: [ages.days_0_30, ages.days_31_60, ages.days_61_90, ages.days_90_plus], backgroundColor:'#6b3a2c', borderRadius:8 }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false}},
      scales:{
        x:{ grid:{color:'#efe5dd'}, ticks:{color:'#8a7c73'} },
        y:{ grid:{color:'#efe5dd'}, ticks:{color:'#8a7c73'}, beginAtZero:true }
      }
    }
  });
}

// modal backdrop click to close
const modalBackdrop = document.getElementById('modalBackdrop');
if (modalBackdrop) {
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
}

init();
