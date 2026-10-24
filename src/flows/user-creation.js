// Mirrors supabase/functions/manage-user-creation/index.ts in Protea
// (the `create` and `reset-password` actions) and the shared checks in
// supabase/functions/_shared/security.ts.

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/
const NAME_MAX_LENGTH = 80
const AGENT_CODE_MAX_LENGTH = 40
const DEFAULT_PASSWORD = 'default-pass'
const RATE_LIMIT = 25

const CREATED = 'user_creation_history.created'
const PASSWORD_RESET = 'user_creation_history.password_reset'

const ACTORS = {
  'admin-mfa': { id: 'u-002', name: 'Siti', aal: 'aal2' },
  'admin-no-mfa': { id: 'u-002', name: 'Siti', aal: 'aal1' },
  agent: { id: 'u-001', name: 'Budi', aal: 'aal2' },
  nobody: null,
}

const normalizeUsername = (value) => value.trim().toLowerCase()
const normalizeFullName = (value) => value.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ')

export default {
  id: 'user-creation',
  title: 'Create a user',
  summary: 'An admin adds a new agent account from Kelola User. The Edge Function checks who is asking, creates the login in Supabase Auth, then writes the profile, role, history and audit rows.',
  source: 'supabase/functions/manage-user-creation',
  hub: 'fn',
  client: 'browser',

  nodes: [
    { id: 'browser', kind: 'client', name: 'Kelola User', detail: 'admin page', x: 110, y: 250 },
    { id: 'fn', kind: 'hub', name: 'manage-user-creation', x: 440, y: 250 },
    { id: 'auth', kind: 'service', name: 'Supabase Auth', detail: 'sessions and accounts', x: 440, y: 70, label: 'right' },
    { id: 'profiles', kind: 'table', name: 'profiles', detail: 'username, name, code', x: 790, y: 90, label: 'right' },
    { id: 'roles', kind: 'table', name: 'user_roles', detail: 'user, admin, developer', x: 870, y: 250, label: 'below' },
    { id: 'history', kind: 'table', name: 'user_creation_history', detail: 'who created whom', x: 790, y: 410, label: 'right' },
    { id: 'audit', kind: 'table', name: 'security_audit_log', detail: 'audit trail, rate limit', x: 440, y: 430, label: 'left' },
  ],
  lines: [['browser', 'fn'], ['fn', 'auth'], ['fn', 'profiles'], ['fn', 'roles'], ['fn', 'history'], ['fn', 'audit']],
  checks: [
    { id: 'session', label: 'Logged in' },
    { id: 'mfa', label: 'MFA verified' },
    { id: 'role', label: 'Admin role' },
    { id: 'limit', label: 'Under rate limit' },
    { id: 'input', label: 'Valid input' },
  ],

  fields: [
    {
      id: 'actor',
      label: 'Who is asking',
      type: 'select',
      options: [
        { value: 'admin-mfa', label: 'Siti, admin, MFA verified' },
        { value: 'admin-no-mfa', label: 'Siti, admin, MFA not verified' },
        { value: 'agent', label: 'Budi, regular agent' },
        { value: 'nobody', label: 'Nobody, logged out' },
      ],
    },
    { id: 'username', label: 'New username', type: 'text' },
    { id: 'fullName', label: 'Full name', type: 'text' },
    { id: 'agentCode', label: 'Agent code (optional)', type: 'text' },
  ],
  scenarios: [
    { id: 'ok', title: 'Admin creates an agent', detail: 'Everything passes. Watch the name get tidied up.', input: { actor: 'admin-mfa', username: 'rina.agent', fullName: '  rina   PUTRI ', agentCode: 'AG-077' } },
    { id: 'taken', title: 'Username already taken', detail: 'Case doesn’t matter: Budi.Agent is budi.agent.', input: { actor: 'admin-mfa', username: 'Budi.Agent', fullName: 'Budi Kedua', agentCode: '' } },
    { id: 'short-name', title: 'Name too short', detail: 'Full names need 2 to 80 characters.', input: { actor: 'admin-mfa', username: 'x.agent', fullName: 'A', agentCode: '' } },
    { id: 'agent', title: 'Regular agent tries it', detail: 'Logged in with MFA, but not an admin.', input: { actor: 'agent', username: 'teman.budi', fullName: 'Teman Budi', agentCode: '' } },
    { id: 'no-mfa', title: 'Admin without MFA', detail: 'Right role, but this session skipped MFA.', input: { actor: 'admin-no-mfa', username: 'joko.agent', fullName: 'Joko Susilo', agentCode: '' } },
    { id: 'nobody', title: 'Not logged in', detail: 'No session token at all.', input: { actor: 'nobody', username: 'hacker', fullName: 'Hacker', agentCode: '' } },
    {
      id: 'limit',
      title: 'Rate limit reached',
      detail: 'Siti already created 25 accounts in 15 minutes.',
      input: { actor: 'admin-mfa', username: 'satu.lagi', fullName: 'Satu Lagi', agentCode: '' },
      setup(db) {
        const rows = Array.from({ length: RATE_LIMIT }, (_, i) => ({ id: `seed-${i}`, actor_id: 'u-002', action: CREATED, target_user_id: 'earlier' }))
        db.audit.push(...rows)
        return () => { db.audit = db.audit.filter((row) => !rows.includes(row)) }
      },
    },
    { id: 'rollback', title: 'Database fails halfway', detail: 'The history insert errors after the login exists.', input: { actor: 'admin-mfa', username: 'gagal.agent', fullName: 'Gagal Agent', agentCode: '' }, flags: { failHistory: true } },
    { id: 'reset', title: 'Reset a password', detail: 'Puts Dewi back on the default password.', input: { actor: 'admin-mfa' }, flags: { action: 'reset-password' } },
  ],

  createDb() {
    return {
      nextUser: 4,
      nextAudit: 1,
      auth: [
        { id: 'u-001', email: 'budi.agent@users.protea.local', meta: { username: 'budi.agent', must_change_password: false } },
        { id: 'u-002', email: 'siti.admin@users.protea.local', meta: { username: 'siti.admin', must_change_password: false } },
        { id: 'u-003', email: 'dewi.agent@users.protea.local', meta: { username: 'dewi.agent', must_change_password: false } },
      ],
      profiles: [
        { id: 'u-001', username: 'budi.agent', full_name: 'Budi Santoso', agent_code: 'AG-012', disabled_at: null },
        { id: 'u-002', username: 'siti.admin', full_name: 'Siti Rahma', agent_code: null, disabled_at: null },
        { id: 'u-003', username: 'dewi.agent', full_name: 'Dewi Lestari', agent_code: 'AG-031', disabled_at: null },
      ],
      roles: { 'u-001': 'user', 'u-002': 'admin', 'u-003': 'user' },
      history: [{ id: 'h-u-003', username: 'dewi.agent', full_name: 'Dewi Lestari', created_by: 'u-002', created_user_id: 'u-003' }],
      audit: [],
    }
  },
  tables: [
    {
      name: 'auth.users',
      key: (row) => row.id,
      rows: (db) => db.auth,
      columns: [
        { label: 'id', value: (r) => r.id },
        { label: 'email', value: (r) => r.email },
        { label: 'must change password', value: (r) => r.meta.must_change_password },
      ],
    },
    {
      name: 'profiles',
      note: 'with role from user_roles',
      key: (row) => row.id,
      rows: (db) => db.profiles,
      columns: [
        { label: 'id', value: (r) => r.id },
        { label: 'username', value: (r) => r.username },
        { label: 'full_name', value: (r) => r.full_name },
        { label: 'agent_code', value: (r) => r.agent_code },
        { label: 'role', value: (r, db) => db.roles[r.id] },
      ],
    },
    {
      name: 'user_creation_history',
      key: (row) => row.id,
      rows: (db) => db.history,
      columns: [
        { label: 'username', value: (r) => r.username },
        { label: 'created_by', value: (r) => r.created_by },
        { label: 'created_user_id', value: (r) => r.created_user_id },
      ],
    },
    {
      name: 'security_audit_log',
      note: 'latest 6',
      empty: 'No audit entries yet',
      key: (row) => row.id,
      rows: (db) => db.audit.slice(-6).reverse(),
      columns: [
        { label: 'actor_id', value: (r) => r.actor_id },
        { label: 'action', value: (r) => r.action },
        { label: 'target', value: (r) => r.target_user_id },
      ],
    },
  ],

  async run(ctx, input) {
    const actor = ACTORS[input.actor] ?? null
    const action = input.action ?? 'create'
    const passed = await securityGate(ctx, actor, action)
    if (!passed) return
    return action === 'reset-password' ? resetPassword(ctx, actor) : createUser(ctx, actor, input)
  },
}

