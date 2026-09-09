# HR Nexus V2 demo readiness

Leadership demo: 16 September 2026. Feature freeze: 10 September.

Target story: admin login → company settings → spreadsheet import → employee review
→ employee login → QR/location attendance → leave submission → approval → payroll
→ published payslip → reports/export → audit trail.

Company Settings, Employee/Department stability, Company Import, Attendance
Verification, Leave, Payroll, Reports and the Audit Log are all complete and browser
verified. **Employee Dashboard V2, company-wide data export and XLSX export are not
built**, and there is still no forced first-login password change. Do not present those
four as complete.

The demo dataset is ready and reproducible: 6 departments, 24 fictional employees, eight
weeks of attendance with lateness, leave in every state, compensation, an approved August
2026 payroll with 22 payslips, and audit activity. See `HR_NEXUS_V2_DEMO_DATA.md` for what
it contains, the accounts, and how to load it.

**It has not been loaded into the source database, and should not be without explicit
approval.** The source still holds one active employee, the five protected orphan
attendance records and a September 2026 draft payroll period; that is not suitable demo
data. Load the demo into a separate database - the loader refuses the application's own
database unless explicitly flagged, and confines every write to identifiers 9000-9099.

Rehearse admin/employee permissions, duplicate import, QR expiry/wrong location,
leave double approval, historical payslip stability, exports, and audit attribution.
Test laptop/mobile flows and location permissions. Complete normal Docker restart
and rebuild without deleting volumes. Record the final stable commit/tag on 15 September.
