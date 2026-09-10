# Security and reporting

Never put wallet keys, provider tokens, customer data or production secrets in
an issue, pull request, browser bundle or Git history (including private Git).
Use a local ignored environment file or the hosting platform's secret store.

For a suspected vulnerability, use GitHub's private vulnerability reporting if
it is enabled under Security → Advisories → Report a vulnerability. If this
option is unavailable, ask the maintainer for a private reporting channel
without publishing exploit details or credentials. No report has been sent by
adding this policy.

SIM and PAPER are local demonstrations; the browser leaderboard is unverified.
PAPER never signs or submits exchange orders. Live execution remains guarded
and is not a production trading integration. Do not infer model availability
from fixture tests or treat local saves as trusted account records.

If a credential is exposed, revoke/rotate it first, then follow GitHub's
sensitive-data removal procedure. Changing repository visibility or adding a
.gitignore rule does not revoke leaked credentials or remove public copies.