// authenticateRequest + MFA + role + rate limit, in the order the function runs them.
async function securityGate(ctx, actor, action) {
  const { db, code } = ctx
  const rateAction = action === 'reset-password' ? PASSWORD_RESET : CREATED

  await ctx.say(`Kelola User sends ${code(`{ action: "${action}" }`)} along with the caller’s session token.`)
  await ctx.send('browser', 'fn', `POST ${action}`)
  await ctx.say('The function only accepts a POST from Protea’s own site.')

  if (!actor) {
    ctx.check('session', false)
    ctx.fault()
    await ctx.say(`There is no ${code('Authorization: Bearer')} header, so the request stops here.`)
    await ctx.respond(401, { error: 'Authentication required' }, 'Kelola User is behind the login, so in practice this only happens to scripted requests.')
    return false
  }

  await ctx.say('Is the session token real and unexpired? The function asks Auth.')
  await ctx.send('fn', 'auth', 'getUser(token)')
  await ctx.reply('auth', `user ${actor.id}`)
  await ctx.send('fn', 'profiles', 'disabled?')
  await ctx.reply('profiles', 'active')
  ctx.check('session', true)

  await ctx.say(`The token says how ${actor.name} logged in: assurance level ${code(actor.aal)}. Managing accounts needs ${code('aal2')}, which means MFA was completed.`)
  if (actor.aal !== 'aal2') {
    ctx.check('mfa', false)
    ctx.fault()
    await ctx.respond(403, { error: 'MFA verification is required' }, `Kelola User asks ${actor.name} to verify with MFA and try again.`)
    return false
  }
  ctx.check('mfa', true)

  await ctx.say(`What role does ${actor.name} have?`)
  await ctx.send('fn', 'roles', `role of ${actor.id}`)
  const role = db.roles[actor.id] ?? 'user'
  await ctx.reply('roles', role)
  if (role !== 'admin' && role !== 'developer') {
    ctx.check('role', false)
    ctx.fault()
    await ctx.say(`${actor.name} is a ${code(role)}. Only admins and developers can continue.`)
    await ctx.respond(403, { error: 'Admin or developer access required' }, 'Regular agents never see Kelola User, so this blocks requests made outside the app.')
    return false
  }
  ctx.check('role', true)

  await ctx.say(`The rate limit counts ${actor.name}’s ${code(rateAction)} rows in the audit log from the last 15 minutes.`)
  await ctx.send('fn', 'audit', 'count last 15 min')
  const count = db.audit.filter((row) => row.actor_id === actor.id && row.action === rateAction).length
  await ctx.reply('audit', `${count} rows`)
  if (count >= RATE_LIMIT) {
    ctx.check('limit', false)
    ctx.fault()
    await ctx.say(`${count} reaches the limit of ${RATE_LIMIT}.`)
    await ctx.respond(429, { error: 'rate_limited' }, 'Kelola User shows <q>Terlalu banyak akun dibuat. Coba lagi nanti.</q>')
    return false
  }
  ctx.check('limit', true)
  return true
}

