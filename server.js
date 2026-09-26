require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { seedDatabase, generateTicketNumber } = require('./seed');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'service_request_secret_2024_secure_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Seed database on startup
seedDatabase();

// ─── Auth Middleware ────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOrAgent(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'agent') return next();
  res.status(403).json({ error: 'Forbidden: insufficient permissions' });
}

// ─── Auth Routes ────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const { password: _, ...userSafe } = user;
  res.json({ token, user: userSafe });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, department } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = uuidv4();
  const hashed = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, name, email, password, role, department) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, email, hashed, 'user', department || '');

  const token = jwt.sign({ id, email, role: 'user', name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.status(201).json({ token, user: { id, name, email, role: 'user', department: department || '' } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, department, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ─── Dashboard Stats ────────────────────────────────────────────────────────────
app.get('/api/stats', authMiddleware, (req, res) => {
  const isAgent = req.user.role === 'admin' || req.user.role === 'agent';
  const condition = isAgent ? '' : 'WHERE requester_id = ?';
  const params = isAgent ? [] : [req.user.id];

  const total = db.prepare(`SELECT COUNT(*) as count FROM tickets ${condition}`).get(...params);
  const open = db.prepare(`SELECT COUNT(*) as count FROM tickets ${condition ? condition + ' AND status = ?' : 'WHERE status = ?'}`).get(...params, 'open');
  const inProgress = db.prepare(`SELECT COUNT(*) as count FROM tickets ${condition ? condition + ' AND status = ?' : 'WHERE status = ?'}`).get(...params, 'in_progress');
  const resolved = db.prepare(`SELECT COUNT(*) as count FROM tickets ${condition ? condition + ' AND status IN (?,?)' : 'WHERE status IN (?,?)'}`).get(...params, 'resolved', 'closed');
  const critical = db.prepare(`SELECT COUNT(*) as count FROM tickets ${condition ? condition + ' AND priority = ? AND status NOT IN (?,?)' : 'WHERE priority = ? AND status NOT IN (?,?)'}`).get(...params, 'critical', 'resolved', 'closed');

  // Category breakdown
  const byCategory = db.prepare(`SELECT category, COUNT(*) as count FROM tickets ${condition} GROUP BY category ORDER BY count DESC LIMIT 6`).all(...params);

  // Priority breakdown
  const byPriority = db.prepare(`SELECT priority, COUNT(*) as count FROM tickets ${condition} GROUP BY priority`).all(...params);

  // Recent activity (last 7 days)
  const recentActivity = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count 
    FROM tickets ${condition ? condition + " AND created_at >= datetime('now', '-7 days')" : "WHERE created_at >= datetime('now', '-7 days')"}
    GROUP BY DATE(created_at) ORDER BY date ASC
  `).all(...params);

  // Avg resolution time (resolved tickets)
  const avgResolution = isAgent 
    ? db.prepare(`SELECT AVG((julianday(updated_at) - julianday(created_at)) * 24) as avg_hours FROM tickets WHERE status IN ('resolved','closed') AND resolved_at IS NOT NULL`).get()
    : null;

  res.json({
    total: total.count,
    open: open.count,
    inProgress: inProgress.count,
    resolved: resolved.count,
    critical: critical.count,
    byCategory,
    byPriority,
    recentActivity,
    avgResolutionHours: avgResolution?.avg_hours || 0
  });
});

// ─── Ticket Routes ──────────────────────────────────────────────────────────────
app.get('/api/tickets', authMiddleware, (req, res) => {
  const { status, priority, category, search, assignee, page = 1, limit = 10, sort = 'created_at', order = 'desc' } = req.query;
  const isAgent = req.user.role === 'admin' || req.user.role === 'agent';

  let conditions = [];
  let params = [];

  if (!isAgent) {
    conditions.push('t.requester_id = ?');
    params.push(req.user.id);
  }
  if (status) { conditions.push('t.status = ?'); params.push(status); }
  if (priority) { conditions.push('t.priority = ?'); params.push(priority); }
  if (category) { conditions.push('t.category = ?'); params.push(category); }
  if (assignee) { conditions.push('t.assignee_id = ?'); params.push(assignee); }
  if (search) {
    conditions.push('(t.title LIKE ? OR t.description LIKE ? OR t.ticket_number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const validSorts = ['created_at', 'updated_at', 'priority', 'status', 'title'];
  const sortCol = validSorts.includes(sort) ? sort : 'created_at';
  const orderDir = order === 'asc' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) as count FROM tickets t ${where}`).get(...params);
  const tickets = db.prepare(`
    SELECT t.*, 
      u1.name as requester_name, u1.email as requester_email, u1.department as requester_department,
      u2.name as assignee_name, u2.email as assignee_email,
      (SELECT COUNT(*) FROM comments c WHERE c.ticket_id = t.id) as comment_count
    FROM tickets t
    LEFT JOIN users u1 ON t.requester_id = u1.id
    LEFT JOIN users u2 ON t.assignee_id = u2.id
    ${where}
    ORDER BY t.${sortCol} ${orderDir}
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({
    tickets,
    pagination: {
      total: total.count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total.count / parseInt(limit))
    }
  });
});

app.post('/api/tickets', authMiddleware, (req, res) => {
  const { title, description, category, priority, due_date, tags } = req.body;
  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Title, description, and category are required' });
  }

  const id = uuidv4();
  const ticketNumber = generateTicketNumber();

  db.prepare(`
    INSERT INTO tickets (id, ticket_number, title, description, category, priority, status, requester_id, due_date, tags)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `).run(id, ticketNumber, title, description, category, priority || 'medium', req.user.id, due_date || null, JSON.stringify(tags || []));

  db.prepare('INSERT INTO activity_log (id, ticket_id, user_id, action, new_value) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), id, req.user.id, 'created', `Ticket ${ticketNumber} created`);

  // Notify admins/agents
  const agents = db.prepare("SELECT id FROM users WHERE role IN ('admin','agent')").all();
  const notifStmt = db.prepare('INSERT INTO notifications (id, user_id, ticket_id, message, type) VALUES (?, ?, ?, ?, ?)');
  agents.forEach(agent => {
    notifStmt.run(uuidv4(), agent.id, id, `New ticket ${ticketNumber}: ${title}`, 'new_ticket');
  });

  const ticket = db.prepare(`
    SELECT t.*, u1.name as requester_name, u1.email as requester_email
    FROM tickets t LEFT JOIN users u1 ON t.requester_id = u1.id
    WHERE t.id = ?
  `).get(id);

  res.status(201).json(ticket);
});

app.get('/api/tickets/:id', authMiddleware, (req, res) => {
  const ticket = db.prepare(`
    SELECT t.*, 
      u1.name as requester_name, u1.email as requester_email, u1.department as requester_department,
      u2.name as assignee_name, u2.email as assignee_email
    FROM tickets t
    LEFT JOIN users u1 ON t.requester_id = u1.id
    LEFT JOIN users u2 ON t.assignee_id = u2.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const isAgent = req.user.role === 'admin' || req.user.role === 'agent';
  if (!isAgent && ticket.requester_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const comments = db.prepare(`
    SELECT c.*, u.name as author_name, u.role as author_role
    FROM comments c
    LEFT JOIN users u ON c.author_id = u.id
    WHERE c.ticket_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  const activity = db.prepare(`
    SELECT a.*, u.name as user_name
    FROM activity_log a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.ticket_id = ?
    ORDER BY a.created_at DESC
    LIMIT 20
  `).all(req.params.id);

  res.json({ ticket, comments, activity });
});

app.patch('/api/tickets/:id', authMiddleware, (req, res) => {
  const { title, description, status, priority, assignee_id, category, due_date, tags } = req.body;
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const isAgent = req.user.role === 'admin' || req.user.role === 'agent';
  const isOwner = ticket.requester_id === req.user.id;

  if (!isAgent && !isOwner) return res.status(403).json({ error: 'Access denied' });

  const updates = {};
  const logEntries = [];

  if (title && (isAgent || isOwner)) updates.title = title;
  if (description && (isAgent || isOwner)) updates.description = description;
  if (category && isAgent) updates.category = category;
  if (priority && isAgent) {
    logEntries.push({ action: 'priority_changed', old: ticket.priority, new: priority });
    updates.priority = priority;
  }
  if (status && isAgent) {
    logEntries.push({ action: 'status_changed', old: ticket.status, new: status });
    updates.status = status;
    if (status === 'resolved' || status === 'closed') {
      updates.resolved_at = new Date().toISOString();
    }
  }
  if (assignee_id !== undefined && isAgent) {
    logEntries.push({ action: 'assigned', old: ticket.assignee_id, new: assignee_id });
    updates.assignee_id = assignee_id || null;
  }
  if (due_date !== undefined) updates.due_date = due_date || null;
  if (tags !== undefined) updates.tags = JSON.stringify(tags);

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  updates.updated_at = new Date().toISOString();
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE tickets SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);

  const logStmt = db.prepare('INSERT INTO activity_log (id, ticket_id, user_id, action, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)');
  logEntries.forEach(e => logStmt.run(uuidv4(), req.params.id, req.user.id, e.action, e.old, e.new));

  // Notify requester of status change
  if (status && ticket.requester_id !== req.user.id) {
    db.prepare('INSERT INTO notifications (id, user_id, ticket_id, message, type) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), ticket.requester_id, req.params.id, `Your ticket "${ticket.title}" status changed to: ${status}`, 'status_update');
  }

  const updated = db.prepare(`
    SELECT t.*, u1.name as requester_name, u2.name as assignee_name
    FROM tickets t LEFT JOIN users u1 ON t.requester_id = u1.id LEFT JOIN users u2 ON t.assignee_id = u2.id
    WHERE t.id = ?
  `).get(req.params.id);

  res.json(updated);
});

app.delete('/api/tickets/:id', authMiddleware, adminOrAgent, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
  res.json({ message: 'Ticket deleted successfully' });
});

// ─── Comments Routes ─────────────────────────────────────────────────────────────
app.post('/api/tickets/:id/comments', authMiddleware, (req, res) => {
  const { content, is_internal } = req.body;
  if (!content) return res.status(400).json({ error: 'Comment content is required' });

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const isAgent = req.user.role === 'admin' || req.user.role === 'agent';
  if (!isAgent && ticket.requester_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
  if (is_internal && !isAgent) return res.status(403).json({ error: 'Only agents can post internal notes' });

  const id = uuidv4();
  db.prepare('INSERT INTO comments (id, ticket_id, author_id, content, is_internal) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, req.user.id, content, is_internal ? 1 : 0);

  db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);

  db.prepare('INSERT INTO activity_log (id, ticket_id, user_id, action, new_value) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), req.params.id, req.user.id, 'commented', content.substring(0, 100));

  // Notify relevant parties
  const notifyId = ticket.requester_id === req.user.id ? (ticket.assignee_id) : ticket.requester_id;
  if (notifyId) {
    db.prepare('INSERT INTO notifications (id, user_id, ticket_id, message, type) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), notifyId, req.params.id, `New comment on ticket "${ticket.title}"`, 'comment');
  }

  const comment = db.prepare(`
    SELECT c.*, u.name as author_name, u.role as author_role
    FROM comments c LEFT JOIN users u ON c.author_id = u.id WHERE c.id = ?
  `).get(id);

  res.status(201).json(comment);
});

// ─── Users Routes ────────────────────────────────────────────────────────────────
app.get('/api/users', authMiddleware, adminOrAgent, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, department, created_at FROM users ORDER BY name').all();
  res.json(users);
});

app.get('/api/users/agents', authMiddleware, (req, res) => {
  const agents = db.prepare("SELECT id, name, email, department FROM users WHERE role IN ('admin','agent') ORDER BY name").all();
  res.json(agents);
});

app.patch('/api/users/:id', authMiddleware, (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { name, department } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (department !== undefined) updates.department = department;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.params.id);
  const updated = db.prepare('SELECT id, name, email, role, department FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ─── Notifications Routes ─────────────────────────────────────────────────────────
app.get('/api/notifications', authMiddleware, (req, res) => {
  const notifs = db.prepare(`
    SELECT n.*, t.ticket_number FROM notifications n
    LEFT JOIN tickets t ON n.ticket_id = t.id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 20
  `).all(req.user.id);
  const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
  res.json({ notifications: notifs, unreadCount: unreadCount.count });
});

app.patch('/api/notifications/read-all', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'All notifications marked as read' });
});

// ─── Categories Route ────────────────────────────────────────────────────────────
app.get('/api/categories', (req, res) => {
  res.json([
    'IT Support', 'Hardware', 'Software', 'Network', 'Account', 'Access',
    'HR', 'Finance', 'Facilities', 'Onboarding', 'Security', 'Other'
  ]);
});

// ─── Serve Frontend ──────────────────────────────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Service Request System running at http://localhost:${PORT}`);
  console.log(`📋 Demo accounts:`);
  console.log(`   Admin:  admin@company.com / admin123`);
  console.log(`   Agent:  sarah@company.com / sarah123`);
  console.log(`   User:   emily@company.com / emily123`);
});
