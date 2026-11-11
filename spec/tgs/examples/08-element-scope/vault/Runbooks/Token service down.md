---
type: Runbook
---
# Token service down

## Symptoms

Logins fail with 503.

<details>
<rollback>
Redeploy the previous release.
</rollback>
</details>

<step id="restart" risk="safe">
Restart the token service.
</step>

<step risk="reboot">
<check>The health endpoint answers 200.</check>
<rollback>
Undo the reboot.
</rollback>
</step>

<check>Outside any step this is text.</check>

<note owner="sre">Undeclared attributes are allowed.</note>
