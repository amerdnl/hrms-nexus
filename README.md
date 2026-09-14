# HR Nexus

HR Nexus is a full-stack Human Resource Management System developed as a group project. It provides role-based tools for employees and administrators to manage attendance, leave, employee records, departments, profiles, and HR dashboard information through a responsive web interface.

## Features

HR Nexus V3 is organised around what each person can do. Access is decided by the server
on every request from current data, so the interface only ever reflects it.

### Everyone signed in

- Action Center: the work waiting for you, derived from the records themselves
- Notifications with an unread count, links to the page concerned and a full history
- Global search (Ctrl+K or ⌘K) over people, departments and pages you may open
- Company directory, social profiles with an About section, and an org chart
- Company calendar with holidays, events and who is out
- Announcements for the company or one department, with read tracking
- Recognition between colleagues, public or private
- Light, dark and system themes, and layouts that work from 375px phones up

### Employee

- Dashboard with today, leave, goals, recognition and announcements
- Verified attendance: check-in and check-out with the office QR code and location
- Leave requests previewed in working days from the company's working week, balances,
  and cancellation until the leave starts (by the company's date)
- Payslips, with a notification when payroll is approved and when it is paid
- Goals with progress history, self-reviews and a response to the manager's review
- Onboarding and offboarding tasks
- Profile, profile photo and password change

### Manager

Anyone with direct reports, decided from the current reporting line:

- My team: who is in today, leave waiting for a decision, who is away, and team insights
- Team leave decisions, team attendance, team goals and manager reviews
- A report's leave reasons and goals, never their pay or personal details

### Administrator (HR)

- Employees, departments and reporting lines
- Attendance records and audited corrections, with missing check-outs in the Action Center
- Leave management, policies and entitlements
- Payroll from calculation through review and approval to paid; statutory amounts are
  entered as manual lines (EPF, SOCSO, EIS and PCB are not calculated automatically)
- Onboarding and offboarding templates and plans
- Performance review cycles and goal oversight
- Announcements, company holidays, company events and company settings
- Reports and analytics: workforce, attendance, leave, payroll, onboarding, performance
  and recognition
- Data export (CSV and Excel), employee import and the audit log

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide React
- Axios

### Backend

- Node.js
- Express.js
- TypeScript
- JWT Authentication
- Multer

### Database

- PostgreSQL

### Development & Infrastructure

- Docker
- Docker Compose
- Git
- GitHub

## Local Setup

1. Clone the repository.

```bash
git clone <repository-url>
cd hr-nexus
```

2. Copy the environment example files.

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

3. Install the frontend dependencies.

```bash
cd frontend
npm install
```

4. Install the backend dependencies.

```bash
cd ../backend
npm install
```

5. Return to the project root.

```bash
cd ..
```

6. Start Docker Desktop.

7. Build and start the full system.

```bash
docker compose up --build
```

Or run it in the background:

```bash
docker compose up -d --build
```

## Starting and Stopping the Local System

Run the following Docker commands from the project root directory.

### Start the Full System

Start the frontend, backend, and PostgreSQL database:

```bash
docker compose up
```

To run everything in the background:

```bash
docker compose up -d
```

If Docker images, dependencies, or Docker configuration have changed, rebuild before starting:

```bash
docker compose up --build
```

Or rebuild and start in the background:

```bash
docker compose up -d --build
```

### Check Running Services

```bash
docker compose ps
```

### Stop the Full System

```bash
docker compose down
```

This stops and removes the application containers while keeping the PostgreSQL Docker volume, so your local database data should remain available when the system is started again.

### Start the System Again

After running `docker compose down`, start the system again with:

```bash
docker compose up -d
```

If you want to see the logs directly in the terminal:

```bash
docker compose up
```

### Restart the Full System

```bash
docker compose restart
```

### Restart Individual Services

Restart the backend:

```bash
docker compose restart backend
```

Restart the frontend:

```bash
docker compose restart frontend
```

Restart PostgreSQL:

```bash
docker compose restart postgres
```

### View Logs

View logs for all services:

```bash
docker compose logs
```

Follow logs continuously:

```bash
docker compose logs -f
```

View only backend logs:

```bash
docker compose logs -f backend
```

### Important

Avoid using:

```bash
docker compose down -v
```

unless you intentionally want to delete Docker volumes.

The `-v` option may remove the PostgreSQL volume and therefore delete your local database data.

## Services

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5001/api`
- Backend health check: `http://localhost:5001/api/health`
- Database health check: `http://localhost:5001/api/health/database`

> Confirm the backend host port in `docker-compose.yml` if the URLs above do not work in your local environment.

## Project Modules

- Authentication, sessions and forced password change
- Roles and permissions: employee, manager scope and HR
- People: directory, social profiles, org chart and reporting lines
- Workplace: Action Center, notifications, search, calendar and announcements
- Attendance with QR and location verification
- Leave with balances and working-day counting
- Payroll with an immutable approved and paid state
- Onboarding and offboarding
- Recognition and the employee timeline
- Goals and performance reviews
- Reports, analytics, data export and import
- Company settings, holidays and the audit log

## User Roles

HR Nexus has two account roles, **employee** and **admin**. **Manager** is not a stored
role: an employee is a manager while someone currently reports to them, and loses that
scope on the next request when the last report moves. The full permission model and the
profile visibility matrix are in
[docs/HR_NEXUS_V3_ARCHITECTURE.md](docs/HR_NEXUS_V3_ARCHITECTURE.md) (sections 2 to 4).

### Employee

Employees use the self-service pages above and see colleagues only through their social
profile: name, photo, job title, department, manager, About and skills, and a phone number
only when its owner shares it. Pay, personal details, leave reasons, private goals,
review content and private recognition belong to their owner, and to their manager or HR
only where the design says so.

Employment and personal information such as employee number, job title, department,
employment status, date of birth, and employment date are read-only for employees and are
managed by HR administrators.

### Manager

Managers keep their own self-service pages and gain the team layer for their current
direct reports: attendance, leave (including reasons, because they decide it), goals and
reviews. They never see a report's pay, personal details or private recognition, and they
have no access to anyone outside their team.

### Admin

Administrators manage the company: people, structure, attendance, leave, payroll,
onboarding and offboarding, performance, announcements, calendar, settings, reports,
export, import and the audit log. Sensitive actions are recorded in the append-only audit
log, which never holds passwords, tokens, QR secrets, coordinates or private words.

## User Interface

HR Nexus includes:

- Responsive layouts for desktop, tablet, and mobile
- Light and dark themes
- HR Nexus branding
- Reusable UI components
- Responsive tables and forms
- Keyboard-accessible dialogs
- Keyboard-accessible navigation
- Accessible status indicators
- Accessible form labels and hints
- Theme persistence between sessions

## Project Structure

```text
hr-nexus/
├── backend/
├── database/
├── docs/
├── frontend/
│   ├── public/
│   │   └── branding/
│   └── src/
├── docker-compose.yml
├── package-lock.json
└── README.md
```

## Development Workflow

The project uses feature branches for development.

```text
feature branch
     ↓
Pull Request
     ↓
main
```

Recommended workflow:

```bash
git switch main
git pull origin main
git switch -c feature/<feature-name>
```

After completing a feature:

```bash
git add .
git commit -m "describe the completed work"
git push -u origin feature/<feature-name>
```

Then create a Pull Request from the feature branch into `main`.

Avoid making feature changes directly on `main`.

## Reviewing Another Team Member's Branch

Fetch the latest remote branches:

```bash
git fetch origin
```

Switch to the branch you want to review:

```bash
git switch <branch-name>
```

Pull its latest changes:

```bash
git pull origin <branch-name>
```

After reviewing, return to `main`:

```bash
git switch main
git pull origin main
```

## Validation

Frontend:

```bash
cd frontend
npx tsc -b
npm run lint
npm run build
npm run check:bundle   # every page lazy, vendor chunks present, first-visit JS within budget
```

Backend:

```bash
cd backend
npm run type-check
npm test               # unit tests; database suites skip unless their lab flags are set
```

The database suites (migrations, authorisation, the security matrix and every workflow)
run only against the isolated migration laboratory, never the application database. The
full command and the release gates are in
[docs/HR_NEXUS_V3_RELEASE.md](docs/HR_NEXUS_V3_RELEASE.md).

## Known Development Notes

- Five historical attendance rows belong to employee records that were permanently deleted
  before V2. They are protected history and are deliberately never reconciled or deleted.
- Malaysian statutory payroll (EPF, SOCSO, EIS and PCB) is intentionally not automated;
  see the V3 plan's decisions log for why.
- Sessions are JWTs with an eight-hour expiry and no revocation list, but every request
  re-reads the account, its role, its employee link and its manager scope, so a
  deactivated account or a changed relationship loses access immediately.
- Some list filters are not yet stored in the URL, so they reset after a page reload.

## License

This project was developed for educational purposes as a group project.
