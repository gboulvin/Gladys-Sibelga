# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords, e-mail addresses and EAN
  codes first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## What the integration handles

- **Your Sibelga password and e-mail address.** Gladys stores them (the
  password as a `secret` field) and hands them to the integration, which only
  sends them to the Sibelga sign-in page (`auth.conso.sibelga.be`) over HTTPS.
  They are never logged and never written to disk by the integration.
- **Session tokens.** The access and refresh tokens Sibelga returns stay in
  memory: a restart signs in again.
- **`/data/state.json`.** The only file the integration writes. It holds the
  last day of readings announced per EAN code and the outages already seen —
  no credential, no token, no consumption value.
- **Outgoing connections.** Only to Sibelga: `auth.conso.sibelga.be`,
  `api-gateway.datahub.sibelga.be` and `www.sibelga.be`. Nothing is sent to
  any other party.

The identifiers in `src/sibelga/constants.js` (API keys, client id) are those
of Sibelga's public web portal, served to every browser: they are not secrets
of this project, and finding them here is not a vulnerability.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the Sibelga services the integration talks to — report a problem in those
to Sibelga.
