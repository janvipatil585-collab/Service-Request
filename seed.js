const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./db');

function generateTicketNumber() {
  const prefix = 'TKT';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
}

// Seed initial data
function seedDatabase() {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existingUsers.count > 0) return;

  console.log('Seeding database with initial data...');

  const users = [
    {
      id: uuidv4(),
      name: 'Admin User',
      email: 'admin@company.com',
      password: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      department: 'IT',
    },
    {
      id: uuidv4(),
      name: 'Sarah Johnson',
      email: 'sarah@company.com',
      password: bcrypt.hashSync('sarah123', 10),
      role: 'agent',
      department: 'Support',
    },
    {
      id: uuidv4(),
      name: 'Michael Chen',
      email: 'michael@company.com',
      password: bcrypt.hashSync('michael123', 10),
      role: 'agent',
      department: 'Technical',
    },
    {
      id: uuidv4(),
      name: 'Emily Davis',
      email: 'emily@company.com',
      password: bcrypt.hashSync('emily123', 10),
      role: 'user',
      department: 'Marketing',
    },
    {
      id: uuidv4(),
      name: 'James Wilson',
      email: 'james@company.com',
      password: bcrypt.hashSync('james123', 10),
      role: 'user',
      department: 'Finance',
    },
    {
      id: uuidv4(),
      name: 'Priya Patel',
      email: 'priya@company.com',
      password: bcrypt.hashSync('priya123', 10),
      role: 'user',
      department: 'HR',
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password, role, department)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  users.forEach(u => insertUser.run(u.id, u.name, u.email, u.password, u.role, u.department));

  const adminId = users[0].id;
  const agentSarahId = users[1].id;
  const agentMichaelId = users[2].id;
  const emilyId = users[3].id;
  const jamesId = users[4].id;
  const priyaId = users[5].id;

  const sampleTickets = [
    {
      id: uuidv4(), title: 'Cannot access email client', description: 'My Outlook is not opening since this morning. I get an error message saying "Cannot connect to server". I have tried restarting but it still fails.', category: 'IT Support', priority: 'high', status: 'open', requester_id: emilyId, assignee_id: agentSarahId,
    },
    {
      id: uuidv4(), title: 'Request for new laptop', description: 'My current laptop is 5 years old and is very slow affecting my productivity. I would like to request a replacement.', category: 'Hardware', priority: 'medium', status: 'in_progress', requester_id: jamesId, assignee_id: agentMichaelId,
    },
    {
      id: uuidv4(), title: 'VPN access not working', description: 'I am unable to connect to the company VPN from home. I get error code 619. This is blocking me from doing any remote work.', category: 'Network', priority: 'critical', status: 'open', requester_id: priyaId, assignee_id: null,
    },
    {
      id: uuidv4(), title: 'Software license renewal needed', description: 'Our Adobe Creative Suite licenses expire next week. Please arrange renewal for the marketing team (5 seats).', category: 'Software', priority: 'high', status: 'in_progress', requester_id: emilyId, assignee_id: agentSarahId,
    },
    {
      id: uuidv4(), title: 'Printer not working on 3rd floor', description: 'The shared printer on the 3rd floor shows offline and cannot print. Multiple people are affected.', category: 'Hardware', priority: 'medium', status: 'resolved', requester_id: jamesId, assignee_id: agentMichaelId,
    },
    {
      id: uuidv4(), title: 'Password reset request', description: 'I forgot my password for the HR portal and cannot login. Please help reset it.', category: 'Account', priority: 'low', status: 'resolved', requester_id: priyaId, assignee_id: agentSarahId,
    },
    {
      id: uuidv4(), title: 'Need access to financial reporting tool', description: 'I need access to SAP Business Objects for generating quarterly reports. Please grant necessary permissions.', category: 'Access', priority: 'high', status: 'open', requester_id: jamesId, assignee_id: null,
    },
    {
      id: uuidv4(), title: 'Internet speed is very slow', description: 'The internet speed in conference room B has been very slow for the past 3 days, affecting video calls and presentations.', category: 'Network', priority: 'medium', status: 'open', requester_id: emilyId, assignee_id: agentMichaelId,
    },
    {
      id: uuidv4(), title: 'New employee onboarding setup', description: 'New hire joining Monday (David Kim). Please set up laptop, email, and access to all required systems.', category: 'Onboarding', priority: 'high', status: 'in_progress', requester_id: priyaId, assignee_id: adminId,
    },
    {
      id: uuidv4(), title: 'Monitor display flickering', description: 'My secondary monitor keeps flickering. Already tried changing the cable but problem persists.', category: 'Hardware', priority: 'low', status: 'closed', requester_id: emilyId, assignee_id: agentMichaelId,
    },
  ];

  const insertTicket = db.prepare(`
    INSERT INTO tickets (id, ticket_number, title, description, category, priority, status, requester_id, assignee_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertComment = db.prepare(`
    INSERT INTO comments (id, ticket_id, author_id, content, is_internal)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activity_log (id, ticket_id, user_id, action, new_value)
    VALUES (?, ?, ?, ?, ?)
  `);

  sampleTickets.forEach(t => {
    const ticketNumber = generateTicketNumber();
    insertTicket.run(t.id, ticketNumber, t.title, t.description, t.category, t.priority, t.status, t.requester_id, t.assignee_id);

    insertActivity.run(uuidv4(), t.id, t.requester_id, 'created', `Ticket created with priority: ${t.priority}`);

    if (t.status !== 'open') {
      insertComment.run(uuidv4(), t.id, t.assignee_id || adminId, 'I am looking into this issue and will update you shortly.', 0);
      insertActivity.run(uuidv4(), t.id, t.assignee_id || adminId, 'status_changed', t.status);
    }

    if (t.status === 'resolved' || t.status === 'closed') {
      insertComment.run(uuidv4(), t.id, t.assignee_id || adminId, 'This issue has been resolved. Please let us know if you experience any further problems.', 0);
    }
  });

  console.log('Database seeded successfully!');
}

module.exports = { seedDatabase, generateTicketNumber };
