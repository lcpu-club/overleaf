const AuthenticationController = require('../Authentication/AuthenticationController')
const EmailHelper = require('../Helpers/EmailHelper')
const UserGetter = require('../User/UserGetter')
const { expressify } = require('@overleaf/promise-utils')

async function createSession(req, res) {
  const email = EmailHelper.parseEmail(req.body?.email)
  if (!email) {
    return res.status(400).json({ error: 'invalid_email' })
  }

  const user = await UserGetter.promises.getUserByAnyEmail(email)

  if (!user) {
    return res.sendStatus(404)
  }

  if (user.suspended) {
    return res.status(403).json({ error: 'account_suspended' })
  }

  await AuthenticationController.promises.createSessionForUser(user, req)

  return res.status(201).json({
    user: {
      id: user._id.toString(),
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
    },
  })
}

module.exports = {
  createSession: expressify(createSession),
}
