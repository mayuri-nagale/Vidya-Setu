# Vidya Setu

Vidya Setu is a teacher-and-student learning portal built with Next.js and MongoDB. Teachers publish lessons and resources; students access them, download learning material, ask doubts, take quizzes, receive updates, and share verified downloads with classmates on the same Wi-Fi or hotspot.

## Prerequisites

- Node.js 20.9 or later
- MongoDB Community Server, or a MongoDB Atlas connection string
- Git

## Run from a fresh clone

```powershell
git clone https://github.com/mayuri-nagale/Vidya-Setu.git
cd Vidya-Setu
npm ci
Copy-Item .env.local.example .env.local
```

If `npm ci` does not work, run `npm install`.

Set `.env.local` for local MongoDB:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=vidya_setu
SESSION_SECRET=replace-with-a-private-random-string-of-at-least-32-characters
OPENAI_API_KEY=your-server-only-openai-api-key
OPENAI_MODEL=gpt-5
```

Start MongoDB. On Windows, when installed as a service, use an elevated PowerShell:

```powershell
Start-Service MongoDB
```

If it is not installed as a service, start it in another terminal with:

```powershell
New-Item -ItemType Directory -Force C:\data\db
mongod --dbpath C:\data\db
```

Then create demo data and run the app:

```powershell
npm run seed:teacher
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Role | Page | ID | Password |
| --- | --- | --- | --- |
| Teacher | `/teacher` | `TCH-001` | `teacher123` |
| Student | `/student` | `101` | `student123` |

Students `102` to `110` also use password `student123`.

## Cloud DB (optional)

Replace `MONGODB_URI` in `.env.local` with the hosted connection string, then restart the app. Allow the application IP address in your database provider.

For deployment, set the required variables in the hosting dashboard. Do not run the demo seed command against a real school database, and replace all demo accounts before sharing the app publicly.

## Lesson helper AI (optional)

Add `OPENAI_API_KEY` and restart the app to enable **Vidya Setu AI** in the student sidebar and **Ask lesson helper** while a student is watching a resource. The key stays on the server. The helper only receives the assigned lesson title, topic, version, teacher description, and current timestamp/page; if it cannot answer confidently, it asks the student to send a doubt to the teacher.

## Verify

1. Log in as the teacher and publish a lesson for **Class 10 / 10A**.
2. Log in as student `101` and confirm the lesson appears.
3. Update the lesson version as the teacher and check the student **Updates** section.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Create a production build |
| `npm start` | Run the production build after `npm run build` |
