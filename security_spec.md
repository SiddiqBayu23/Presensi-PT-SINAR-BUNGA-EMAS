# Security Specification — PT Sinar Bunga Mas HRIS (Firestore Zero-Trust)

## 1. Data Invariants
1. **Master Gate & Global Default Deny**: Every unmatched path is denied (`allow read, write: if false`).
2. **Verified Email Identity**: Every authenticated read/write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **No Self-Assigned Roles**: Non-admin employees can only create `/employees/{uid}` where `employeeId == request.auth.uid` and `role == 'employee'`. Only verified HRD admins (`fikriramadhan998@gmail.com` or `/admins/{uid}`) may assign `role == 'hrd'`, modify salaries/leave quotas, or manage `/admins/{adminId}`.
4. **PII Isolation**: `/employees/{employeeId}` contains email, phone, and address. Single-doc `get` is strictly limited to `isOwner(employeeId) || isAdmin()`. `list` queries are strictly limited to `resource.data.uid == request.auth.uid || isBootstrapAdmin()` (zero `get()`/`exists()` inside `allow list`).
5. **Global Consistency Invariant**: Every operational record (`attendance`, `leaves`, `overtimes`, `shiftSwaps`, `exitClearances`, `schedules`) MUST reference an existing employee profile via `exists(/databases/$(database)/documents/employees/$(incoming().uid))` on create.
6. **Terminal State Locking**: Once a `leave`, `overtime`, `shiftSwap`, or `exitClearance` transitions to `'Disetujui'` or `'Ditolak'`, non-admins cannot mutate it. Once an `attendance` record has `clockOutTime != ''`, non-admins cannot overwrite it.
7. **Temporal Integrity & Immutability**: `createdAt == request.time` on create; `updatedAt == request.time` on update; `uid`, `nik`, and `createdAt` remain immutable on update.
8. **Strict Key & Size Enforcement**: Every create enforces `hasAll` + `hasOnly`; every update is wrapped in `isValid[Entity](incoming())` and uses action-based `affectedKeys().hasOnly(...)`. Every string has `.size()` bounds; `exitClearances.checklist` is strictly bounded `1..10` with index-0 map validation.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unverified Admin Email Spoof**: `{ auth: { uid: "attacker", token: { email: "fikriramadhan998@gmail.com", email_verified: false } } }` reading `/employees/victimUid`.
2. **Self-Assigned HRD Privilege Escalation on Create**: Creating `/employees/u1` with `{ uid: "u1", role: "hrd", ... }` as non-admin.
3. **Shadow Field Injection ("Ghost Field")**: Updating `/employees/u1` with `{ phone: "0812", isSuperAdmin: true, updatedAt: serverTimestamp }`.
4. **Cross-User PII Read**: Authenticated verified user `u1` requesting `get /employees/u2`.
5. **Blanket Collection Scraping**: Authenticated verified user `u1` executing unfiltered `list /attendance` without `where('uid', '==', 'u1')`.
6. **Salary & Leave Quota Tampering**: Employee `u1` updating `/employees/u1` with `{ baseSalary: 99999999, leaveQuota: 999, updatedAt: serverTimestamp }`.
7. **Identity Spoofing on Attendance Create**: Employee `u1` creating `/attendance/att-1` with `{ uid: "u2", ... }`.
8. **Orphaned Record Creation**: Authenticated verified user `u_ghost` (no `/employees/u_ghost` doc) creating `/leaves/lv-1` with `{ uid: "u_ghost", ... }`.
9. **Self-Approval State Shortcutting**: Employee `u1` creating `/leaves/lv-1` with `{ status: "Disetujui" }` or updating an existing leave to `status: "Disetujui"`.
10. **Terminal State Mutation**: Employee `u1` updating `/exitClearances/ex-1` checklist after `existing().status == "Disetujui"`.
11. **Resource Poisoning (Oversized ID & String)**: Creating `/attendance/` with a 150-char document ID or a 5,000-char `clockInAddress`.
12. **Client Timestamp Forgery**: Creating `/overtimes/ot-1` with a backdated client timestamp (`createdAt != request.time`) or mutating `createdAt` during update.
