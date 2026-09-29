# Policy Gate for taskflow-api (Lab 06).
# Input: the JSON written by `npm audit --json` (backend/reports/audit.json).
# Two independent clauses: either one firing denies the build.
package security

import rego.v1

# Clause 1: the audit summary counts at least one critical vulnerability.
deny contains msg if {
	n := input.metadata.vulnerabilities.critical
	n > 0
	msg := sprintf("npm audit reports %d CRITICAL vulnerabilit(ies)", [n])
}

# Clause 2: name every individual package whose advisory is CRITICAL.
deny contains msg if {
	some name, vuln in input.vulnerabilities
	vuln.severity == "critical"
	msg := sprintf("CRITICAL CVE in dependency '%s'", [name])
}

allow if count(deny) == 0
