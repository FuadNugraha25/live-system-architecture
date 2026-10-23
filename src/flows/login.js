// Mirrors supabase/functions/login-with-username/index.ts in Protea.

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/
const MAX_PASSWORD_LENGTH = 256
const USERNAME_FAILURE_LIMIT = 10
const CLIENT_IP = '203.0.113.7'
const SHOWN_ERROR = 'The login page shows <q>Username atau kata sandi salah.</q>'

// Stand-in for the real SHA-256 hash; only needs to be stable and short.
function hash(value) {
  let h = 0
  for (const char of value) h = (h * 31 + char.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(8, '0')
}

const usernameHash = (username) => hash(`username:${username}`)
const ipHash = hash(`ip:${CLIENT_IP}`)

export default {
  id: 'login',
  title: 'Log in with a username',
  summary: 'An agent types a username and password. The Edge Function turns the username into an email, checks for repeated failures, and asks Supabase Auth to verify the password.',
  source: 'supabase/functions/login-with-username',
  hub: 'fn',
  client: 'browser',

  nodes: [
    { id: 'browser', kind: 'client', name: 'Login page', detail: 'CustomLogin.jsx', x: 110, y: 250 },
    { id: 'fn', kind: 'hub', name: 'login-with-username', x: 440, y: 250 },
    { id: 'attempts', kind: 'table', name: 'username_login_attempts', detail: 'failed-login log', x: 440, y: 70, label: 'right' },
    { id: 'profiles', kind: 'table', name: 'profiles', detail: 'username to user id', x: 790, y: 100, label: 'right' },
    { id: 'admin', kind: 'service', name: 'Auth admin', detail: 'user id to email', x: 860, y: 270, label: 'below' },
    { id: 'signin', kind: 'service', name: 'Auth sign-in', detail: 'checks the password', x: 690, y: 420, label: 'right' },
  ],
  lines: [['browser', 'fn'], ['fn', 'attempts'], ['fn', 'profiles'], ['fn', 'admin'], ['fn', 'signin']],
  checks: [
    { id: 'format', label: 'Username format' },
    { id: 'limit', label: 'Under failure limit' },
    { id: 'account', label: 'Active account' },
    { id: 'password', label: 'Password' },
  ],

  fields: [
    { id: 'username', label: 'Username', type: 'text' },
    { id: 'password', label: 'Password', type: 'text' },
  ],
  scenarios: [
    { id: 'ok', title: 'Correct login', detail: 'Budi logs in with the right password.', input: { username: 'budi.agent', password: 'rahasia123' } },
    { id: 'wrong', title: 'Wrong password', detail: 'Right username, wrong password.', input: { username: 'budi.agent', password: 'salah' } },
    { id: 'ghost', title: 'Username that doesn’t exist', detail: 'Gets the same error as a wrong password.', input: { username: 'ghost.user', password: 'apapun' } },
    { id: 'disabled', title: 'Disabled account', detail: 'The profile was switched off by an admin.', input: { username: 'old.agent', password: 'lama123' } },
    { id: 'format', title: 'Badly formed username', detail: 'Rejected before any database lookup.', input: { username: 'Hi!', password: 'x' } },
    {
      id: 'locked',
      title: 'Too many failed attempts',
      detail: 'Ten failures in the last 15 minutes are already logged.',
      input: { username: 'budi.agent', password: 'salah' },
      setup(db) {
        const rows = Array.from({ length: USERNAME_FAILURE_LIMIT }, (_, i) => ({ id: `seed-${i}`, username_hash: usernameHash('budi.agent'), ip_hash: ipHash, successful: false }))
        db.attempts.push(...rows)
        return () => { db.attempts = db.attempts.filter((row) => !rows.includes(row)) }
      },
    },
  ],

  createDb() {
    return {
      profiles: [
        { id: 'u-001', username: 'budi.agent', disabled_at: null },
        { id: 'u-002', username: 'siti.admin', disabled_at: null },
        { id: 'u-003', username: 'old.agent', disabled_at: '2026-03-01' },
      ],
      authUsers: {
        'u-001': { email: 'budi@protea.test', password: 'rahasia123' },
        'u-002': { email: 'siti@protea.test', password: 'admin456' },
        'u-003': { email: 'old@protea.test', password: 'lama123' },
      },
      attempts: [],
      nextAttempt: 1,
    }
  },
  tables: [
    {
      name: 'profiles',
      key: (row) => row.id,
      rows: (db) => db.profiles,
      columns: [
        { label: 'id', value: (r) => r.id },
        { label: 'username', value: (r) => r.username },
        { label: 'disabled_at', value: (r) => r.disabled_at },
      ],
    },
    {
      name: 'username_login_attempts',
      note: 'latest 8',
      empty: 'No attempts logged yet',
      key: (row) => row.id,
      rows: (db) => db.attempts.slice(-8).reverse(),
      columns: [
        { label: 'username_hash', value: (r) => r.username_hash },
        { label: 'ip_hash', value: (r) => r.ip_hash },
        { label: 'successful', value: (r) => r.successful },
      ],
    },
  ],

  async run(ctx, { username: rawUsername = '', password = '' }) {
    const { db, code } = ctx
    const deny = () => ctx.respond(401, { error: 'invalid_credentials' }, SHOWN_ERROR)

    await ctx.say(`The login page sends ${code(rawUsername)} and the password to the Edge Function.`)
    await ctx.send('browser', 'fn', 'POST /login-with-username')
    await ctx.say('The function only accepts a POST from Protea’s own site, with a body under 4 KB.')

    const username = rawUsername.trim().toLowerCase()
    if (!USERNAME_PATTERN.test(username) || !password || password.length > MAX_PASSWORD_LENGTH) {
      ctx.check('format', false)
      ctx.fault()
      await ctx.say(`${code(username)} isn’t a valid username: it must be 3 to 32 characters of a–z, 0–9, dot, dash or underscore. Rejected before any database lookup.`)
      return deny()
    }
    ctx.check('format', true)

    const userHash = usernameHash(username)
    await ctx.say('The username and IP address are hashed, so the attempt log never stores the real values.')
    await ctx.say('How many failed logins has this username had in the last 15 minutes?')
    await ctx.send('fn', 'attempts', 'count failures')
    const failures = db.attempts.filter((row) => row.username_hash === userHash && !row.successful).length
    await ctx.reply('attempts', `${failures} failures`)
    if (failures >= USERNAME_FAILURE_LIMIT) {
      ctx.check('limit', false)
      ctx.fault()
      await ctx.say(`${failures} failures reaches the limit of ${USERNAME_FAILURE_LIMIT}. The function stops before it even checks the password.`)
      return ctx.respond(429, { error: 'rate_limited' }, 'The login page shows the same generic error. The username unlocks once the failures are older than 15 minutes.')
    }
    ctx.check('limit', true)

    const recordAttempt = async (successful) => {
      await ctx.send('fn', 'attempts', `log successful=${successful}`, successful ? 'ok' : 'fault')
      db.attempts.push({ id: `a-${db.nextAttempt++}`, username_hash: userHash, ip_hash: ipHash, successful })
      ctx.commit()
      await ctx.say(`The attempt is logged with successful = ${code(successful)}.`)
    }

    await ctx.say(`The function looks up ${code(username)} in ${code('profiles')}.`)
    await ctx.send('fn', 'profiles', 'find username')
    const profile = db.profiles.find((row) => row.username === username)
    await ctx.reply('profiles', profile ? `id ${profile.id}` : 'no row')

    if (profile?.disabled_at) {
      ctx.check('account', false)
      ctx.fault()
      await ctx.say(`The profile exists but was disabled on ${profile.disabled_at}.`)
      await recordAttempt(false)
      return deny()
    }

    let email = null
    if (profile) {
      await ctx.say('Using the admin key, the function asks Auth for this user’s email address.')
      await ctx.send('fn', 'admin', 'getUserById')
      email = db.authUsers[profile.id]?.email ?? null
      await ctx.reply('admin', email ?? 'no user')
    }
    if (!email) {
      ctx.check('account', false)
      ctx.fault()
      await ctx.say('No account matches. The response is identical to a wrong password, so nobody can probe which usernames exist.')
      await recordAttempt(false)
      return deny()
    }
    ctx.check('account', true)

    await ctx.say(`The function signs in to Auth with ${code(email)} and the password.`)
    await ctx.send('fn', 'signin', 'signInWithPassword')
    const passwordOk = db.authUsers[profile.id].password === password
    await ctx.reply('signin', passwordOk ? 'session' : 'rejected', passwordOk ? 'ok' : 'fault')
    if (!passwordOk) {
      ctx.check('password', false)
      ctx.fault()
      await ctx.say('Auth rejects the password.')
      await recordAttempt(false)
      return deny()
    }
    ctx.check('password', true)

    await ctx.say('The password is correct. Auth returns an access token and a refresh token.')
    await recordAttempt(true)
    await ctx.say('Attempt rows older than 7 days are cleared out. Every response is held to at least 350 ms, so timing doesn’t reveal which check failed.')
    return ctx.respond(200, { access_token: 'fake', refresh_token: 'fake' }, `The login page calls ${code('supabase.auth.setSession()')} with the tokens. Budi is logged in.`)
  },
}
