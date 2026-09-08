# HR Nexus V2 demo readiness

Leadership demo: 16 September 2026. Feature freeze: 10 September.

Target story: admin login → company settings → spreadsheet import → employee review
→ employee login → QR/location attendance → leave submission → approval → payroll
→ published payslip → reports/export → audit trail.

Current core pages exist, but settings, imports, verified attendance, balances,
payroll/payslips, exports and audit are not ready. Do not present them as complete.
The live database currently has one active employee and five orphan attendance
records; this is not suitable final demo data.

Once P0 is stable, prepare 20+ professional fictional employees across departments,
attendance/late examples, pending/approved leave, balances, compensation, payroll,
payslips and audit history using intentional non-destructive seed tooling.
Do not use real personal data or overwrite existing records to stage the demo.

Rehearse admin/employee permissions, duplicate import, QR expiry/wrong location,
leave double approval, historical payslip stability, exports, and audit attribution.
Test laptop/mobile flows and location permissions. Complete normal Docker restart
and rebuild without deleting volumes. Record the final stable commit/tag on 15 September.