async function createUser(ctx, actor, input) {
  const { db, code } = ctx
  const username = normalizeUsername(input.username ?? '')
  const fullName = normalizeFullName(input.fullName ?? '')
  const agentCode = (input.agentCode ?? '').trim() || null

  await ctx.say(`The input is tidied: ${code(input.fullName)} becomes ${code(fullName)}, and the username is lowercased to ${code(username)}.`)
  if (!USERNAME_PATTERN.test(username) || fullName.length < 2 || fullName.length > NAME_MAX_LENGTH
    || (agentCode && agentCode.length > AGENT_CODE_MAX_LENGTH)) {
    ctx.check('input', false)
    ctx.fault()
    await ctx.say('Usernames need 3 to 32 characters of a–z, 0–9, dot, dash or underscore. Names need 2 to 80 characters.')
    return ctx.respond(400, { error: 'invalid_input' }, 'Kelola User shows <q>Username atau nama tidak valid.</q>')
  }

  await ctx.say(`Is ${code(username)} already taken?`)
  await ctx.send('fn', 'profiles', 'find username')
  const taken = db.profiles.some((row) => row.username === username)
  await ctx.reply('profiles', taken ? 'found' : 'free')
  if (taken) {
    ctx.check('input', false)
    ctx.fault()
    return ctx.respond(409, { error: 'username_taken' }, 'Kelola User shows <q>Username sudah digunakan.</q>')
  }
  ctx.check('input', true)

  const email = `${username}@users.protea.local`
  await ctx.say(`The login is created in Auth with an internal email, ${code(email)}, and the default password ${code(DEFAULT_PASSWORD)}. A flag forces a password change on first login.`)
  await ctx.send('fn', 'auth', 'admin.createUser')
  const userId = `u-${String(db.nextUser++).padStart(3, '0')}`
  db.auth.push({ id: userId, email, meta: { username, must_change_password: true } })
  ctx.commit()
  await ctx.reply('auth', `id ${userId}`)

  try {
    await ctx.say('The profile is saved with the tidied name and agent code.')
    await ctx.send('fn', 'profiles', 'upsert profile')
    db.profiles.push({ id: userId, username, full_name: fullName, agent_code: agentCode, disabled_at: null })
    ctx.commit()
    await ctx.reply('profiles', 'saved')

    await ctx.say(`The new account gets the plain ${code('user')} role.`)
    await ctx.send('fn', 'roles', 'upsert role')
    db.roles[userId] = 'user'
    ctx.commit()
    await ctx.reply('roles', 'saved')

    await ctx.say(`${code('user_creation_history')} records that ${actor.name} created this account.`)
    await ctx.send('fn', 'history', 'insert row')
    if (input.failHistory) {
      await ctx.reply('history', 'error', 'fault')
      throw new Error('history insert failed')
    }
    db.history.unshift({ id: `h-${userId}`, username, full_name: fullName, created_by: actor.id, created_user_id: userId })
    ctx.commit()
    await ctx.reply('history', 'saved')

    await ctx.say('An audit entry is written. The rate limit counts these rows next time.')
    await ctx.send('fn', 'audit', 'insert entry')
    db.audit.push({ id: `l-${db.nextAudit++}`, actor_id: actor.id, action: CREATED, target_user_id: userId })
    ctx.commit()
    await ctx.reply('audit', 'saved')

    return ctx.respond(200, {}, `Kelola User lists ${code(username)}. Hand over the default password; the new agent must change it on first login.`)
  } catch {
    ctx.fault()
    await ctx.say('A save failed after the Auth login already existed. The function deletes that login so no half-made account can sign in.')
    await ctx.send('fn', 'auth', 'admin.deleteUser', 'fault')
    db.auth = db.auth.filter((row) => row.id !== userId)
    delete db.roles[userId]
    ctx.commit()
    await ctx.reply('auth', 'deleted')
    await ctx.say(`The ${code('user_roles')} row goes with it (${code('on delete cascade')}). Protea’s migrations don’t define a cascade for ${code('profiles')}, so that row may be left behind and block the username on the next try.`)
    return ctx.respond(500, { error: 'server_error' }, 'Kelola User shows <q>Permintaan tidak dapat diproses.</q>')
  }
}

