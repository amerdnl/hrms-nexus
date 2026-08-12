# HR Nexus

HR Nexus is a full-stack Human Resource Management System developed as a group project. It provides role-based tools for employees and administrators to manage attendance, leave, employee records, departments, profiles, and HR dashboard information through a responsive web interface.

## Features

### Employee

- Secure login and role-based access
- Employee dashboard
- Attendance check-in and check-out
- Work-hours calculation
- Attendance history and status filtering
- Leave application and leave history
- Upcoming leave overview
- Profile and contact information management
- Profile photo upload and removal
- Password change
- Light and dark mode

### Admin

- Admin dashboard with workforce and attendance statistics
- Attendance status breakdown
- Manual attendance creation and correction
- Attendance filtering by employee, department, status, and date
- Leave request management
- Leave details, approval, and rejection
- Employee management
- Department management
- Employee and department filtering
- Responsive tables and pagination

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

- Authentication and authorization
- Employee profile management
- Employee management
- Department management
- Attendance management
- Leave management
- Employee dashboard
- Admin dashboard

## User Roles

### Employee

Employees can:

- View their employee dashboard
- Check in and check out
- View attendance history
- View calculated work hours
- Filter attendance records
- Apply for leave
- View leave request history and status
- View upcoming approved leave
- Update supported contact information
- Upload and remove a profile photo
- Change their password
- Switch between light and dark mode

Employment and personal information such as employee number, job title, department, employment status, date of birth, and employment date are read-only for employees and are managed by HR administrators.

### Admin

Administrators can:

- View HR dashboard statistics
- View attendance status breakdowns
- Filter attendance records
- Create manual attendance records
- Correct attendance records
- Review leave request details
- Approve or reject leave requests
- Manage employee records
- Create and edit employees
- Deactivate and reactivate employees
- Manage departments
- View active employee counts by department
- Use employee, department, status, job-title, and date filters where supported

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

Frontend validation commands:

```bash
cd frontend
npx tsc -b
npm run lint
npm run build
```

These commands check:

- TypeScript compilation
- Lint issues
- Production build compatibility

## Known Development Notes

- Attendance statistics currently use a single selected date rather than a date range.
- Some frontend pages perform client-side joins and filtering using full API result sets. For a larger production deployment, server-side pagination and aggregate endpoints would be preferable.
- Attendance history associated with permanently deleted employees requires further backend/database design review because historical attendance records may remain without a corresponding employee record.
- Filter and tab state is currently not stored in the URL, so it resets after a page reload.

## License

This project was developed for educational purposes as a group project.
