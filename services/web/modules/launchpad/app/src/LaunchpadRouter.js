/* eslint-disable
    max-len,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const logger = require('@overleaf/logger')
const LaunchpadController = require('./LaunchpadController')
const AuthenticationController = require('../../../../app/src/Features/Authentication/AuthenticationController')
const AuthorizationMiddleware = require('../../../../app/src/Features/Authorization/AuthorizationMiddleware')
const UserRegistrationHandler = require('../../../../app/src/Features/User/UserRegistrationHandler')
const r = require('request')
const crypto = require('crypto')
const UserGetter = require('../../../../app/src/Features/User/UserGetter')

module.exports = {
  apply(webRouter) {
    logger.debug({}, 'Init launchpad router')

    webRouter.get('/auth/iaaa', (req, res, next) => {
      const token = req.query.token
      const APP_ID = "latex_online";
      const REMOTE_ADDR = req.ip
      const KEY = "REPLACE_ME_IAAA_KEY";
      const str = `appId=${APP_ID}&remoteAddr=${REMOTE_ADDR}&token=${token}` + KEY;
      const md5 = (data) => crypto.createHash("md5").update(data).digest("hex");
      const url = `REPLACE_ME_IAAA_ENDPOINT/iaaa/svc/token/validate.do?remoteAddr=${REMOTE_ADDR}&appId=${APP_ID}&token=${token}&msgAbs=${md5(str)}`;
      r(url, function (err, resp, body) {
        if (err) {
          logger.error({ err }, `IAAA request failed, response: ${body}`);
        }
        const { userInfo } = JSON.parse(body);
        if (!userInfo) {
          logger.error({ err }, `IAAA request failed, response: ${body}`);
          return res.redirect('/');
        }
        const { identityId } = userInfo;
        const email = identityId + "@pku.edu.cn";
        // find user by email
        UserGetter.getUserByMainEmail(email, function (err, user) {
          if (!user) {
            const password = crypto.randomBytes(16).toString('hex')
            UserRegistrationHandler.registerNewUser({ email, password }, function (err, user) {
              if (!user) {
                logger.error({ err }, `Failed to register user ${email}`);
                return res.redirect('/');
              }
              logger.info({ email }, `User ${email} registered`);
              AuthenticationController.finishLogin(user, req, res, next);
            });
          }
          logger.info({ email }, `User ${email} logged in`);
          AuthenticationController.finishLogin(user, req, res, next);
        })
      })
    })
    AuthenticationController.addEndpointToLoginWhitelist('/auth/iaaa')

    webRouter.get('/launchpad', LaunchpadController.launchpadPage)
    webRouter.post(
      '/launchpad/register_admin',
      LaunchpadController.registerAdmin
    )
    webRouter.post(
      '/launchpad/register_ldap_admin',
      LaunchpadController.registerExternalAuthAdmin('ldap')
    )
    webRouter.post(
      '/launchpad/register_saml_admin',
      LaunchpadController.registerExternalAuthAdmin('saml')
    )
    webRouter.post(
      '/launchpad/send_test_email',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      LaunchpadController.sendTestEmail
    )

    if (AuthenticationController.addEndpointToLoginWhitelist != null) {
      AuthenticationController.addEndpointToLoginWhitelist('/launchpad')
      AuthenticationController.addEndpointToLoginWhitelist(
        '/launchpad/register_admin'
      )
      AuthenticationController.addEndpointToLoginWhitelist(
        '/launchpad/register_ldap_admin'
      )
      return AuthenticationController.addEndpointToLoginWhitelist(
        '/launchpad/register_saml_admin'
      )
    }
  },
}