async function resetPassword(ctx, actor) {
  const { db, code } = ctx
  const entry = db.history.find((row) => row.username === 'dewi.agent') ?? db.history[0]
  ctx.check('input', true)

  await ctx.say(`The history row for ${code(entry.username)} says which login to reset.`)
  await ctx.send('fn', 'history', 'find row')
  await ctx.reply('history', `user ${entry.created_user_id}`)

  await ctx.say('The function first reads the user’s current details. The update replaces them all at once, so the old ones have to be copied back in.')
  await ctx.send('fn', 'auth', 'admin.getUserById')
  const user = db.auth.find((row) => row.id === entry.created_user_id)
  await ctx.reply('auth', 'details')

  await ctx.say(`The password goes back to ${code(DEFAULT_PASSWORD)} and the must-change-password flag is turned on again.`)
  await ctx.send('fn', 'auth', 'admin.updateUserById')
  user.meta = { ...user.meta, must_change_password: true }
  ctx.commit()
  await ctx.reply('auth', 'updated')

  await ctx.send('fn', 'audit', 'insert entry')
  db.audit.push({ id: `l-${db.nextAudit++}`, actor_id: actor.id, action: PASSWORD_RESET, target_user_id: user.id })
  ctx.commit()
  await ctx.reply('audit', 'saved')
  return ctx.respond(200, { success: true }, `${code(entry.username)} can log in with ${code(DEFAULT_PASSWORD)} and will be asked to choose a new password.`)
}
