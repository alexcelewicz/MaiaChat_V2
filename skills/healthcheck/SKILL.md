---
name: healthcheck
slug: healthcheck
version: '1.0.0'
description: 'Host security hardening and risk-tolerance configuration. Security audits, firewall/SSH/update hardening, risk posture, exposure review.'
author: openclaw
icon: '🛡️'
category: productivity
permissions:
  - command_execution
  - file_access
---

# OpenClaw Host Hardening

## Overview

Assess and harden the host running OpenClaw, then align it to a user-defined risk tolerance without breaking access.

## Core rules

- Require explicit approval before any state-changing action.
- Do not modify remote access settings without confirming how the user connects.
- Prefer reversible, staged changes with a rollback plan.
- If role/identity is unknown, provide recommendations only.
- Every set of user choices must be numbered so the user can reply with a single digit.
- System-level backups are recommended; try to verify status.

## Workflow (follow in order)

### 1) Establish context (read-only)

Try to infer from the environment before asking. Determine:

1. OS and version (Linux/macOS/Windows), container vs host.
2. Privilege level (root/admin vs user).
3. Access path (local console, SSH, RDP, tailnet).
4. Network exposure (public IP, reverse proxy, tunnel).
5. Backup system and status.
6. Disk encryption status (FileVault/LUKS/BitLocker).
7. OS automatic security updates status.
8. Usage mode (local workstation vs headless/remote vs other).

First ask once for permission to run read-only checks. If granted, run by default. Examples:

- OS: `uname -a`, `cat /etc/os-release`
- Listening ports: Linux: `ss -ltnup`; macOS: `lsof -nP -iTCP -sTCP:LISTEN`
- Firewall status: Linux: `ufw status`, `firewall-cmd --state`, `nft list ruleset`; macOS: `/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate`

### 2) Determine risk tolerance

Ask the user to pick or confirm a risk posture:

1. Home/Workstation Balanced (most common): firewall on with reasonable defaults, remote access restricted to LAN or tailnet.
2. VPS Hardened: deny-by-default inbound firewall, minimal open ports, key-only SSH, no root login, automatic security updates.
3. Developer Convenience: more local services allowed, explicit exposure warnings, still audited.
4. Custom: user-defined constraints.

### 3) Produce a remediation plan

Include:

- Target profile
- Current posture summary
- Gaps vs target
- Step-by-step remediation with exact commands
- Access-preservation strategy and rollback
- Risks and potential lockout scenarios
- Least-privilege notes
- Credential hygiene notes

Always show the plan before any changes.

### 4) Offer execution options

1. Do it for me (guided, step-by-step approvals)
2. Show plan only
3. Fix only critical issues
4. Export commands for later

### 5) Execute with confirmations

For each step:

- Show the exact command
- Explain impact and rollback
- Confirm access will remain available
- Stop on unexpected output and ask for guidance

### 6) Verify and report

Re-check:

- Firewall status
- Listening ports
- Remote access still works

Deliver a final posture report and note any deferred items.

## Required confirmations (always)

Require explicit approval for:

- Firewall rule changes
- Opening/closing ports
- SSH/RDP configuration changes
- Installing/removing packages
- Enabling/disabling services
- User/group modifications
- Scheduling tasks or startup persistence
- Update policy changes
- Access to sensitive files or credentials

If unsure, ask.
