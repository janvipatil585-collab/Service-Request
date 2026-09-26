/* ═══════════════════════════════════════════════════════════════════════════════
   ServiceDesk Pro — Frontend JavaScript (Full Working Implementation)
   ═══════════════════════════════════════════════════════════════════════════════ */

const API = '/api';
let authToken = localStorage.getItem('sd_token');
let currentUser = JSON.parse(localStorage.getItem('sd_user') || 'null');
let currentPage = 'dashboard';
let currentTicketId = null;
let ticketFilters = { status: '', priority: '', category: '', search: '', page: 1, sort: 'created_at', order: 'desc' };
let searchDebounceTimer = null;
let notifPollInterval = null;
let categories = [];

// ═══════════════════════════════════════════════════════════════════ API CALLS ══
async function api(method, endpoint, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(API + endpoint, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════ UTILS ══
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = {
    success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️'
  };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function priorityBadge(priority) {
  const labels = { critical: '🔴 Critical', high: '🟠 High', medium: '🟡 Medium', low: '🟢 Low' };
  return `<span class="badge badge-${priority}">${labels[priority] || priority}</span>`;
}

function statusBadge(status) {
  const labels = { open: '⏳ Open', in_progress: '⚡ In Progress', resolved: '✅ Resolved', closed: '🔒 Closed' };
  const text = labels[status] || status;
  return `<span class="badge status-${status}">${text}</span>`;
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════════ AUTH LOGIC ══
function switchAuthTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

function fillDemo(email, pass) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = pass;
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const btn = document.getElementById('login-btn');
  btn.innerHTML = '<span>Signing in...</span>';
  btn.disabled = true;

  try {
    const data = await api('POST', '/auth/login', { email, password });
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('sd_token', authToken);
    localStorage.setItem('sd_user', JSON.stringify(currentUser));
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    btn.innerHTML = '<span>Sign In</span><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
    btn.disabled = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const department = document.getElementById('reg-department').value;
  const errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  const btn = document.getElementById('register-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Creating account...';

  try {
    const data = await api('POST', '/auth/register', { name, email, password, department });
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('sd_token', authToken);
    localStorage.setItem('sd_user', JSON.stringify(currentUser));
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Create Account';
  }
}

function handleLogout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('sd_token');
  localStorage.removeItem('sd_user');
  clearInterval(notifPollInterval);
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

// ════════════════════════════════════════════════════════════════ APP STARTUP ══
function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  initApp();
}

async function initApp() {
  // Set user info in UI
  const isAgentOrAdmin = currentUser.role === 'admin' || currentUser.role === 'agent';

  // Sidebar user
  document.getElementById('sidebar-avatar').textContent = getInitials(currentUser.name);
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-role').textContent = currentUser.role;
  document.getElementById('header-avatar').textContent = getInitials(currentUser.name);
  document.getElementById('comment-user-avatar').textContent = getInitials(currentUser.name);

  // Show admin section if admin/agent
  document.getElementById('admin-section').style.display = isAgentOrAdmin ? 'block' : 'none';

  // Dashboard greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dashboard-greeting').textContent = `${greeting}, ${currentUser.name.split(' ')[0]}! 👋`;

  // Load categories
  try {
    categories = await api('GET', '/categories');
    populateCategoryFilters();
  } catch (e) {}

  // Load initial data
  await Promise.all([loadDashboard(), loadNotifications()]);

  // Start notification polling
  notifPollInterval = setInterval(loadNotifications, 30000);

  navigateTo('dashboard');
}

function populateCategoryFilters() {
  const filterCat = document.getElementById('filter-category');
  filterCat.innerHTML = '<option value="">All Categories</option>';
  categories.forEach(cat => {
    filterCat.innerHTML += `<option value="${cat}">${cat}</option>`;
  });

  const ntCat = document.getElementById('nt-category');
  ntCat.innerHTML = '<option value="">Select category...</option>';
  categories.forEach(cat => {
    ntCat.innerHTML += `<option value="${cat}">${cat}</option>`;
  });
}

// ══════════════════════════════════════════════════════════════════ NAVIGATION ══
function navigateTo(page) {
  currentPage = page;
  // Update nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Show target page
  document.getElementById(`page-${page}`).classList.add('active');

  // Load page-specific data
  if (page === 'dashboard') loadDashboard();
  else if (page === 'tickets') {
    document.getElementById('tickets-page-title').textContent = 'All Tickets';
    ticketFilters = { status: '', priority: '', category: '', search: '', page: 1, sort: 'created_at', order: 'desc' };
    resetTicketFilterUI();
    loadTickets();
  }
  else if (page === 'my-tickets') loadMyTickets();
  else if (page === 'users') loadUsers();

  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function handleGlobalSearch(val) {
  if (val.length > 2 || val.length === 0) {
    navigateTo('tickets');
    document.getElementById('filter-search').value = val;
    ticketFilters.search = val;
    ticketFilters.page = 1;
    loadTickets();
  }
}

// ════════════════════════════════════════════════════════════════════ DASHBOARD ══
async function loadDashboard() {
  try {
    const stats = await api('GET', '/stats');
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-open').textContent = stats.open;
    document.getElementById('stat-inprogress').textContent = stats.inProgress;
    document.getElementById('stat-resolved').textContent = stats.resolved;
    document.getElementById('stat-critical').textContent = stats.critical;

    // Update nav badge
    const navBadge = document.getElementById('nav-open-count');
    navBadge.textContent = stats.open;
    navBadge.style.display = stats.open > 0 ? 'inline' : 'none';

    // Priority chart
    renderPriorityChart(stats.byPriority, stats.total);

    // Category list
    renderCategoryList(stats.byCategory);

    // Recent tickets
    await loadRecentTickets();
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

function renderPriorityChart(byPriority, total) {
  const chart = document.getElementById('priority-chart');
  const priorities = ['critical', 'high', 'medium', 'low'];
  const data = {};
  byPriority.forEach(row => data[row.priority] = row.count);

  chart.innerHTML = priorities.map(p => {
    const count = data[p] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="priority-bar-row">
        <span class="priority-bar-label">${p}</span>
        <div class="priority-bar-track">
          <div class="priority-bar-fill fill-${p}" style="width: ${pct}%"></div>
        </div>
        <span class="priority-bar-count">${count}</span>
      </div>`;
  }).join('');
}

function renderCategoryList(byCategory) {
  const list = document.getElementById('category-list');
  if (!byCategory.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0">No data yet</p>';
    return;
  }
  list.innerHTML = byCategory.map(cat => `
    <div class="category-row">
      <span class="category-name">${cat.category}</span>
      <span class="category-count">${cat.count}</span>
    </div>`).join('');
}

async function loadRecentTickets() {
  const isAgent = currentUser.role === 'admin' || currentUser.role === 'agent';
  const endpoint = isAgent ? '/tickets?limit=5&sort=created_at&order=desc' : '/tickets?limit=5&sort=created_at&order=desc';
  const data = await api('GET', endpoint);
  const list = document.getElementById('recent-list');
  if (!data.tickets.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0">No tickets yet</p>';
    return;
  }
  list.innerHTML = data.tickets.map(t => `
    <div class="recent-ticket-item" onclick="openTicketDetail('${t.id}')">
      ${priorityBadge(t.priority)}
      <div class="recent-ticket-meta">
        <div class="recent-ticket-title">${t.title}</div>
        <div class="recent-ticket-sub">${t.ticket_number} · ${formatRelative(t.created_at)}</div>
      </div>
      ${statusBadge(t.status)}
    </div>`).join('');
}

// ════════════════════════════════════════════════════════════════════ TICKETS ══
function resetTicketFilterUI() {
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-priority').value = '';
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-sort').value = 'created_at-desc';
  document.getElementById('filter-search').value = '';
}

function applyFilters() {
  const sortVal = document.getElementById('filter-sort').value.split('-');
  ticketFilters.status = document.getElementById('filter-status').value;
  ticketFilters.priority = document.getElementById('filter-priority').value;
  ticketFilters.category = document.getElementById('filter-category').value;
  ticketFilters.sort = sortVal[0];
  ticketFilters.order = sortVal[1] || 'desc';
  ticketFilters.page = 1;
  loadTickets();
}

function debounceSearch(val) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    ticketFilters.search = val;
    ticketFilters.page = 1;
    loadTickets();
  }, 400);
}

async function loadTickets() {
  const params = new URLSearchParams();
  if (ticketFilters.status) params.set('status', ticketFilters.status);
  if (ticketFilters.priority) params.set('priority', ticketFilters.priority);
  if (ticketFilters.category) params.set('category', ticketFilters.category);
  if (ticketFilters.search) params.set('search', ticketFilters.search);
  params.set('page', ticketFilters.page);
  params.set('limit', 10);
  params.set('sort', ticketFilters.sort);
  params.set('order', ticketFilters.order);

  try {
    const data = await api('GET', `/tickets?${params}`);
    renderTicketsTable(data.tickets);
    renderPagination(data.pagination);
    document.getElementById('tickets-count-subtitle').textContent = `${data.pagination.total} ticket${data.pagination.total !== 1 ? 's' : ''} found`;
  } catch (err) {
    showToast('Failed to load tickets', 'error');
  }
}

function renderTicketsTable(tickets) {
  const tbody = document.getElementById('tickets-tbody');
  const empty = document.getElementById('tickets-empty');

  if (!tickets.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const isAgent = currentUser.role === 'admin' || currentUser.role === 'agent';
  tbody.innerHTML = tickets.map(t => `
    <tr onclick="openTicketDetail('${t.id}')">
      <td><span class="ticket-num">${t.ticket_number}</span></td>
      <td class="ticket-title-cell">
        <span class="ticket-title-text">${t.title}</span>
        <div class="ticket-requester">by ${t.requester_name} · ${t.requester_department || 'N/A'}</div>
      </td>
      <td><span class="badge-category">${t.category}</span></td>
      <td>${priorityBadge(t.priority)}</td>
      <td>${statusBadge(t.status)}</td>
      <td>
        ${t.assignee_name 
          ? `<div class="assignee-chip"><div class="assignee-avatar">${getInitials(t.assignee_name)}</div>${t.assignee_name}</div>` 
          : '<span class="unassigned">Unassigned</span>'}
      </td>
      <td><span class="date-text">${formatRelative(t.created_at)}</span></td>
      <td onclick="event.stopPropagation()">
        <button class="action-btn" onclick="openTicketDetail('${t.id}')">View</button>
        ${isAgent && t.status === 'open' ? `<button class="action-btn" style="margin-left:4px" onclick="quickAssignSelf('${t.id}')">Assign me</button>` : ''}
      </td>
    </tr>`).join('');
}

function renderPagination(pagination) {
  const el = document.getElementById('pagination');
  if (pagination.totalPages <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${pagination.page <= 1 ? 'disabled' : ''} onclick="changePage(${pagination.page - 1})">← Prev</button>`;
  for (let i = 1; i <= pagination.totalPages; i++) {
    if (i === 1 || i === pagination.totalPages || Math.abs(i - pagination.page) <= 1) {
      html += `<button class="page-btn ${i === pagination.page ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    } else if (Math.abs(i - pagination.page) === 2) {
      html += `<span style="color:var(--text-muted);padding:0 4px">...</span>`;
    }
  }
  html += `<button class="page-btn" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} onclick="changePage(${pagination.page + 1})">Next →</button>`;
  el.innerHTML = html;
}

function changePage(page) {
  ticketFilters.page = page;
  loadTickets();
  document.querySelector('.main-content').scrollTo({ top: 0, behavior: 'smooth' });
}

async function quickAssignSelf(ticketId) {
  try {
    await api('PATCH', `/tickets/${ticketId}`, { assignee_id: currentUser.id, status: 'in_progress' });
    showToast('Ticket assigned to you and marked In Progress', 'success');
    loadTickets();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═════════════════════════════════════════════════════════════════ MY TICKETS ══
async function loadMyTickets() {
  try {
    const data = await api('GET', `/tickets?limit=50&sort=created_at&order=desc`);
    const myTickets = data.tickets.filter(t => t.requester_id === currentUser.id);
    const grid = document.getElementById('my-tickets-grid');
    const empty = document.getElementById('my-tickets-empty');

    if (!myTickets.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    grid.innerHTML = myTickets.map(t => `
      <div class="ticket-card priority-${t.priority}" onclick="openTicketDetail('${t.id}')">
        <div class="ticket-card-header">
          <span class="ticket-card-num">${t.ticket_number}</span>
          ${statusBadge(t.status)}
        </div>
        ${priorityBadge(t.priority)}
        <div class="ticket-card-title">${t.title}</div>
        <div class="ticket-card-desc">${t.description}</div>
        <div class="ticket-card-footer">
          <span class="ticket-card-date">${formatRelative(t.created_at)}</span>
          ${t.assignee_name ? `<span class="ticket-card-comments">👤 ${t.assignee_name}</span>` : '<span class="ticket-card-comments">Unassigned</span>'}
        </div>
      </div>`).join('');
  } catch (err) {
    showToast('Failed to load tickets', 'error');
  }
}

// ════════════════════════════════════════════════════════════ TICKET DETAIL ══
async function openTicketDetail(ticketId) {
  currentTicketId = ticketId;
  showLoading(true);
  try {
    const data = await api('GET', `/tickets/${ticketId}`);
    const { ticket, comments, activity } = data;
    const isAgentOrAdmin = currentUser.role === 'admin' || currentUser.role === 'agent';

    // Header
    document.getElementById('detail-ticket-number').textContent = ticket.ticket_number;
    document.getElementById('detail-title').textContent = ticket.title;
    document.getElementById('detail-description').textContent = ticket.description;

    // Status
    document.getElementById('detail-status-display').innerHTML = statusBadge(ticket.status);
    const statusChanger = document.getElementById('status-changer');
    statusChanger.style.display = isAgentOrAdmin ? 'block' : 'none';
    if (isAgentOrAdmin) document.getElementById('detail-status-select').value = ticket.status;

    // Priority
    document.getElementById('detail-priority-display').innerHTML = priorityBadge(ticket.priority);
    const priorityChanger = document.getElementById('priority-changer');
    priorityChanger.style.display = isAgentOrAdmin ? 'block' : 'none';
    if (isAgentOrAdmin) document.getElementById('detail-priority-select').value = ticket.priority;

    // Category
    document.getElementById('detail-category').textContent = ticket.category;

    // Requester
    document.getElementById('detail-requester').innerHTML = `
      <div class="user-chip-avatar">${getInitials(ticket.requester_name)}</div>
      <div class="user-chip-info">
        <div class="user-chip-name">${ticket.requester_name}</div>
        <div class="user-chip-dept">${ticket.requester_department || 'N/A'}</div>
      </div>`;

    // Assignee
    const assigneeDisplay = document.getElementById('detail-assignee-display');
    assigneeDisplay.innerHTML = ticket.assignee_name
      ? `<div class="user-chip"><div class="user-chip-avatar">${getInitials(ticket.assignee_name)}</div><div class="user-chip-name">${ticket.assignee_name}</div></div>`
      : '<span class="unassigned">Unassigned</span>';

    const assigneeChanger = document.getElementById('assignee-changer');
    assigneeChanger.style.display = isAgentOrAdmin ? 'block' : 'none';
    if (isAgentOrAdmin) {
      await loadAgentsForSelect(ticket.assignee_id);
    }

    // Dates
    document.getElementById('detail-created').textContent = formatDate(ticket.created_at) + ' · ' + formatRelative(ticket.created_at);
    document.getElementById('detail-updated').textContent = formatRelative(ticket.updated_at);

    // Comments
    renderComments(comments, isAgentOrAdmin);

    // Activity
    renderActivity(activity);

    // Show/hide internal toggle and agent buttons
    document.getElementById('internal-toggle').style.display = isAgentOrAdmin ? 'flex' : 'none';
    document.getElementById('agent-action-btns').style.display = isAgentOrAdmin ? 'block' : 'none';

    // Clear comment input
    document.getElementById('comment-input').value = '';
    document.getElementById('comment-internal').checked = false;

    showLoading(false);
    document.getElementById('ticket-detail-modal').classList.remove('hidden');
  } catch (err) {
    showLoading(false);
    showToast('Failed to load ticket: ' + err.message, 'error');
  }
}

async function loadAgentsForSelect(currentAssigneeId) {
  try {
    const agents = await api('GET', '/users/agents');
    const select = document.getElementById('detail-assignee-select');
    select.innerHTML = '<option value="">Unassigned</option>';
    agents.forEach(a => {
      select.innerHTML += `<option value="${a.id}" ${a.id === currentAssigneeId ? 'selected' : ''}>${a.name}</option>`;
    });
  } catch (e) {}
}

function renderComments(comments, isAgentOrAdmin) {
  const list = document.getElementById('detail-comments-list');
  const countEl = document.getElementById('detail-comment-count');
  const visible = isAgentOrAdmin ? comments : comments.filter(c => !c.is_internal);
  countEl.textContent = `(${visible.length})`;

  if (!visible.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;font-style:italic;padding:8px 0">No comments yet. Be the first to respond.</p>';
    return;
  }
  list.innerHTML = visible.map(c => `
    <div class="comment-item ${c.is_internal ? 'internal' : ''}">
      <div class="comment-avatar">${getInitials(c.author_name)}</div>
      <div class="comment-content">
        <div>
          <span class="comment-author">${c.author_name}</span>
          <span class="comment-time">${formatRelative(c.created_at)}</span>
          ${c.is_internal ? '<span class="comment-internal-badge">INTERNAL</span>' : ''}
        </div>
        <div class="comment-text">${c.content}</div>
      </div>
    </div>`).join('');
}

function renderActivity(activity) {
  const list = document.getElementById('detail-activity');
  if (!activity.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:12px">No activity recorded</p>';
    return;
  }
  const actionLabels = {
    created: 'created this ticket',
    status_changed: (a) => `changed status to <strong>${a.new_value}</strong>`,
    priority_changed: (a) => `changed priority to <strong>${a.new_value}</strong>`,
    assigned: (a) => `updated assignee`,
    commented: 'added a comment',
  };
  list.innerHTML = activity.map(a => {
    const label = typeof actionLabels[a.action] === 'function'
      ? actionLabels[a.action](a)
      : (actionLabels[a.action] || a.action);
    return `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-text"><strong>${a.user_name}</strong> ${label}</div>
        <span class="activity-time">${formatRelative(a.created_at)}</span>
      </div>`;
  }).join('');
}

async function updateTicketField(field, value) {
  try {
    const body = { [field]: value };
    await api('PATCH', `/tickets/${currentTicketId}`, body);
    showToast(`Ticket ${field.replace('_', ' ')} updated`, 'success');
    // Refresh the detail
    await openTicketDetail(currentTicketId);
    // Refresh list/dashboard in background
    if (currentPage === 'tickets') loadTickets();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitComment() {
  const content = document.getElementById('comment-input').value.trim();
  if (!content) { showToast('Please enter a comment', 'warning'); return; }
  const is_internal = document.getElementById('comment-internal').checked;

  try {
    await api('POST', `/tickets/${currentTicketId}/comments`, { content, is_internal });
    showToast('Comment added successfully', 'success');
    document.getElementById('comment-input').value = '';
    document.getElementById('comment-internal').checked = false;
    await openTicketDetail(currentTicketId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCurrentTicket() {
  if (!confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) return;
  try {
    await api('DELETE', `/tickets/${currentTicketId}`);
    closeModal('ticket-detail-modal');
    showToast('Ticket deleted successfully', 'success');
    if (currentPage === 'tickets') loadTickets();
    else if (currentPage === 'my-tickets') loadMyTickets();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═════════════════════════════════════════════════════════════ NEW TICKET ════
function openNewTicketModal() {
  document.getElementById('new-ticket-form').reset();
  document.getElementById('priority-hint').textContent = '';
  document.getElementById('new-ticket-modal').classList.remove('hidden');
}

async function submitNewTicket(e) {
  e.preventDefault();
  const title = document.getElementById('nt-title').value.trim();
  const category = document.getElementById('nt-category').value;
  const priority = document.getElementById('nt-priority').value;
  const description = document.getElementById('nt-description').value.trim();
  const due_date = document.getElementById('nt-due').value;

  const btn = document.getElementById('submit-ticket-btn');
  btn.disabled = true;
  btn.querySelector('span') && (btn.innerHTML = '<span>Submitting...</span>');

  try {
    const ticket = await api('POST', '/tickets', { title, category, priority, description, due_date });
    closeModal('new-ticket-modal');
    showToast(`Ticket ${ticket.ticket_number} created successfully!`, 'success');
    if (currentPage === 'tickets') loadTickets();
    else if (currentPage === 'my-tickets') loadMyTickets();
    loadDashboard();
    // Open the created ticket
    setTimeout(() => openTicketDetail(ticket.id), 500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg> Submit Ticket';
  }
}

// ════════════════════════════════════════════════════════════════════ USERS ════
async function loadUsers() {
  try {
    const users = await api('GET', '/users');
    const grid = document.getElementById('users-grid');
    grid.innerHTML = users.map(u => `
      <div class="user-card">
        <div class="user-card-avatar">${getInitials(u.name)}</div>
        <div class="user-card-name">${u.name}</div>
        <div class="user-card-email">${u.email}</div>
        <div class="user-card-dept">${u.department || 'No department'}</div>
        <span class="role-badge role-${u.role}">${u.role}</span>
      </div>`).join('');
  } catch (err) {
    showToast('Failed to load users', 'error');
  }
}

// ════════════════════════════════════════════════════════════ NOTIFICATIONS ════
async function loadNotifications() {
  try {
    const data = await api('GET', '/notifications');
    const countEl = document.getElementById('notif-count');
    if (data.unreadCount > 0) {
      countEl.textContent = data.unreadCount;
      countEl.classList.remove('hidden');
    } else {
      countEl.classList.add('hidden');
    }
    renderNotifications(data.notifications);
  } catch (e) {}
}

function renderNotifications(notifs) {
  const list = document.getElementById('notif-list');
  if (!notifs.length) {
    list.innerHTML = '<div class="notif-empty">🔔 No notifications yet</div>';
    return;
  }
  list.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="notifClick('${n.ticket_id}')">
      ${n.is_read ? '<div class="notif-dot"></div>' : ''}
      <div class="notif-text">
        <div class="notif-msg">${n.message}</div>
        <div class="notif-time">${formatRelative(n.created_at)} ${n.ticket_number ? '· ' + n.ticket_number : ''}</div>
      </div>
    </div>`).join('');
}

function notifClick(ticketId) {
  if (!ticketId) return;
  toggleNotifications();
  openTicketDetail(ticketId);
  markAllRead();
}

function toggleNotifications() {
  document.getElementById('notif-dropdown').classList.toggle('hidden');
}

async function markAllRead() {
  try {
    await api('PATCH', '/notifications/read-all');
    await loadNotifications();
  } catch (e) {}
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notif-dropdown');
  const btn = document.getElementById('notif-btn');
  if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

// ═══════════════════════════════════════════════════════════ INITIALIZATION ════
(function init() {
  if (authToken && currentUser) {
    showApp();
  } else {
    document.getElementById('auth-screen').classList.remove('hidden');
  }
})();
